// Tiny relay invoked by DB triggers. Authenticates via x-internal-key
// (NOTIFY_TRIGGER_SECRET, env or vault fallback) and forwards the
// payload to notify-event using the anon key (proven to pass the gateway).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-internal-key',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const internalKey = req.headers.get('x-internal-key') || '';
    const expectedEnv = Deno.env.get('NOTIFY_TRIGGER_SECRET') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    let isAuthorized = !!expectedEnv && internalKey === expectedEnv;

    // Vault fallback in case the env-cached value is stale.
    if (!isAuthorized && internalKey) {
      try {
        const sb = createClient(supabaseUrl, serviceKey);
        const { data } = await sb.rpc('verify_notify_trigger_secret', { p_secret: internalKey });
        if (data === true) isAuthorized = true;
      } catch (e) {
        console.error('[relay] vault verify failed:', e);
      }
    }

    if (!isAuthorized) {
      console.warn('[relay] unauthorized', { hasEnv: !!expectedEnv, keyLen: internalKey.length });
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.text();
    console.log('[relay] forwarding to notify-event', { bytes: body.length });

    const resp = await fetch(`${supabaseUrl}/functions/v1/notify-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'x-internal-key': internalKey,
      },
      body,
    });

    const text = await resp.text();
    console.log('[relay] notify-event responded', { status: resp.status, body: text.slice(0, 200) });
    return new Response(text, {
      status: resp.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[relay] exception', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
