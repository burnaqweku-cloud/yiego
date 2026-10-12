/* Flutterwave → us. Set in Flutterwave → Settings → Webhooks:
     URL          https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/flutterwave-webhook
     Secret hash  the value of the FLUTTERWAVE_WEBHOOK_HASH secret
   Every event is stored in payment_events; a successful charge is verified again with Flutterwave
   by our tx_ref before anything is credited (never trust the webhook body for the amount). */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { verifyFlutterwaveByReference, verifyFlutterwaveWebhook } from "../_shared/flutterwave.ts";
import { settlePaymentIntent } from "../_shared/paymentSettlement.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  if (!verifyFlutterwaveWebhook(req)) return jsonResponse({ error: "Invalid signature" }, { status: 401 });

  try {
    const payload = await req.json().catch(() => null);
    if (!payload) return jsonResponse({ error: "Bad payload" }, { status: 400 });
    const supabase = createSupabaseAdmin();
    const eventType = String(payload.event ?? payload["event.type"] ?? "unknown");
    const data = payload.data ?? {};
    const reference: string | null = data.tx_ref ?? data.txRef ?? null;

    await supabase.from("payment_events").upsert({ provider: "flutterwave", event_type: eventType, provider_reference: reference, payload }, { onConflict: "provider,event_type,provider_reference" });

    const looksSuccessful = String(data.status ?? "").toLowerCase() === "successful";
    if (!reference || !looksSuccessful) return jsonResponse({ received: true, settled: false });

    const verified = await verifyFlutterwaveByReference(reference);
    if (!verified.ok) return jsonResponse({ received: true, verified: false, state: verified.status });
    if ((verified.currency ?? "GHS") !== "GHS") return jsonResponse({ received: true, verified: false, state: `currency_${verified.currency}` });

    const result = await settlePaymentIntent(supabase, { provider: "flutterwave", providerReference: reference, paidAmount: verified.amount, transactionId: verified.transactionId, source: "webhook" });
    if (result.status !== "error") {
      await supabase.from("payment_events").update({ processed_at: new Date().toISOString() }).eq("provider", "flutterwave").eq("event_type", eventType).eq("provider_reference", reference);
    }
    return jsonResponse({ received: true, ...result }, { status: result.status === "error" ? 500 : 200 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
