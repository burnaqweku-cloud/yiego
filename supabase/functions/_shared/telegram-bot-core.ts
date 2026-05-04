// deno-lint-ignore-file no-explicit-any
// DataSika Telegram bot — long-poll loop, fired every minute by pg_cron.
//
// Architecture: this bot is a thin presentation layer over the existing
// DataSika backend. It NEVER forks order/wallet/payment logic. Instead it:
//   • inserts a paystack_payments row (purpose='order' or 'deposit') with
//     checkout_meta carrying recipient/product/network — so the existing
//     paystack-webhook processOrder()/processDeposit() handles fulfilment.
//   • stamps every bot order with telegram_chat_id so unlinked customers
//     can /history and the delivered-trigger can notify them.
//
// Account linking is OPTIONAL. Anyone can /buy via Paystack. Linking unlocks
// wallet payments, /deposit, full /history (web + bot), /account.
//
// Linking methods (in /link menu):
//   1. Magic link from website (PRIMARY) — datasika.com/dashboard/connect-telegram
//   2. Email magic link (Resend) — visible only when RESEND_API_KEY is set
//   3. Phone OTP (fallback)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  sendMessage,
  sendChatAction,
  answerCallbackQuery,
  editMessageText,
  getUpdates,
  esc,
  type InlineKeyboard,
} from "./telegram.ts";
import {
  dispatchToSupplier,
  parseDispatchResult,
  shouldQueueOrder,
} from "./supplier-dispatch.ts";
import { logSupplierSpend } from "./supplier-ledger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;
const SITE_URL = "https://datasika.com";
const BOT_USERNAME = "datasika_bot";
const PROCESSING_FEE_RATE = 0.04;
const OTP_TTL_MINUTES = 10;
const LINK_TOKEN_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

// Quick-pick deposit chips
const DEPOSIT_PRESETS = [10, 20, 50, 100];
const DEPOSIT_MIN = 5;
const DEPOSIT_MAX = 5000;

// ── Persistent reply keyboard (always visible at bottom of chat) ───────
function persistentKeyboard() {
  return {
    keyboard: [
      [{ text: "🛒 Buy Data" }],
      [{ text: "📦 My Orders" }, { text: "💳 Wallet" }],
      [{ text: "🔍 Track Order" }, { text: "🎁 Invite Friends" }],
      [{ text: "🔗 Link Account" }, { text: "📩 Contact Support" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

// Referral Hub reply keyboard — replaces the main keyboard while the user
// is browsing the Referral Hub. Tapping any button restores the main menu
// (handled in dispatchMessage). The two PRIMARY actions (Share my link,
// Claim Reward Data) live in the inline buttons of the hub message itself.
function referralHubKeyboard() {
  return {
    keyboard: [
      [{ text: "📋 Copy link" }, { text: "👥 My referrals" }],
      [{ text: "💎 Rewards earned" }, { text: "🏆 Leaderboard" }],
      [{ text: "📖 How it works" }, { text: "⬅️ Back to main menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

// Hide-keyboard payload — used when a flow needs the persistent keyboard
// gone (e.g. while in support mode).
function hiddenKeyboard() {
  return { remove_keyboard: true as const };
}

function withMenu<T extends Record<string, any>>(opts: T = {} as T) {
  return { reply_markup: persistentKeyboard(), ...opts };
}

function withReferralMenu<T extends Record<string, any>>(opts: T = {} as T) {
  return { reply_markup: referralHubKeyboard(), ...opts };
}

// ── Text-input prompt helper ──────────────────────────────────────────
// ForceReply is Telegram's native "user must type now" UI. It hides the
// persistent reply keyboard and focuses the input field without needing the
// broken remove_keyboard + inline-keyboard scaffold pattern.
//
// Telegram only permits ONE reply_markup per message. If quick-option inline
// buttons are needed (e.g. "Use my number" + "Cancel"), we attach them
// directly to the prompt instead of force_reply — sending a separate "·"
// scaffold message looks like junk in chat. The user can still type a reply
// because the session state (set by the caller) routes the next text input.
async function sendInputPrompt(
  chatId: number,
  text: string,
  cancelCallback?: string,
  extraInlineRows: InlineKeyboard = [],
) {
  const hasInlineExtras = extraInlineRows.length > 0 && !!cancelCallback;

  if (hasInlineExtras) {
    const prompt = await sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: [
          ...extraInlineRows,
          [{ text: "↩️ Cancel", callback_data: cancelCallback! }],
        ],
      },
    });
    console.log("[telegram-bot][input-prompt] inline+text", {
      chat_id: chatId,
      ok: prompt.ok,
      status: prompt.status,
      message_id: prompt.data?.result?.message_id ?? null,
    });
    return prompt;
  }

  const prompt = await sendMessage(chatId, text, {
    reply_markup: {
      force_reply: true,
      input_field_placeholder: "Type your reply...",
    },
  });
  console.log("[telegram-bot][input-prompt] force_reply", {
    chat_id: chatId,
    ok: prompt.ok,
    status: prompt.status,
    message_id: prompt.data?.result?.message_id ?? null,
  });
  return prompt;
}

// ── Phone helpers ──────────────────────────────────────────────────────
function normalizeGhanaLocal(raw: string): string | null {
  const cleaned = (raw || "").replace(/[\s\-()]/g, "");
  if (/^0[2-5][0-9]{8}$/.test(cleaned)) return cleaned;
  if (/^\+233[2-5][0-9]{8}$/.test(cleaned)) return "0" + cleaned.slice(4);
  if (/^233[2-5][0-9]{8}$/.test(cleaned)) return "0" + cleaned.slice(3);
  return null;
}
function toArkesel233(local0: string): string {
  return "233" + local0.slice(1);
}
function detectNetwork(local0: string): "MTN" | "Telecel" | "AirtelTigo" | null {
  const map: Record<string, "MTN" | "Telecel" | "AirtelTigo"> = {
    "024": "MTN", "025": "MTN", "053": "MTN", "054": "MTN", "055": "MTN", "059": "MTN",
    "020": "Telecel", "050": "Telecel",
    "026": "AirtelTigo", "027": "AirtelTigo", "056": "AirtelTigo", "057": "AirtelTigo",
  };
  return map[local0.substring(0, 3)] ?? null;
}
function genOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function genReference(prefix = "TG"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
function genToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + Math.random().toString(36).slice(2, 10);
}
function genOrderId(): string {
  // TG- prefix marks Telegram-originated orders across bot, web, admin and
  // supplier records. Length MUST match DS-XXXXXXXX / AGT-XXXXXXXX (11/12
  // chars) so all order ids line up visually in admin tables, exports and
  // supplier records. Mirrors generateOrderId() in paystack-initialize:
  // 8 random chars from a curated ambiguity-free alphabet.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  return `TG-${suffix}`;
}

// ── Points grant safety wrapper ────────────────────────────────────────
// Defense-in-depth: every grant goes through this. It checks BOTH the
// Postgres-level error AND the JSON `success` field returned by the RPC,
// throws a typed error on failure, and logs every attempt regardless.
// This makes "claim success on silent failure" physically impossible.
export type GrantReason =
  | "referral_referrer" | "referral_referee" | "purchase"
  | "checkin" | "streak_bonus" | "redemption" | "expiry" | "admin_adjust";

export type GrantErrorCode =
  | "INVALID_REASON" | "EARNING_PAUSED" | "INSUFFICIENT_POINTS"
  | "MISSING_USER_ID" | "INVALID_DELTA" | "SERVER_ERROR" | "RPC_ERROR";

export class GrantPointsError extends Error {
  code: GrantErrorCode;
  detail: unknown;
  constructor(code: GrantErrorCode, message: string, detail?: unknown) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export interface GrantResult {
  success: true;
  new_balance: number;
  previous_balance: number;
  delta: number;
  ledger_id: string;
}

// Legacy uuid-keyed wrapper (kept for any non-bot callers — not used by current bot flows).
export async function grantPointsSafe(
  supa: any,
  userId: string,
  delta: number,
  reason: GrantReason,
  referenceId: string | null,
): Promise<GrantResult> {
  const attemptCtx = { user_id: userId, delta, reason, reference_id: referenceId };
  console.log("[grantPointsSafe] attempt", attemptCtx);
  const { data, error } = await supa.rpc("grant_telegram_points", {
    p_user_id: userId, p_delta: delta, p_reason: reason, p_reference_id: referenceId,
  });
  if (error) throw new GrantPointsError("RPC_ERROR", error.message || "RPC error", error);
  if (!data || data.success !== true) {
    const code = (data?.error as GrantErrorCode) || "SERVER_ERROR";
    throw new GrantPointsError(code, data?.message || code, data);
  }
  return data as GrantResult;
}

// New tg-user-keyed wrapper. Points belong to the Telegram user (chatId in 1:1 chats).
// p_user_id (uuid) is optional metadata if the user has linked a DataSika account.
export async function grantPointsSafeTg(
  supa: any,
  telegramUserId: number,
  delta: number,
  reason: GrantReason,
  referenceId: string | null,
  linkedUserId?: string | null,
): Promise<GrantResult> {
  const ctx = { telegram_user_id: telegramUserId, delta, reason, reference_id: referenceId };
  console.log("[grantPointsSafeTg] attempt", ctx);
  const { data, error } = await supa.rpc("grant_telegram_points_v2", {
    p_telegram_user_id: telegramUserId,
    p_delta: delta,
    p_reason: reason,
    p_reference_id: referenceId,
    p_user_id: linkedUserId || null,
  });
  if (error) {
    console.error("[grantPointsSafeTg] RPC error", ctx, error);
    throw new GrantPointsError("RPC_ERROR", error.message || "RPC error", error);
  }
  if (!data || data.success !== true) {
    const code = (data?.error as GrantErrorCode) || "SERVER_ERROR";
    console.error("[grantPointsSafeTg] grant rejected", ctx, data);
    throw new GrantPointsError(code, data?.message || code, data);
  }
  console.log("[grantPointsSafeTg] ok", { ...ctx, new_balance: data.new_balance, ledger_id: data.ledger_id });
  return data as GrantResult;
}

function grantErrorUserMessage(err: GrantPointsError): string {
  switch (err.code) {
    case "EARNING_PAUSED":
      return "⏸ <b>Points earning is paused</b>\n\nWe'll resume shortly — try again in a few minutes.";
    case "INSUFFICIENT_POINTS":
      return "🔒 <b>Not enough points</b>\n\nCheck your balance with /points or earn more with /checkin.";
    case "INVALID_REASON":
    case "INVALID_DELTA":
    case "MISSING_USER_ID":
      return "⚠️ <b>Something went wrong on our side</b>\n\nWe couldn't credit your points. Tap /support so we can fix it.";
    case "RPC_ERROR":
    case "SERVER_ERROR":
    default:
      return "⚠️ <b>Couldn't credit points right now</b>\n\nPlease try again. If it keeps happening, tap /support.";
  }
}

// ── Session helpers ────────────────────────────────────────────────────
async function getSession(supa: any, chatId: number) {
  const { data } = await supa
    .from("telegram_sessions")
    .select("state, data")
    .eq("chat_id", chatId)
    .maybeSingle();
  return { state: data?.state || null, data: (data?.data ?? {}) as Record<string, any> };
}
async function setSession(supa: any, chatId: number, state: string | null, data: Record<string, any> = {}) {
  await supa.from("telegram_sessions").upsert({
    chat_id: chatId,
    state,
    data,
    updated_at: new Date().toISOString(),
  });
}
async function clearSession(supa: any, chatId: number) {
  await supa.from("telegram_sessions").delete().eq("chat_id", chatId);
  // When a flow ends (cancel, success, expiry) we also forget the live
  // transient menu so any later in-flight stale callbacks don't get
  // mistakenly accepted by the next flow.
  await supa.from("telegram_transient_menus").delete().eq("chat_id", chatId);
}
async function getLink(supa: any, chatId: number): Promise<{ user_id: string; phone: string | null } | null> {
  const { data } = await supa
    .from("telegram_links")
    .select("user_id, phone")
    .eq("chat_id", chatId)
    .maybeSingle();
  return data || null;
}
async function touchLink(supa: any, chatId: number) {
  await supa.from("telegram_links").update({ last_active_at: new Date().toISOString() }).eq("chat_id", chatId);
}

async function rememberTelegramIdentity(supa: any, chatId: number, firstName?: string | null, username?: string | null) {
  if (!Number.isFinite(chatId) || chatId <= 0) return;
  const cleanFirstName = (firstName || "").trim() || null;
  const cleanUsername = (username || "").trim() || null;

  try {
    await markTelegramUserSeen(supa, chatId, cleanFirstName, null);
  } catch (e) {
    console.error("[identity] known user update failed:", e);
  }

  const patch: Record<string, any> = { last_active_at: new Date().toISOString() };
  if (cleanFirstName) patch.first_name = cleanFirstName;
  if (cleanUsername) patch.username = cleanUsername;
  try {
    await supa.from("telegram_links").update(patch).eq("chat_id", chatId);
  } catch (e) {
    console.error("[identity] link name update failed:", e);
  }
}

// ── SMS helper (fire-and-forget) ───────────────────────────────────────
async function sendOtpSms(arkeselTo: string, otp: string) {
  const apiKey = Deno.env.get("ARKESEL_API_KEY");
  if (!apiKey) {
    console.error("[telegram-bot] ARKESEL_API_KEY not set");
    return false;
  }
  try {
    const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey.trim() },
      body: JSON.stringify({
        sender: "JJS",
        message: `Your DataSika Telegram code is ${otp}. Valid for ${OTP_TTL_MINUTES} minutes. Don't share it.`,
        recipients: [arkeselTo],
      }),
    });
    return res.ok;
  } catch (e) {
    console.error("[telegram-bot] SMS send failed:", e);
    return false;
  }
}

// ── Email helper (Resend via gateway) ──────────────────────────────────
function isResendAvailable(): boolean {
  return !!(Deno.env.get("LOVABLE_API_KEY") && Deno.env.get("RESEND_API_KEY"));
}
async function sendLinkEmail(toEmail: string, fullName: string | null, link: string) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!lovableKey || !resendKey) return false;
  try {
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a;">
        <h2 style="margin:0 0 12px;">Link your DataSika account to Telegram</h2>
        <p style="font-size:15px;line-height:1.5;color:#334155;">Hi ${esc(fullName || "there")},</p>
        <p style="font-size:15px;line-height:1.5;color:#334155;">Tap the button below from your phone (with Telegram installed) to link your DataSika account to the bot.</p>
        <p style="margin:24px 0;"><a href="${link}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Open Telegram &amp; finish linking</a></p>
        <p style="font-size:13px;color:#64748b;">Or paste this link: <br/><code>${link}</code></p>
        <p style="font-size:12px;color:#94a3b8;margin-top:24px;">This link expires in ${LINK_TOKEN_TTL_MINUTES} minutes. If you didn't request this, ignore this email.</p>
      </div>
    `;
    const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from: "DataSika <noreply@datasika.com>",
        to: [toEmail],
        subject: "Link your DataSika account to Telegram",
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[telegram-bot] Resend send failed:", res.status, body);
      // fallback to verified Resend test domain when custom domain isn't verified yet
      if (body.includes("domain") || res.status === 403) {
        const fb = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": resendKey,
          },
          body: JSON.stringify({
            from: "DataSika <onboarding@resend.dev>",
            to: [toEmail],
            subject: "Link your DataSika account to Telegram",
            html,
          }),
        });
        return fb.ok;
      }
      return false;
    }
    return true;
  } catch (e) {
    console.error("[telegram-bot] Resend exception:", e);
    return false;
  }
}

// ── Welcome/help copy ──────────────────────────────────────────────────
async function showWelcome(chatId: number, name: string) {
  await sendMessage(
    chatId,
    [
      `👋 Welcome to <b>DataSika</b>, ${esc(name)}!`,
      "",
      "Buy MTN, Telecel & AirtelTigo data bundles right here in chat. <b>No account needed</b> 🚀",
      "",
      "Link your DataSika account for extras: wallet payments, faster checkout, daily points & free data 🎁",
      "",
      "Tap a button below or type /help.",
    ].join("\n"),
    withMenu(),
  );
}

// Standardized "needs linked account" message used everywhere a feature requires /link.
const LINK_REQUIRED_MSG =
  "🔗 This feature needs a linked DataSika account. Tap <b>Link account</b> or run /link to get started.";

// Returns a short, contextual nudge for a returning linked user (or null for the
// generic greeting). Picks the most actionable item: unclaimed check-in →
// redeem-ready → active streak → null.
async function getReturningUserNudge(supa: any, userId: string): Promise<string | null> {
  try {
    const { date: today } = todayAccraISO();
    const { data: last } = await supa
      .from("telegram_checkins")
      .select("checkin_date, streak_count")
      .eq("user_id", userId)
      .order("checkin_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const checkedInToday = last?.checkin_date === today;
    if (!checkedInToday) {
      return "✨ Daily check-in is waiting (+5 pts) — tap /checkin";
    }

    const balance = await getPointsBalance(supa, userId);
    if (balance >= POINTS_PER_GB) {
      return `🎁 You have enough points for ${Math.floor(balance / POINTS_PER_GB)}GB free — tap /redeem`;
    }

    if (last?.streak_count && last.streak_count >= 2) {
      return `🔥 You're on a ${last.streak_count}-day streak — keep it going tomorrow with /checkin`;
    }

    return null;
  } catch (e) {
    console.error("[telegram-bot] returning-user nudge failed:", e);
    return null;
  }
}

async function showHelp(chatId: number) {
  const text = [
    "<b>DataSika commands</b>",
    "",
    "/buy — purchase a data bundle 🛒",
    "/history — your recent orders 📜",
    "/status &lt;ORDER-ID&gt; — check an order 🔎",
    "/support — talk to support 🎧",
    "/agent — apply to be an agent 💼 <i>(type to open)</i>",
    "/link — link your DataSika account 🔗",
    "/refer — invite friends, earn free data 🎁",
    "/help — show this command list ℹ️ <i>(type to open)</i>",
    "/cancel — clear current action ↩️",
    "",
    "<b>🔒 Linked accounts only:</b>",
    "/account — profile + wallet balance 💳",
    "/deposit — top up your wallet 💰",
    "/checkin — daily check-in (+5 pts) ✨",
    "/points — view your points balance ⭐",
    "/redeem — redeem points for free data 🎁",
    "/leaderboard — top earners this week 🏆",
  ].join("\n");
  await sendMessage(chatId, text, withMenu());
}

// ── Linking: menu picker ───────────────────────────────────────────────
async function handleLinkMenu(supa: any, chatId: number) {
  const link = await getLink(supa, chatId);
  if (link) {
    // Issue 15 — Account Management view for already-linked users
    const { data: profile } = await supa
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", link.user_id)
      .maybeSingle();
    const maskEmail = (e?: string | null) => {
      if (!e) return "—";
      const [u, d] = e.split("@");
      if (!d || u.length <= 2) return e;
      return `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}@${d}`;
    };
    const maskPhone = (p?: string | null) => {
      if (!p) return "—";
      const digits = p.replace(/\D/g, "");
      if (digits.length < 6) return p;
      return `${digits.slice(0, 3)}••••${digits.slice(-3)}`;
    };
    await sendMessage(
      chatId,
      [
        "🔗 <b>Account linked</b>",
        "",
        `👤 ${esc(profile?.full_name || "Your DataSika account")}`,
        `📧 ${esc(maskEmail(profile?.email))}`,
        `📞 <code>${esc(maskPhone(link.phone || profile?.phone))}</code>`,
        "",
        "Manage your linked account below.",
      ].join("\n"),
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Switch account", web_app: { url: `${SITE_URL}/tg/link` } } as any],
            [{ text: "🔓 Unlink account", callback_data: "link:unlink_confirm" }],
            [{ text: "↩️ Back", callback_data: "menu:back" }],
          ],
        },
      },
    );
    return;
  }
  // Issue 2 — phone OTP option removed entirely.
  // Issue 3 — "From the website" button is the web_app launcher itself, with
  // no second explainer message. The Mini App page handles the rest.
  const buttons: InlineKeyboard = [
    [{ text: "🌐 From the website (recommended)", web_app: { url: `${SITE_URL}/tg/link` } } as any],
  ];
  if (isResendAvailable()) {
    buttons.push([{ text: "📧 By email", callback_data: "link:email" }]);
  }
  buttons.push([{ text: "↩️ Cancel", callback_data: "link:cancel" }]);
  await sendMessage(
    chatId,
    [
      "🔗 <b>Link your DataSika account</b>",
      "",
      "How would you like to link?",
      "",
      "1. <b>From the website</b> — opens a quick sign-in screen right here in Telegram",
      isResendAvailable() ? "2. <b>By email</b> — we send a magic link to your inbox" : null,
    ].filter(Boolean).join("\n"),
    { reply_markup: { inline_keyboard: buttons } },
  );
}

// Legacy fallback — only fires for stale callback buttons cached in old
// chat clients. Sends them straight to the Mini App with no extra message.
async function handleLinkWeb(chatId: number) {
  await sendMessage(
    chatId,
    "🔗 Tap below to open the secure link screen.",
    {
      reply_markup: {
        inline_keyboard: [[{ text: "🌐 Open link screen", web_app: { url: `${SITE_URL}/tg/link` } } as any]],
      },
    },
  );
}

async function handleLinkEmailStart(supa: any, chatId: number) {
  if (!isResendAvailable()) {
    await sendMessage(chatId, "Email linking isn't available right now. Use the Mini App option instead.", withMenu());
    return;
  }
  await setSession(supa, chatId, "awaiting_link_email", {});
  await sendInputPrompt(chatId, "📧 What's your DataSika account email?\n\nReply with the email address, or send /cancel to go back.", "link:cancel");
}

