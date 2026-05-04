// Telegram Login Widget verification + Supabase session bootstrap.
// Verifies hash with bot token, then issues a magic link the client redirects to.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function sha256(buf: Uint8Array): Promise<Uint8Array> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return new Uint8Array(d);
}

async function hmacSha256(key: Uint8Array, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: 'Server not configured' });
  }

  let payload: Record<string, any>;
  try { payload = await req.json(); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { hash, redirect_to, ...fields } = payload;
  if (!hash || typeof hash !== 'string') return json(400, { error: 'Missing hash' });
  if (!fields.id) return json(400, { error: 'Missing Telegram id' });

  // Build data-check string per Telegram Login Widget spec
  const dataCheck = Object.keys(fields)
    .filter(k => fields[k] !== undefined && fields[k] !== null)
    .sort()
    .map(k => `${k}=${fields[k]}`)
    .join('\n');

  const secretKey = await sha256(new TextEncoder().encode(BOT_TOKEN));
  const computed = await hmacSha256(secretKey, dataCheck);
  if (computed !== hash) return json(401, { error: 'Invalid Telegram signature' });

  // Optional freshness (24h)
  const authDate = Number(fields.auth_date || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) {
    return json(401, { error: 'Telegram session expired' });
  }

  const tgId = String(fields.id);
  const fullName = [fields.first_name, fields.last_name].filter(Boolean).join(' ').trim() || `Telegram ${tgId.slice(-4)}`;
  const tgUsername = fields.username ? String(fields.username) : null;
  // Synthetic stable email — never delivered to, used only as Supabase identifier.
  const email = `tg_${tgId}@telegram.yiego.local`;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Find or create user
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = existing?.users?.find((u: any) => u.email === email);

  if (!user) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        telegram_id: tgId,
        telegram_username: tgUsername,
        provider: 'telegram',
        avatar_url: fields.photo_url || null,
      },
    });
    if (createErr || !created.user) {
      console.error('telegram-auth createUser', createErr);
      return json(500, { error: 'Could not create Telegram account' });
    }
    user = created.user;
  }

  // Issue a magic link the client can navigate to (sets the session)
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: redirect_to || `${new URL(req.url).origin}/dashboard` },
  });
  if (linkErr || !link?.properties?.action_link) {
    console.error('telegram-auth generateLink', linkErr);
    return json(500, { error: 'Could not start Telegram session' });
  }

  return json(200, { action_link: link.properties.action_link, user_id: user.id });
});
