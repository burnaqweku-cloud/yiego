// One-shot smoke test: verify TELEGRAM_ADMIN_CHAT_ID is readable and the
// bot can post into the admin group via the Lovable connector gateway.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const adminChatId = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID") || "";
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const tgKey = Deno.env.get("TELEGRAM_API_KEY") || "";

  const env_check = {
    TELEGRAM_ADMIN_CHAT_ID_present: Boolean(adminChatId),
    TELEGRAM_ADMIN_CHAT_ID_value: adminChatId,
    LOVABLE_API_KEY_present: Boolean(lovableKey),
    TELEGRAM_API_KEY_present: Boolean(tgKey),
  };

  if (!adminChatId || !lovableKey || !tgKey) {
    return new Response(JSON.stringify({ ok: false, env_check, reason: "missing required env" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const text = `🧪 <b>Smoke test</b>\nBot can post to admin group.\nTime: ${new Date().toISOString()}`;
  const res = await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": tgKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: adminChatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return new Response(JSON.stringify({ ok: res.ok && data?.ok !== false, status: res.status, env_check, telegram: data }), {
    status: res.ok ? 200 : 502,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