async function handleLinkEmailInput(supa: any, chatId: number, email: string) {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    await sendMessage(chatId, "❌ <b>That email doesn't look right</b>\n\nReply with your DataSika email (e.g. <code>you@example.com</code>) or tap /cancel.");
    return;
  }
  const { data: profile } = await supa
    .from("profiles")
    .select("id, full_name, email")
    .ilike("email", trimmed)
    .maybeSingle();

  // Always show same message regardless of whether email exists (no enumeration)
  await clearSession(supa, chatId);

  if (profile) {
    const token = genToken();
    await supa.from("telegram_link_tokens").insert({
      token,
      user_id: profile.id,
      channel: "email",
      expires_at: new Date(Date.now() + LINK_TOKEN_TTL_MINUTES * 60_000).toISOString(),
    });
    const link = `https://t.me/${BOT_USERNAME}?start=link_${token}`;
    await sendLinkEmail(trimmed, profile.full_name, link).catch(() => {});
  }

  await sendMessage(
    chatId,
    `📧 If a DataSika account exists for <code>${esc(trimmed)}</code>, we just sent it a link.\n\nCheck your inbox and tap the link to finish.`,
    withMenu(),
  );
}

async function handleLinkPhoneStart(supa: any, chatId: number) {
  await setSession(supa, chatId, "awaiting_phone", {});
  await sendInputPrompt(
    chatId,
    "📱 Reply with your DataSika phone number (e.g. <code>0241234567</code>). We'll text a 6-digit code.\n\nSend /cancel to go back.",
    "link:cancel",
  );
}

// ── Magic link consumer (works for web + email) ────────────────────────
async function handleLinkToken(supa: any, chatId: number, token: string, fromName: string, tgUsername: string | null) {
  const { data: row } = await supa
    .from("telegram_link_tokens")
    .select("id, user_id, expires_at, consumed_at")
    .eq("token", token)
    .maybeSingle();

  if (!row) {
    await sendMessage(chatId, "❌ <b>Invalid link</b>\n\nGenerate a fresh one with /link and try again.", withMenu());
    return;
  }
  if (row.consumed_at) {
    await sendMessage(chatId, "⚠️ <b>Link already used</b>\n\nIf you didn't link successfully, run /link to start over.", withMenu());
    return;
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await sendMessage(chatId, "⏱ <b>Link expired</b>\n\nRun /link to generate a fresh one.", withMenu());
    return;
  }

  // Consume + create link atomically (best-effort)
  await supa
    .from("telegram_link_tokens")
    .update({ consumed_at: new Date().toISOString(), consumed_by_chat_id: chatId })
    .eq("id", row.id)
    .is("consumed_at", null);

  const { data: profile } = await supa
    .from("profiles")
    .select("full_name, phone")
    .eq("id", row.user_id)
    .maybeSingle();

  await supa.from("telegram_links").upsert({
    chat_id: chatId,
    user_id: row.user_id,
    phone: profile?.phone || null,
    username: tgUsername,
    first_name: fromName,
    last_active_at: new Date().toISOString(),
  });
  await backfillReferralUserIds(supa, chatId, row.user_id);
  await clearSession(supa, chatId);
  await sendMessage(
    chatId,
    `✅ <b>Account linked, ${esc(profile?.full_name || fromName)}!</b>\n\nYou now have access to wallet payments, /account, /deposit, and faster checkout.`,
    withMenu(),
  );
}

// ── Referral helpers ───────────────────────────────────────────────────
// Anti-abuse: referrer must have interacted with bot at least once before
// the referee signs up (i.e. exists in telegram_links OR telegram_sessions).
async function referrerHasInteracted(supa: any, referrerChatId: number): Promise<boolean> {
  const { data: link } = await supa
    .from("telegram_links")
    .select("chat_id")
    .eq("chat_id", referrerChatId)
    .maybeSingle();
  if (link) return true;
  const { data: sess } = await supa
    .from("telegram_sessions")
    .select("chat_id")
    .eq("chat_id", referrerChatId)
    .maybeSingle();
  return !!sess;
}

// Record a pending referral when a new chat starts via ref_<CHAT_ID>.
// Idempotent: unique constraint on referee_chat_id silently no-ops dupes.
async function registerPendingReferral(
  supa: any,
  refereeChatId: number,
  referrerChatId: number,
): Promise<{ status: "created" | "self" | "duplicate" | "no_referrer" | "skipped" }> {
  // Self-referral guard (DB also enforces via CHECK)
  if (refereeChatId === referrerChatId) return { status: "self" };

  // Already exists? (one referral per referee chat ever)
  const { data: existing } = await supa
    .from("telegram_referrals")
    .select("id")
    .eq("referee_chat_id", refereeChatId)
    .maybeSingle();
  if (existing) return { status: "duplicate" };

  // Anti-abuse: referrer must have used the bot before
  const interacted = await referrerHasInteracted(supa, referrerChatId);
  if (!interacted) return { status: "no_referrer" };

  // Look up referrer's user_id if linked (nullable — backfilled later)
  const { data: refLink } = await supa
    .from("telegram_links")
    .select("user_id")
    .eq("chat_id", referrerChatId)
    .maybeSingle();

  const { error } = await supa.from("telegram_referrals").insert({
    referrer_chat_id: referrerChatId,
    referrer_user_id: refLink?.user_id || null,
    referee_chat_id: refereeChatId,
    status: "pending",
  });
  if (error) {
    // Unique violation race → treat as duplicate
    if ((error as any).code === "23505") return { status: "duplicate" };
    console.error("[referral] insert failed:", error);
    return { status: "skipped" };
  }
  return { status: "created" };
}

// Called after any link completion. Backfills referee_user_id and
// referrer_user_id where this chat is involved. Safe to call repeatedly.
async function backfillReferralUserIds(supa: any, chatId: number, userId: string) {
  try {
    // 1. If this chat is a referee → set referee_user_id
    await supa
      .from("telegram_referrals")
      .update({ referee_user_id: userId })
      .eq("referee_chat_id", chatId)
      .is("referee_user_id", null);

    // 2. If this chat is a referrer → set referrer_user_id on all their referrals
    await supa
      .from("telegram_referrals")
      .update({ referrer_user_id: userId })
      .eq("referrer_chat_id", chatId)
      .is("referrer_user_id", null);
  } catch (e) {
    // Fire-and-forget: never block link completion
    console.error("[referral] backfill failed:", e);
  }
}

// Build the referral share link + message
function buildReferLink(chatId: number): string {
  return `https://t.me/${BOT_USERNAME}?start=ref_${chatId}`;
}

// ── Settings helper (tg_admin_settings) ───────────────────────────────
async function getAdminSetting(supa: any, key: string, fallback: string): Promise<string> {
  try {
    const { data } = await supa.from("tg_admin_settings").select("value").eq("key", key).maybeSingle();
    if (data?.value == null) return fallback;
    if (typeof data.value === "string") return data.value;
    return JSON.stringify(data.value);
  } catch { return fallback; }
}

// Friendly share copy. Leads with value, mentions welcome bonus, link goes at the end.
// Stored as a 2-line prefix; the referral link is appended by the caller.
const DEFAULT_SHARE_MSG =
  "🇬🇭 Cheap MTN, Telecel & AirtelTigo data bundles on DataSika.\n\nTap my link, get 100 free points on your first order 🎁\n\n👉 ";

// ── Referral Hub (sub-menu the user navigates within) ─────────────────
const REFERRER_REWARD_PTS = 400;
const REFEREE_REWARD_PTS = 100;
const POINTS_PER_GB_REF = 1000; // for "equivalent free data" calc

async function getReferralStats(supa: any, chatId: number) {
  // Live counts — no caching
  const all = await supa
    .from("telegram_referrals")
    .select("id, status")
    .eq("referrer_chat_id", chatId);
  const rows = (all.data || []) as Array<{ status: string }>;
  const total = rows.length;
  const pending = rows.filter(r => r.status === "pending").length;
  const qualified = rows.filter(r => r.status === "qualified").length;
  const rewarded = rows.filter(r => r.status === "rewarded").length;

  // Points earned from referrals — telegram-keyed (works even without a linked account)
  let pointsEarned = 0;
  const link = await getLink(supa, chatId);
  const { data: ledger } = await supa
    .from("telegram_points_ledger")
    .select("delta")
    .eq("telegram_user_id", chatId)
    .eq("reason", "referral_referrer");
  pointsEarned = (ledger || []).reduce((s: number, r: any) => s + (r.delta || 0), 0);
  return { total, pending, qualified, rewarded, pointsEarned, linked: !!link };
}

// (Old inline hubKeyboard removed — the Referral Hub now builds its inline
// keyboard directly inside renderReferralHub() with just two primary actions.
// Secondary actions live in the persistent reply keyboard via referralHubKeyboard().)


function backToHubKeyboard(extra: any[][] = []) {
  return { inline_keyboard: [...extra, [{ text: "⬅️ Back to Hub", callback_data: "refhub:home" }]] };
}

async function handleRefer(supa: any, chatId: number) {
  await touchLink(supa, chatId);
  await setSession(supa, chatId, "in_referral_hub", {});
  return renderReferralHub(supa, chatId);
}

async function renderReferralHub(supa: any, chatId: number) {
  const stats = await getReferralStats(supa, chatId);
  const referralLink = buildReferLink(chatId);

  // Detect whether the user has any claimable reward data (points >= 1GB)
  let canClaim = false;
  if (stats.linked) {
    const linkRow = await getLink(supa, chatId);
    if (linkRow?.user_id) {
      const balance = await getPointsBalance(supa, linkRow.user_id);
      canClaim = balance >= POINTS_PER_GB_REF;
    }
  }

  // Build a copy-friendly share message (works in WhatsApp, SMS, X, Telegram)
  const shareMsg = await getAdminSetting(supa, "referral_share_message", DEFAULT_SHARE_MSG);
  // Use Telegram's native share sheet URL — unlike switch_inline_query, this
  // does NOT prepend "@botname " to the pre-filled text.
  const shareSheetUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareMsg + referralLink)}`;

  // Current points balance (telegram-user-keyed; works for guests + linked).
  const balance = await getPointsBalanceTg(supa, chatId);
  const equivGB = balance / POINTS_PER_GB_REF;
  const gbLabel = equivGB >= 1
    ? `${equivGB.toFixed(equivGB % 1 === 0 ? 0 : 1)} GB free data`
    : `${equivGB.toFixed(1)} GB free data`;

  const lines: string[] = [
    "🎁 <b>Your Referral Hub</b>",
    "",
    "Invite friends to DataSika and earn free data together!",
    "",
    "<b>📊 Your stats</b>",
    `👥 Friends invited: <b>${stats.total}</b>`,
    `✅ Qualified: <b>${stats.qualified + stats.rewarded}</b>  <i>(placed their first order)</i>`,
    `⏳ Pending: <b>${stats.pending}</b>  <i>(joined but haven't ordered yet)</i>`,
    `💎 Points earned: <b>${stats.pointsEarned.toLocaleString()}</b>`,
    "",
    `⭐ <b>Your balance: ${balance.toLocaleString()} pts</b> <i>(${gbLabel})</i>`,
    "",
    "Use the buttons below to share or claim rewards. More options are in the keyboard at the bottom.",
  ];
  if (!stats.linked) {
    lines.splice(2, 0, "🔗 <i>Link your account to track and claim your referral rewards.</i>", "");
  }

  const inlineRows: InlineKeyboard = [
    [
      { text: "📤 Share my link", url: shareSheetUrl } as any,
    ],
    [
      canClaim
        ? { text: "🎁 Claim Reward Data", callback_data: "redeem:start" }
        : { text: "🎁 Claim Reward Data (need 1,000 pts)", callback_data: "redeem_locked" },
    ],
  ];
  if (!stats.linked) {
    inlineRows.unshift([{ text: "🔗 Link account", callback_data: "menu:link" }]);
  }

  // Send TWO messages:
  //  1. Replace the persistent keyboard with the Referral Hub keyboard.
  //  2. The hub message itself, with the 2 inline buttons.
  await sendMessage(chatId, "🎁 Referral Hub — extra options are in the keyboard below 👇", withReferralMenu());
  await sendMessage(chatId, lines.join("\n"), { reply_markup: { inline_keyboard: inlineRows } });
}

async function handleRefHubShare(supa: any, chatId: number) {
  const link = buildReferLink(chatId);
  const shareMsg = await getAdminSetting(supa, "referral_share_message", DEFAULT_SHARE_MSG);
  // Telegram's native share sheet
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareMsg + link)}`;
  await sendMessage(
    chatId,
    [
      "📤 <b>Share your link</b>",
      "",
      "Tap below to open Telegram's share sheet — your link will be pre-filled.",
    ].join("\n"),
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📤 Open share sheet", url: shareUrl }],
          [{ text: "⬅️ Back to Hub", callback_data: "refhub:home" }],
        ],
      },
    },
  );
}

async function handleRefHubCopy(supa: any, chatId: number) {
  const link = buildReferLink(chatId);
  await sendMessage(
    chatId,
    [
      "📋 <b>Your referral link</b>",
      "",
      "Tap to copy 👇",
      "",
      `<code>${esc(link)}</code>`,
    ].join("\n"),
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📤 Share instead", callback_data: "refhub:share" }],
          [{ text: "⬅️ Back to Hub", callback_data: "refhub:home" }],
        ],
      },
    },
  );
}

const REFLIST_PAGE_SIZE = 10;

async function handleRefHubList(supa: any, chatId: number, page: number) {
  const offset = page * REFLIST_PAGE_SIZE;
  const { data, count } = await supa
    .from("telegram_referrals")
    .select("referee_chat_id, referee_user_id, status, created_at", { count: "exact" })
    .eq("referrer_chat_id", chatId)
    .order("created_at", { ascending: false })
    .range(offset, offset + REFLIST_PAGE_SIZE - 1);

  const rows = (data || []) as Array<{ referee_chat_id: number; referee_user_id: string | null; status: string; created_at: string }>;
  const total = count ?? 0;

  if (rows.length === 0 && page === 0) {
    await sendMessage(
      chatId,
      "👥 <b>My referrals</b>\n\nNo referrals yet. Share your link to get started!",
      backToHubKeyboard([[{ text: "📤 Share my link", callback_data: "refhub:share" }]]),
    );
    return;
  }

  // Privacy: first name only, fallback to "Friend #N" — never username/phone/chat_id
  const refereeChatIds = rows.map(r => r.referee_chat_id);
  const { data: links } = refereeChatIds.length
    ? await supa.from("telegram_links").select("chat_id, first_name").in("chat_id", refereeChatIds)
    : { data: [] };
  const nameMap = new Map<number, string>();
  let anonCounter = offset + 1;
  for (const r of rows) {
    const l = (links || []).find((x: any) => x.chat_id === r.referee_chat_id);
    const fn = (l?.first_name || "").trim();
    nameMap.set(r.referee_chat_id, fn || `Friend #${anonCounter}`);
    anonCounter++;
  }

  const statusIcon = (s: string) =>
    s === "rewarded" ? "🎁" : s === "qualified" ? "✅" : s === "pending" ? "⏳" : "❌";
  const statusLabel = (s: string) =>
    s === "rewarded" ? "rewarded" : s === "qualified" ? "qualified" : s === "pending" ? "pending" : s;

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit", timeZone: "Africa/Accra" });
  };

  const lines = [
    "👥 <b>My referrals</b>",
    "",
    ...rows.map(r => {
      const name = nameMap.get(r.referee_chat_id) || "Friend";
      return `${statusIcon(r.status)} ${esc(name)} — ${statusLabel(r.status)} — ${fmtDate(r.created_at)}`;
    }),
    "",
    `Showing ${offset + 1}–${offset + rows.length} of ${total}`,
  ];

  const navRow: any[] = [];
  if (page > 0) navRow.push({ text: "⬅️ Prev", callback_data: `refhub:list:${page - 1}` });
  if (offset + rows.length < total) navRow.push({ text: "Next ➡️", callback_data: `refhub:list:${page + 1}` });
  const kb: any[][] = [];
  if (navRow.length) kb.push(navRow);
  kb.push([{ text: "⬅️ Back to Hub", callback_data: "refhub:home" }]);

  await sendMessage(chatId, lines.join("\n"), { reply_markup: { inline_keyboard: kb } });
}

async function handleRefHubRewards(supa: any, chatId: number) {
  const link = await getLink(supa, chatId); // optional — used only for the linked badge
  // Read referral grants by telegram_user_id so unlinked users see their rewards too.
  const { data: ledger } = await supa
    .from("telegram_points_ledger")
    .select("delta, reference_id, created_at")
    .eq("telegram_user_id", chatId)
    .eq("reason", "referral_referrer")
    .order("created_at", { ascending: false })
    .limit(10);

  const rows = (ledger || []) as Array<{ delta: number; reference_id: string | null; created_at: string }>;
  const total = rows.reduce((s, r) => s + (r.delta || 0), 0);
  const equivGB = total / POINTS_PER_GB_REF;

  // Resolve referee names via telegram_referrals.id == reference_id
  const refIds = rows.map(r => r.reference_id).filter(Boolean) as string[];
  const refMap = new Map<string, string>();
  if (refIds.length) {
    const { data: refs } = await supa
      .from("telegram_referrals")
      .select("id, referee_chat_id")
      .in("id", refIds);
    const chatIds = (refs || []).map((r: any) => r.referee_chat_id);
    const { data: links } = chatIds.length
      ? await supa.from("telegram_links").select("chat_id, first_name").in("chat_id", chatIds)
      : { data: [] };
    const nameByChat = new Map<number, string>();
    for (const l of (links || []) as any[]) {
      const fn = (l.first_name || "").trim();
      if (fn) nameByChat.set(l.chat_id, fn);
    }
    let anonN = 1;
    for (const r of (refs || []) as any[]) {
      refMap.set(r.id, nameByChat.get(r.referee_chat_id) || `Friend #${anonN++}`);
    }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit", timeZone: "Africa/Accra" });

  const lines = [
    "💎 <b>Rewards earned</b>",
    "",
    `💎 Total points from referrals: <b>${total.toLocaleString()}</b>`,
    `💰 Equivalent free data: <b>${equivGB.toFixed(equivGB >= 1 ? 2 : 3)} GB</b>`,
    "",
  ];
  if (rows.length === 0) {
    lines.push("<i>No referral rewards yet.</i>");
  } else {
    lines.push("<b>Recent grants:</b>");
    for (const r of rows) {
      const who = (r.reference_id && refMap.get(r.reference_id)) || "a friend";
      lines.push(`• +${r.delta} pts — ${esc(who)} — ${fmtDate(r.created_at)}`);
    }
  }
  await sendMessage(chatId, lines.join("\n"), backToHubKeyboard());
}

async function handleRefHubHow(_supa: any, chatId: number) {
  const text = [
    "📖 <b>How DataSika referrals work</b>",
    "",
    `1️⃣ Share your unique link with friends`,
    `2️⃣ They sign up and link their account`,
    `3️⃣ When they make their first delivered order, you earn <b>${REFERRER_REWARD_PTS} pts</b>`,
    `4️⃣ They also get <b>${REFEREE_REWARD_PTS} pts</b> as a welcome bonus`,
    `5️⃣ <b>1,000 pts = 1GB free data</b>`,
    "",
    "<b>Pro tips:</b>",
    "• Your friend must <b>link</b> their DataSika account to claim their welcome bonus",
    "• You earn on their <b>first delivered order</b>",
    "• One referral per friend — they can't be referred twice",
    "• Self-referrals don't count",
    "",
    "Got questions? Tap /support.",
  ].join("\n");
  await sendMessage(chatId, text, backToHubKeyboard());
}

async function handleRefHubLeaderboard(supa: any, chatId: number, viewerFirstName?: string | null) {
  // Unified leaderboard — same weekly view as /leaderboard.
  return handleLeaderboard(supa, chatId, viewerFirstName);
}

// ── Transient inline-menu expiry ───────────────────────────────────────
// Some inline menus (network pickers, payment-method picker, deposit chips,
// confirmation dialogs) only make sense at one point in the flow. If the
// user scrolls back and taps an old one a few minutes later we get stale
// state. Solution: when we send a NEW transient menu we (a) strip the
// buttons off the previous one, and (b) remember which menu is "live" so
// stale callbacks can be politely refused.
//
// Persistent menus (bundle grids, /history rows, RefHub pagination, support
// ticket controls) opt OUT and use plain sendMessage(...).
//
// State is persisted in `telegram_transient_menus` (per chat_id) because
// edge function isolates cycle frequently in production — an in-memory
// Map would lose the message_id between taps.
const TRANSIENT_PREFIXES: string[] = [
  "buy_net:",
  "redeem_net:",
  "pay:wallet",
  "pay:nope",
  "pay:paystack",
  "dep:",
  "redeem_confirm:",
  "support:escalate",
  "support:ai_continue",
];

function callbackIsTransient(data: string): boolean {
  return TRANSIENT_PREFIXES.some((p) =>
    p.endsWith(":") ? data.startsWith(p) : data === p,
  );
}

async function getTransient(supa: any, chatId: number): Promise<{ message_id: number; prefixes: string[] } | null> {
  const { data } = await supa
    .from("telegram_transient_menus")
    .select("message_id, prefixes")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (!data) return null;
  return { message_id: Number(data.message_id), prefixes: data.prefixes || [] };
}

async function setTransient(supa: any, chatId: number, messageId: number, prefixes: string[]) {
  await supa.from("telegram_transient_menus").upsert({
    chat_id: chatId,
    message_id: messageId,
    prefixes,
    updated_at: new Date().toISOString(),
  });
}

async function clearTransient(supa: any, chatId: number) {
  await supa.from("telegram_transient_menus").delete().eq("chat_id", chatId);
}

async function stripPreviousTransient(supa: any, chatId: number) {
  const prev = await getTransient(supa, chatId);
  if (!prev) return;
  try {
    await fetch("https://connector-gateway.lovable.dev/telegram/editMessageReplyMarkup", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "X-Connection-Api-Key": Deno.env.get("TELEGRAM_API_KEY")!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: prev.message_id,
        reply_markup: { inline_keyboard: [] },
      }),
    }).catch(() => {});
  } catch (_) { /* swallow */ }
}

