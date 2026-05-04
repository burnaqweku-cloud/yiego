import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { syncOrderStatusFromSupplier, mapWebhookEvent } from "../_shared/supplier-status-sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-datamart-signature, x-datamart-event, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Constant-time HMAC SHA256 verification ─────────────────
async function verifyHmacSha256(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const expectedHex = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const a = expectedHex.toLowerCase();
    const b = signature.toLowerCase();
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
      mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Get DataMart supplier ID for webhook_events logging
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id")
    .eq("code", "DATAMART")
    .maybeSingle();
  const supplierId = supplier?.id || null;

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-datamart-signature") || "";
    const eventHeader = req.headers.get("x-datamart-event") || "";
    const webhookSecret = Deno.env.get("DATAMART_WEBHOOK_SECRET");

    if (!webhookSecret) {
      console.error("[datamart-webhook] DATAMART_WEBHOOK_SECRET not configured");
      return new Response(JSON.stringify({ error: "Not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify HMAC SHA256 signature
    const isValid = await verifyHmacSha256(rawBody, signature, webhookSecret);

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error("[datamart-webhook] Invalid JSON body");
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventName = payload.event || eventHeader || payload.type || "unknown";
    console.log("[datamart-webhook] Received:", eventName, "valid:", isValid);

    // ─── Idempotency via webhook_events ─────────────────────────
    const data = payload.data || payload;
    const reference = data.orderReference || data.transactionReference || data.reference ||
      data.orderId || data.transactionId || data.order_id ||
      payload.transactionReference || payload.reference;

    if (reference && supplierId) {
      const { data: dupeCheck } = await supabase
        .from("webhook_events")
        .select("id")
        .eq("supplier_id", supplierId)
        .eq("event_name", eventName)
        .eq("processing_status", "processed")
        .limit(1);

      // Deep dupe check on reference
      if (dupeCheck && dupeCheck.length > 0) {
        const { data: refDupe } = await supabase
          .from("webhook_events")
          .select("id")
          .eq("supplier_id", supplierId)
          .eq("processing_status", "processed")
          .contains("payload_raw", { transactionReference: reference })
          .limit(1);

        if (refDupe && refDupe.length > 0) {
          console.log("[datamart-webhook] Duplicate webhook, skipping:", reference);
          return new Response(JSON.stringify({ received: true, duplicate: true }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Log webhook event
    const { data: webhookEvent } = await supabase.from("webhook_events").insert({
      supplier_id: supplierId,
      event_name: eventName,
      signature_valid: isValid,
      payload_raw: payload,
      processing_status: isValid ? "processing" : "rejected",
      error_message: isValid ? null : "Invalid signature",
    }).select("id").single();

    const eventId = webhookEvent?.id;

    if (!isValid) {
      console.warn("[datamart-webhook] Invalid signature, rejecting");
      // Log to sync logs too
      try {
        await supabase.from("supplier_status_sync_logs").insert({
          source: "webhook",
          local_order_table: "unknown",
          local_order_id: reference || "unknown",
          supplier_reference: reference || null,
          supplier_status: eventName,
          mapped_platform_status: null,
          previous_local_status: null,
          applied: false,
          reason: "invalid_signature",
          raw_meta: JSON.stringify({ event: eventName }).slice(0, 2000),
        });
      } catch { /* non-fatal */ }

      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!reference) {
      console.warn("[datamart-webhook] No reference in payload");
      if (eventId) {
        await supabase.from("webhook_events").update({
          processing_status: "skipped",
          error_message: "No transaction reference",
          processed_at: new Date().toISOString(),
        }).eq("id", eventId);
      }
      return new Response(JSON.stringify({ received: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Route through shared sync engine ───────────────────────
    const { supplierStatus } = mapWebhookEvent(eventName);
    const supplierUpdatedAt = data.updatedAt || data.updated_at || null;
    const supplierMessage = data.message || data.reason || null;

    const result = await syncOrderStatusFromSupplier(supabase, {
      supplierReference: reference,
      supplierStatus,
      supplierUpdatedAt,
      source: "webhook",
      rawMeta: { event: eventName, reference, signature: signature.slice(0, 20) + "..." },
      supplierMessage,
      // Tag as DataMart so the sync engine applies the soft-failed
      // watch window (Failed→Delivered allowed within 24h).
      supplierKey: "DATAMART",
    });

    // Handle wallet refund for failed orders (orders table only)
    if (result.applied && result.table === "orders" && result.newStatus === "Failed") {
      await handleWalletRefund(supabase, result.orderId!);
    }
    // DataMart soft-failed RECOVERY via webhook: reverse the wallet refund.
    if (
      result.applied
      && result.table === "orders"
      && result.previousStatus === "Failed"
      && result.newStatus === "Delivered"
    ) {
      await reverseWalletRefund(supabase, result.orderId!);
    }

    // Mark webhook event as processed
    if (eventId) {
      await supabase.from("webhook_events").update({
        processing_status: result.applied ? "processed" : "skipped",
        processed_at: new Date().toISOString(),
        error_message: result.reason,
      }).eq("id", eventId);
    }

    console.log(`[datamart-webhook] ${eventName} ref=${reference} applied=${result.applied} reason=${result.reason}`);

    return new Response(JSON.stringify({ received: true, processed: result.applied }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[datamart-webhook] Error:", err);
    return new Response(JSON.stringify({ received: true, error: "Processing error" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Wallet refund for failed wallet orders ─────────────────
async function handleWalletRefund(supabase: any, orderId: string) {
  const { data: order } = await supabase
    .from("orders")
    .select("order_id, payment_method, user_id, amount_ghs")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!order || order.payment_method !== "wallet" || !order.user_id) return;

  const amount = Number(order.amount_ghs) || 0;
  if (amount <= 0) return;

  const refundRef = `REF-${orderId}`;
  const { data: existingRefund } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("reference", refundRef)
    .eq("type", "refund")
    .maybeSingle();

  if (existingRefund) {
    console.log(`[datamart-webhook] Refund already exists for ${orderId}`);
    return;
  }

  const { data: wallet } = await supabase
    .from("wallets")
    .select("id, balance_ghs")
    .eq("user_id", order.user_id)
    .maybeSingle();

  if (wallet) {
    await supabase.from("wallets").update({
      balance_ghs: Number(wallet.balance_ghs) + amount,
    }).eq("id", wallet.id);

    await supabase.from("wallet_transactions").insert({
      user_id: order.user_id,
      type: "refund",
      amount_ghs: amount,
      status: "confirmed",
      reference: refundRef,
      description: `Auto-refund for failed order ${orderId} (DataMart webhook)`,
    });

    console.log(`[datamart-webhook] Wallet refunded GHS ${amount} for order ${orderId}`);
  }
}

// ─── DataMart soft-failed RECOVERY: reverse a prior wallet refund ───
async function reverseWalletRefund(supabase: any, orderId: string) {
  const { data: order } = await supabase
    .from("orders")
    .select("order_id, payment_method, user_id, amount_ghs")
    .eq("order_id", orderId)
    .maybeSingle();
  if (!order || order.payment_method !== "wallet" || !order.user_id) return;

  const refundRef = `REF-${orderId}`;
  const { data: refund } = await supabase
    .from("wallet_transactions")
    .select("id, amount_ghs")
    .eq("reference", refundRef)
    .eq("type", "refund")
    .maybeSingle();
  if (!refund) return;

  const reverseRef = `REVREF-${orderId}`;
  const { data: alreadyReversed } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("reference", reverseRef)
    .maybeSingle();
  if (alreadyReversed) return;

  const amount = Number(refund.amount_ghs) || Number(order.amount_ghs) || 0;
  if (amount <= 0) return;

  const { data: wallet } = await supabase
    .from("wallets")
    .select("id, balance_ghs")
    .eq("user_id", order.user_id)
    .maybeSingle();
  if (!wallet) return;

  await supabase.from("wallets").update({
    balance_ghs: Math.max(0, Number(wallet.balance_ghs) - amount),
  }).eq("id", wallet.id);

  await supabase.from("wallet_transactions").insert({
    user_id: order.user_id,
    type: "refund_reversal",
    amount_ghs: -amount,
    status: "confirmed",
    reference: reverseRef,
    description: `Reverse auto-refund — DataMart later delivered order ${orderId}`,
  });

  console.log(`[datamart-webhook] Reversed wallet refund for ${orderId} (soft-failed recovery)`);
}
