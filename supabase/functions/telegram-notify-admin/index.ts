// deno-lint-ignore-file no-explicit-any
// Internal-only function: pushes admin alerts to the configured Telegram admin chat.
// Called by withdrawal flow + AI ticket creation. JWT NOT verified — uses internal key check instead.

import { sendMessage, esc, type InlineKeyboard } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key",
};

const SITE_URL = "https://datasika.com";

type WithdrawalAlert = {
  kind: "withdrawal_request" | "payout_threshold";
  agent_name: string;
  agent_phone?: string | null;
  amount_ghs: number;
  momo_number?: string | null;
  momo_network?: string | null;
  withdrawal_id?: string;
  agent_id?: string;
};

type TicketAlert = {
  kind: "ai_ticket";
  ticket_code: string;
  ticket_id: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  category: string;
  summary: string;
};

type GenericAlert = {
  // Generic shape sent by notify-event for any to_admins event
  event?: string;
  title: string;
  message: string;
  url?: string;
  data?: Record<string, any>;
};

type Payload = WithdrawalAlert | TicketAlert | GenericAlert;

function buildGenericMessage(p: GenericAlert): { text: string; keyboard: InlineKeyboard } {
  const text = [`🔔 <b>${esc(p.title)}</b>`, "", esc(p.message)].join("\n");
  const url = p.url || `${SITE_URL}/admin/dashboard`;
  return { text, keyboard: [[{ text: "🔎 Open admin", url }]] };
}

function buildWithdrawalMessage(p: WithdrawalAlert): { text: string; keyboard: InlineKeyboard } {
  const title = p.kind === "payout_threshold"
    ? "💰 <b>Payout threshold reached</b>"
    : "💸 <b>New withdrawal request</b>";

  const lines = [
    title,
    "",
    `<b>Agent:</b> ${esc(p.agent_name)}`,
    p.agent_phone ? `<b>Phone:</b> ${esc(p.agent_phone)}` : null,
    `<b>Amount due:</b> GHS ${esc(p.amount_ghs.toFixed(2))}`,
    p.momo_number ? `<b>MoMo:</b> ${esc(p.momo_number)} (${esc(p.momo_network ?? "—")})` : null,
  ].filter(Boolean);

  const url = p.withdrawal_id
    ? `${SITE_URL}/admin/withdrawals?id=${encodeURIComponent(p.withdrawal_id)}`
    : `${SITE_URL}/admin/withdrawals`;

  return {
    text: lines.join("\n"),
    keyboard: [[{ text: "✅ Review & Approve", url }]],
  };
}

function buildTicketMessage(p: TicketAlert): { text: string; keyboard: InlineKeyboard } {
  const lines = [
    "🎫 <b>New AI support ticket</b>",
    "",
    `<b>Ticket:</b> ${esc(p.ticket_code)}`,
    `<b>Category:</b> ${esc(p.category)}`,
    p.customer_phone ? `<b>Phone:</b> ${esc(p.customer_phone)}` : null,
    p.customer_email ? `<b>Email:</b> ${esc(p.customer_email)}` : null,
    "",
    `<b>Summary:</b> ${esc(p.summary).slice(0, 700)}`,
  ].filter(Boolean);

  const url = `${SITE_URL}/admin/support/tickets/${encodeURIComponent(p.ticket_id)}`;
  return {
    text: lines.join("\n"),
    keyboard: [[{ text: "🔎 View ticket", url }]],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Internal-key check: only callable from other edge functions or trusted server code.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const provided =
      req.headers.get("x-internal-key") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminChatId = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID");
    if (!adminChatId) {
      console.warn("[telegram-notify-admin] TELEGRAM_ADMIN_CHAT_ID not set — skipping");
      return new Response(JSON.stringify({ ok: false, reason: "admin_chat_not_configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as Payload;

    let body: { text: string; keyboard: InlineKeyboard };
    const kind = (payload as any).kind;
    if (kind === "ai_ticket") {
      body = buildTicketMessage(payload as TicketAlert);
    } else if (kind === "withdrawal_request" || kind === "payout_threshold") {
      body = buildWithdrawalMessage(payload as WithdrawalAlert);
    } else if ((payload as GenericAlert).title && (payload as GenericAlert).message) {
      body = buildGenericMessage(payload as GenericAlert);
    } else {
      return new Response(JSON.stringify({ error: "Unknown alert kind" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await sendMessage(adminChatId, body.text, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: body.keyboard },
    });

    return new Response(JSON.stringify({ ok: result.ok }), {
      status: result.ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[telegram-notify-admin] error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