async function sendTransient(
  supa: any,
  chatId: number,
  text: string,
  reply_markup: { inline_keyboard: InlineKeyboard },
  opts: { parse_mode?: "HTML" | "MarkdownV2" | "Markdown"; disable_web_page_preview?: boolean } = {},
) {
  // Compute which callback prefixes this menu owns (used later to gate
  // stale callbacks). Only count those that are in the transient set.
  const ownedPrefixes = new Set<string>();
  for (const row of reply_markup.inline_keyboard) {
    for (const btn of row) {
      const cd = (btn as any).callback_data as string | undefined;
      if (!cd) continue;
      for (const p of TRANSIENT_PREFIXES) {
        if (p.endsWith(":") ? cd.startsWith(p) : cd === p) {
          ownedPrefixes.add(p);
        }
      }
    }
  }

  // 1) Best-effort: drop buttons off the previous transient menu.
  await stripPreviousTransient(supa, chatId);

  // 2) Send the new transient menu and remember its message_id + prefixes.
  const res = await sendMessage(chatId, text, { ...opts, reply_markup });
  const newId = (res as any)?.data?.result?.message_id;
  if (typeof newId === "number") {
    await setTransient(supa, chatId, newId, Array.from(ownedPrefixes));
  }
  return res;
}


// ── Daily check-in (linked users only) ────────────────────────────────
// Reward formula: 5 pts/day, +20 pts bonus on every 7-day streak milestone.
// Streak resets if user misses a day. Idempotent via unique (user_id, checkin_date).
const CHECKIN_BASE_PTS = 5;
const CHECKIN_WEEK_BONUS_PTS = 20;

// ── Redemption (Phase 5) ──────────────────────────────────────────────
// Fixed table: 1,000 pts = 1GB free bundle (no cash, no partial, no rate).
// Bot picks the matching active product per network at the requested GB size.
const POINTS_PER_GB = 1000;
const REDEEMABLE_GB_OPTIONS = [1, 2, 5, 10] as const;
function pointsForGB(gb: number): number {
  return gb * POINTS_PER_GB;
}

// ── Phase 8: tier-unlock notifications ────────────────────────────────
// DM the user when their balance crosses a redeemable threshold (1k/2k/5k/10k pts).
// Idempotent via `tier_notified_max_gb` on telegram_points_balances.
async function notifyTierUnlock(
  supa: any,
  chatId: number,
  userId: string,
  newBalance: number,
) {
  // Highest tier the user qualifies for now
  let qualifiedGB = 0;
  for (const gb of REDEEMABLE_GB_OPTIONS) {
    if (newBalance >= pointsForGB(gb)) qualifiedGB = gb;
  }
  if (qualifiedGB === 0) return;

  // What tier have we already announced?
  const { data: bal } = await supa
    .from("telegram_points_balances")
    .select("tier_notified_max_gb")
    .eq("user_id", userId)
    .maybeSingle();
  const alreadyNotified = bal?.tier_notified_max_gb ?? 0;
  if (qualifiedGB <= alreadyNotified) return;

  // Persist the new high-water mark first (race-safe enough — worst case = no DM)
  const { error: updErr } = await supa
    .from("telegram_points_balances")
    .update({ tier_notified_max_gb: qualifiedGB })
    .eq("user_id", userId)
    .lt("tier_notified_max_gb", qualifiedGB);
  if (updErr) {
    console.error("[telegram-bot] tier_notified update failed:", updErr);
    return;
  }

  try {
    await sendMessage(
      chatId,
      [
        `🎁 <b>You just unlocked ${qualifiedGB}GB free data!</b>`,
        "",
        `Your balance (<b>${newBalance.toLocaleString()} pts</b>) is now enough for a <b>${qualifiedGB}GB</b> bundle — 100% free.`,
        "",
        "Tap /redeem when you're ready to claim it.",
      ].join("\n"),
      withMenu(),
    );
  } catch (e) {
    console.error("[telegram-bot] notifyTierUnlock send failed:", e);
  }
}

// Telegram-keyed tier-unlock DM. Same idempotent high-water-mark approach but
// keyed on telegram_user_id so guests (no linked account) also benefit.
async function notifyTierUnlockTg(
  supa: any,
  chatId: number,
  telegramUserId: number,
  newBalance: number,
) {
  let qualifiedGB = 0;
  for (const gb of REDEEMABLE_GB_OPTIONS) {
    if (newBalance >= pointsForGB(gb)) qualifiedGB = gb;
  }
  if (qualifiedGB === 0) return;

  const { data: bal } = await supa
    .from("telegram_points_balances")
    .select("tier_notified_max_gb")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  const alreadyNotified = bal?.tier_notified_max_gb ?? 0;
  if (qualifiedGB <= alreadyNotified) return;

  const { error: updErr } = await supa
    .from("telegram_points_balances")
    .update({ tier_notified_max_gb: qualifiedGB })
    .eq("telegram_user_id", telegramUserId)
    .lt("tier_notified_max_gb", qualifiedGB);
  if (updErr) {
    console.error("[telegram-bot] tier_notified_tg update failed:", updErr);
    return;
  }

  try {
    await sendMessage(
      chatId,
      [
        `🎁 <b>You just unlocked ${qualifiedGB}GB free data!</b>`,
        "",
        `Your balance (<b>${newBalance.toLocaleString()} pts</b>) is now enough for a <b>${qualifiedGB}GB</b> bundle — 100% free.`,
        "",
        "Tap /redeem when you're ready to claim it.",
      ].join("\n"),
      withMenu(),
    );
  } catch (e) {
    console.error("[telegram-bot] notifyTierUnlockTg send failed:", e);
  }
}


function todayAccraISO(): { date: string; today: Date } {
  // Ghana is UTC+0, so the UTC date is the Accra date.
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return { date: `${y}-${m}-${d}`, today: now };
}

function daysBetween(a: string, b: string): number {
  // a, b: 'YYYY-MM-DD'. Returns whole days a - b.
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((da - db) / 86_400_000);
}

async function getPointsBalance(supa: any, userId: string): Promise<number> {
  const { data } = await supa
    .from("telegram_points_balances")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  return Number(data?.balance ?? 0);
}

// Telegram-user-keyed balance lookup (preferred for all bot flows).
async function getPointsBalanceTg(supa: any, telegramUserId: number): Promise<number> {
  const { data } = await supa
    .from("telegram_points_balances")
    .select("balance")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  return Number(data?.balance ?? 0);
}

// Mark a Telegram user as "known". Used to lock in the original referrer
// the first time we see them, and to block re-referral abuse on subsequent
// /start interactions (even after the user removes and re-adds the bot).
// Returns the row as it was BEFORE the upsert (so callers can detect "first time").
async function markTelegramUserSeen(
  supa: any,
  telegramUserId: number,
  firstName: string | null,
  candidateReferrerTgUid: number | null,
): Promise<{ wasNew: boolean; firstReferrerTgUid: number | null }> {
  // Read first
  const { data: existing } = await supa
    .from("telegram_known_users")
    .select("telegram_user_id, first_referrer_telegram_user_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (existing) {
    // Update last_seen only — never overwrite first_referrer
    await supa.from("telegram_known_users")
      .update({ last_seen_at: new Date().toISOString(), first_name: firstName || null })
      .eq("telegram_user_id", telegramUserId);
    return { wasNew: false, firstReferrerTgUid: existing.first_referrer_telegram_user_id ?? null };
  }

  // Insert with referrer locked in
  await supa.from("telegram_known_users").insert({
    telegram_user_id: telegramUserId,
    first_name: firstName || null,
    first_referrer_telegram_user_id: candidateReferrerTgUid ?? null,
  });
  return { wasNew: true, firstReferrerTgUid: candidateReferrerTgUid ?? null };
}

async function isPointsEnabled(supa: any): Promise<boolean> {
  const { data } = await supa
    .from("telegram_points_config")
    .select("points_system_enabled")
    .eq("id", true)
    .maybeSingle();
  return data?.points_system_enabled !== false;
}

async function handleCheckin(supa: any, chatId: number) {
  await touchLink(supa, chatId);
  const link = await getLink(supa, chatId); // optional — used only for legacy user_id metadata
  const tgUserId = chatId;

  const enabled = await isPointsEnabled(supa);
  if (!enabled) {
    await sendMessage(chatId, "Daily check-in is paused right now. Try again later.", withMenu());
    return;
  }

  const { date: today } = todayAccraISO();

  // Find most recent check-in to compute streak continuation (telegram-keyed)
  const { data: last } = await supa
    .from("telegram_checkins")
    .select("checkin_date, streak_count")
    .eq("telegram_user_id", tgUserId)
    .order("checkin_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  let newStreak = 1;
  if (last?.checkin_date) {
    const gap = daysBetween(today, last.checkin_date);
    if (gap === 0) {
      const balance = await getPointsBalanceTg(supa, tgUserId);
      await sendMessage(
        chatId,
        [
          "✅ <b>You already checked in today</b>",
          "",
          `🔥 Streak: <b>${last.streak_count} day${last.streak_count === 1 ? "" : "s"}</b>`,
          `⭐ Points: <b>${balance}</b>`,
          "",
          "Come back tomorrow to keep your streak going!",
        ].join("\n"),
        withMenu(),
      );
      return;
    }
    if (gap === 1) {
      newStreak = (last.streak_count || 0) + 1;
    } else {
      newStreak = 1;
    }
  }

  // Insert today's check-in (telegram-keyed unique constraint)
  const { error: insertErr } = await supa
    .from("telegram_checkins")
    .insert({
      telegram_user_id: tgUserId,
      user_id: link?.user_id ?? null,
      checkin_date: today,
      streak_count: newStreak,
    });

  if (insertErr) {
    if (insertErr.code === "23505") {
      const balance = await getPointsBalanceTg(supa, tgUserId);
      await sendMessage(
        chatId,
        `✅ Already checked in today. Balance: <b>${balance} pts</b>.`,
        withMenu(),
      );
      return;
    }
    console.error("[telegram-bot] checkin insert failed:", insertErr);
    await sendMessage(chatId, "⚠️ <b>Couldn't record your check-in</b>\n\nPlease try /checkin again in a moment.", withMenu());
    return;
  }

  const isWeekMilestone = newStreak > 0 && newStreak % 7 === 0;
  const reward = CHECKIN_BASE_PTS + (isWeekMilestone ? CHECKIN_WEEK_BONUS_PTS : 0);

  const referenceId = `checkin:tg:${tgUserId}:${today}`;
  let grantResult: GrantResult;
  try {
    grantResult = await grantPointsSafeTg(
      supa,
      tgUserId,
      reward,
      "checkin",
      referenceId,
      link?.user_id ?? null,
    );
  } catch (err) {
    const ge = err as GrantPointsError;
    console.error("[telegram-bot] checkin grant failed:", ge.code, ge.message, ge.detail);
    await sendMessage(
      chatId,
      [
        "✅ Check-in recorded — but points couldn't be credited.",
        "",
        grantErrorUserMessage(ge),
      ].join("\n"),
      withMenu(),
    );
    return;
  }

  const balance = await getPointsBalanceTg(supa, tgUserId);
  notifyTierUnlockTg(supa, chatId, tgUserId, balance).catch(() => {});
  const fire = "🔥".repeat(Math.min(5, Math.max(1, Math.floor(newStreak / 3) || 1)));
  const milestoneLine = isWeekMilestone
    ? `\n🎉 <b>${newStreak}-day milestone!</b> +${CHECKIN_WEEK_BONUS_PTS} bonus pts`
    : "";

  await sendMessage(
    chatId,
    [
      `✨ <b>Checked in! +${reward} pts</b>${milestoneLine}`,
      "",
      `${fire} Streak: <b>${newStreak} day${newStreak === 1 ? "" : "s"}</b>`,
      `⭐ Balance: <b>${balance} pts</b>`,
      "",
      "Come back tomorrow to keep the streak alive!",
    ].join("\n"),
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "⭐ View points", callback_data: "points:view" }],
          [{ text: "🛒 Buy data", callback_data: "menu:buy" }],
        ],
      },
    },
  );
}

async function handlePoints(supa: any, chatId: number) {
  await touchLink(supa, chatId);
  const tgUserId = chatId;

  const balance = await getPointsBalanceTg(supa, tgUserId);

  const { data: last } = await supa
    .from("telegram_checkins")
    .select("checkin_date, streak_count")
    .eq("telegram_user_id", tgUserId)
    .order("checkin_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { date: today } = todayAccraISO();
  let streakLine = "🔥 Streak: <b>0 days</b> — start one today!";
  let canCheckinToday = true;
  if (last?.checkin_date) {
    const gap = daysBetween(today, last.checkin_date);
    if (gap === 0) {
      streakLine = `🔥 Streak: <b>${last.streak_count} day${last.streak_count === 1 ? "" : "s"}</b> · ✅ Checked in today`;
      canCheckinToday = false;
    } else if (gap === 1) {
      streakLine = `🔥 Streak: <b>${last.streak_count} day${last.streak_count === 1 ? "" : "s"}</b> — check in to extend!`;
    } else {
      streakLine = `🔥 Streak reset — last check-in was ${gap} days ago. Start a new streak today!`;
    }
  }

  const buttons: InlineKeyboard = [];
  if (canCheckinToday) {
    buttons.push([{ text: "✨ Daily check-in (+5 pts)", callback_data: "points:checkin" }]);
  }
  if (balance >= POINTS_PER_GB) {
    buttons.push([{ text: `🎁 Redeem for free data (${balance.toLocaleString()} pts)`, callback_data: "redeem:start" }]);
  }
  buttons.push([{ text: "🎁 Invite friends", callback_data: "menu:refer" }]);

  const tableLines = REDEEMABLE_GB_OPTIONS.map((gb) => {
    const cost = pointsForGB(gb);
    const tick = balance >= cost ? "✅" : "🔒";
    return `${tick} <b>${gb}GB</b> — ${cost.toLocaleString()} pts`;
  });

  await sendMessage(
    chatId,
    [
      "⭐ <b>Your DataSika points</b>",
      "",
      `Balance: <b>${balance.toLocaleString()} pts</b>`,
      streakLine,
      "",
      "<b>Redeem for 100% free data:</b>",
      ...tableLines,
      "",
      "<i>Points redeem only for free bundles — they never convert to cash.</i>",
    ].join("\n"),
    { reply_markup: { inline_keyboard: buttons } },
  );
}

// ── /leaderboard (Phase 7) ─────────────────────────────────────────────
async function handleLeaderboard(supa: any, chatId: number, viewerFirstName?: string | null) {
  const { data, error } = await supa.rpc("telegram_points_weekly_leaderboard", { p_limit: 10 });
  if (error) {
    await sendMessage(chatId, "Couldn't load the leaderboard right now. Try again shortly.", withMenu());
    return;
  }
  const rows = (data || []) as Array<{ rank: number; telegram_user_id: number | null; first_name: string | null; username: string | null; chat_id: number | null; points_earned: number }>;
  if (rows.length === 0) {
    await sendMessage(chatId, "🏆 <b>Weekly leaderboard</b>\n\nNo earners yet this week — be the first! Try /checkin or /refer.", withMenu());
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  let anonN = 0;
  const viewerName = (viewerFirstName || "").trim();
  const lines = rows.map((r, i) => {
    const fn = Number(r.telegram_user_id) === Number(chatId) && viewerName ? viewerName : (r.first_name || "").trim();
    const name = esc(fn || `Friend #${++anonN}`);
    const badge = medals[i] || `${r.rank}.`;
    return `${badge} <b>${name}</b> — ${r.points_earned.toLocaleString()} pts`;
  });
  await sendMessage(
    chatId,
    ["🏆 <b>Top earners this week</b>", "", ...lines, "", "<i>Resets every Monday at midnight GMT.</i>"].join("\n"),
    withMenu(),
  );
}

// ── /redeem (Phase 5) ──────────────────────────────────────────────────
// Strict spec: 1,000 pts = 1GB free bundle, network-specific, 100% free
// (no cash component, no partial redemption, no GHS conversion). Recipient
// defaults to the user's linked phone but can be overridden.

async function handleRedeemStart(supa: any, chatId: number) {
  await touchLink(supa, chatId);
  const tgUserId = chatId;

  const balance = await getPointsBalanceTg(supa, tgUserId);
  if (balance < POINTS_PER_GB) {
    await sendMessage(
      chatId,
      [
        "🎁 <b>Redeem free data</b>",
        "",
        `Balance: <b>${balance.toLocaleString()} pts</b>`,
        `You need at least <b>${POINTS_PER_GB.toLocaleString()} pts</b> to redeem 1GB.`,
        "",
        "Earn more by checking in daily and inviting friends.",
      ].join("\n"),
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✨ Daily check-in", callback_data: "points:checkin" }],
            [{ text: "🎁 Invite friends", callback_data: "menu:refer" }],
          ],
        },
      },
    );
    return;
  }

  await setSession(supa, chatId, "redeem_network", { balance });
  await sendTransient(
    supa,
    chatId,
    [
      "🎁 <b>Redeem free data</b>",
      "",
      `Balance: <b>${balance.toLocaleString()} pts</b>`,
      "",
      "Pick a network:",
    ].join("\n"),
    {
      inline_keyboard: [
        [
          { text: "MTN", callback_data: "redeem_net:MTN" },
          { text: "Telecel", callback_data: "redeem_net:Telecel" },
          { text: "AirtelTigo", callback_data: "redeem_net:AirtelTigo" },
        ],
        [{ text: "↩️ Cancel", callback_data: "redeem_cancel" }],
      ],
    },
  );
}

async function handleRedeemNetwork(supa: any, chatId: number, network: string) {
  const tgUserId = chatId;
  const balance = await getPointsBalanceTg(supa, tgUserId);

  const { data: products } = await supa
    .from("products")
    .select("id, bundle_size_gb, price_ghs, cost_price_ghs, active")
    .eq("network", network)
    .eq("active", true);

  if (!products || products.length === 0) {
    await sendMessage(chatId, `No active ${esc(network)} bundles right now. Try another network.`, withMenu());
    await clearSession(supa, chatId);
    return;
  }

  const bySize = new Map<number, any>();
  for (const p of products) {
    const gb = Number(p.bundle_size_gb);
    const existing = bySize.get(gb);
    if (!existing || Number(p.price_ghs) < Number(existing.price_ghs)) {
      bySize.set(gb, p);
    }
  }

  const rows: InlineKeyboard = [];
  for (const gb of REDEEMABLE_GB_OPTIONS) {
    const product = bySize.get(gb);
    const cost = pointsForGB(gb);
    if (!product) continue;
    if (balance >= cost) {
      rows.push([{ text: `🎁 ${gb}GB — ${cost.toLocaleString()} pts`, callback_data: `redeem_bdl:${product.id}:${gb}` }]);
    } else {
      const need = cost - balance;
      rows.push([{ text: `🔒 ${gb}GB — need ${need.toLocaleString()} more pts`, callback_data: "redeem_locked" }]);
    }
  }
  rows.push([{ text: "↩️ Cancel", callback_data: "redeem_cancel" }]);

  if (rows.length === 1) {
    await sendMessage(chatId, `${esc(network)} doesn't have any redeemable bundle sizes right now.`, withMenu());
    await clearSession(supa, chatId);
    return;
  }

  await setSession(supa, chatId, "redeem_bundle", { network, balance });
  await sendMessage(
    chatId,
    [
      `🎁 <b>${esc(network)} — pick a bundle</b>`,
      "",
      `Balance: <b>${balance.toLocaleString()} pts</b>`,
    ].join("\n"),
    { reply_markup: { inline_keyboard: rows } },
  );
}

async function handleRedeemBundle(supa: any, chatId: number, productId: string, gb: number) {
  const tgUserId = chatId;
  const link = await getLink(supa, chatId); // optional — used only for "Use my number" affordance

  const cost = pointsForGB(gb);
  const balance = await getPointsBalanceTg(supa, tgUserId);
  if (balance < cost) {
    await sendMessage(chatId, `🔒 <b>Not enough points</b>\n\nYou need <b>${(cost - balance).toLocaleString()} more pts</b> for this bundle.\nTap /points to see your balance or /checkin to earn more.`, withMenu());
    await clearSession(supa, chatId);
    return;
  }

  const { data: product } = await supa
    .from("products")
    .select("id, network, bundle_size_gb, active, cost_price_ghs")
    .eq("id", productId).maybeSingle();
  if (!product || !product.active || Number(product.bundle_size_gb) !== gb) {
    await sendMessage(chatId, "⚠️ <b>That bundle is no longer available</b>\n\nRun /redeem to see current options.", withMenu());
    await clearSession(supa, chatId);
    return;
  }

  await setSession(supa, chatId, "redeem_recipient", {
    product_id: product.id,
    network: product.network,
    bundle_size_gb: gb,
    cost_pts: cost,
    cost_price_ghs: Number(product.cost_price_ghs ?? 0),
  });

  const extraRows: InlineKeyboard = [];
  if (link?.phone && detectNetwork(link.phone) === product.network) {
    extraRows.push([{ text: `📱 Use my number (${link.phone})`, callback_data: "redeem_rcpt:self" }]);
  }

  await sendInputPrompt(
    chatId,
    [
      `🎁 <b>${gb}GB ${esc(product.network)}</b> — ${cost.toLocaleString()} pts (FREE bundle)`,
      "",
      "Who is this bundle for?",
      "Reply with the recipient's number (e.g. <code>0241234567</code>)",
      "",
      "Send /cancel to go back.",
    ].join("\n"),
    "redeem_cancel",
    extraRows,
  );
}

