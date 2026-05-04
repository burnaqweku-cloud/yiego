// Auto-closes Telegram support tickets that have been inactive for 48h.
// Triggered by pg_cron (see SQL configuration).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const TICKET_AUTOCLOSE_HOURS = 48;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function tgSend(chatId: number | string, text: string) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const tgKey = Deno.env.get("TELEGRAM_API_KEY");
  if (!lovableKey || !tgKey) {
    console.warn("[tg-ticket-expire] missing telegram keys; skipping send");
    return;
  }
  try {
    await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": tgKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.error("[tg-ticket-expire] send failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supa = createClient(supabaseUrl, svcKey);
  const adminChatId = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID") || "";

  const cutoff = new Date(Date.now() - TICKET_AUTOCLOSE_HOURS * 60 * 60 * 1000).toISOString();

  // Pull stale Telegram tickets
  const { data: stale, error } = await supa
    .from("support_tickets_v2")
    .select("id, ticket_code, telegram_chat_id, last_user_message_at, updated_at")
    .in("status", ["open", "in_progress"])
    .eq("source", "telegram")
    .or(`last_user_message_at.lt.${cutoff},and(last_user_message_at.is.null,updated_at.lt.${cutoff})`)
    .limit(200);

  if (error) {
    console.error("[tg-ticket-expire] query failed:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let closed = 0;
  for (const t of stale || []) {
    await supa.from("support_tickets_v2").update({
      status: "closed",
      close_reason: `Auto-closed after ${TICKET_AUTOCLOSE_HOURS}h of inactivity`,
    }).eq("id", t.id);

    await supa.from("ticket_messages").insert({
      ticket_id: t.id,
      sender_type: "system",
      sender_name: "System",
      message_text: `Auto-closed after ${TICKET_AUTOCLOSE_HOURS}h of inactivity.`,
      read_by_user: false, read_by_agent: true, read_by_admin: true,
    });

    if (t.telegram_chat_id) {
      await tgSend(
        t.telegram_chat_id,
        `⏱ <b>Ticket ${t.ticket_code} auto-closed</b>\n\nWe didn't hear back for ${TICKET_AUTOCLOSE_HOURS}h. Type /support anytime to start again.`,
      );
    }
    if (adminChatId) {
      await tgSend(adminChatId, `⏱ <code>${t.ticket_code}</code> auto-closed (inactive ${TICKET_AUTOCLOSE_HOURS}h).`);
    }
    closed++;
  }

  return new Response(JSON.stringify({ ok: true, closed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
