/* Kora → us. The URL is passed per charge as notification_url (gateway.ts), so no dashboard
   setup is needed; it can also be set in Kora → Settings → Webhooks as
     https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/kora-webhook
   Kora signs the `data` object with the secret key (x-korapay-signature). Every event is stored
   in payment_events; a successful charge is verified again with Kora by our reference before
   anything is credited (never trust the webhook body for the amount). */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { verifyKoraCharge, verifyKoraWebhookSignature } from "../_shared/kora.ts";
import { settlePaymentIntent } from "../_shared/paymentSettlement.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

  try {
    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") return jsonResponse({ error: "Bad payload" }, { status: 400 });
    if (!(await verifyKoraWebhookSignature(payload.data, req.headers.get("x-korapay-signature")))) return jsonResponse({ error: "Invalid signature" }, { status: 401 });

    const supabase = createSupabaseAdmin();
    const eventType = String(payload.event ?? "unknown");
    const data = payload.data ?? {};
    const reference: string | null = data.reference ?? null;

    await supabase.from("payment_events").upsert({ provider: "kora", event_type: eventType, provider_reference: reference, payload }, { onConflict: "provider,event_type,provider_reference" });

    if (eventType !== "charge.success" || !reference) return jsonResponse({ received: true, settled: false });

    const verified = await verifyKoraCharge(reference);
    if (!verified.ok) return jsonResponse({ received: true, verified: false, state: verified.status });
    if ((verified.currency ?? "GHS") !== "GHS") return jsonResponse({ received: true, verified: false, state: `currency_${verified.currency}` });

    const result = await settlePaymentIntent(supabase, { provider: "kora", providerReference: reference, paidAmount: verified.amount, transactionId: verified.transactionId, source: "webhook" });
    if (result.status !== "error") {
      await supabase.from("payment_events").update({ processed_at: new Date().toISOString() }).eq("provider", "kora").eq("event_type", eventType).eq("provider_reference", reference);
    }
    return jsonResponse({ received: true, ...result }, { status: result.status === "error" ? 500 : 200 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