async function handleRedeemRecipient(supa: any, chatId: number, recipientLocal: string) {
  const tgUserId = chatId;

  const session = await getSession(supa, chatId);
  if (session.state !== "redeem_recipient" || !session.data?.product_id) {
    await sendMessage(chatId, "⏱ <b>Redemption session expired</b>\n\nRun /redeem to start again.", withMenu()); return;
  }

  const detected = detectNetwork(recipientLocal);
  if (!detected || detected !== session.data.network) {
    await sendMessage(chatId, `❌ <b>Wrong network</b>\n\nThat number isn't on <b>${esc(session.data.network)}</b>. Send a valid ${esc(session.data.network)} number or tap /redeem to start over.`);
    return;
  }

  const balance = await getPointsBalanceTg(supa, tgUserId);
  const cost = Number(session.data.cost_pts);
  if (balance < cost) {
    await sendMessage(chatId, `⚠️ <b>Balance changed</b>\n\nYou now have <b>${balance.toLocaleString()} pts</b> but need <b>${cost.toLocaleString()} pts</b>.\nTap /checkin to earn more or /points to see options.`, withMenu());
    await clearSession(supa, chatId);
    return;
  }

  await setSession(supa, chatId, "redeem_confirm", {
    ...session.data,
    recipient: recipientLocal,
  });

  await sendTransient(
    supa,
    chatId,
    [
      "🎁 <b>Confirm redemption</b>",
      "",
      `Bundle: <b>${esc(session.data.bundle_size_gb)}GB ${esc(session.data.network)}</b>`,
      `Recipient: <code>${esc(recipientLocal)}</code>`,
      `Cost: <b>${cost.toLocaleString()} pts</b>`,
      `Cash: <b>FREE</b> (no payment needed)`,
      "",
      "Tap <b>Redeem now</b> to deduct points and dispatch.",
      "<i>Points are deducted immediately. If delivery fails, points are refunded automatically.</i>",
    ].join("\n"),
    {
      inline_keyboard: [
        [{ text: "✅ Redeem now", callback_data: "redeem_confirm:yes" }],
        [{ text: "↩️ Cancel", callback_data: "redeem_cancel" }],
      ],
    },
  );
}

async function handleRedeemConfirm(supa: any, chatId: number) {
  const tgUserId = chatId;
  const link = await getLink(supa, chatId); // optional

  const session = await getSession(supa, chatId);
  if (session.state !== "redeem_confirm" || !session.data?.product_id || !session.data?.recipient) {
    await sendMessage(chatId, "⏱ <b>Redemption session expired</b>\n\nRun /redeem to start again.", withMenu()); return;
  }

  const s = session.data;
  const cost = Number(s.cost_pts);
  const orderId = genOrderId();

  // Step 1: insert order row. user_id is optional (guest redemption supported).
  const { error: orderErr } = await supa.from("orders").insert({
    order_id: orderId,
    user_id: link?.user_id ?? null,
    recipient_number: s.recipient,
    network: s.network,
    product_id: s.product_id,
    bundle_size_gb: s.bundle_size_gb,
    amount_ghs: 0,
    processing_fee: 0,
    total_paid: 0,
    cost_price_ghs: s.cost_price_ghs ?? null,
    status: "Pending",
    payment_method: "reward",
    payment_status: "paid",
    order_type: "reward",
    order_source: "telegram",
    telegram_chat_id: chatId,
    admin_notes: `Telegram points redemption: ${cost} pts → ${s.bundle_size_gb}GB ${s.network} (tg_uid=${tgUserId})`,
  });
  if (orderErr) {
    console.error("[telegram-bot][redeem] order insert failed:", orderErr);
    await sendMessage(chatId, "⚠️ <b>Couldn't create your redemption</b>\n\nNo points were deducted. Please try /redeem again.", withMenu());
    return;
  }

  // Step 2: deduct points (telegram-keyed). Idempotent on reference_id.
  const debitRef = `redemption:${orderId}`;
  try {
    await grantPointsSafeTg(supa, tgUserId, -cost, "redemption", debitRef, link?.user_id ?? null);
  } catch (err) {
    const ge = err as GrantPointsError;
    console.error("[telegram-bot][redeem] points debit failed:", ge.code, ge.message, ge.detail);
    await supa.from("orders").update({
      status: "Cancelled",
      failure_reason: `Points debit failed: ${ge.code}`,
    }).eq("order_id", orderId);
    const errMsg = ge.code === "INSUFFICIENT_POINTS"
      ? "⚠️ <b>Balance changed</b>\n\nYou no longer have enough points for this redemption. Tap /points to see your current balance."
      : grantErrorUserMessage(ge);
    await sendMessage(chatId, errMsg, withMenu());
    await clearSession(supa, chatId);
    return;
  }

  await clearSession(supa, chatId);
  await sendMessage(
    chatId,
    [
      "🎁 <b>Redemption locked in!</b>",
      "",
      `📦 <b>${esc(s.bundle_size_gb)}GB ${esc(s.network)}</b> → <code>${esc(s.recipient)}</code>`,
      `⭐ ${cost.toLocaleString()} pts deducted`,
      `📋 Order: <code>${esc(orderId)}</code>`,
      "",
      "Dispatching now…",
    ].join("\n"),
    withMenu(),
  );

  // Step 3: dispatch (or queue). Failures auto-refund (telegram-keyed).
  await dispatchRedemption(supa, chatId, orderId, tgUserId, link?.user_id ?? null, s, cost, debitRef);
}

async function dispatchRedemption(
  supa: any,
  chatId: number,
  orderId: string,
  telegramUserId: number,
  userId: string | null,
  s: any,
  cost: number,
  debitRef: string,
) {
  // Bulk dispatch queue gate (master switch = feature flag + manual_bulk mode)
  try {
    if (await shouldQueueOrder(supa, { order_id: orderId, network: s.network }, "orders")) {
      console.log(`[telegram-bot][redeem][queue] Order ${orderId} queued (flag+manual_bulk active)`);
      await supa.from("orders").update({ queue_state: "queued" }).eq("order_id", orderId);
      await sendMessage(
        chatId,
        `⏳ Your redemption is queued for manual delivery. We'll notify you here when it's sent.`,
        withMenu(),
      );
      return;
    }
  } catch (e) {
    console.warn("[telegram-bot][redeem] queue gate check failed:", e);
  }

  const supplierPayload = {
    network: s.network,
    phone_number: s.recipient,
    data_amount: String(s.bundle_size_gb),
  };

  let dispatchOk = false;
  let failureReason = "Unknown dispatch error";

  try {
    await supa.from("orders").update({ status: "Processing" }).eq("order_id", orderId);

    const result = await dispatchToSupplier(supa, supplierPayload, s.product_id, { orderId });
    const rawResponse = JSON.stringify(result.body);

    if (result.ok) {
      const p = parseDispatchResult(result);
      await supa.from("orders").update({
        status: p.newStatus,
        supplier_order_id: p.supplierOrderId,
        supplier_reference: p.supplierReference,
        supplier_status: p.supplierStatus,
        supplier_message: p.supplierMessage,
        supplier_amount: p.supplierAmount,
        supplier_remaining_balance: p.supplierBalance,
        supplier_raw_response: rawResponse,
        supplier_timestamp: new Date().toISOString(),
        supplier_id: p.supplierId,
      }).eq("order_id", orderId);

      // Log supplier spend (cost is paid by DataSika since user paid in points).
      try {
        await logSupplierSpend(supa, orderId, Number(s.cost_price_ghs || 0), {
          network: s.network,
          bundle_size_gb: s.bundle_size_gb,
          recipient: s.recipient,
          supplier_order_id: p.supplierOrderId,
          created_by: `telegram_redemption:tg_${telegramUserId}${userId ? `:u_${userId}` : ""}`,
        });
      } catch (e) {
        console.warn("[telegram-bot][redeem] logSupplierSpend non-fatal:", e);
      }

      dispatchOk = true;
      console.log(`[telegram-bot][redeem] ${orderId} dispatched OK → ${p.newStatus}`);
    } else {
      failureReason = String(
        (result.body as any)?.message || (result.body as any)?.error || `Supplier HTTP ${result.status}`,
      ).slice(0, 500);
      await supa.from("orders").update({
        status: "Failed",
        failure_reason: failureReason,
        supplier_raw_response: rawResponse,
        supplier_status: "failed",
        supplier_message: failureReason,
        supplier_timestamp: new Date().toISOString(),
      }).eq("order_id", orderId);
      console.error(`[telegram-bot][redeem] ${orderId} dispatch FAILED: ${failureReason}`);
    }
  } catch (err: any) {
    failureReason = String(err?.message || err).slice(0, 500);
    console.error(`[telegram-bot][redeem] ${orderId} dispatch threw:`, err);
    await supa.from("orders").update({
      status: "Failed",
      failure_reason: failureReason,
    }).eq("order_id", orderId);
  }

  // Step 4: refund on failure (idempotent — separate reference_id).
  if (!dispatchOk) {
    const refundRef = `redemption_refund:${orderId}`;
    let refunded = false;
    try {
      await grantPointsSafeTg(supa, telegramUserId, cost, "redemption", refundRef, userId);
      refunded = true;
    } catch (err) {
      const ge = err as GrantPointsError;
      console.error(`[telegram-bot][redeem] REFUND FAILED for ${orderId}:`, ge.code, ge.message, ge.detail);
    }

    if (!refunded) {
      await sendMessage(
        chatId,
        [
          `⚠️ <b>Redemption failed</b>`,
          "",
          `Order: <code>${esc(orderId)}</code>`,
          `Reason: ${esc(failureReason)}`,
          "",
          `Your points refund couldn't be applied automatically — please contact /support and quote the order ID.`,
        ].join("\n"),
        withMenu(),
      );
    } else {
      await sendMessage(
        chatId,
        [
          `⚠️ <b>Redemption failed</b>`,
          "",
          `Order: <code>${esc(orderId)}</code>`,
          `Reason: ${esc(failureReason)}`,
          "",
          `✅ <b>${cost.toLocaleString()} pts refunded</b> to your balance.`,
          "Try /redeem again or contact /support.",
        ].join("\n"),
        withMenu(),
      );
    }
  }
  // On success the existing notify_telegram_on_delivered DB trigger will
  // message the user when the order transitions to Delivered (same as paid orders).
}


// ── /start (with optional start param) ─────────────────────────────────
async function handleStart(supa: any, chatId: number, fromName: string, startParam: string, tgUsername: string | null) {
  // 1. Magic link
  if (startParam.startsWith("link_")) {
    return handleLinkToken(supa, chatId, startParam.slice(5), fromName, tgUsername);
  }
  // 2. Payment confirmation deep link (orders + deposits)
  if (startParam.startsWith("paid_")) {
    const ref = startParam.slice(5);

    // Deposits: TGDEP-* references
    if (ref.startsWith("TGDEP-")) {
      const { data: payment } = await supa
        .from("paystack_payments")
        .select("amount_ghs, status")
        .eq("reference", ref)
        .maybeSingle();
      const link = await getLink(supa, chatId);
      const { data: wallet } = link
        ? await supa.from("wallets").select("balance_ghs").eq("user_id", link.user_id).maybeSingle()
        : { data: null };
      const credited = payment?.status === "success" || payment?.status === "completed";
      await sendMessage(
        chatId,
        credited
          ? [
              "✅ <b>Wallet topped up</b>",
              "",
              `Credited: <b>GHS ${Number(payment?.amount_ghs ?? 0).toFixed(2)}</b>`,
              `New balance: <b>GHS ${Number(wallet?.balance_ghs ?? 0).toFixed(2)}</b>`,
              "",
              "Tap /buy to use it now.",
            ].join("\n")
          : [
              "⏳ <b>Processing your deposit…</b>",
              "",
              "We'll credit your wallet the moment Paystack confirms it — usually within a minute.",
              "",
              `Reference: <code>${esc(ref)}</code>`,
            ].join("\n"),
        withMenu(),
      );
      return;
    }

    // Orders: look up by paystack reference
    const { data: order } = await supa
      .from("orders")
      .select("order_id, network, bundle_size_gb, recipient_number, status")
      .eq("paystack_reference", ref)
      .maybeSingle();

    if (order) {
      await sendMessage(
        chatId,
        [
          "✅ <b>Payment received</b>",
          "",
          `<b>${esc(order.bundle_size_gb)}GB ${esc(order.network)}</b> → <b>${esc(order.recipient_number)}</b>`,
          `Order: <code>${esc(order.order_id)}</code>`,
          `Status: <b>${esc(order.status)}</b>`,
          "",
          "We'll message you here the moment your bundle is delivered.",
        ].join("\n"),
        withMenu(),
      );
    } else {
      await sendMessage(
        chatId,
        [
          "✅ <b>Payment received</b>",
          "",
          "We're processing your bundle now — confirmation lands here in a moment.",
          "",
          `Reference: <code>${esc(ref)}</code>`,
        ].join("\n"),
        withMenu(),
      );
    }
    return;
  }
  // 3. Apply-to-agent shortcut
  if (startParam === "agent") {
    return handleAgent(chatId);
  }
  // 4. Referral deep link: ref_<REFERRER_CHAT_ID>
  if (startParam.startsWith("ref_")) {
    const raw = startParam.slice(4);
    const referrerChatId = Number(raw);
    if (Number.isFinite(referrerChatId) && Number.isInteger(referrerChatId)) {
      // Anti-abuse: lock in the original referrer the FIRST time we see this
      // Telegram user. If they've been seen before, ignore any new ref_ param —
      // they can't re-claim a different referrer by removing/re-adding the bot.
      const seen = await markTelegramUserSeen(
        supa,
        chatId,
        fromName || null,
        referrerChatId,
      );

      if (seen.wasNew) {
        // First-ever interaction → register the pending referral.
        const existingLink = await getLink(supa, chatId);
        const result = await registerPendingReferral(supa, chatId, referrerChatId);
        if (result.status === "created" && existingLink) {
          await backfillReferralUserIds(supa, chatId, existingLink.user_id);
        }
        // Notify referrer (best-effort) + send ONE combined welcome to referee.
        let referrerName = "A friend";
        if (result.status === "created") {
          try {
            const { data: refLink } = await supa
              .from("telegram_links")
              .select("first_name")
              .eq("chat_id", referrerChatId)
              .maybeSingle();
            const { data: refKnown } = await supa
              .from("telegram_known_users")
              .select("first_name")
              .eq("telegram_user_id", referrerChatId)
              .maybeSingle();
            referrerName =
              ((refLink?.first_name || refKnown?.first_name || "").trim()) || "A friend";

            const stats = await getReferralStats(supa, referrerChatId).catch(() => null);
            const totalRefs = stats?.total ?? 0;

            await sendMessage(
              referrerChatId,
              [
                `ℹ️ <b>A user has joined the bot using your referral link.</b>`,
                ``,
                `Total referrals: <b>${totalRefs}</b>`,
                ``,
                `Once they place their first order, you'll earn <b>400 points</b> and they'll get <b>100 points</b>.`,
                ``,
                `Keep sharing your link to earn more!`,
              ].join("\n"),
            ).catch((e) => console.error("[start] notify referrer (join) failed:", e));
          } catch (e) {
            console.error("[start] referral join notifications failed:", e);
          }
        }

        // ONE combined first-time welcome (referral context + standard welcome).
        const refereeName = (fromName || "").trim() || "Friend";
        await sendMessage(
          chatId,
          [
            `👋 Welcome to <b>DataSika</b>, ${esc(refereeName)}!`,
            ``,
            `Buy MTN, Telecel & AirtelTigo data bundles right here in chat. <b>No account needed</b> 🚀`,
            ``,
            `<b>${esc(referrerName)}</b> referred you — place your first order and you'll earn <b>100 points</b> (and your friend gets 400) 🎁`,
            ``,
            `Link your DataSika account for extras: wallet payments, faster checkout, daily points & free data.`,
            ``,
            `Tap a button below or type /help.`,
          ].join("\n"),
          withMenu(),
        );
        return;
      } else {
        // Already known — ignore new ref_ param (anti-abuse lock-in).
        console.log("[start] referral param ignored — user already known", {
          chat_id: chatId,
          original_referrer: seen.firstReferrerTgUid,
          attempted_referrer: referrerChatId,
        });
      }
    }
    // Fall through to default welcome (returning user)
  }

  // Non-referral /start (or returning referred user): mark seen and route by recency.
  const seenOrganic = await markTelegramUserSeen(supa, chatId, fromName || null, null).catch(() => null);

  // Default welcome
  const link = await getLink(supa, chatId);
  if (link) {
    await touchLink(supa, chatId);
    const nudge = await getReturningUserNudge(supa, link.user_id);
    const lines = [`👋 Welcome back, <b>${esc(fromName)}</b>!`];
    if (nudge) {
      lines.push("", nudge);
    } else {
      lines.push("", "What can I help you with today?");
    }
    await sendMessage(chatId, lines.join("\n"), withMenu());
    return;
  }

  // Unlinked: distinguish first-ever vs returning unlinked guest.
  if (seenOrganic && seenOrganic.wasNew) {
    await showWelcome(chatId, fromName);
  } else {
    await sendMessage(
      chatId,
      [
        `👋 Welcome back, <b>${esc(fromName)}</b>!`,
        ``,
        `Tap 🛒 <b>Buy Data</b> to get started, or type /help.`,
      ].join("\n"),
      withMenu(),
    );
  }
}

// ── /start (no param): phone-OTP fallback flow ─────────────────────────
async function handlePhoneInput(supa: any, chatId: number, text: string) {
  const local = normalizeGhanaLocal(text);
  if (!local) {
    await sendMessage(chatId, "❌ <b>That doesn't look like a Ghana number</b>\n\nReply with a 10-digit number, e.g. <code>0241234567</code>.");
    return;
  }
  const last9 = local.slice(1);
  const candidates = [local, last9, "+233" + last9, "233" + last9];
  let { data: rows } = await supa.from("profiles").select("id, full_name, email, phone").in("phone", candidates).limit(10);
  if (!rows || rows.length === 0) {
    const { data: fuzzy } = await supa.from("profiles").select("id, full_name, email, phone").ilike("phone", `%${last9}`).limit(10);
    rows = fuzzy || [];
  }
  const seen = new Set<string>();
  const accounts = (rows || []).filter((p: any) => p?.id && !seen.has(p.id) && (seen.add(p.id), true));

  if (accounts.length === 0) {
    await sendMessage(
      chatId,
      `❌ <b>No DataSika account found</b>\n\nWe couldn't find an account for that number.\n\nCreate one at <a href="${SITE_URL}/auth">${SITE_URL}/auth</a>, then run /link.`,
      withMenu(),
    );
    await clearSession(supa, chatId);
    return;
  }

  const otp = genOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();
  await supa.from("telegram_link_otps").insert({ chat_id: chatId, phone: local, otp_code: otp, expires_at: expiresAt });

  const accountOptions = accounts.map((p: any) => ({
    id: p.id, full_name: p.full_name || "DataSika account", email: p.email || null, phone: p.phone || local,
  }));
  const smsOk = await sendOtpSms(toArkesel233(local), otp);
  await setSession(supa, chatId, "awaiting_otp", {
    phone: local,
    user_id: accountOptions.length === 1 ? accountOptions[0].id : null,
    account_options: accountOptions,
  });
  await sendInputPrompt(
    chatId,
    smsOk
      ? `📨 <b>Code sent</b>\n\nWe texted a 6-digit code to <b>${esc(local)}</b>.\nReply with the code to finish linking, or send /cancel to go back.`
      : `⚠️ <b>Couldn't send the SMS</b>\n\nWe saved your code but the text didn't go through. If it doesn't arrive in 2 minutes, tap /support. Send /cancel to go back.`,
    "link:cancel",
  );
}

