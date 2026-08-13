// Fallback completion for a guest data purchase whose Paystack webhook never
// arrived. Safe to call unauthenticated: it only completes an order whose
// payment_intent verifies as "success" directly with Paystack, so it can never
// mark an unpaid order paid. Idempotent — re-running a completed order no-ops.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { amountFromSubunit, verifyPaystackTransaction } from "../_shared/paystack.ts";
import { fulfillOrderWithDataMartGH } from "../_shared/fulfillment.ts";
import { sendGuestOrderConfirmation } from "../_shared/email.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

  try {
    const body = await req.json();
    const orderReference = String(body.orderReference ?? "").trim().toUpperCase();
    if (!orderReference) return jsonResponse({ error: "orderReference is required" }, { status: 400 });

    const supabase = createSupabaseAdmin();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, order_reference, status, payment_status, supplier_order_reference, recipient_phone, amount, paystack_reference")
      .eq("order_reference", orderReference)
      .maybeSingle();
    if (orderError) return jsonResponse({ error: orderError.message }, { status: 500 });
    if (!order) return jsonResponse({ error: "Order not found" }, { status: 404 });

    // Already done — report the terminal state without touching anything.
    if (order.payment_status === "succeeded") {
      return jsonResponse({ status: "already_paid", orderReference, orderStatus: order.status });
    }

    const { data: intent, error: intentError } = await supabase
      .from("payment_intents")
      .select("id, amount, purpose, status, order_id, user_id, provider_reference")
      .eq("order_id", order.id)
      .eq("purpose", "guest_data_purchase")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (intentError) return jsonResponse({ error: intentError.message }, { status: 500 });

    const providerReference = intent?.provider_reference ?? order.paystack_reference;
    if (!providerReference) {
      return jsonResponse({ error: "No Paystack reference on this order" }, { status: 409 });
    }

    // The gate: ask Paystack directly whether this reference was actually paid.
    const verified = await verifyPaystackTransaction(providerReference);
    if (!verified.ok || verified.payload?.data?.status !== "success") {
      const state = verified.payload?.data?.status ?? "unknown";
      return jsonResponse({ status: "not_paid", orderReference, paystackStatus: state });
    }

    const paidAmount = amountFromSubunit(Number(verified.payload.data.amount));
    if (paidAmount < Number(order.amount)) {
      return jsonResponse({ error: "Verified amount is less than the order amount" }, { status: 400 });
    }

    // Record that the webhook was missed, for the audit trail.
    await supabase.from("payment_events").upsert(
      {
        provider: "paystack",
        event_type: "charge.success.reconciled",
        provider_reference: providerReference,
        payload: verified.payload,
        processed_at: new Date().toISOString(),
      },
      { onConflict: "provider,event_type,provider_reference" },
    );

    if (intent) {
      await supabase
        .from("payment_intents")
        .update({ status: "succeeded", verified_at: new Date().toISOString() })
        .eq("id", intent.id);
    }

    await supabase
      .from("orders")
      .update({
        payment_status: "succeeded",
        status: order.status === "awaiting_payment" ? "paid" : order.status,
        paid_by_user_id: intent?.user_id ?? null,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    await supabase.from("order_events").insert({
      order_id: order.id,
      event_type: "payment.succeeded",
      from_status: order.status,
      to_status: "paid",
      message: "Payment confirmed by reconciliation (webhook was missed)",
      metadata: { provider: "paystack", reference: providerReference, amount: paidAmount, reconciled: true },
    });

    let fulfillment = null;
    if (!order.supplier_order_reference) {
      try {
        fulfillment = await fulfillOrderWithDataMartGH(supabase, order.id);
      } catch (fulfillmentError) {
        const message = fulfillmentError instanceof Error ? fulfillmentError.message : "Supplier fulfillment failed";
        await supabase
          .from("orders")
          .update({ status: "failed_needs_review", failure_reason: message, updated_at: new Date().toISOString() })
          .eq("id", order.id);
        await supabase.from("order_events").insert({
          order_id: order.id,
          event_type: "supplier.fulfillment_exception",
          from_status: "paid",
          to_status: "failed_needs_review",
          message,
        });
        return jsonResponse({ status: "paid_fulfillment_failed", orderReference, error: message });
      }
    }

    // Email the guest their Order ID + track link (best-effort, no-op without
    // email configured or for account orders).
    try { await sendGuestOrderConfirmation(supabase, order.id); } catch { /* best-effort */ }

    const { data: fresh } = await supabase
      .from("orders")
      .select("status, supplier_status, supplier_order_reference")
      .eq("id", order.id)
      .maybeSingle();

    return jsonResponse({
      status: "reconciled",
      orderReference,
      orderStatus: fresh?.status ?? "paid",
      supplierStatus: fresh?.supplier_status ?? null,
      supplierReference: fresh?.supplier_order_reference ?? null,
      fulfillment,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
