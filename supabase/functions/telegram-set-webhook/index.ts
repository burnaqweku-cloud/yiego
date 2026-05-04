// deno-lint-ignore-file no-explicit-any
// One-shot administrative helper to register / remove the Telegram webhook.
//
// Usage (admin / curl):
//   POST /functions/v1/telegram-set-webhook
//     body: { "action": "set" }   // default — register webhook
//     body: { "action": "delete" } // remove webhook (rollback)
//     body: { "action": "info" }   // show current webhook info
//
// All Telegram calls go through the Lovable connector gateway, identical
// to the rest of the bot.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const PROJECT_REF = "nrsfvhztpzwkadwciizp";
const WEBHOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/telegram-webhook`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function tg(path: string, body: Record<string, unknown>) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const tgKey = Deno.env.get("TELEGRAM_API_KEY");
  if (!lovableKey || !tgKey) throw new Error("Telegram connector keys missing");
  const res = await fetch(`${GATEWAY_URL}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": tgKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let action = "set";
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body?.action) action = String(body.action);
    } catch { /* ignore */ }
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    if (action === "info") {
      const r = await tg("getWebhookInfo", {});
      return new Response(JSON.stringify({ ok: true, action, result: r.data }), { headers });
    }

    if (action === "delete") {
      const r = await tg("setWebhook", { url: "", drop_pending_updates: false });
      return new Response(
        JSON.stringify({ ok: true, action, status: r.status, result: r.data }),
        { headers },
      );
    }

    // default: set
    const secret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    if (!secret) {
      return new Response(
        JSON.stringify({ ok: false, error: "TELEGRAM_WEBHOOK_SECRET not configured" }),
        { status: 500, headers },
      );
    }

    const r = await tg("setWebhook", {
      url: WEBHOOK_URL,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
      max_connections: 40,
    });

    const info = await tg("getWebhookInfo", {});
    return new Response(
      JSON.stringify({
        ok: true,
        action,
        webhook_url: WEBHOOK_URL,
        set_status: r.status,
        set_result: r.data,
        webhook_info: info.data,
      }),
      { headers },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }),
      { status: 500, headers },
    );
  }
});