async function handleOtpInput(supa: any, chatId: number, text: string, fromName: string, tgUsername: string | null) {
  const otp = text.trim().replace(/\D/g, "");
  if (otp.length !== 6) { await sendMessage(chatId, "❌ <b>Code must be 6 digits</b>\n\nReply with the 6-digit code from your SMS."); return; }
  const session = await getSession(supa, chatId);
  if (session.state !== "awaiting_otp" || !session.data?.phone) {
    await sendMessage(chatId, "⏱ <b>Linking session expired</b>\n\nRun /link to start again.", withMenu());
    await clearSession(supa, chatId);
    return;
  }
  const { data: rows } = await supa
    .from("telegram_link_otps")
    .select("id, otp_code, attempts, expires_at, consumed_at")
    .eq("chat_id", chatId).eq("phone", session.data.phone).is("consumed_at", null)
    .order("created_at", { ascending: false }).limit(1);
  const row = rows?.[0];
  if (!row) { await sendMessage(chatId, "⚠️ <b>No active code</b>\n\nRun /link to request a new one.", withMenu()); return; }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await sendMessage(chatId, "⏱ <b>Code expired</b>\n\nRun /link to get a fresh one.", withMenu());
    await clearSession(supa, chatId); return;
  }
  if (row.attempts >= MAX_OTP_ATTEMPTS) {
    await sendMessage(chatId, "🚫 <b>Too many wrong attempts</b>\n\nFor your security, run /link to start over.", withMenu());
    await clearSession(supa, chatId); return;
  }
  if (row.otp_code !== otp) {
    await supa.from("telegram_link_otps").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    await sendMessage(chatId, `❌ <b>Wrong code</b>\n\n${MAX_OTP_ATTEMPTS - row.attempts - 1} attempt(s) left. Double-check the SMS and try again.`);
    return;
  }
  await supa.from("telegram_link_otps").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);

  const accountOptions = (session.data.account_options || []) as Array<{ id: string; full_name?: string; email?: string | null }>;
  if (accountOptions.length > 1) {
    await setSession(supa, chatId, "awaiting_account_choice", {
      phone: session.data.phone, account_options: accountOptions, tg_username: tgUsername, from_name: fromName,
    });
    const buttons = accountOptions.slice(0, 8).map((a, i) => ([{
      text: `${i + 1}. ${a.full_name || "DataSika account"}${a.email ? ` — ${a.email}` : ""}`.slice(0, 58),
      callback_data: `link_acct:${a.id}`,
    }]));
    await sendMessage(chatId, "✅ Phone verified. Choose the account to link:", { reply_markup: { inline_keyboard: buttons } });
    return;
  }

  const userId = session.data.user_id || accountOptions[0]?.id;
  if (!userId) {
    await sendMessage(chatId, "We verified the code but couldn't identify the account. Contact support.", withMenu());
    await clearSession(supa, chatId); return;
  }
  await supa.from("telegram_links").upsert({
    chat_id: chatId, user_id: userId, phone: session.data.phone,
    username: tgUsername, first_name: fromName, last_active_at: new Date().toISOString(),
  });
  await backfillReferralUserIds(supa, chatId, userId);
  await clearSession(supa, chatId);
  await sendMessage(chatId, "✅ <b>Account linked!</b> You now have wallet, /account, and /deposit.", withMenu());
}

// ── /buy step 1: network picker ────────────────────────────────────────
async function handleBuyStart(supa: any, chatId: number, prefilled?: { network?: string; productId?: string; recipient?: string }) {
  if (prefilled?.productId) {
    // Re-buy shortcut
    await setSession(supa, chatId, "buy_bundle", { network: prefilled.network });
    await handleBuyBundle(supa, chatId, prefilled.productId, prefilled.recipient);
    return;
  }
  await setSession(supa, chatId, "buy_network", {});
  await sendTransient(supa, chatId, "📡 Which network?", {
    inline_keyboard: [
      [
        { text: "MTN", callback_data: "buy_net:MTN" },
        { text: "Telecel", callback_data: "buy_net:Telecel" },
        { text: "AirtelTigo", callback_data: "buy_net:AirtelTigo" },
      ],
      [{ text: "↩️ Cancel", callback_data: "buy_cancel" }],
    ],
  });
}

async function handleBuyNetwork(supa: any, chatId: number, network: string) {
  const { data: products } = await supa
    .from("products")
    .select("id, bundle_size_gb, price_ghs")
    .eq("network", network).eq("active", true)
    .order("bundle_size_gb", { ascending: true });

  if (!products || products.length === 0) {
    await sendMessage(chatId, `No active bundles for ${esc(network)} right now.`, withMenu());
    await clearSession(supa, chatId);
    return;
  }
  await setSession(supa, chatId, "buy_bundle", { network });
  const rows: InlineKeyboard = [];
  for (let i = 0; i < products.length; i += 2) {
    rows.push(products.slice(i, i + 2).map((p: any) => ({
      text: `${p.bundle_size_gb}GB · GHS ${Number(p.price_ghs).toFixed(2)}`,
      callback_data: `buy_bdl:${p.id}`,
    })));
  }
  rows.push([{ text: "↩️ Cancel", callback_data: "buy_cancel" }]);
  await sendMessage(chatId, `Pick a <b>${esc(network)}</b> bundle:`, { reply_markup: { inline_keyboard: rows } });
}

async function handleBuyBundle(supa: any, chatId: number, productId: string, prefillRecipient?: string) {
  const { data: product } = await supa
    .from("products")
    .select("id, network, bundle_size_gb, price_ghs, active, cost_price_ghs")
    .eq("id", productId).maybeSingle();
  if (!product || !product.active) {
    await sendMessage(chatId, "That bundle is no longer available. Run /buy again.", withMenu());
    await clearSession(supa, chatId); return;
  }

  const link = await getLink(supa, chatId);
  await setSession(supa, chatId, "buy_recipient", {
    product_id: product.id, network: product.network, bundle_size_gb: product.bundle_size_gb,
    base_price: Number(product.price_ghs), cost_price: Number(product.cost_price_ghs ?? 0),
  });

  if (prefillRecipient) {
    return handleBuyRecipient(supa, chatId, prefillRecipient);
  }

  const extraRows: InlineKeyboard = [];
  if (link?.phone && detectNetwork(link.phone) === product.network) {
    extraRows.push([{ text: `📱 Use my number (${link.phone})`, callback_data: "buy_rcpt:self" }]);
  }

  await sendInputPrompt(
    chatId,
    [
      `<b>${esc(product.bundle_size_gb)}GB ${esc(product.network)}</b> — GHS ${Number(product.price_ghs).toFixed(2)}`,
      "",
      "Who is this bundle for?",
      "Reply with the recipient's number (e.g. <code>0241234567</code>)",
      "",
      "Send /cancel to go back.",
    ].join("\n"),
    "buy_cancel",
    extraRows,
  );
}

// ── /buy: recipient → payment-method picker (linked) or Paystack (guest)
async function handleBuyRecipient(supa: any, chatId: number, recipientLocal: string) {
  const session = await getSession(supa, chatId);
  if (session.state !== "buy_recipient" || !session.data?.product_id) {
    await sendMessage(chatId, "⏱ <b>Purchase session expired</b>\n\nRun /buy to start again.", withMenu()); return;
  }
  const detected = detectNetwork(recipientLocal);
  if (!detected || detected !== session.data.network) {
    await sendMessage(chatId, `❌ <b>Wrong network</b>\n\nThat number isn't on <b>${esc(session.data.network)}</b>. Send a valid ${esc(session.data.network)} number or tap /buy to start over.`);
    return;
  }
  const baseAmount = Number(session.data.base_price);
  const fee = Math.round(baseAmount * PROCESSING_FEE_RATE * 100) / 100;
  const totalPayable = Math.round((baseAmount + fee) * 100) / 100;

  const link = await getLink(supa, chatId);
  if (!link) {
    // Guest: straight to Paystack
    return initiatePaystackOrder(supa, chatId, {
      ...session.data, recipient: recipientLocal, base_amount: baseAmount, fee, total: totalPayable,
    }, null);
  }

  // Linked: show payment-method picker with wallet balance
  const { data: wallet } = await supa.from("wallets").select("balance_ghs").eq("user_id", link.user_id).maybeSingle();
  const balance = Number(wallet?.balance_ghs ?? 0);
  const canWallet = balance >= baseAmount; // wallet pays only the base (no Paystack fee)

  await setSession(supa, chatId, "buy_pay_method", {
    ...session.data, recipient: recipientLocal, base_amount: baseAmount, fee, total: totalPayable,
  });

  const buttons: InlineKeyboard = [];
  if (canWallet) {
    buttons.push([{ text: `💰 Pay from wallet (Balance: GHS ${balance.toFixed(2)})`, callback_data: "pay:wallet" }]);
  } else {
    buttons.push([{ text: `💰 Wallet GHS ${balance.toFixed(2)} — insufficient`, callback_data: "pay:nope" }]);
  }
  buttons.push([{ text: "📱 Pay with MoMo via Paystack", callback_data: "pay:paystack" }]);
  if (!canWallet) buttons.push([{ text: "➕ Top up wallet (/deposit)", callback_data: "menu:deposit" }]);
  buttons.push([{ text: "↩️ Cancel", callback_data: "buy_cancel" }]);

  await sendTransient(
    supa,
    chatId,
    [
      `🧾 <b>Order summary</b>`,
      "",
      `Bundle: <b>${esc(session.data.bundle_size_gb)}GB ${esc(session.data.network)}</b>`,
      `Recipient: <code>${esc(recipientLocal)}</code>`,
      "",
      `Bundle price: GHS ${baseAmount.toFixed(2)}`,
      `Processing fee (Paystack only, 4%): GHS ${fee.toFixed(2)}`,
      "",
      `💰 Pay from wallet: <b>GHS ${baseAmount.toFixed(2)}</b> <i>(no fee)</i>`,
      `💳 Pay with Paystack: <b>GHS ${totalPayable.toFixed(2)}</b>`,
      "",
      "Choose how to pay:",
    ].join("\n"),
    { inline_keyboard: buttons },
  );
}

// ── Paystack order init: route through paystack-initialize edge function ─
// IMPORTANT: This MUST go through paystack-initialize (the same function the
// website uses) so that the paystack_payments + payment_intents rows, the
// reference, the order_id and the checkout_meta are produced by the canonical
// platform code path. The bot must NOT call api.paystack.co directly — that
// would fork the order pipeline and bypass dispatchToSupplier in the webhook.
async function initiatePaystackOrder(
  supa: any,
  chatId: number,
  s: any,
  link: { user_id: string; phone: string | null } | null,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    await sendMessage(chatId, "⚠️ <b>Payments temporarily unavailable</b>\n\nWe're working on it — please try again in a few minutes.", withMenu());
    return;
  }

  // Resolve customer email (used by Paystack receipts and as paystack_payments.customer_email)
  let email: string | null = null;
  if (link?.user_id) {
    try {
      const { data: { user } } = await supa.auth.admin.getUserById(link.user_id);
      email = user?.email || null;
    } catch (_) { /* ignore */ }
  }

  const initRes = await fetch(`${supabaseUrl}/functions/v1/paystack-initialize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // service-role auth so paystack-initialize can identify the linked user
      // when present, while still allowing guest checkout when link is null.
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify({
      purpose: "order",
      product_id: s.product_id,
      recipient_phone: s.recipient,
      // Generic post-payment landing — the actual delivery confirmation is
      // pushed to this chat by the webhook (via checkout_meta.telegram_chat_id).
      callback_url: `https://t.me/${BOT_USERNAME}?start=paid_pending`,
      // Linked users → "authenticated" flow + user_id_override so the order
      // attributes to their account (orders.user_id set, shows in their web
      // history). Guests stay on the "guest" flow.
      flow: link?.user_id ? "authenticated" : "guest",
      email: email || undefined,
      // Additive params — see paystack-initialize.
      reference_prefix: "TGORD",
      order_id_prefix: "TG-",
      telegram_chat_id: chatId,
      ...(link?.user_id ? { user_id_override: link.user_id } : {}),
    }),
  });

  const initJson = await initRes.json().catch(() => null);
  if (!initRes.ok || !initJson?.success || !initJson?.authorization_url || !initJson?.reference) {
    console.error("[telegram-bot] paystack-initialize failed:", initRes.status, initJson);
    // Surface friendly server-provided messages (e.g. 409 duplicate guard,
    // 422 validation) instead of the generic fallback.
    const friendly = typeof initJson?.error === "string" && initJson.error.length < 300
      ? `⚠️ <b>Payment couldn't start</b>\n\n${initJson.error}`
      : "⚠️ <b>Couldn't create payment link</b>\n\nNothing was charged. Please try /buy again.";
    await sendMessage(chatId, friendly, withMenu());
    return;
  }

  const reference: string = initJson.reference;

  // The webhook is the source of truth for delivery and will message this
  // chat directly via checkout_meta.telegram_chat_id once Paystack confirms
  // payment and dispatchToSupplier completes.

  // Tracking row for the bot's own bookkeeping (and for chat notification context)
  await supa.from("telegram_payment_intents").insert({
    chat_id: chatId, user_id: link?.user_id || null, paystack_reference: reference,
    purpose: "order", product_id: s.product_id, recipient_phone: s.recipient,
    network: s.network, bundle_size_gb: s.bundle_size_gb,
    base_amount: s.base_amount, total_payable: s.total,
  }).then(({ error }: { error: any }) => { if (error) console.error("[telegram-bot] telegram_payment_intents (non-fatal):", error); });

  await clearSession(supa, chatId);
  await sendMessage(
    chatId,
    [
      `🧾 <b>Order ready to pay</b>`,
      "",
      `Bundle: <b>${esc(s.bundle_size_gb)}GB ${esc(s.network)}</b>`,
      `Recipient: <code>${esc(s.recipient)}</code>`,
      `<b>Total: GHS ${Number(s.total).toFixed(2)}</b>`,
      "",
      "Tap <b>Pay now</b> below. Your bundle is delivered automatically once payment confirms.",
    ].join("\n"),
    {
      reply_markup: {
        // Mini App deep link — opens /tg/pay inside Telegram with the order
        // reference in start_param. Falls back gracefully on old Telegram
        // clients that don't support Mini Apps (Telegram opens the URL).
        // Legacy "Pay now" buttons sent before this change still work because
        // they carry the raw Paystack authorization_url.
        inline_keyboard: [[{
          text: "💳 Pay now",
          url: `https://t.me/${BOT_USERNAME}/pay?startapp=pay_${encodeURIComponent(reference)}`,
        }]],
      },
    },
  );
}

// ── Wallet payment path: create order + dispatch (reuses RPC pattern) ──
async function payFromWallet(supa: any, chatId: number, s: any, link: { user_id: string; phone: string | null }) {
  const orderId = genOrderId();
  const baseAmount = Number(s.base_amount);

  // Atomic debit via RPC if exists, else manual update with row check
  const { data: wallet } = await supa.from("wallets").select("id, balance_ghs").eq("user_id", link.user_id).maybeSingle();
  if (!wallet || Number(wallet.balance_ghs) < baseAmount) {
    await sendMessage(chatId, "⚠️ <b>Wallet balance changed</b>\n\nYour balance is no longer enough for this order. Tap /deposit to top up or /buy to try again.", withMenu());
    return;
  }
  const newBal = Number(wallet.balance_ghs) - baseAmount;
  const { error: debitErr } = await supa
    .from("wallets")
    .update({ balance_ghs: newBal, updated_at: new Date().toISOString() })
    .eq("id", wallet.id)
    .eq("balance_ghs", wallet.balance_ghs); // optimistic lock
  if (debitErr) {
    console.error("[telegram-bot] wallet debit failed:", debitErr);
    await sendMessage(chatId, "⚠️ <b>Couldn't charge your wallet</b>\n\nNothing was deducted. Please try /buy again.", withMenu());
    return;
  }

  // Wallet ledger entry
  await supa.from("wallet_transactions").insert({
    user_id: link.user_id, type: "debit", amount_ghs: baseAmount,
    description: `Order ${orderId} — ${s.bundle_size_gb}GB ${s.network}`,
    reference: orderId, status: "confirmed",
  }).then(({ error }: { error: any }) => { if (error) console.error("[telegram-bot] wallet_transactions:", error); });

  // Create order (status=Paid so existing dispatch/webhook flows pick it up)
  const { error: orderErr } = await supa.from("orders").insert({
    order_id: orderId, user_id: link.user_id,
    recipient_number: s.recipient, network: s.network,
    product_id: s.product_id, bundle_size_gb: s.bundle_size_gb,
    amount_ghs: baseAmount, processing_fee: 0, total_paid: baseAmount,
    cost_price_ghs: s.cost_price ?? null,
    status: "Paid", payment_method: "wallet", payment_status: "paid",
    order_source: "telegram", telegram_chat_id: chatId,
  });
  if (orderErr) {
    console.error("[telegram-bot] order insert failed; refunding wallet:", orderErr);
    await supa.from("wallets").update({ balance_ghs: Number(wallet.balance_ghs), updated_at: new Date().toISOString() }).eq("id", wallet.id);
    await sendMessage(chatId, "⚠️ <b>Couldn't create your order</b>\n\nYour wallet was <b>not</b> charged. Please try /buy again.", withMenu());
    return;
  }

  // Trigger dispatch via process-wallet-order edge function (uses existing logic)
  const fnUrl = Deno.env.get("SUPABASE_URL")! + "/functions/v1/process-wallet-order";
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  fetch(fnUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${svcKey}` },
    body: JSON.stringify({ order_id: orderId, dispatch_only: true }),
  }).catch((e) => console.error("[telegram-bot] dispatch trigger:", e));

  await clearSession(supa, chatId);
  await sendMessage(
    chatId,
    [
      `✅ <b>Order placed</b>`,
      "",
      `📦 <b>${esc(s.bundle_size_gb)}GB ${esc(s.network)}</b> → <code>${esc(s.recipient)}</code>`,
      `💰 GHS ${baseAmount.toFixed(2)} debited from wallet`,
      `📋 Order: <code>${esc(orderId)}</code>`,
      "",
      "We'll message you here the moment it's delivered.",
    ].join("\n"),
    withMenu(),
  );
}

// ── /account (Wallet view) ─────────────────────────────────────────────
// Issue 7 — Simplified wallet view: balance + last 3 wallet txns + points
// context + account info. Guest (unlinked) users see a points-only card with
// a Link prompt. Single inline button: "💰 Top up wallet".
async function handleAccount(supa: any, chatId: number) {
  const link = await getLink(supa, chatId);
  const tgUserId = chatId;
  const points = link
    ? await getPointsBalance(supa, link.user_id)
    : await getPointsBalanceTg(supa, tgUserId).catch(() => 0);
  const ptsToNextGB = Math.max(0, POINTS_PER_GB - (points % POINTS_PER_GB));
  const pointsLine = points >= POINTS_PER_GB
    ? `⭐ <b>${points.toLocaleString()} pts</b> · enough for ${Math.floor(points / POINTS_PER_GB)}GB free`
    : `⭐ <b>${points.toLocaleString()} pts</b> · ${ptsToNextGB.toLocaleString()} more for 1GB free`;

  if (!link) {
    await sendMessage(
      chatId,
      [
        "💳 <b>Your Wallet</b>",
        "",
        pointsLine,
        "",
        "<i>Link your DataSika account to add a wallet for faster checkout.</i>",
      ].join("\n"),
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔗 Link account", callback_data: "menu:link" }],
          ],
        },
      },
    );
    return;
  }

  const [{ data: wallet }, { data: profile }, { data: txns }] = await Promise.all([
    supa.from("wallets").select("balance_ghs").eq("user_id", link.user_id).maybeSingle(),
    supa.from("profiles").select("full_name, phone, email").eq("id", link.user_id).maybeSingle(),
    supa
      .from("wallet_transactions")
      .select("type, amount_ghs, description, status, created_at")
      .eq("user_id", link.user_id)
      .in("status", ["completed", "success", "Success", "Completed"])
      .order("created_at", { ascending: false })
      .limit(3),
  ]);
  const balance = Number(wallet?.balance_ghs ?? 0);

  const fmtAgo = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diffMs / 60_000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d === 1) return "Yesterday";
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };
  const txLines: string[] = [];
  for (const t of (txns || [])) {
    const isCredit = (t.type || "").toLowerCase().includes("deposit") || (t.type || "").toLowerCase().includes("credit") || (t.type || "").toLowerCase().includes("topup") || (t.type || "").toLowerCase().includes("top_up");
    const sign = isCredit ? "+" : "−";
    const amt = Math.abs(Number(t.amount_ghs || 0)).toFixed(2);
    const label = isCredit ? "Top-up" : (t.description || "Payment").slice(0, 28);
    txLines.push(`${sign} GHS ${amt} · ${esc(label)} · ${fmtAgo(t.created_at)}`);
  }

  await sendMessage(
    chatId,
    [
      "💳 <b>Your Wallet</b>",
      "",
      `💰 Balance: <b>GHS ${balance.toFixed(2)}</b>`,
      "",
      txLines.length ? "<b>Recent activity</b>" : "<i>No wallet activity yet.</i>",
      ...txLines,
      "",
      pointsLine,
      "",
      `👤 ${esc(profile?.full_name || "—")}`,
      `📞 <code>${esc(link.phone || profile?.phone || "—")}</code>`,
      `📧 <code>${esc(profile?.email || "—")}</code>`,
    ].join("\n"),
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "💰 Top up wallet", callback_data: "menu:deposit" }],
        ],
      },
    },
  );
}

// ── /history (chat-scoped for guests, full for linked) ─────────────────
async function handleHistory(supa: any, chatId: number) {
  const link = await getLink(supa, chatId);
  let query = supa
    .from("orders")
    .select("id, order_id, network, bundle_size_gb, status, amount_ghs, created_at, recipient_number")
    .order("created_at", { ascending: false }).limit(10);

  if (link) {
    query = query.or(`user_id.eq.${link.user_id},telegram_chat_id.eq.${chatId}`);
  } else {
    query = query.eq("telegram_chat_id", chatId);
  }
  const { data: orders } = await query;

  if (!orders || orders.length === 0) {
    await sendMessage(
      chatId,
      link ? "You haven't placed any orders yet. Tap 🛒 <b>Buy data</b> to get started!"
           : "No orders yet from this chat. Tap 🛒 <b>Buy data</b> to get started!",
      withMenu(),
    );
    return;
  }

  const buttons: InlineKeyboard = [];
  for (const o of orders) {
    const date = new Date(o.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    const icon = o.status === "Delivered" ? "✅" : o.status === "Failed" ? "❌" : "⏳";
    buttons.push([{
      text: `${o.order_id} · ${o.bundle_size_gb}GB ${o.network} · ${icon} ${o.status} · ${date}`,
      callback_data: `order:${o.order_id}`,
    }]);
  }
  await sendMessage(
    chatId,
    "📦 <b>Recent orders</b> · tap one for details",
    { reply_markup: { inline_keyboard: buttons } },
  );
}

async function handleOrderDetail(supa: any, chatId: number, orderId: string) {
  const link = await getLink(supa, chatId);
  let query = supa
    .from("orders")
    .select("order_id, network, bundle_size_gb, recipient_number, status, amount_ghs, total_paid, payment_method, payment_status, created_at, updated_at, telegram_chat_id, user_id")
    .eq("order_id", orderId).limit(1);

  const { data: rows } = await query;
  const order = rows?.[0];
  if (!order || (order.telegram_chat_id !== chatId && (!link || order.user_id !== link.user_id))) {
    await sendMessage(chatId, `No order <code>${esc(orderId)}</code> found.`, withMenu());
    return;
  }

  const placed = new Date(order.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const updated = new Date(order.updated_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const statusIcon = order.status === "Delivered" ? "✅" : order.status === "Failed" ? "❌" : "⏳";

  await sendMessage(
    chatId,
    [
      `📦 <b>Order ${esc(order.order_id)}</b>`,
      "",
      `Bundle: <b>${esc(order.bundle_size_gb)}GB ${esc(order.network)}</b>`,
      `Recipient: <code>${esc(order.recipient_number)}</code>`,
      `Amount: GHS ${Number(order.amount_ghs).toFixed(2)}`,
      `Total paid: GHS ${Number(order.total_paid ?? order.amount_ghs).toFixed(2)}`,
      `Payment: ${esc(order.payment_method || "—")} (${esc(order.payment_status || "—")})`,
      `Status: ${statusIcon} <b>${esc(order.status)}</b>`,
      `Placed: ${esc(placed)}`,
      `Updated: ${esc(updated)}`,
    ].join("\n"),
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔁 Buy this again", callback_data: `rebuy:${order.order_id}` }],
          [{ text: "🆘 Issue with this order", callback_data: `issue:${order.order_id}` }],
        ],
      },
    },
  );
}

// ── /status <id> (legacy, single-line) ─────────────────────────────────
async function handleStatus(supa: any, chatId: number, orderId: string) {
  const id = orderId.trim().toUpperCase();
  if (!id) { await sendMessage(chatId, "Usage: <code>/status DS-XXXXXXXX</code>", withMenu()); return; }
  return handleOrderDetail(supa, chatId, id);
}

// ── 🔍 Track Order — friendly, prefix-aware lookup (works for guests too) ──
const ORDER_ID_REGEX = /^(DS|TG|AGT|WS|RWD)-[A-Z0-9]{4,}$/i;

async function handleTrackOrderStart(supa: any, chatId: number) {
  await setSession(supa, chatId, "track_order_input", {});
  await sendInputPrompt(
    chatId,
    [
      "🔍 <b>Track an order</b>",
      "",
      "Send the order ID you want to track. Works for any DataSika order — <b>DS-</b>, <b>TG-</b>, <b>AGT-</b>, <b>WS-</b>, or <b>RWD-</b> prefix.",
      "",
      "Example: <code>DS-4ZV3CUG2</code>",
      "",
      "Type /cancel to go back.",
    ].join("\n"),
    "track:cancel",
  );
}

async function handleTrackOrderInput(supa: any, chatId: number, text: string) {
  const id = text.trim().toUpperCase();
  if (!ORDER_ID_REGEX.test(id)) {
    await sendMessage(
      chatId,
      "❌ <b>That doesn't look like a valid order ID</b>\n\nThey start with <b>DS-</b>, <b>TG-</b>, <b>AGT-</b>, <b>WS-</b>, or <b>RWD-</b>. Try again or /cancel.",
    );
    return;
  }
  await clearSession(supa, chatId);
  return handleTrackOrderLookup(supa, chatId, id);
}

async function handleTrackOrderLookup(supa: any, chatId: number, orderId: string) {
  const link = await getLink(supa, chatId);
  const { data: rows } = await supa
    .from("orders")
    .select("order_id, network, bundle_size_gb, recipient_number, status, amount_ghs, total_paid, created_at, telegram_chat_id, user_id")
    .eq("order_id", orderId).limit(1);
  const order = rows?.[0];

  if (!order) {
    await sendMessage(
      chatId,
      `🔍 <b>No order found</b>\n\nWe couldn't find <code>${esc(orderId)}</code>. Double-check the ID and try again, or tap 📞 <b>Support</b> if you need help.`,
      withMenu(),
    );
    return;
  }

  const isOwner = order.telegram_chat_id === chatId || (link && order.user_id === link.user_id);
  const placed = new Date(order.created_at).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) + " GMT";
  const statusIcon = order.status === "Delivered" ? "✅" : order.status === "Failed" ? "❌" : "⏳";

  const lines = [
    `📦 <b>Order ${esc(order.order_id)}</b>`,
    "",
    `Bundle: <b>${esc(order.bundle_size_gb)}GB ${esc(order.network)}</b>`,
  ];

  if (isOwner) {
    lines.push(
      `Recipient: <code>${esc(order.recipient_number)}</code>`,
      `Status: ${statusIcon} <b>${esc(order.status)}</b>`,
      `Placed: ${esc(placed)}`,
      `Amount paid: GHS ${Number(order.total_paid ?? order.amount_ghs).toFixed(2)}`,
    );
    if (link) {
      lines.push("", "<i>More details available with /history.</i>");
    }
  } else {
    // Public details only — mask recipient phone and amount for privacy
    lines.push(
      `Status: ${statusIcon} <b>${esc(order.status)}</b>`,
      `Placed: ${esc(placed)}`,
      "",
      "<i>🔒 Some details are hidden. Link this chat to the account that placed the order to see the full receipt.</i>",
    );
  }

  await sendMessage(chatId, lines.join("\n"), withMenu());
}


