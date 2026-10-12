/* What happens once a gateway confirms a payment intent was paid. Faithful to what
   paystack-webhook/index.ts does inline (that file is deliberately left as it is); the Flutterwave
   webhook and the reconcile paths call this.

   `test` = the intent was started with a Flutterwave TEST key (admins only, see gateway.ts). A test
   payment settles nothing real: the intent is marked succeeded with metadata.test, an event is
   written, and no wallet is credited, no plan activated, no order paid or sent to a supplier. */
import { fulfillOrderWithDataMartGH } from "./fulfillment.ts";
import { sendOrderConfirmation } from "./email.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
export type Provider = "paystack" | "flutterwave";

export interface SettleInput {
  provider: Provider;
  providerReference: string;
  /** Amount the gateway says was actually paid, in major units (GHS). */
  paidAmount: number;
  /** Gateway-side transaction id, kept for refunds. */
  transactionId?: string | null;
  source: "webhook" | "reconcile";
}

export async function settlePaymentIntent(supabase: Db, input: SettleInput): Promise<{ status: string; purpose?: string; test?: boolean; error?: string }> {
  const { data: intent, error } = await supabase.from("payment_intents").select("id, amount, purpose, status, order_id, user_id, metadata").eq("provider", input.provider).eq("provider_reference", input.providerReference).maybeSingle();
  if (error) return { status: "error", error: error.message };
  if (!intent) return { status: "no_intent" };
  if (intent.status === "succeeded") return { status: "already_settled", purpose: intent.purpose };
  if (input.paidAmount < Number(intent.amount)) return { status: "error", purpose: intent.purpose, error: "Verified amount is less than payment intent amount" };

  const now = new Date().toISOString();
  const test = intent.metadata?.test === true;
  const meta = { ...(intent.metadata ?? {}), transactionId: input.transactionId ?? intent.metadata?.transactionId ?? null, settledVia: input.source };

  if (test) {
    // Prove the pipe, move nothing.
    await supabase.from("payment_intents").update({ status: "succeeded", verified_at: now, metadata: { ...meta, test: true, testSettledAt: now } }).eq("id", intent.id);
    if (intent.order_id) {
      await supabase.from("order_events").insert({ order_id: intent.order_id, event_type: "payment.test_received", from_status: "awaiting_payment", to_status: "awaiting_payment", message: "Flutterwave TEST payment received. Nothing delivered, order left unpaid.", metadata: { provider: input.provider, reference: input.providerReference, amount: input.paidAmount, test: true } });
    }
    return { status: "test_settled", purpose: intent.purpose, test: true };
  }

  if (intent.purpose === "wallet_deposit") {
    const { error: creditError } = await supabase.rpc("credit_wallet_deposit", { p_payment_intent_id: intent.id, p_provider_reference: input.providerReference });
    if (creditError) return { status: "error", purpose: intent.purpose, error: creditError.message };
    await supabase.from("payment_intents").update({ metadata: meta }).eq("id", intent.id);
    return { status: "settled", purpose: intent.purpose };
  }

  if (intent.purpose === "agent_subscription") {
    await supabase.from("payment_intents").update({ status: "succeeded", verified_at: now, metadata: meta }).eq("id", intent.id);
    await supabase.rpc("agent_activate_subscription", { p_intent_id: intent.id });
    return { status: "settled", purpose: intent.purpose };
  }

  if (intent.purpose === "guest_data_purchase" && intent.order_id) {
    await supabase.from("payment_intents").update({ status: "succeeded", verified_at: now, metadata: meta }).eq("id", intent.id);
    const { data: order, error: orderError } = await supabase.from("orders").select("id, status, payment_status, supplier_order_reference").eq("id", intent.order_id).maybeSingle();
    if (orderError) return { status: "error", purpose: intent.purpose, error: orderError.message };
    if (order && order.payment_status !== "succeeded") {
      await supabase.from("orders").update({ payment_status: "succeeded", status: order.status === "awaiting_payment" ? "paid" : order.status, paid_by_user_id: intent.user_id ?? null, paid_at: now, updated_at: now, payment_provider: input.provider }).eq("id", order.id);
      await supabase.from("order_events").insert({ order_id: order.id, event_type: "payment.succeeded", from_status: order.status, to_status: "paid", message: `${input.provider === "flutterwave" ? "Flutterwave" : "Paystack"} confirmed data purchase payment${input.source === "reconcile" ? " (reconciled)" : ""}`, metadata: { provider: input.provider, reference: input.providerReference, amount: input.paidAmount, paidByUserId: intent.user_id ?? null } });
    }
    if (order && !order.supplier_order_reference) {
      try { await fulfillOrderWithDataMartGH(supabase, order.id); } catch (e) {
        const message = e instanceof Error ? e.message : "Supplier fulfillment failed";
        await supabase.from("orders").update({ status: "failed_needs_review", failure_reason: message, updated_at: new Date().toISOString() }).eq("id", order.id);
        await supabase.from("order_events").insert({ order_id: order.id, event_type: "supplier.fulfillment_exception", from_status: "paid", to_status: "failed_needs_review", message });
      }
    }
    if (order) { try { await sendOrderConfirmation(supabase, order.id); } catch { /* email is best-effort */ } }
    return { status: "settled", purpose: intent.purpose };
  }

  // Unknown purpose: record the money, touch nothing else.
  await supabase.from("payment_intents").update({ status: "succeeded", verified_at: now, metadata: meta }).eq("id", intent.id);
  return { status: "settled_unhandled_purpose", purpose: intent.purpose };
}
