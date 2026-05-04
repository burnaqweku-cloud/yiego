import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ONESIGNAL_API_URL = 'https://onesignal.com/api/v1/notifications';

interface PushPayload {
  title: string;
  message: string;
  segment?: string; // 'All' | 'Agents' | 'Users'
  url?: string;
  // For targeting specific player IDs
  playerIds?: string[];
  // For dedup
  idempotencyKey?: string;
  // Audit fields
  triggeredBy?: string;
  entityType?: string;
  entityId?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
  const onesignalAppId = Deno.env.get('ONESIGNAL_APP_ID') || '6896f18f-ebe9-4196-b7e6-8874caea4904';

  if (!restApiKey) {
    console.error('[send-push-notification] ONESIGNAL_REST_API_KEY secret is not configured');
    return new Response(JSON.stringify({ error: 'Push notification service is not configured. ONESIGNAL_REST_API_KEY missing.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const authHeader = req.headers.get('Authorization');

    // Allow internal calls (from webhook) with service role, or admin calls
    let isAuthorized = false;
    let callerId = 'system';

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        // Check if admin or staff
        const { data: role } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .in('role', ['admin', 'staff'])
          .single();

        if (role) {
          isAuthorized = true;
          callerId = user.id;
        }
      }
    }

    // Allow internal calls via the dedicated trigger secret (preferred)
    // or the service role key (legacy backward compat).
    const internalKey = req.headers.get('x-internal-key');
    const triggerSecret = Deno.env.get('NOTIFY_TRIGGER_SECRET');
    if (
      (triggerSecret && internalKey === triggerSecret) ||
      (internalKey && internalKey === serviceRoleKey)
    ) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: PushPayload = await req.json();
    const { title, message, segment = 'All', url, playerIds, idempotencyKey, triggeredBy, entityType, entityId } = body;

    if (!title || !message) {
      return new Response(JSON.stringify({ error: 'title and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Dedup check
    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from('push_notification_logs' as any)
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .single();

      if (existing) {
        return new Response(JSON.stringify({ success: true, duplicate: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Build OneSignal notification payload
    const notification: any = {
      app_id: onesignalAppId,
      headings: { en: title },
      contents: { en: message },
      chrome_web_icon: 'https://datasika.com/datasika-icon.png',
      firefox_icon: 'https://datasika.com/datasika-icon.png',
      chrome_web_badge: 'https://datasika.com/favicon.png',
      small_icon: 'datasika-icon',
    };

    if (url) {
      notification.url = url;
    }

    // Target by player IDs or segment
    if (playerIds && playerIds.length > 0) {
      notification.include_subscription_ids = playerIds;
    } else {
      // Segment targeting
      // OneSignal uses tags for segmentation (set during subscription)
      if (segment === 'Agents') {
        notification.filters = [{ field: 'tag', key: 'is_agent', relation: '=', value: '1' }];
      } else if (segment === 'Admins') {
        notification.filters = [{ field: 'tag', key: 'is_admin', relation: '=', value: '1' }];
      } else if (segment === 'Users') {
        notification.filters = [
          { field: 'tag', key: 'role', relation: '=', value: 'user' },
          { operator: 'OR' },
          { field: 'tag', key: 'role', relation: 'not_exists' },
        ];
      } else {
        // All subscribers
        notification.included_segments = ['All'];
      }
    }

    // Send to OneSignal
    const response = await fetch(ONESIGNAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${restApiKey}`,
      },
      body: JSON.stringify(notification),
    });

    const result = await response.json();

    // Log the send
    await supabase.from('push_notification_logs' as any).insert({
      onesignal_notification_id: result.id || null,
      title,
      message,
      segment,
      url: url || null,
      triggered_by: triggeredBy || callerId,
      entity_type: entityType || null,
      entity_id: entityId || null,
      recipients: result.recipients || 0,
      status: response.ok ? 'sent' : 'failed',
      idempotency_key: idempotencyKey || null,
      error_message: !response.ok ? JSON.stringify(result.errors) : null,
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'OneSignal error', details: result }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, notificationId: result.id, recipients: result.recipients }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[send-push-notification] error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
