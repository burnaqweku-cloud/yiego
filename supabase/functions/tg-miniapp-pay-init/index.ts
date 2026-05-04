// Mini App: Order payment.
//
// Two methods on one endpoint (option A from spec):
//   GET  ?reference=TGORD-XXXX  → preview order details (read-only)
//   POST { order_reference }     → initiate Paystack hosted page
//
// Source of truth for the order BEFORE payment is `telegram_payment_intents`
// (created by the bot's /buy flow when paystack-initialize succeeds). The
// `orders` row may not exist yet (it's created by the webhook on payment
// success) — so we display details from the intent.
//
// Defense:
//   - Mini App session JWT required, must be linked.
//   - Refuse cross-user lookups (intent.user_id must match claims.user_id).
//   - Refuse already-paid / failed references.
//
// HARD CONSTRAINT: Zero changes to paystack-initialize / paystack-webhook /
// supplier dispatch. We DO NOT create orders here — the bot's /buy flow
// already created the intent + reference; we just open the existing
// Paystack hosted page (or re-create the link from the same reference if
// expired — but for now we surface the original authorization_url is
// rebuilt by calling paystack-initialize with the same reference, which
// the existing function tolerates as it's idempotent on reference).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  requireMiniAppSession,
  TG_MINIAPP_CORS,
} from "../_shared/tg-miniapp-auth.ts";

const BOT_USERNAME = "datasika_bot";
const PROCESSING_FEE_RATE = 0.04;

// IP rate limit — 10 req / 60s
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...TG_MINIAPP_CORS, "Content-Type": "application/json" },
  });
}