// ── /support ───────────────────────────────────────────────────────────
//
// AI flow stays identical: /support sets state to "support_chat" and routes
// every reply through ai-support-chat. The ONLY addition is an inline
// "🎧 Speak to a representative" button appended to each AI reply.
// Users who never tap it see zero behavioral change.
//
// If a ticket is open for this chat, we BYPASS the AI entirely and forward
// every user message to the admin Telegram group via the same direct
// sendMessage() the bot already uses everywhere — no third path.

const ADMIN_CHAT_ID = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID") || "";
const TICKET_AUTOCLOSE_HOURS = 48;

// Shown ONLY when ai-support-chat signals offer_escalation: true.
// AI is the primary handler — no unconditional escalation button anywhere.
function offerEscalationKeyboard(): InlineKeyboard {
  return [
    [{ text: "🎧 Yes, connect me", callback_data: "support:escalate" }],
    [{ text: "Let AI try again", callback_data: "support:ai_continue" }],
  ];
}

function ticketControlsForUser(): InlineKeyboard {
  return [[{ text: "✖️ Close this ticket", callback_data: "support:close_user" }]];
}

const SUPPORT_EMAIL = "support@datasika.com";

// Replacement reply keyboard shown ONLY while a ticket is open.
function supportKeyboard() {
  return {
    keyboard: [
      [{ text: "✖️ Close this ticket" }, { text: "📧 Email" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

function withSupportMenu<T extends Record<string, any>>(opts: T = {} as T) {
  return { reply_markup: supportKeyboard(), ...opts };
}

const SEP = "─────────────────────────────────";

function formatAgentReply(ticketCode: string, agentName: string, body: string) {
  const ts = new Date().toLocaleTimeString("en-GB", {
    timeZone: "Africa/Accra",
    hour: "2-digit",
    minute: "2-digit",
  });
  return [
    SEP,
    `🎧 <b>DATASIKA SUPPORT · ${esc(ticketCode)}</b>`,
    SEP,
    ``,
    esc(body),
    ``,
    `👤 ${esc(agentName)} · ${ts}`,
  ].join("\n");
}

function ratingKeyboard(): InlineKeyboard {
  return [
    [
      { text: "⭐⭐⭐⭐⭐", callback_data: "support:rate:5" },
      { text: "⭐⭐⭐⭐", callback_data: "support:rate:4" },
    ],
    [
      { text: "⭐⭐⭐", callback_data: "support:rate:3" },
      { text: "⭐⭐", callback_data: "support:rate:2" },
      { text: "⭐", callback_data: "support:rate:1" },
    ],
  ];
}

function buildClosureMessage(ticketCode: string) {
  return [
    SEP,
    `✅ <b>SUPPORT CONVERSATION ENDED</b>`,
    SEP,
    ``,
    `Ticket <code>${esc(ticketCode)}</code> is closed.`,
    ``,
    `Thanks for reaching out! How was your support experience?`,
    ``,
    `You can now buy data, top up your wallet, or anything else from the menu below.`,
  ].join("\n");
}

// Set of slash commands and reply-keyboard button labels that are
// "transactional" — gated while a ticket is open.
const TRANSACTIONAL_SLASH = new Set([
  "/buy", "/deposit", "/account", "/history", "/orders", "/status",
  "/points", "/balance", "/redeem", "/free", "/refer", "/invite",
  "/agent", "/checkin", "/leaderboard", "/top", "/link",
]);
const TRANSACTIONAL_BUTTONS = new Set([
  // Current keyboard labels
  "🛒 Buy Data", "📦 My Orders", "💳 Wallet", "🔍 Track Order",
  "🎁 Invite Friends", "🔗 Link Account", "📩 Contact Support",
  // Referral hub keyboard labels (shown while in hub mode)
  "📋 Copy link", "👥 My referrals", "💎 Rewards earned",
  "🏆 Leaderboard", "📖 How it works", "⬅️ Back to main menu",
  // Old labels (backwards compat for stale chat UIs)
  "🛒 Buy data", "📜 My orders", "💰 Wallet", "🎁 Refer & Earn",
  "🎁 Invite friends", "🔗 Link account", "🌟 Become Agent",
  "⭐ Become an agent", "ℹ️ How It Works", "ℹ️ Help",
  "📞 Support", "🆘 Support",
]);

function transactionalLabel(token: string): string {
  const map: Record<string, string> = {
    "/buy": "buy data", "🛒 Buy Data": "buy data", "🛒 Buy data": "buy data",
    "/deposit": "make a deposit",
    "💳 Wallet": "open your wallet", "💰 Wallet": "open your wallet",
    "/account": "open your account",
    "/history": "see your orders", "/orders": "see your orders",
    "📦 My Orders": "see your orders", "📜 My orders": "see your orders",
    "/status": "check order status", "🔍 Track Order": "track an order",
    "/points": "view your points", "/balance": "view your points",
    "/redeem": "redeem points", "/free": "redeem points",
    "/refer": "invite friends", "/invite": "invite friends",
    "🎁 Refer & Earn": "invite friends", "🎁 Invite friends": "invite friends",
    "🎁 Invite Friends": "invite friends",
    "/agent": "explore the agent program",
    "🌟 Become Agent": "explore the agent program", "⭐ Become an agent": "explore the agent program",
    "/checkin": "do your daily check-in",
    "/leaderboard": "view the leaderboard", "/top": "view the leaderboard",
    "/link": "link your account",
    "🔗 Link Account": "link your account", "🔗 Link account": "link your account",
    "ℹ️ How It Works": "see help", "ℹ️ Help": "see help",
    "📞 Support": "open support", "🆘 Support": "open support",
    "📩 Contact Support": "open support",
  };
  return map[token] || "do that";
}

async function sendTicketGatedRedirect(chatId: number, ticketCode: string, token: string) {
  const action = transactionalLabel(token);
  await sendMessage(
    chatId,
    [
      `💬 <b>You're connected to support right now.</b>`,
      ``,
      `Finish your conversation here first, or tap <b>✖️ Close this ticket</b> if you're done.`,
      ``,
      `Then you can ${esc(action)} again.`,
      ``,
      `Ticket: <code>${esc(ticketCode)}</code>`,
    ].join("\n"),
    withSupportMenu(),
  );
}

async function getOpenTicketForChat(supa: any, chatId: number): Promise<any | null> {
  const { data } = await supa
    .from("support_tickets_v2")
    .select("*")
    .eq("telegram_chat_id", chatId)
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function handleSupport(supa: any, chatId: number, prefillContext?: string) {
  // (Linking is OPTIONAL for support — guests can use it freely.)
  // If a ticket is already open, surface it instead of restarting AI.
  const open = await getOpenTicketForChat(supa, chatId);
  if (open) {
    // First: ensure persistent menu is replaced with the support keyboard.
    await sendMessage(
      chatId,
      [
        SEP,
        `🎧 <b>DATASIKA SUPPORT · ${esc(open.ticket_code)}</b>`,
        SEP,
        ``,
        open.assigned_agent_name
          ? `You're connected with <b>${esc(open.assigned_agent_name)}</b>.`
          : `You're connected — waiting for an available agent…`,
        ``,
        `Just type your message — every reply reaches our team.`,
      ].join("\n"),
      withSupportMenu(),
    );
    // Second: re-attach the inline close button as a separate small message.
    await sendMessage(
      chatId,
      `Tap below if you're done.`,
      { reply_markup: { inline_keyboard: ticketControlsForUser() } },
    );
    return;
  }
  await setSession(supa, chatId, "support_chat", { messages: [], prefill: prefillContext || null });
  // Issue 5 — Hide the persistent reply keyboard while in support so users
  // see ONLY the inline "Leave Support" button. This avoids accidental taps
  // on Buy/Wallet/etc. while in support mode.
  await sendMessage(
    chatId,
    [
      "📩 <b>You're now in DataSika Support</b>",
      "",
      "I'm here to help solve issues fast — order problems, payments, deposits, anything DataSika.",
      "",
      prefillContext
        ? `I see you have an issue with <code>${esc(prefillContext)}</code>. Just type your message below and I'll do my best to fix it right away.`
        : "Just type your message below and I'll do my best to fix it right away.",
      "",
      "To leave support and return to the main menu, tap the <b>Leave Support</b> button below.",
    ].join("\n"),
    {
      reply_markup: hiddenKeyboard(),
    },
  );
  await sendMessage(
    chatId,
    "Tap below when you're done.",
    {
      reply_markup: { inline_keyboard: [[{ text: "↩️ Leave Support", callback_data: "support:leave" }]] },
    },
  );
}

async function handleSupportMessage(supa: any, chatId: number, text: string) {
  // If escalated to a human, forward instead of AI.
  const open = await getOpenTicketForChat(supa, chatId);
  if (open) {
    return forwardUserMessageToAdmins(supa, chatId, open, text);
  }

  const link = await getLink(supa, chatId);
  const session = await getSession(supa, chatId);
  const history = (session.data?.messages || []) as Array<{ role: string; content: string }>;
  const prefill = session.data?.prefill as string | null;
  let userText = text;
  if (history.length === 0 && prefill) {
    userText = `[Order ${prefill}]\n\n${text}`;
  }
  history.push({ role: "user", content: userText });

  const fnUrl = Deno.env.get("SUPABASE_URL")! + "/functions/v1/ai-support-chat";
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let aiReply = "⚠️ <b>I'm having trouble responding right now</b>\n\nPlease try again in a moment, or tap <b>Talk to a human</b>.";
  let offerEscalation = false;
  try {
    const res = await fetch(fnUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${svcKey}` },
      body: JSON.stringify({
        messages: history,
        sessionId: `telegram-${chatId}`,
        context: {
          page: "telegram",
          sourcePage: "telegram",
          userType: link ? "registered" : "guest",
          userId: link?.user_id ?? null,
        },
      }),
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.reply) aiReply = json.reply;
      else if (typeof json === "string") aiReply = json;
      if (json?.offer_escalation === true) offerEscalation = true;
    } else {
      console.error("[telegram-bot] ai-support-chat:", res.status, await res.text());
    }
  } catch (e) {
    console.error("[telegram-bot] support call:", e);
  }

  history.push({ role: "assistant", content: aiReply });
  await setSession(supa, chatId, "support_chat", { messages: history.slice(-20), prefill });

  // AI is the primary handler. Only attach the escalation buttons when the AI
  // explicitly signals offer_escalation. Otherwise the reply is plain text.
  if (offerEscalation) {
    await sendMessage(chatId, esc(aiReply), { reply_markup: { inline_keyboard: offerEscalationKeyboard() } });
  } else {
    await sendMessage(chatId, esc(aiReply));
  }
}

// ── Human escalation ───────────────────────────────────────────────────
async function escalateToHuman(supa: any, chatId: number, fromName: string, tgUsername: string | null, tgUserId: number | null) {
  // Block if a ticket is already open
  const existing = await getOpenTicketForChat(supa, chatId);
  if (existing) {
    await sendMessage(
      chatId,
      `You're already connected — ticket <code>${esc(existing.ticket_code)}</code>. Just reply here.`,
      withSupportMenu(),
    );
    await sendMessage(
      chatId,
      `Tap below if you're done.`,
      { reply_markup: { inline_keyboard: ticketControlsForUser() } },
    );
    return;
  }

  const link = await getLink(supa, chatId);
  const session = await getSession(supa, chatId);
  const history = (session.data?.messages || []) as Array<{ role: string; content: string }>;
  const prefill = session.data?.prefill as string | null;

  // Generate ticket code via DB helper (DSA-XXXXX)
  const { data: codeRow, error: codeErr } = await supa.rpc("generate_dsa_ticket_code");
  if (codeErr || !codeRow) {
    console.error("[telegram-bot] generate_dsa_ticket_code failed:", codeErr);
    await sendMessage(chatId, "⚠️ <b>Couldn't reach a representative</b>\n\nPlease try again in about a minute.");
    return;
  }
  const ticketCode = String(codeRow);

  const subject = prefill ? `Telegram escalation: order ${prefill}` : `Telegram escalation from ${fromName}`;
  const insertPayload: Record<string, unknown> = {
    ticket_type: "user",
    subject,
    category: "other",
    status: "open",
    ticket_code: ticketCode,
    telegram_chat_id: chatId,
    telegram_user_id: tgUserId,
    telegram_username: tgUsername,
    related_order_id: prefill || null,
    last_user_message_at: new Date().toISOString(),
    source: "telegram",
    created_by: link?.user_id ?? null,
  };
  const { data: ticket, error: insErr } = await supa
    .from("support_tickets_v2")
    .insert(insertPayload)
    .select()
    .single();
  if (insErr || !ticket) {
    console.error("[telegram-bot] ticket insert failed:", insErr);
    await sendMessage(chatId, "⚠️ <b>Couldn't open your ticket</b>\n\nPlease try again in a moment.");
    return;
  }

  // Persist AI history as the opening transcript so admins see context.
  if (history.length > 0) {
    const transcript = history
      .map((h) => `${h.role === "user" ? "👤" : "🤖"} ${h.content}`)
      .join("\n\n")
      .slice(0, 4000);
    await supa.from("ticket_messages").insert({
      ticket_id: ticket.id,
      sender_type: "system",
      sender_name: "AI transcript",
      message_text: `[AI conversation before escalation]\n\n${transcript}`,
      read_by_user: true,
      read_by_agent: false,
      read_by_admin: false,
    });
  }

  // Clear AI session so further messages are intercepted as ticket replies.
  await clearSession(supa, chatId);

  // Confirm to user — first message swaps the persistent menu to the support keyboard.
  await sendMessage(
    chatId,
    [
      SEP,
      `🎧 <b>DATASIKA SUPPORT</b>`,
      SEP,
      ``,
      `You're now connected to our support team.`,
      ``,
      `📋 Ticket: <code>${esc(ticketCode)}</code>`,
      `⏱ Average response: ~10 minutes`,
      `🕐 Hours: 9am–9pm GMT`,
      ``,
      `Just type your message — every reply reaches our team. Other bot features are paused until this conversation ends.`,
    ].join("\n"),
    withSupportMenu(),
  );
  // Inline close button as a separate, slim message
  await sendMessage(
    chatId,
    `Tap below to end the conversation when you're done.`,
    { reply_markup: { inline_keyboard: ticketControlsForUser() } },
  );

  // Alert admin group via the SAME direct sendMessage() path the bot uses
  // for every other admin-group notification — no third messaging path.
  if (ADMIN_CHAT_ID) {
    const userLine = link
      ? `Linked user (${esc(link.phone || "no phone")})`
      : `Unlinked Telegram user`;
    const tgHandle = tgUsername ? `@${esc(tgUsername)}` : `id:${tgUserId ?? chatId}`;
    const aiSnippet = history.length
      ? `\n\n<b>Last user message:</b>\n<i>${esc(history.filter((h) => h.role === "user").slice(-1)[0]?.content?.slice(0, 300) || "(none)")}</i>`
      : "";
    const adminMsg = [
      `🆕 <b>New support ticket</b>`,
      `Code: <code>${esc(ticketCode)}</code>`,
      `From: ${esc(fromName)} (${tgHandle})`,
      `Type: ${userLine}`,
      prefill ? `Order: <code>${esc(prefill)}</code>` : "",
      ``,
      `Reply with: <code>/r ${esc(ticketCode)} your message</code>`,
      `Or: <code>/assign ${esc(ticketCode)}</code> · <code>/close ${esc(ticketCode)}</code> · <code>/history ${esc(ticketCode)}</code>`,
      aiSnippet,
    ].filter(Boolean).join("\n");
    await sendMessage(ADMIN_CHAT_ID, adminMsg);
  } else {
    console.warn("[telegram-bot] TELEGRAM_ADMIN_CHAT_ID not set — admins will not be notified of new tickets");
  }
}

async function forwardUserMessageToAdmins(supa: any, chatId: number, ticket: any, text: string) {
  // Subtle "real conversation" feel
  await sendChatAction(chatId, "typing").catch(() => undefined);

  // Persist
  await supa.from("ticket_messages").insert({
    ticket_id: ticket.id,
    sender_type: "user",
    sender_telegram_id: ticket.telegram_user_id,
    sender_name: ticket.telegram_username || null,
    message_text: text,
    read_by_user: true,
    read_by_agent: false,
    read_by_admin: false,
  });
  await supa
    .from("support_tickets_v2")
    .update({ last_user_message_at: new Date().toISOString(), status: "open" })
    .eq("id", ticket.id);

  if (ADMIN_CHAT_ID) {
    const handle = ticket.telegram_username ? `@${esc(ticket.telegram_username)}` : `id:${ticket.telegram_user_id ?? chatId}`;
    await sendMessage(
      ADMIN_CHAT_ID,
      [
        `💬 <b>${esc(ticket.ticket_code)}</b> · ${handle}`,
        ``,
        esc(text),
        ``,
        `Reply: <code>/r ${esc(ticket.ticket_code)} your message</code>`,
      ].join("\n"),
    );
  }

  // Every 3rd user message → subtle ack so the user knows the team is hearing them.
  try {
    const { count } = await supa
      .from("ticket_messages")
      .select("id", { count: "exact", head: true })
      .eq("ticket_id", ticket.id)
      .eq("sender_type", "user");
    if (typeof count === "number" && count > 0 && count % 3 === 0) {
      await sendMessage(chatId, `📨 Message sent to our team.`);
    }
  } catch (_) { /* ack is best-effort */ }
}

async function logAdminCommand(
  supa: any,
  fromTgUserId: number,
  username: string | null,
  chatId: number,
  command: string,
  args: string,
  ticketCode: string | null,
  ticketId: string | null,
  result: string,
) {
  try {
    await supa.from("telegram_admin_command_log").insert({
      telegram_user_id: fromTgUserId,
      telegram_username: username,
      telegram_chat_id: chatId,
      command,
      args: args || null,
      ticket_code: ticketCode,
      ticket_id: ticketId,
      result,
    });
  } catch (e) {
    console.error("[telegram-bot] admin audit insert failed:", e);
  }
}

async function findTicketByCode(supa: any, code: string): Promise<any | null> {
  if (!code) return null;
  const { data } = await supa
    .from("support_tickets_v2")
    .select("*")
    .eq("ticket_code", code.toUpperCase())
    .maybeSingle();
  return data || null;
}

// Admin slash command router (fires only inside TELEGRAM_ADMIN_CHAT_ID group).
async function handleAdminGroupCommand(
  supa: any,
  fromTgUserId: number,
  fromName: string,
  username: string | null,
  groupChatId: number,
  text: string,
) {
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.split("@")[0].toLowerCase();
  const argLine = rest.join(" ").trim();

  if (cmd === "/r" || cmd === "/reply") {
    // /r DSA-XXXXX message body
    const sp = argLine.indexOf(" ");
    const code = sp > 0 ? argLine.slice(0, sp).trim() : argLine.trim();
    const body = sp > 0 ? argLine.slice(sp + 1).trim() : "";
    const ticket = await findTicketByCode(supa, code);
    if (!ticket || !body) {
      await sendMessage(groupChatId, `Usage: <code>/r DSA-XXXXX your reply text</code>`);
      await logAdminCommand(supa, fromTgUserId, username, groupChatId, cmd, argLine, code || null, ticket?.id ?? null, "invalid_usage");
      return;
    }
    if (ticket.status === "closed" || ticket.status === "resolved") {
      await sendMessage(groupChatId, `Ticket <code>${esc(ticket.ticket_code)}</code> is ${esc(ticket.status)}. Reopen first.`);
      await logAdminCommand(supa, fromTgUserId, username, groupChatId, cmd, argLine, ticket.ticket_code, ticket.id, "ticket_closed");
      return;
    }
    // Persist + forward to user
    await supa.from("ticket_messages").insert({
      ticket_id: ticket.id,
      sender_type: "admin",
      sender_telegram_id: fromTgUserId,
      sender_name: fromName,
      message_text: body,
      read_by_user: false,
      read_by_agent: false,
      read_by_admin: true,
    });
    // Auto-assign the first responder if not yet assigned
    if (!ticket.assigned_agent_telegram_id) {
      await supa.from("support_tickets_v2").update({
        status: "in_progress",
        assigned_agent_telegram_id: fromTgUserId,
        assigned_agent_name: fromName,
      }).eq("id", ticket.id);
    } else {
      await supa.from("support_tickets_v2").update({ status: "in_progress" }).eq("id", ticket.id);
    }
    if (ticket.telegram_chat_id) {
      await sendMessage(
        ticket.telegram_chat_id,
        formatAgentReply(ticket.ticket_code, fromName, body),
        { reply_markup: { inline_keyboard: ticketControlsForUser() } },
      );
    }
    await sendMessage(groupChatId, `✅ Sent to <code>${esc(ticket.ticket_code)}</code>`);
    await logAdminCommand(supa, fromTgUserId, username, groupChatId, cmd, argLine, ticket.ticket_code, ticket.id, "ok");
    return;
  }

  if (cmd === "/assign") {
    const code = argLine.trim();
    const ticket = await findTicketByCode(supa, code);
    if (!ticket) {
      await sendMessage(groupChatId, `Ticket <code>${esc(code)}</code> not found.`);
      await logAdminCommand(supa, fromTgUserId, username, groupChatId, cmd, argLine, code || null, null, "not_found");
      return;
    }
    await supa.from("support_tickets_v2").update({
      assigned_agent_telegram_id: fromTgUserId,
      assigned_agent_name: fromName,
      status: "in_progress",
    }).eq("id", ticket.id);
    await sendMessage(groupChatId, `🎯 <code>${esc(ticket.ticket_code)}</code> assigned to <b>${esc(fromName)}</b>.`);
    if (ticket.telegram_chat_id) {
      await sendMessage(ticket.telegram_chat_id, `🎧 <b>${esc(fromName)}</b> from DataSika Support is now handling your ticket.`);
    }
    await logAdminCommand(supa, fromTgUserId, username, groupChatId, cmd, argLine, ticket.ticket_code, ticket.id, "ok");
    return;
  }

  if (cmd === "/close") {
    const code = argLine.trim();
    const ticket = await findTicketByCode(supa, code);
    if (!ticket) {
      await sendMessage(groupChatId, `Ticket <code>${esc(code)}</code> not found.`);
      await logAdminCommand(supa, fromTgUserId, username, groupChatId, cmd, argLine, code || null, null, "not_found");
      return;
    }
    await supa.from("support_tickets_v2").update({
      status: "closed",
      close_reason: `Closed by ${fromName} (tg:${fromTgUserId})`,
    }).eq("id", ticket.id);
    await supa.from("ticket_messages").insert({
      ticket_id: ticket.id,
      sender_type: "system",
      sender_name: "DataSika Support",
      message_text: `Ticket closed by ${fromName}.`,
      read_by_user: false, read_by_agent: true, read_by_admin: true,
    });
    if (ticket.telegram_chat_id) {
      // Restore the main persistent menu
      await sendMessage(
        ticket.telegram_chat_id,
        buildClosureMessage(ticket.ticket_code),
        withMenu(),
      );
      // Inline rating prompt as a follow-up
      await sendMessage(
        ticket.telegram_chat_id,
        `Rate your experience:`,
        { reply_markup: { inline_keyboard: ratingKeyboard() } },
      );
    }
    await sendMessage(groupChatId, `🔒 <code>${esc(ticket.ticket_code)}</code> closed.`);
    await logAdminCommand(supa, fromTgUserId, username, groupChatId, cmd, argLine, ticket.ticket_code, ticket.id, "ok");
    return;
  }

  if (cmd === "/history") {
    const code = argLine.trim();
    const ticket = await findTicketByCode(supa, code);
    if (!ticket) {
      await sendMessage(groupChatId, `Ticket <code>${esc(code)}</code> not found.`);
      await logAdminCommand(supa, fromTgUserId, username, groupChatId, cmd, argLine, code || null, null, "not_found");
      return;
    }
    const { data: msgs } = await supa
      .from("ticket_messages")
      .select("sender_type, sender_name, message_text, created_at")
      .eq("ticket_id", ticket.id)
      .order("created_at", { ascending: true })
      .limit(50);
    const lines = (msgs || []).map((m: any) => {
      const who = m.sender_type === "user" ? "👤 User"
        : m.sender_type === "admin" ? `🎧 ${m.sender_name || "Agent"}`
        : m.sender_type === "system" ? "⚙️ System"
        : `🤝 ${m.sender_name || "Agent"}`;
      return `<b>${who}</b>: ${esc(String(m.message_text || "").slice(0, 500))}`;
    });
    const body = lines.length ? lines.join("\n\n") : "(no messages)";
    await sendMessage(
      groupChatId,
      `📜 <b>${esc(ticket.ticket_code)}</b> — ${esc(ticket.status)}\n\n${body}`.slice(0, 3800),
    );
    await logAdminCommand(supa, fromTgUserId, username, groupChatId, cmd, argLine, ticket.ticket_code, ticket.id, "ok");
    return;
  }

  if (cmd === "/tickets") {
    const { data: open } = await supa
      .from("support_tickets_v2")
      .select("ticket_code, status, assigned_agent_name, telegram_username, last_user_message_at, created_at")
      .in("status", ["open", "in_progress"])
      .order("last_user_message_at", { ascending: false, nullsFirst: false })
      .limit(20);
    if (!open || open.length === 0) {
      await sendMessage(groupChatId, "✅ No open tickets.");
    } else {
      const lines = open.map((t: any) => {
        const handle = t.telegram_username ? `@${t.telegram_username}` : "(no handle)";
        const agent = t.assigned_agent_name ? ` · ${t.assigned_agent_name}` : " · unassigned";
        return `• <code>${esc(t.ticket_code)}</code> ${esc(t.status)} ${esc(handle)}${esc(agent)}`;
      });
      await sendMessage(groupChatId, `📋 <b>Open tickets</b>\n\n${lines.join("\n")}`);
    }
    await logAdminCommand(supa, fromTgUserId, username, groupChatId, cmd, argLine, null, null, "ok");
    return;
  }

  // Unknown admin command — silent (don't spam group with bot noise)
}

// ── /agent ─────────────────────────────────────────────────────────────
async function handleAgent(chatId: number) {
  await sendMessage(
    chatId,
    [
      "⭐ <b>Become a DataSika Agent</b>",
      "",
      "Earn from every data bundle sold. Get exclusive wholesale prices, instant payouts to MoMo, your own customer dashboard, and dedicated support.",
      "",
      "✅ Lower wholesale prices on every bundle",
      "✅ Earn commission on each sale",
      "✅ Withdraw to MoMo anytime",
      "✅ Free training and resources",
      "✅ Be your own boss",
      "",
      "Tap below to apply 👇",
    ].join("\n"),
    {
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Apply now", web_app: { url: `${SITE_URL}/become-an-agent?ref=tg_${chatId}` } } as any]],
        // NOTE: web_app type opens the application form as a Mini App overlay
        // inside Telegram (Issue 6), matching the deposit/pay/link pattern.
      },
    },
  );
}

// ── /deposit ───────────────────────────────────────────────────────────
async function handleDepositStart(supa: any, chatId: number) {
  const link = await getLink(supa, chatId);
  if (!link) {
    await sendMessage(chatId, LINK_REQUIRED_MSG, withMenu());
    return;
  }
  // Mini App deep links — open the deposit Mini App with the amount
  // preselected via start_param (amt_<n>). Falls back to a typed amount
  // for clients that can't render web_app buttons (handleDepositAmount
  // remains wired for plain text input via the deposit_amount session).
  await setSession(supa, chatId, "deposit_amount", {});
  const miniAppUrl = (n: number) =>
    `https://t.me/${BOT_USERNAME}/deposit?startapp=amt_${n}`;
  const buttons: InlineKeyboard = [
    DEPOSIT_PRESETS.slice(0, 2).map((a) => ({ text: `GHS ${a}`, url: miniAppUrl(a) })),
    DEPOSIT_PRESETS.slice(2, 4).map((a) => ({ text: `GHS ${a}`, url: miniAppUrl(a) })),
    [{ text: "✏️ Custom amount", url: `https://t.me/${BOT_USERNAME}/deposit?startapp=custom` }],
    [{ text: "↩️ Cancel", callback_data: "buy_cancel" }],
  ];
  await sendTransient(
    supa,
    chatId,
    "💰 <b>Top up your wallet</b>\n\nTap a preset amount to open the secure deposit screen, or type a custom amount in the chat.",
    { inline_keyboard: buttons },
  );
}

async function handleDepositAmount(supa: any, chatId: number, amount: number) {
  const link = await getLink(supa, chatId);
  if (!link) { await sendMessage(chatId, LINK_REQUIRED_MSG, withMenu()); return; }
  if (!Number.isFinite(amount) || amount < DEPOSIT_MIN || amount > DEPOSIT_MAX) {
    await sendMessage(chatId, `❌ <b>Amount out of range</b>\n\nDeposits must be between <b>GHS ${DEPOSIT_MIN}</b> and <b>GHS ${DEPOSIT_MAX}</b>. Reply with another amount.`);
    return;
  }
  const baseAmount = Math.round(amount * 100) / 100;
  const fee = Math.round(baseAmount * PROCESSING_FEE_RATE * 100) / 100;
  const totalPayable = Math.round((baseAmount + fee) * 100) / 100;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    await sendMessage(chatId, "⚠️ <b>Deposits temporarily unavailable</b>\n\nPlease try again in a few minutes.", withMenu()); return;
  }

  const { data: { user } } = await supa.auth.admin.getUserById(link.user_id);
  const email = user?.email || `${link.user_id}@telegram.datasika.com`;

  // Pre-allocate the deposit reference so we can attach a wallet_transactions
  // row to the same reference paystack-initialize will use.
  const reference = genReference("TGDEP");

  // 1. wallet_transactions pending row → linked to paystack_payments via reference
  const { data: walletTxn, error: walletErr } = await supa.from("wallet_transactions").insert({
    user_id: link.user_id, type: "deposit", amount_ghs: baseAmount,
    description: `Wallet deposit GHS ${baseAmount.toFixed(2)} via Telegram`,
    reference, status: "pending",
  }).select("id").maybeSingle();
  if (walletErr) {
    console.error("[telegram-bot] wallet_transactions insert:", walletErr);
    await sendMessage(chatId, "⚠️ <b>Couldn't start the deposit</b>\n\nNothing was charged. Please try /deposit again.", withMenu()); return;
  }

  // 2. tracking row (bot-side bookkeeping)
  await supa.from("telegram_payment_intents").insert({
    chat_id: chatId, user_id: link.user_id, paystack_reference: reference,
    purpose: "deposit", base_amount: baseAmount, total_payable: totalPayable,
  }).then(({ error }: { error: any }) => { if (error) console.error("[telegram-bot] telegram_payment_intents (deposit, non-fatal):", error); });

  // 3. Route through paystack-initialize (same function the website uses).
  // Service-role auth + user_id_override identifies the linked user without
  // a user JWT; telegram_chat_id is captured into checkout_meta for the
  // post-payment landing page deep-link.
  const initRes = await fetch(`${supabaseUrl}/functions/v1/paystack-initialize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify({
      purpose: "deposit",
      amount_ghs: baseAmount,
      reference,
      email,
      callback_url: `https://t.me/${BOT_USERNAME}?start=paid_${encodeURIComponent(reference)}`,
      metadata: { wallet_txn_id: walletTxn?.id || null },
      // Additive params — see paystack-initialize.
      telegram_chat_id: chatId,
      user_id_override: link.user_id,
    }),
  });
  const initJson = await initRes.json().catch(() => null);
  if (!initRes.ok || !initJson?.success || !initJson?.authorization_url) {
    console.error("[telegram-bot] deposit init failed:", initRes.status, initJson);
    await sendMessage(chatId, "⚠️ <b>Couldn't create payment link</b>\n\nNothing was charged. Please try /deposit again.", withMenu()); return;
  }

  await clearSession(supa, chatId);
  await sendMessage(
    chatId,
    [
      `💰 <b>Wallet deposit</b>`,
      "",
      `Amount: GHS ${baseAmount.toFixed(2)}`,
      `Processing fee (4%): GHS ${fee.toFixed(2)}`,
      `<b>Total: GHS ${totalPayable.toFixed(2)}</b>`,
      "",
      "Tap <b>Pay now</b>. Your wallet is credited the moment payment confirms.",
    ].join("\n"),
    { reply_markup: { inline_keyboard: [[{ text: "💳 Pay now", url: initJson.authorization_url }]] } },
  );
}

// ── Re-buy a previous order ────────────────────────────────────────────
async function handleRebuy(supa: any, chatId: number, orderId: string) {
  const { data: order } = await supa
    .from("orders")
    .select("network, bundle_size_gb, recipient_number, product_id, telegram_chat_id, user_id")
    .eq("order_id", orderId).maybeSingle();
  if (!order) { await sendMessage(chatId, "Couldn't find that order.", withMenu()); return; }
  const link = await getLink(supa, chatId);
  if (order.telegram_chat_id !== chatId && (!link || order.user_id !== link.user_id)) {
    await sendMessage(chatId, "Couldn't find that order on this chat.", withMenu()); return;
  }
  if (!order.product_id) {
    await sendMessage(chatId, "That bundle is no longer available — please run /buy.", withMenu()); return;
  }
  return handleBuyStart(supa, chatId, {
    network: order.network, productId: order.product_id, recipient: order.recipient_number,
  });
}

// ── Update dispatcher ──────────────────────────────────────────────────
// Internal: run a handler dispatch with a guaranteed safety net so a single
// throwing handler can never silently kill the bot or leave the user without
// a response. Errors are logged and a friendly fallback is shown.
async function safeDispatch(
  chatId: number | null | undefined,
  label: string,
  fn: () => Promise<unknown> | unknown,
) {
  const startedAt = Date.now();
  console.log(`[bot] handler "${label}" start`, { chat_id: chatId ?? null });
  try {
    await fn();
    console.log(`[bot] handler "${label}" done`, {
      chat_id: chatId ?? null,
      duration_ms: Date.now() - startedAt,
    });
  } catch (e) {
    console.error(`[bot] handler "${label}" failed:`, e);
    if (chatId) {
      try {
        await sendMessage(
          chatId,
          "⚠️ Something went wrong on our side. Please try again or tap /help.",
          withMenu(),
        );
      } catch (e2) {
        console.error(`[bot] fallback sendMessage failed for ${label}:`, e2);
      }
    }
  }
}

export async function processUpdate(supa: any, update: any) {
  // Callback queries (button taps)
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId: number = cq.message?.chat?.id;
    const data: string = cq.data || "";
    // Fire-and-forget the ack so Telegram clears the loading spinner
    // immediately. Awaiting it previously meant every button tap waited
    // on a network round-trip before the actual handler started — the
    // root cause of the "tap 2-3 times" issue.
    answerCallbackQuery(cq.id).catch((e) =>
      console.error("[bot] answerCallbackQuery failed:", e),
    );
    if (!chatId) return;
    if (chatId > 0) await rememberTelegramIdentity(supa, chatId, cq.from?.first_name || null, cq.from?.username || null);
    return safeDispatch(chatId, `cb:${data}`, () =>
      dispatchCallback(supa, chatId, cq, data),
    );
  }

  // Text messages
  const msg = update.message;
  if (!msg || !msg.chat?.id) return;
  const chatIdMsg: number = msg.chat.id;
  const textMsg = (msg.text || "").trim();
  if (chatIdMsg > 0 && !textMsg.startsWith("/start")) {
    await rememberTelegramIdentity(supa, chatIdMsg, msg.from?.first_name || null, msg.from?.username || null);
  }
  return safeDispatch(chatIdMsg, `msg:${(msg.text || "").slice(0, 32)}`, () =>
    dispatchMessage(supa, update),
  );
}

