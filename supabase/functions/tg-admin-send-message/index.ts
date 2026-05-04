// Admin-only: send a custom message to a Telegram chat.
// Verifies caller is admin, then sends via the existing sendMessage helper,
// and writes an audit log entry.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMessage } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    const { chat_id, text, button_label, button_url, reason } = await req.json();
    if (!chat_id || !text) {
      return new Response(JSON.stringify({ error: "chat_id_and_text_required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reply_markup = button_label && button_url
      ? { inline_keyboard: [[{ text: button_label, url: button_url }]] }
      : undefined;

    const res = await sendMessage(Number(chat_id), String(text), { reply_markup });

    await supa.rpc("log_tg_admin_action", {
      p_action: "user.send_message",
      p_target_type: "telegram_chat",
      p_target_id: String(chat_id),
      p_details: { text_preview: String(text).slice(0, 200), success: res.ok, reason },
    });

    return new Response(JSON.stringify({ ok: res.ok, telegram: res }), {
      status: res.ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