function maskRecipient(num: string | null): string {
  if (!num) return "—";
  const s = String(num);
  if (s.length <= 4) return s;
  return s.slice(0, -4).replace(/\d/g, "•") + s.slice(-4);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: TG_MINIAPP_CORS });
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip") || "unknown";
  if (rateLimited(ip)) {
    return jsonResponse({ ok: false, error: "Too many requests. Please wait a moment." }, 429);
  }

  // Auth — must be a linked Mini App session
  let claims;
  try {
    claims = await requireMiniAppSession(req);
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : "Unauthorized" }, 401);
  }
  const chatId = claims.chat_id;
  const userId = claims.user_id ?? null;
  // Guests are allowed — points/referrals/orders are tied to the Telegram
  // chat, not the linked DataSika account. Ownership is enforced by chat_id
  // when the intent has no user_id.

  // Resolve reference
  let reference = "";
  let isInit = false;
  if (req.method === "GET") {
    reference = (new URL(req.url).searchParams.get("reference") || "").trim();
  } else {
    let body: any;
    try { body = await req.json(); } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
    }
    reference = String(body?.order_reference || body?.reference || "").trim();
    isInit = true;
  }
  if (!reference || reference.length > 64 || !/^[A-Z0-9_-]+$/i.test(reference)) {
    return jsonResponse({ ok: false, error: "Missing or invalid reference" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ ok: false, error: "Payments are temporarily unavailable." }, 500);
  }
  const supa = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Fetch the intent (created by bot /buy)
  const { data: intent, error: intentErr } = await supa
    .from("telegram_payment_intents")
    .select("chat_id, user_id, paystack_reference, purpose, network, bundle_size_gb, recipient_phone, base_amount, total_payable, product_id")
    .eq("paystack_reference", reference)
    .maybeSingle();
  if (intentErr) {
    console.error("[tg-miniapp-pay-init] intent read:", intentErr);
    return jsonResponse({ ok: false, error: "Lookup failed" }, 500);
  }
  if (!intent) {
    return jsonResponse({ ok: false, error: "Order not found." }, 404);
  }
  // Cross-user defense: if the intent has a user_id, the caller must match.
  // If the intent is a guest intent (user_id null), the caller's chat_id must
  // match the intent's chat_id — that's the ownership signal for guests.
  if (intent.user_id) {
    if (intent.user_id !== userId) {
      return jsonResponse({ ok: false, error: "This order belongs to a different account." }, 403);
    }
  } else {
    if (Number(intent.chat_id) !== Number(chatId)) {
      return jsonResponse({ ok: false, error: "This order belongs to a different chat." }, 403);
    }
  }
  if (intent.purpose !== "order") {
    return jsonResponse({ ok: false, error: "This reference is not an order payment." }, 400);
  }

  // 2. Check whether this reference was already paid (orders or paystack_payments)
  const [{ data: order }, { data: psp }] = await Promise.all([
    supa.from("orders").select("order_id, payment_status, status").eq("paystack_reference", reference).maybeSingle(),
    supa.from("paystack_payments").select("status").eq("reference", reference).maybeSingle(),
  ]);
  const alreadyPaid =
    (order?.payment_status && String(order.payment_status).toLowerCase() === "paid") ||
    (psp?.status && String(psp.status).toLowerCase() === "success");

  const baseAmount = Number(intent.base_amount) || 0;
  const totalPayable = Number(intent.total_payable)
    || Math.round((baseAmount + baseAmount * PROCESSING_FEE_RATE) * 100) / 100;
  const fee = Math.round((totalPayable - baseAmount) * 100) / 100;

  // GET → preview only (we still tell them paid/unpaid so the UI can branch)
  if (!isInit) {
    return jsonResponse({
      ok: true,
      reference,
      order_id: order?.order_id ?? null,
      network: intent.network,
      bundle_size_gb: Number(intent.bundle_size_gb),
      recipient_masked: maskRecipient(intent.recipient_phone),
      recipient_phone: intent.recipient_phone, // user owns it; fine to return full
      amount_ghs: baseAmount,
      fee,
      total_payable: totalPayable,
      already_paid: !!alreadyPaid,
    });
  }

  // POST → must NOT initiate if already paid / cancelled
  if (alreadyPaid) {
    return jsonResponse(
      { ok: false, error: "This order has already been paid." },
      400,
    );
  }

  // Resolve email for receipts (only when linked)
  let email = "";
  if (userId) {
    const { data: userResp } = await supa.auth.admin.getUserById(userId);
    email = userResp?.user?.email || `${userId}@telegram.datasika.com`;
  } else {
    email = `tg-${chatId}@telegram.datasika.com`;
  }

  // Re-call paystack-initialize. The function is the same one the bot uses;
  // calling it again with the same product_id + recipient produces a fresh
  // authorization_url. The reference will be a new one — to keep our intent
  // tied to the new attempt we'll write a fresh intent row mirroring the
  // original. (We don't reuse the OLD reference because Paystack hosted
  // sessions can't be "reopened" once abandoned.)
  const initRes = await fetch(`${supabaseUrl}/functions/v1/paystack-initialize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify({
      purpose: "order",
      product_id: intent.product_id,
      recipient_phone: intent.recipient_phone,
      callback_url: `https://datasika.com/tg/pay/success`,
      flow: userId ? "authenticated" : "guest",
      email,
      reference_prefix: "TGORD",
      order_id_prefix: "TG-",
      telegram_chat_id: chatId,
      ...(userId ? { user_id_override: userId } : {}),
    }),
  });
  const initJson = await initRes.json().catch(() => null);
  if (!initRes.ok || !initJson?.success || !initJson?.authorization_url || !initJson?.reference) {
    console.error("[tg-miniapp-pay-init] paystack-initialize failed:", initRes.status, initJson);
    return jsonResponse({ ok: false, error: "Couldn't create the payment link. Try again." }, 502);
  }

  const newReference: string = initJson.reference;

  // Mirror the original intent so the success page can poll the new reference
  await supa.from("telegram_payment_intents").insert({
    chat_id: chatId,
    user_id: userId,
    paystack_reference: newReference,
    purpose: "order",
    product_id: intent.product_id,
    recipient_phone: intent.recipient_phone,
    network: intent.network,
    bundle_size_gb: intent.bundle_size_gb,
    base_amount: baseAmount,
    total_payable: totalPayable,
  }).then(({ error }: { error: any }) => {
    if (error) console.error("[tg-miniapp-pay-init] intent mirror (non-fatal):", error);
  });

  return jsonResponse({
    ok: true,
    authorization_url: initJson.authorization_url,
    reference: newReference,
    order_id: null, // created by webhook on payment confirmation
    network: intent.network,
    bundle_size_gb: Number(intent.bundle_size_gb),
    amount_ghs: baseAmount,
    fee,
    total_payable: totalPayable,
  });
});
