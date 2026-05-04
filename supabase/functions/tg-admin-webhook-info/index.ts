// Admin-only: returns Telegram getWebhookInfo (redacted secret).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData } = await supa.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await supa.rpc("is_admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lk = Deno.env.get("LOVABLE_API_KEY");
    const tk = Deno.env.get("TELEGRAM_API_KEY");
    if (!lk || !tk) {
      return new Response(JSON.stringify({ error: "telegram_not_configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const r = await fetch(`${GATEWAY_URL}/getWebhookInfo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lk}`,
        "X-Connection-Api-Key": tk,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const d = await r.json();

    // Redact secret hint if any
    if (d?.result?.url) {
      d.result.url = String(d.result.url).replace(/(\?|&)secret=[^&]+/i, "$1secret=***");
    }
    return new Response(JSON.stringify({ ok: true, info: d?.result ?? null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
