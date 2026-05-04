// Shared Telegram gateway helpers — used by every telegram-* function.
// All requests go through the Lovable connector gateway (never call api.telegram.org directly).

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [250, 750, 1500];

export type InlineKeyboardButton =
  | { text: string; url: string }
  | { text: string; callback_data: string };

export type InlineKeyboard = InlineKeyboardButton[][];

export type ReplyKeyboardButton = { text: string };
export type ReplyKeyboard = {
  keyboard: ReplyKeyboardButton[][];
  resize_keyboard?: boolean;
  is_persistent?: boolean;
  one_time_keyboard?: boolean;
  selective?: boolean;
};

export type ForceReplyMarkup = {
  force_reply: true;
  input_field_placeholder?: string;
  selective?: boolean;
};

export type ReplyMarkup =
  | { inline_keyboard: InlineKeyboard }
  | ReplyKeyboard
  | { remove_keyboard: true }
  | ForceReplyMarkup;

function getKeys() {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const tgKey = Deno.env.get("TELEGRAM_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!tgKey) throw new Error("TELEGRAM_API_KEY is not configured");
  return { lovableKey, tgKey };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tgFetch(path: string, body: Record<string, unknown>) {
  const { lovableKey, tgKey } = getKeys();
  let last = { ok: false, status: 0, data: {} as unknown };

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
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
      if (res.ok && data?.ok !== false) {
        return { ok: true, status: res.status, data };
      }
      last = { ok: false, status: res.status, data };
      if (!RETRYABLE_STATUSES.has(res.status) || attempt === RETRY_DELAYS_MS.length) break;
      console.warn(`[telegram] ${path} retry ${attempt + 1}/${RETRY_DELAYS_MS.length} after [${res.status}]:`, JSON.stringify(data));
    } catch (e) {
      last = { ok: false, status: 0, data: { error: String(e) } };
      if (attempt === RETRY_DELAYS_MS.length) break;
      console.warn(`[telegram] ${path} retry ${attempt + 1}/${RETRY_DELAYS_MS.length} after fetch error:`, e);
    }

    await delay(RETRY_DELAYS_MS[attempt]);
  }

  console.error(`[telegram] ${path} failed [${last.status}]:`, JSON.stringify(last.data));
  return last;
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  opts: {
    parse_mode?: "HTML" | "MarkdownV2" | "Markdown";
    reply_markup?: ReplyMarkup;
    disable_web_page_preview?: boolean;
  } = {},
) {
  return tgFetch("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: opts.parse_mode ?? "HTML",
    disable_web_page_preview: opts.disable_web_page_preview ?? true,
    ...(opts.reply_markup ? { reply_markup: opts.reply_markup } : {}),
  });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false,
) {
  return tgFetch("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text, show_alert: showAlert } : {}),
  });
}

export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  opts: {
    parse_mode?: "HTML" | "MarkdownV2" | "Markdown";
    reply_markup?: { inline_keyboard: InlineKeyboard };
  } = {},
) {
  return tgFetch("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: opts.parse_mode ?? "HTML",
    ...(opts.reply_markup ? { reply_markup: opts.reply_markup } : {}),
  });
}

export async function sendChatAction(
  chatId: number | string,
  action: "typing" | "upload_photo" | "record_video" | "upload_video" | "record_voice" | "upload_voice" | "upload_document" | "choose_sticker" | "find_location" | "record_video_note" | "upload_video_note" = "typing",
) {
  return tgFetch("sendChatAction", { chat_id: chatId, action });
}

export async function getUpdates(offset: number, timeout: number) {
  return tgFetch("getUpdates", {
    offset,
    timeout,
    allowed_updates: ["message", "callback_query"],
  });
}

/** Escape HTML reserved chars for safe insertion into messages */
export function esc(s: string | number | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Shared customer-facing order status copy ──────────────────────────
// Single source of truth for "delivered", "failed", and "processing"
// notifications so the bot, the trigger-driven notify-customer function,
// and the notify-event function all speak in one voice.
export type OrderStatusEvent = "delivered" | "failed" | "processing";

export interface OrderStatusFields {
  order_id: string;
  network: string | number | null | undefined;
  bundle_size_gb: string | number | null | undefined;
  recipient_number: string | number | null | undefined;
}

/**
 * Build a fully-formatted Telegram HTML message body for a customer-facing
 * order status update. Returns the full text ready for sendMessage().
 *
 * Tone: warm-but-measured. Always ends with a clear next step.
 */
export function buildOrderStatusMessage(
  order: OrderStatusFields,
  event: OrderStatusEvent,
): string {
  const bundle = `<b>${esc(order.bundle_size_gb)}GB ${esc(order.network)}</b>`;
  const recipient = `<b>${esc(order.recipient_number)}</b>`;
  const orderRef = `<code>${esc(order.order_id)}</code>`;

  if (event === "delivered") {
    return [
      "<b>✅ Bundle delivered</b>",
      "",
      `${bundle} → ${recipient}`,
      `Order: ${orderRef}`,
      "",
      "Thanks for choosing DataSika 🎉",
      "Tap /buy to order again or /history for past orders.",
    ].join("\n");
  }

  if (event === "failed") {
    return [
      "<b>⚠️ Delivery failed</b>",
      "",
      `We couldn't deliver ${bundle} to ${recipient}.`,
      `Order: ${orderRef}`,
      "",
      "Our team has been alerted and your refund will be processed shortly.",
      "Tap /support if you need help right away.",
    ].join("\n");
  }

  // processing
  return [
    "<b>⏳ Order processing</b>",
    "",
    `${bundle} → ${recipient}`,
    `Order: ${orderRef}`,
    "",
    "We'll message you here the moment it's delivered.",
  ].join("\n");
}

