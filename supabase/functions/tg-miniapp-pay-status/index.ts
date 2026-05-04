// Mini App: Poll the status of an order payment.
//
// Auth: Mini App session JWT. The intent + order are scoped to the caller's
// user_id from JWT claims.
//
// Returns:
//   {
//     ok, status: "pending"|"paid"|"failed"|"unknown",
//     order_id, network, bundle_size_gb, recipient_masked,
//     supplier_status: "queued"|"processing"|"delivered"|"failed"|null
//   }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  requireMiniAppSession,
  TG_MINIAPP_CORS,
} from "../_shared/tg-miniapp-auth.ts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...TG_MINIAPP_CORS, "Content-Type": "application/json" },
  });
}

// Caller has already proven ownership (matched user_id OR chat_id), so
// recipient is always the user's OWN. Show in full — they need to verify
// it went to the right number. Masking is reserved for cross-user lookups.
function formatRecipient(num: string | null): string {
  if (!num) return "—";
  return String(num);
}

/**
 * Map orders.status (and payment_status) to a UI-friendly supplier_status.
 * Order status taxonomy (from existing platform): Pending, Processing, Paid,
 * Delivered, Failed, Refunded, Cancelled.
 */
function mapSupplierStatus(orderStatus: string | null, paymentStatus: string | null): string | null {
  if (!orderStatus && !paymentStatus) return null;
  const os = String(orderStatus || "").toLowerCase();
  const ps = String(paymentStatus || "").toLowerCase();
  if (os === "delivered") return "delivered";
  if (os === "failed" || os === "refunded") return "failed";
  if (os === "cancelled") return "failed";
  if (os === "processing") return "processing";
  if (os === "paid") return "queued";
  if (ps === "paid") return "queued";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: TG_MINIAPP_CORS });
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let claims;
  try {
    claims = await requireMiniAppSession(req);
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : "Unauthorized" }, 401);
  }
  const userId = claims.user_id ?? null;
  const chatId = claims.chat_id;
  // Guests are allowed — we look up the order by reference and enforce
  // ownership via the chat_id stored on the intent / order.

  const reference = (new URL(req.url).searchParams.get("reference") || "").trim();
  if (!reference || reference.length > 64) {
    return jsonResponse({ ok: false, error: "Missing or invalid reference" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ ok: false, error: "Service unavailable." }, 500);
  }
  const supa = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Intent first — confirms ownership + carries the canonical order context
  // even before the orders row is created by the webhook.
  const { data: intent } = await supa
    .from("telegram_payment_intents")
    .select("user_id, chat_id, network, bundle_size_gb, recipient_phone, base_amount, total_payable")
    .eq("paystack_reference", reference)
    .maybeSingle();
  if (intent) {
    if (intent.user_id) {
      // Linked intent — caller must match user_id
      if (intent.user_id !== userId) {
        return jsonResponse({ ok: false, error: "Not your order." }, 403);
      }
    } else {
      // Guest intent — caller's chat must match
      if (Number(intent.chat_id) !== Number(chatId)) {
        return jsonResponse({ ok: false, error: "Not your order." }, 403);
      }
    }
  }

  const [{ data: order }, { data: psp }] = await Promise.all([
    supa.from("orders")
      .select("order_id, payment_status, status, network, bundle_size_gb, recipient_number, user_id, telegram_chat_id")
      .eq("paystack_reference", reference)
      .maybeSingle(),
    supa.from("paystack_payments").select("status").eq("reference", reference).maybeSingle(),
  ]);

  // Order ownership: linked → match user_id; guest → match telegram_chat_id.
  if (order) {
    if (order.user_id) {
      if (order.user_id !== userId) {
        return jsonResponse({ ok: false, error: "Not your order." }, 403);
      }
    } else if (order.telegram_chat_id != null) {
      if (Number(order.telegram_chat_id) !== Number(chatId)) {
        return jsonResponse({ ok: false, error: "Not your order." }, 403);
      }
    }
  }

  let status: "pending" | "paid" | "failed" | "unknown" = "unknown";
  if (order?.payment_status && String(order.payment_status).toLowerCase() === "paid") status = "paid";
  else if (psp?.status && String(psp.status).toLowerCase() === "success") status = "paid";
  else if (psp?.status && ["failed", "abandoned", "reversed"].includes(String(psp.status).toLowerCase())) status = "failed";
  else if (intent || psp) status = "pending";

  const network = order?.network ?? intent?.network ?? null;
  const bundleSize = Number(order?.bundle_size_gb ?? intent?.bundle_size_gb ?? 0);
  const recipient = order?.recipient_number ?? intent?.recipient_phone ?? null;

  return jsonResponse({
    ok: true,
    status,
    order_id: order?.order_id ?? null,
    network,
    bundle_size_gb: bundleSize,
    recipient_masked: formatRecipient(recipient),
    supplier_status: mapSupplierStatus(order?.status ?? null, order?.payment_status ?? null),
    base_amount: Number(intent?.base_amount ?? 0),
    total_payable: Number(intent?.total_payable ?? 0),
  });
});