// Callback dispatch table — extracted so safeDispatch wraps the whole flow.
async function dispatchCallback(supa: any, chatId: number, cq: any, data: string) {

    // ── Stale transient-menu guard ────────────────────────────────────
    // If this callback belongs to a transient menu category (network
    // picker, payment chips, deposit chips, redeem confirm, etc.) AND
    // the message it came from is NOT the chat's currently-live transient
    // menu, refuse it gracefully instead of acting on stale state.
    if (callbackIsTransient(data)) {
      const live = await getTransient(supa, chatId);
      const fromMsgId = Number(cq.message?.message_id);
      if (Number.isFinite(fromMsgId) && (!live || live.message_id !== fromMsgId)) {
        try {
          await answerCallbackQuery(
            cq.id,
            "This menu has expired. Tap a button below to start fresh.",
            false,
          );
        } catch (_) { /* swallow */ }
        try {
          await fetch("https://connector-gateway.lovable.dev/telegram/editMessageReplyMarkup", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
              "X-Connection-Api-Key": Deno.env.get("TELEGRAM_API_KEY")!,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: fromMsgId,
              reply_markup: { inline_keyboard: [] },
            }),
          }).catch(() => {});
        } catch (_) { /* swallow */ }
        return;
      }
    }

    if (data === "menu:buy") return handleBuyStart(supa, chatId);
    if (data === "menu:account") return handleAccount(supa, chatId);
    if (data === "menu:history") return handleHistory(supa, chatId);
    if (data === "menu:support") return handleSupport(supa, chatId);
    if (data === "menu:help") return showHelp(chatId);
    if (data === "menu:deposit") return handleDepositStart(supa, chatId);
    if (data === "menu:agent") return handleAgent(chatId);
    if (data === "menu:link") return handleLinkMenu(supa, chatId);
    if (data === "menu:refer" || data === "refer:refresh") return handleRefer(supa, chatId);
    // Referral Hub sub-screens
    if (data === "refhub:home") return renderReferralHub(supa, chatId);
    if (data === "refhub:share") return handleRefHubShare(supa, chatId);
    if (data === "refhub:copy") return handleRefHubCopy(supa, chatId);
    if (data === "refhub:rewards") return handleRefHubRewards(supa, chatId);
    if (data === "refhub:how") return handleRefHubHow(supa, chatId);
    if (data === "refhub:leaders" || data === "refhub:leaderboard") return handleRefHubLeaderboard(supa, chatId, cq.from?.first_name || null);
    if (data === "refhub:exit") {
      await clearSession(supa, chatId);
      await sendMessage(chatId, "👋 Back to the main menu.", withMenu());
      return;
    }
    if (data.startsWith("refhub:list:")) {
      const p = parseInt(data.slice("refhub:list:".length), 10) || 0;
      return handleRefHubList(supa, chatId, p);
    }
    if (data === "points:view") return handlePoints(supa, chatId);
    if (data === "points:checkin") return handleCheckin(supa, chatId);

    if (data === "buy_cancel" || data === "track:cancel") {
      await clearSession(supa, chatId);
      await sendMessage(chatId, "↩️ Cancelled. Tap a button below to continue.", withMenu());
      return;
    }

    // Linking
    if (data === "link:web") return handleLinkWeb(chatId);
    if (data === "link:email") return handleLinkEmailStart(supa, chatId);
    if (data === "link:phone") return handleLinkPhoneStart(supa, chatId);
    if (data === "link:cancel") {
      await clearSession(supa, chatId);
      await sendMessage(chatId, "↩️ Linking cancelled. Tap a button below to continue.", withMenu());
      return;
    }
    // Issue 15 — Unlink confirmation flow
    if (data === "link:unlink_confirm") {
      await sendMessage(
        chatId,
        [
          "🔓 <b>Unlink your DataSika account?</b>",
          "",
          "You'll lose wallet access from this chat.",
          "Your bot points and referrals stay with you (they're tied to your Telegram, not your account).",
        ].join("\n"),
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Yes, unlink", callback_data: "link:unlink_yes" }],
              [{ text: "↩️ Keep linked", callback_data: "menu:link" }],
            ],
          },
        },
      );
      return;
    }
    if (data === "link:unlink_yes") {
      await supa.from("telegram_links").delete().eq("chat_id", chatId);
      await sendMessage(
        chatId,
        "✅ <b>Account unlinked.</b>\n\nYour bot points and referrals are unchanged. Run /link any time to reconnect.",
        withMenu(),
      );
      return;
    }
    if (data === "menu:back") {
      await sendMessage(chatId, "↩️ Back to main menu.", withMenu());
      return;
    }
    if (data.startsWith("link_acct:")) {
      const userId = data.slice("link_acct:".length);
      const session = await getSession(supa, chatId);
      const options = (session.data?.account_options || []) as Array<{ id: string }>;
      if (session.state !== "awaiting_account_choice" || !session.data?.phone || !options.some((a) => a.id === userId)) {
        await sendMessage(chatId, "⏱ <b>Selection expired</b>\n\nRun /link to start again.", withMenu());
        await clearSession(supa, chatId); return;
      }
      await supa.from("telegram_links").upsert({
        chat_id: chatId, user_id: userId, phone: session.data.phone,
        username: cq.from?.username || session.data?.tg_username || null,
        first_name: (cq.from?.first_name || session.data?.from_name || "").trim() || null,
        last_active_at: new Date().toISOString(),
      });
      await backfillReferralUserIds(supa, chatId, userId);
      await clearSession(supa, chatId);
      await sendMessage(chatId, "✅ <b>Account linked!</b>", withMenu());
      return;
    }

    // Buy
    if (data.startsWith("buy_net:")) return handleBuyNetwork(supa, chatId, data.slice(8));
    if (data.startsWith("buy_bdl:")) return handleBuyBundle(supa, chatId, data.slice(8));
    if (data === "buy_rcpt:self") {
      const link = await getLink(supa, chatId);
      if (link?.phone) return handleBuyRecipient(supa, chatId, link.phone);
      await sendInputPrompt(chatId, "Reply with the recipient number, or send /cancel to go back.", "buy_cancel");
      return;
    }

    // Payment method
    if (data === "pay:wallet") {
      const link = await getLink(supa, chatId);
      const session = await getSession(supa, chatId);
      if (!link || session.state !== "buy_pay_method") {
        await sendMessage(chatId, "⏱ <b>Purchase session expired</b>\n\nRun /buy to start again.", withMenu()); return;
      }
      return payFromWallet(supa, chatId, session.data, link);
    }
    if (data === "pay:paystack") {
      const session = await getSession(supa, chatId);
      if (session.state !== "buy_pay_method") {
        await sendMessage(chatId, "⏱ <b>Purchase session expired</b>\n\nRun /buy to start again.", withMenu()); return;
      }
      const link = await getLink(supa, chatId);
      return initiatePaystackOrder(supa, chatId, session.data, link);
    }
    if (data === "pay:nope") {
      await sendMessage(chatId, "💰 Your wallet balance is too low for this order. Tap /deposit to top up.", withMenu());
      return;
    }

    // Deposit
    if (data.startsWith("dep:")) {
      const v = data.slice(4);
      if (v === "custom") {
        await setSession(supa, chatId, "deposit_custom", {});
        await sendInputPrompt(chatId, `Reply with the amount in GHS (between ${DEPOSIT_MIN} and ${DEPOSIT_MAX}), or send /cancel to go back.`, "buy_cancel");
        return;
      }
      const amount = Number(v);
      if (Number.isFinite(amount)) return handleDepositAmount(supa, chatId, amount);
    }

    // Order details
    if (data.startsWith("order:")) return handleOrderDetail(supa, chatId, data.slice(6));
    if (data.startsWith("rebuy:")) return handleRebuy(supa, chatId, data.slice(6));
    if (data.startsWith("issue:")) return handleSupport(supa, chatId, data.slice(6));

    // Human escalation
    if (data === "support:escalate") {
      const fromName = cq.from?.first_name || "there";
      const tgUsername = cq.from?.username || null;
      const tgUserId = cq.from?.id ?? null;
      return escalateToHuman(supa, chatId, fromName, tgUsername, tgUserId);
    }
    if (data === "support:ai_continue") {
      // User chose to give AI another shot — keep them in support_chat state
      // (no session change needed; they're already there) and send a small ack.
      await sendMessage(
        chatId,
        "Okay, let's try again. What's still not working?",
      );
      return;
    }
    if (data === "support:leave") {
      const openLeave = await getOpenTicketForChat(supa, chatId);
      if (openLeave) {
        await sendMessage(
          chatId,
          "You're in a live ticket. Tap ✖️ Close this ticket to end it.",
          { reply_markup: { inline_keyboard: ticketControlsForUser() } },
        );
        return;
      }
      await clearSession(supa, chatId);
      await sendMessage(chatId, "↩️ Left support. You're back at the main menu.", withMenu());
      return;
    }
    if (data === "support:close_user") {
      const open = await getOpenTicketForChat(supa, chatId);
      if (!open) {
        await sendMessage(chatId, "No open ticket to close.", withMenu());
        return;
      }
      await supa.from("support_tickets_v2").update({
        status: "closed",
        close_reason: `Closed by user`,
      }).eq("id", open.id);
      await supa.from("ticket_messages").insert({
        ticket_id: open.id,
        sender_type: "system",
        sender_name: "User",
        message_text: "User closed the ticket.",
        read_by_user: true, read_by_agent: false, read_by_admin: false,
      });
      if (ADMIN_CHAT_ID) {
        await sendMessage(ADMIN_CHAT_ID, `🔒 <code>${esc(open.ticket_code)}</code> closed by user.`);
      }
      // Restore the main menu, then offer rating
      await sendMessage(chatId, buildClosureMessage(open.ticket_code), withMenu());
      await sendMessage(
        chatId,
        `Rate your experience:`,
        { reply_markup: { inline_keyboard: ratingKeyboard() } },
      );
      return;
    }
    if (data.startsWith("support:rate:")) {
      const n = Number(data.slice("support:rate:".length));
      if (!Number.isFinite(n) || n < 1 || n > 5) return;
      // Apply rating to the most recent ticket for this chat (open OR closed).
      const { data: recent } = await supa
        .from("support_tickets_v2")
        .select("id, ticket_code, satisfaction_rating")
        .eq("telegram_chat_id", chatId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!recent) return;
      if (recent.satisfaction_rating != null) {
        await sendMessage(chatId, `You've already rated this ticket. Thanks! 💛`);
        return;
      }
      await supa.from("support_tickets_v2").update({ satisfaction_rating: n }).eq("id", recent.id);
      const stars = "⭐".repeat(n);
      await sendMessage(chatId, `${stars}\n\nThanks for the feedback — it helps us improve.`);
      return;
    }

    // Redemption (Phase 5)
    if (data === "redeem:start") { await touchLink(supa, chatId); return handleRedeemStart(supa, chatId); }
    if (data === "redeem_cancel") {
      await clearSession(supa, chatId);
      await sendMessage(chatId, "Redemption cancelled.", withMenu());
      return;
    }
    if (data === "redeem_locked") {
      await sendMessage(chatId, "🔒 You don't have enough points for that bundle yet. Earn more with /checkin or /refer.");
      return;
    }
    if (data.startsWith("redeem_net:")) return handleRedeemNetwork(supa, chatId, data.slice("redeem_net:".length));
    if (data.startsWith("redeem_bdl:")) {
      const rest = data.slice("redeem_bdl:".length);
      const [productId, gbStr] = rest.split(":");
      const gb = Number(gbStr);
      if (!productId || !Number.isFinite(gb)) {
        await sendMessage(chatId, "That bundle is no longer available. Run /redeem again.", withMenu()); return;
      }
      return handleRedeemBundle(supa, chatId, productId, gb);
    }
    if (data === "redeem_rcpt:self") {
      const link = await getLink(supa, chatId);
      if (link?.phone) return handleRedeemRecipient(supa, chatId, link.phone);
      await sendInputPrompt(chatId, "Reply with the recipient number, or send /cancel to go back.", "redeem_cancel");
      return;
    }
    if (data === "redeem_confirm:yes") return handleRedeemConfirm(supa, chatId);

    return;
}

