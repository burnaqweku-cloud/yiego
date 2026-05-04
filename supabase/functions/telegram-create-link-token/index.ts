// Generates a one-time magic link the logged-in web user can open in
// Telegram to link their account to their chat. Token expires in 15 min.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BOT_USERNAME = Deno.env.get("TELEGRAM_BOT_USERNAME") || "datasika_bot";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supaUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await supaUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Generate URL-safe token
    const token = crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error } = await supa.from("telegram_link_tokens").insert({
      token,
      user_id: user.id,
      channel: "magic_link",
      expires_at: expiresAt,
    });

    if (error) {
      console.error("[telegram-create-link-token] insert failed:", error);
      return new Response(JSON.stringify({ error: "Failed to create token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const link = `https://t.me/${BOT_USERNAME}?start=link_${token}`;

    return new Response(
      JSON.stringify({ link, token, expires_at: expiresAt, bot_username: BOT_USERNAME }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[telegram-create-link-token] error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
