import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { amountFromSubunit, verifyPaystackTransaction, verifyPaystackWebhookSignature } from "../_shared/paystack.ts";
import { fulfillOrderWithDataMartGH } from "../_shared/fulfillment.ts";
import { sendGuestOrderConfirmation } from "../_shared/email.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  try {
    const isValid = await verifyPaystackWebhookSignature(rawBody, signature);

    if (!isValid) {
      return jsonResponse({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const supabase = createSupabaseAdmin();
    const providerReference = payload.data?.reference ?? null;
    const eventType = payload.event ?? "unknown";

    const { error } = await supabase.from("payment_events").upsert(
      {
        provider: "paystack",
        event_type: eventType,
        provider_reference: providerReference,
        payload,
      },
      { onConflict: "provider,event_type,provider_reference" },
    );

    if (error) {
      return jsonResponse({ error: error.message }, { status: 500 });
    }

    if (eventType === "charge.success" && providerReference) {
      const verified = await verifyPaystackTransaction(providerReference);

      if (!verified.ok || verified.payload?.data?.status !== "success") {
        return jsonResponse({ received: true, verified: false });
      }

      const { data: paymentIntent, error: paymentIntentError } = await supabase
        .from("payment_intents")
        .select("id, amount, purpose, status, order_id, user_id")
        .eq("provider", "paystack")
        .eq("provider_reference", providerReference)
        .maybeSingle();

      if (paymentIntentError) {
        return jsonResponse({ error: paymentIntentError.message }, { status: 500 });
      }

      if (paymentIntent?.purpose === "wallet_deposit") {
        const paidAmount = amountFromSubunit(Number(verified.payload.data.amount));

        if (paidAmount < Number(paymentIntent.amount)) {
          return jsonResponse({ error: "Verified amount is less than payment intent amount" }, { status: 400 });
        }

        const { error: creditError } = await supabase.rpc("credit_wallet_deposit", {
          p_payment_intent_id: paymentIntent.id,
          p_provider_reference: providerReference,
        });

        if (creditError) {
          return jsonResponse({ error: creditError.message }, { status: 500 });
        }

        await supabase
          .from("payment_events")
          .update({ processed_at: new Date().toISOString() })
          .eq("provider", "paystack")
          .eq("event_type", eventType)
          .eq("provider_reference", providerReference);
      }

      if (paymentIntent?.purpose === "guest_data_purchase" && paymentIntent.order_id) {
        const paidAmount = amountFromSubunit(Number(verified.payload.data.amount));

        if (paidAmount < Number(paymentIntent.amount)) {
          return jsonResponse({ error: "Verified amount is less than payment intent amount" }, { status: 400 });
        }

        await supabase
          .from("payment_intents")
          .update({
            status: "succeeded",
            verified_at: new Date().toISOString(),
          })
          .eq("id", paymentIntent.id);

        const { data: order, error: orderError } = await supabase
          .from("orders")
          .select("id, status, payment_status, supplier_order_reference")
          .eq("id", paymentIntent.order_id)
          .maybeSingle();

        if (orderError) {
          return jsonResponse({ error: orderError.message }, { status: 500 });
        }

        if (order && order.payment_status !== "succeeded") {
          await supabase
            .from("orders")
            .update({
              payment_status: "succeeded",
              status: order.status === "awaiting_payment" ? "paid" : order.status,
              paid_by_user_id: paymentIntent.user_id ?? null,
              paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.id);

          await supabase.from("order_events").insert({
            order_id: order.id,
            event_type: "payment.succeeded",
            from_status: order.status,
            to_status: "paid",
            message: "Paystack confirmed data purchase payment",
            metadata: {
              provider: "paystack",
              reference: providerReference,
              amount: paidAmount,
              paidByUserId: paymentIntent.user_id ?? null,
            },
          });
        }

        if (order && !order.supplier_order_reference) {
          try {
            await fulfillOrderWithDataMartGH(supabase, order.id);
          } catch (fulfillmentError) {
            await supabase
              .from("orders")
              .update({
                status: "failed_needs_review",
                failure_reason:
                  fulfillmentError instanceof Error
                    ? fulfillmentError.message
                    : "Supplier fulfillment failed",
                updated_at: new Date().toISOString(),
              })
              .eq("id", order.id);

            await supabase.from("order_events").insert({
              order_id: order.id,
              event_type: "supplier.fulfillment_exception",
              from_status: "paid",
              to_status: "failed_needs_review",
              message:
                fulfillmentError instanceof Error
                  ? fulfillmentError.message
                  : "Supplier fulfillment failed",
            });
          }
        }

        // Email the guest their Order ID + track link. Never allowed to break
        // the webhook: guarded, and a no-op for account orders or when email
        // is not configured.
        try { await sendGuestOrderConfirmation(supabase, order.id); } catch { /* email is best-effort */ }

        await supabase
          .from("payment_events")
          .update({ processed_at: new Date().toISOString() })
          .eq("provider", "paystack")
          .eq("event_type", eventType)
          .eq("provider_reference", providerReference);
      }
    }

    return jsonResponse({ received: true });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