// Text-message dispatch table — extracted so safeDispatch wraps the whole flow.
async function dispatchMessage(supa: any, update: any) {
  const msg = update.message;
  if (!msg || !msg.chat?.id) return;
  const chatId: number = msg.chat.id;
  const text: string = (msg.text || "").trim();
  const fromName: string = msg.from?.first_name || "there";
  const tgUsername: string | null = msg.from?.username || null;
  if (!text) return;

  // ── Admin-group routing ──
  // If the message comes from inside the configured admin group, only
  // admin slash commands are handled. Trust = group membership only.
  if (ADMIN_CHAT_ID && String(chatId) === String(ADMIN_CHAT_ID)) {
    if (text.startsWith("/")) {
      const fromTgUserId: number = msg.from?.id ?? 0;
      if (fromTgUserId) {
        await handleAdminGroupCommand(supa, fromTgUserId, fromName, tgUsername, chatId, text);
      }
    }
    return; // Never run user-facing handlers for admin-group chat
  }

  // ── Open-ticket intercept ──
  // If this user has an open ticket, gate transactional commands and
  // route plain messages to the agent group. AI is bypassed.
  const openTicket = await getOpenTicketForChat(supa, chatId);
  if (openTicket) {
    const firstToken = text.split(/\s+/)[0].split("@")[0];

    // 1. Support-keyboard buttons
    if (text === "✖️ Close this ticket") {
      await supa.from("support_tickets_v2").update({
        status: "closed",
        close_reason: `Closed by user`,
      }).eq("id", openTicket.id);
      await supa.from("ticket_messages").insert({
        ticket_id: openTicket.id,
        sender_type: "system",
        sender_name: "User",
        message_text: "User closed the ticket.",
        read_by_user: true, read_by_agent: false, read_by_admin: false,
      });
      if (ADMIN_CHAT_ID) {
        await sendMessage(ADMIN_CHAT_ID, `🔒 <code>${esc(openTicket.ticket_code)}</code> closed by user.`);
      }
      await sendMessage(chatId, buildClosureMessage(openTicket.ticket_code), withMenu());
      await sendMessage(chatId, `Rate your experience:`, { reply_markup: { inline_keyboard: ratingKeyboard() } });
      return;
    }
    if (text === "📧 Email") {
      await sendMessage(
        chatId,
        [
          `📧 <b>Email DataSika Support</b>`,
          ``,
          `<a href="mailto:${esc(SUPPORT_EMAIL)}">${esc(SUPPORT_EMAIL)}</a>`,
        ].join("\n"),
        withSupportMenu({ disable_web_page_preview: true }),
      );
      return;
    }

    // 2. Always-safe commands inside a ticket
    const allowedInTicket = new Set(["/cancel", "/start", "/help", "/support"]);

    // 3. Transactional slash commands → friendly redirect
    if (text.startsWith("/") && TRANSACTIONAL_SLASH.has(firstToken)) {
      await sendTicketGatedRedirect(chatId, openTicket.ticket_code, firstToken);
      return;
    }
    // 4. Transactional reply-keyboard buttons → friendly redirect
    if (TRANSACTIONAL_BUTTONS.has(text)) {
      await sendTicketGatedRedirect(chatId, openTicket.ticket_code, text);
      return;
    }
    // 5. /support inside a ticket → friendly refusal (re-shows support keyboard)
    if (firstToken === "/support" || text === "🆘 Support" || text === "📞 Support") {
      await sendMessage(
        chatId,
        `You're already in a ticket (<code>${esc(openTicket.ticket_code)}</code>). Just reply here.`,
        withSupportMenu(),
      );
      await sendMessage(chatId, `Tap below if you're done.`, { reply_markup: { inline_keyboard: ticketControlsForUser() } });
      return;
    }
    // 6. /cancel /start /help fall through; everything else → forward
    if (!text.startsWith("/") || !allowedInTicket.has(firstToken)) {
      return forwardUserMessageToAdmins(supa, chatId, openTicket, text);
    }
  }

  // /cancel always works
  if (text === "/cancel") {
    await clearSession(supa, chatId);
    await sendMessage(chatId, "Cleared.", withMenu());
    return;
  }

  // ── AI Support session gating ──
  // While in support_chat (pre-ticket AI mode), block transactional commands
  // and reply-keyboard buttons so the user stays focused on their issue.
  // /cancel, /start, /help, /support are always safe.
  {
    const sessAi = await getSession(supa, chatId);
    if (sessAi.state === "support_chat") {
      const firstAi = text.split(/\s+/)[0].split("@")[0];
      const safeAi = new Set(["/cancel", "/start", "/help", "/support"]);
      const isTxnSlash = text.startsWith("/") && TRANSACTIONAL_SLASH.has(firstAi);
      const isTxnBtn = TRANSACTIONAL_BUTTONS.has(text);
      if (isTxnSlash || isTxnBtn) {
        await sendMessage(
          chatId,
          [
            "💬 <b>You're currently in support mode.</b>",
            "",
            "Tap <b>Leave Support</b> below to exit and use other features, or just type your message to continue.",
          ].join("\n"),
          { reply_markup: { inline_keyboard: [[{ text: "↩️ Leave Support", callback_data: "support:leave" }]] } },
        );
        return;
      }
      if (text.startsWith("/") && !safeAi.has(firstAi)) {
        // Unknown slash command in support — also gate.
        await sendMessage(
          chatId,
          "You're in support mode. Type your message, or tap Leave Support to exit.",
          { reply_markup: { inline_keyboard: [[{ text: "↩️ Leave Support", callback_data: "support:leave" }]] } },
        );
        return;
      }
    }
  }

  // Re-check after gate (kept for clarity)
  if (text === "/cancel") {
    await clearSession(supa, chatId);
    await sendMessage(chatId, "Cleared.", withMenu());
    return;
  }

  // Slash commands
  if (text.startsWith("/")) {
    const [cmdRaw, ...rest] = text.split(/\s+/);
    const cmd = cmdRaw.split("@")[0];
    const arg = rest.join(" ").trim();

    if (cmd === "/start")   return handleStart(supa, chatId, fromName, arg, tgUsername);
    if (cmd === "/help")    return showHelp(chatId);
    if (cmd === "/buy")     { await touchLink(supa, chatId); return handleBuyStart(supa, chatId); }
    if (cmd === "/account") { await touchLink(supa, chatId); return handleAccount(supa, chatId); }
    if (cmd === "/history") { await touchLink(supa, chatId); return handleHistory(supa, chatId); }
    if (cmd === "/orders")  { await touchLink(supa, chatId); return handleHistory(supa, chatId); }
    if (cmd === "/status")  { await touchLink(supa, chatId); return handleStatus(supa, chatId, arg); }
    if (cmd === "/support") { await touchLink(supa, chatId); return handleSupport(supa, chatId); }
    if (cmd === "/agent")   return handleAgent(chatId);
    if (cmd === "/link")    return handleLinkMenu(supa, chatId);
    if (cmd === "/deposit") { await touchLink(supa, chatId); return handleDepositStart(supa, chatId); }
    if (cmd === "/refer" || cmd === "/invite") return handleRefer(supa, chatId);
    if (cmd === "/checkin") { await touchLink(supa, chatId); return handleCheckin(supa, chatId); }
    if (cmd === "/points" || cmd === "/balance") { await touchLink(supa, chatId); return handlePoints(supa, chatId); }
    if (cmd === "/redeem" || cmd === "/free")    { await touchLink(supa, chatId); return handleRedeemStart(supa, chatId); }
    if (cmd === "/leaderboard" || cmd === "/top") { await touchLink(supa, chatId); return handleLeaderboard(supa, chatId, fromName); }

    await sendMessage(chatId, "Unknown command. Try /help.", withMenu());
    return;
  }

  // Reply-keyboard buttons (text matches) — accept new + old labels for backwards compat
  switch (text) {
    // Buy Data
    case "🛒 Buy Data":
    case "🛒 Buy data":
    case "Buy Data":
    case "Buy data":              await touchLink(supa, chatId); return handleBuyStart(supa, chatId);
    // My Orders
    case "📦 My Orders":
    case "📜 My orders":
    case "My Orders":
    case "My orders":             await touchLink(supa, chatId); return handleHistory(supa, chatId);
    // Wallet
    case "💳 Wallet":
    case "💰 Wallet":
    case "Wallet":                await touchLink(supa, chatId); return handleAccount(supa, chatId);
    // Track Order
    case "🔍 Track Order":
    case "Track Order":           await touchLink(supa, chatId); return handleTrackOrderStart(supa, chatId);
    // Support
    case "📩 Contact Support":
    case "📞 Support":
    case "🆘 Support":
    case "Contact Support":
    case "Support":               await touchLink(supa, chatId); return handleSupport(supa, chatId);
    // Become Agent (kept for backwards compat — no longer on keyboard)
    case "🌟 Become Agent":
    case "⭐ Become an agent":
    case "Become Agent":
    case "Become an Agent":       return handleAgent(chatId);
    // Link Account
    case "🔗 Link Account":
    case "🔗 Link account":
    case "Link Account":          return handleLinkMenu(supa, chatId);
    // Invite Friends / Refer
    case "🎁 Invite Friends":
    case "🎁 Refer & Earn":
    case "🎁 Invite friends":
    case "Invite Friends":
    case "Invite friends":
    case "Invite Friends (Free Data)":
    case "Refer & Earn":          return handleRefer(supa, chatId);
    // Help / How It Works (kept for backwards compat — no longer on keyboard)
    case "ℹ️ How It Works":
    case "ℹ️ Help":
    case "How It Works":          return showHelp(chatId);
    // Referral Hub reply-keyboard buttons (shown only while in hub mode)
    case "📋 Copy link":           return handleRefHubCopy(supa, chatId);
    case "👥 My referrals":        return handleRefHubList(supa, chatId, 0);
    case "💎 Rewards earned":      return handleRefHubRewards(supa, chatId);
    case "🏆 Leaderboard":         { await touchLink(supa, chatId); return handleRefHubLeaderboard(supa, chatId, fromName); }
    case "📖 How it works":        return handleRefHubHow(supa, chatId);
    case "⬅️ Back to main menu": {
      await sendMessage(chatId, "↩️ Back to main menu.", withMenu());
      return;
    }
  }

  // Stateful flows
  const session = await getSession(supa, chatId);
  if (session.state === "awaiting_phone")     return handlePhoneInput(supa, chatId, text);
  if (session.state === "awaiting_otp")       return handleOtpInput(supa, chatId, text, fromName, tgUsername);
  if (session.state === "awaiting_link_email") return handleLinkEmailInput(supa, chatId, text);
  if (session.state === "buy_recipient") {
    const local = normalizeGhanaLocal(text);
    if (!local) { await sendMessage(chatId, "Send a valid Ghana number, e.g. <code>0241234567</code>."); return; }
    return handleBuyRecipient(supa, chatId, local);
  }
  if (session.state === "redeem_recipient") {
    const local = normalizeGhanaLocal(text);
    if (!local) { await sendMessage(chatId, "Send a valid Ghana number, e.g. <code>0241234567</code>."); return; }
    return handleRedeemRecipient(supa, chatId, local);
  }
  if (session.state === "deposit_custom" || session.state === "deposit_amount") {
    const amt = Number(text.replace(/[^0-9.]/g, ""));
    return handleDepositAmount(supa, chatId, amt);
  }
  if (session.state === "support_chat") return handleSupportMessage(supa, chatId, text);
  if (session.state === "track_order_input") return handleTrackOrderInput(supa, chatId, text);

  // Unknown free text → menu
  await sendMessage(chatId, "Tap a button below or type /help.", withMenu());
}

// Long-poll loop lives in `telegram-bot/index.ts` (fallback only) and uses
// the exported `processUpdate` from this module.
export { MAX_RUNTIME_MS, MIN_REMAINING_MS };

