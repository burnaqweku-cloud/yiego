// Mini App: Initialize a Paystack wallet deposit for a linked Telegram user.
//
// Auth: requires a valid Mini App session JWT. The chat_id and user_id are
// taken from the JWT claims — never from the request body. Only LINKED
// chats may deposit (claims.user_id must be present).
//
// This function is a thin wrapper that:
//   1. Validates amount (DEPOSIT_MIN..DEPOSIT_MAX) and recomputes fee/total.
//   2. Pre-allocates a TGDEP-XXXXXXXX reference.
//   3. Inserts a pending wallet_transactions row tied to that reference.
//   4. Inserts a telegram_payment_intents tracking row (best-effort).
//   5. Calls the existing `paystack-initialize` edge function with
//      service-role auth + user_id_override + telegram_chat_id +
//      purpose='deposit'. The webhook will credit the wallet exactly
//      as it does for the legacy /deposit text flow.
//
// HARD CONSTRAINT: ZERO changes to paystack-initialize / paystack-webhook /
// wallet credit logic. This function only PREPARES the same payload shape
// the bot already uses (see _shared/telegram-bot-core.ts handleDepositAmount).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  requireMiniAppSession,
  TG_MINIAPP_CORS,
} from "../_shared/tg-miniapp-auth.ts";

const BOT_USERNAME = "datasika_bot";
const PROCESSING_FEE_RATE = 0.04;
const DEPOSIT_MIN = 5;
const DEPOSIT_MAX = 5000;

// Simple in-memory IP rate limit (per cold start). 8 deposits / 60s / IP.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 8;
const rateBuckets = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (rateBuckets.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    rateBuckets.set(ip, arr);
    return true;
  }
  arr.push(now);
  rateBuckets.set(ip, arr);
  return false;
}

function genReference(prefix = "TGDEP"): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${suffix}`;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...TG_MINIAPP_CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: TG_MINIAPP_CORS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip") || "unknown";
  if (rateLimited(ip)) {
    return jsonResponse({ ok: false, error: "Too many requests. Please wait a moment." }, 429);
  }

  // 1. Verify Mini App session
  let claims;
  try {
    claims = await requireMiniAppSession(req);
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : "Unauthorized" }, 401);
  }
  const chatId = claims.chat_id;
  const userId = claims.user_id ?? null;
  if (!userId) {
    return jsonResponse(
      { ok: false, error: "This chat isn't linked yet. Please link your account first." },
      403,
    );
  }

  // 2. Parse + validate amount
  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400); }
  const rawAmount = Number(body?.amount_ghs);
  if (!Number.isFinite(rawAmount)) {
    return jsonResponse({ ok: false, error: "amount_ghs must be a number" }, 400);
  }
  const baseAmount = Math.round(rawAmount * 100) / 100;
  if (baseAmount < DEPOSIT_MIN || baseAmount > DEPOSIT_MAX) {
    return jsonResponse(
      { ok: false, error: `Amount must be between GHS ${DEPOSIT_MIN} and GHS ${DEPOSIT_MAX}.` },
      400,
    );
  }
  const fee = Math.round(baseAmount * PROCESSING_FEE_RATE * 100) / 100;
  const totalPayable = Math.round((baseAmount + fee) * 100) / 100;

  // 3. Service-role client for the prep + downstream call
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("[tg-miniapp-deposit-init] missing SUPABASE_URL/SERVICE_ROLE_KEY");
    return jsonResponse({ ok: false, error: "Deposits are temporarily unavailable." }, 500);
  }
  const supa = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 4. Re-confirm the link still belongs to this chat + user (defense in depth)
  const { data: link } = await supa
    .from("telegram_links")
    .select("user_id")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (!link || link.user_id !== userId) {
    return jsonResponse(
      { ok: false, error: "This chat isn't linked. Please re-link your account." },
      403,
    );
  }

  // 5. Resolve email for the Paystack receipt
  const { data: userResp } = await supa.auth.admin.getUserById(userId);
  const email = userResp?.user?.email || `${userId}@telegram.datasika.com`;

  const reference = genReference("TGDEP");

  // 6. Pending wallet_transactions row — same shape as bot-core
  const { data: walletTxn, error: walletErr } = await supa
    .from("wallet_transactions")
    .insert({
      user_id: userId,
      type: "deposit",
      amount_ghs: baseAmount,
      description: `Wallet deposit GHS ${baseAmount.toFixed(2)} via Telegram Mini App`,
      reference,
      status: "pending",
    })
    .select("id")
    .maybeSingle();
  if (walletErr) {
    console.error("[tg-miniapp-deposit-init] wallet_transactions insert:", walletErr);
    return jsonResponse({ ok: false, error: "Couldn't start the deposit. Try again." }, 500);
  }

  // 7. Bookkeeping intent row (best-effort)
  await supa.from("telegram_payment_intents").insert({
    chat_id: chatId,
    user_id: userId,
    paystack_reference: reference,
    purpose: "deposit",
    base_amount: baseAmount,
    total_payable: totalPayable,
  }).then(({ error }: { error: any }) => {
    if (error) console.error("[tg-miniapp-deposit-init] telegram_payment_intents (non-fatal):", error);
  });

  // 8. Call the existing paystack-initialize — IDENTICAL payload shape to
  //    the bot's text-flow handleDepositAmount() to keep webhook semantics.
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
      // Paystack-side redirect after payment. Mini App webview navigates
      // ITSELF to the Paystack hosted page (only reliable way to keep iOS
      // users inside Telegram), so this callback returns the webview to the
      // Mini App success page where polling confirms the credit.
      callback_url: `https://datasika.com/tg/deposit/success?ref=${encodeURIComponent(reference)}`,
      metadata: { wallet_txn_id: walletTxn?.id || null, source: "tg_miniapp" },
      telegram_chat_id: chatId,
      user_id_override: userId,
    }),
  });
  const initJson = await initRes.json().catch(() => null);
  if (!initRes.ok || !initJson?.success || !initJson?.authorization_url) {
    console.error("[tg-miniapp-deposit-init] paystack-initialize failed:", initRes.status, initJson);
    // mark the pending row as failed so it doesn't linger as a fake pending
    if (walletTxn?.id) {
      await supa.from("wallet_transactions").update({ status: "failed" }).eq("id", walletTxn.id);
    }
    return jsonResponse({ ok: false, error: "Couldn't create the payment link. Try again." }, 502);
  }

  return jsonResponse({
    ok: true,
    authorization_url: initJson.authorization_url,
    reference,
    base_amount: baseAmount,
    fee,
    total_payable: totalPayable,
  });
});
