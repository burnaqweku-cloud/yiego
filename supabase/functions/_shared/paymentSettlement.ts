/* What happens once a gateway confirms a payment intent was paid. Faithful to what
   paystack-webhook/index.ts does inline (that file is deliberately left as it is); the Flutterwave
   webhook and the reconcile paths call this.

   `test` = the intent was started with a TEST key (Flutterwave or Kora) (admins only, see gateway.ts). A test
   payment settles nothing real: the intent is marked succeeded with metadata.test, an event is
   written, and no wallet is credited, no plan activated, no order paid or sent to a supplier. */
import { fulfillOrderWithDataMartGH } from "./fulfillment.ts";
import { sendOrderConfirmation } from "./email.ts";
import { matchesPayment } from "./paymentVerification.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
export type Provider = "paystack" | "flutterwave" | "kora";
const LABEL: Record<Provider, string> = { paystack: "Paystack", flutterwave: "Flutterwave", kora: "Kora" };

export interface SettleInput {
  provider: Provider;
  providerReference: string;
  /** Amount the gateway says was actually paid, in major units (GHS). */
  paidAmount: number;
  currency: string | null;
  /** Gateway-side transaction id, kept for refunds. */
  transactionId?: string | null;
  source: "webhook" | "reconcile";
}

/* 6 Nov 2026: the customer cancelled an UNPAID order on the site while the gateway was still confirming the payment
   (Kora confirms slower than Paystack). Nothing was bought and no money moved on our side, so the paid order is
   reopened and delivered rather than left as "money arrived, order cancelled". The number may hold one open order at
   a time: a newer UNPAID one for the same number (the customer ordering again after cancelling) gives way; a newer
   PAID one means a person must look. Returns the new status, or an error message. */
export async function reopenCancelledUnpaidOrder(supabase: Db, order: { id: string; status: string; payment_status: string | null; paid_at: string | null; supplier_purchase_id: string | null; supplier_order_reference: string | null; wallet_ledger_entry_id: string | null; closed_reason?: string | null }, provider: Provider, reference: string): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  if (!(order.status === "cancelled" && order.payment_status !== "refunded" && order.paid_at == null && order.supplier_purchase_id == null && order.supplier_order_reference == null && order.wallet_ledger_entry_id == null)) return { ok: true, status: order.status };
  const now = new Date().toISOString();
  const { data: self } = await supabase.from("orders").select("recipient_phone_normalized").eq("id", order.id).maybeSingle();
  const { data: others } = await supabase.from("orders").select("id, order_reference, status, payment_status, paid_at, supplier_purchase_id, supplier_order_reference, wallet_ledger_entry_id").eq("recipient_phone_normalized", self?.recipient_phone_normalized ?? "").eq("is_open", true).neq("id", order.id);
  for (const o of others ?? []) {
    const unpaid = o.status === "awaiting_payment" && o.paid_at == null && o.supplier_purchase_id == null && o.supplier_order_reference == null && o.wallet_ledger_entry_id == null && o.payment_status !== "succeeded";
    if (!unpaid) return { ok: false, error: `Closed order needs manual reconciliation (another open order ${o.order_reference} for this number)` };
    await supabase.from("orders").update({ status: "cancelled", payment_status: "abandoned", is_open: false, closed_at: now, closed_reason: "cancelled_duplicate_unpaid", updated_at: now }).eq("id", o.id);
    await supabase.from("order_events").insert({ order_id: o.id, event_type: "order.cancelled_duplicate", from_status: o.status, to_status: "cancelled", message: "Unpaid duplicate: the earlier order for this number was paid and reopened. No money moved." });
  }
  const { error } = await supabase.from("orders").update({ status: "awaiting_payment", is_open: true, closed_at: null, closed_reason: null, updated_at: now }).eq("id", order.id);
  if (error) return { ok: false, error: error.message };
  await supabase.from("order_events").insert({ order_id: order.id, event_type: "order.reopened", from_status: "cancelled", to_status: "awaiting_payment", message: `${LABEL[provider]} confirmed the payment after the unpaid order was cancelled; reopened to deliver.`, metadata: { provider, reference, closedReason: order.closed_reason ?? null } });
  return { ok: true, status: "awaiting_payment" };
}

export async function settlePaymentIntent(supabase: Db, input: SettleInput): Promise<{ status: string; purpose?: string; test?: boolean; error?: string }> {
  const { data: intent, error } = await supabase.from("payment_intents").select("id, amount, currency, purpose, status, order_id, user_id, metadata").eq("provider", input.provider).eq("provider_reference", input.providerReference).maybeSingle();
  if (error) return { status: "error", error: error.message };
  if (!intent) return { status: "no_intent" };
  if (intent.status === "succeeded") return { status: "already_settled", purpose: intent.purpose };
  if (!matchesPayment({ amount: input.paidAmount, currency: input.currency }, intent)) return { status: "error", purpose: intent.purpose, error: "Verified payment does not match the expected amount and currency" };
  if (["cancelled", "failed", "refunded"].includes(intent.status)) return { status: "error", error: "Closed payment needs manual reconciliation" };
  if (input.provider === "kora" && /^sk_test_/.test(Deno.env.get("KORA_SECRET_KEY") ?? "") && intent.metadata?.test !== true) return { status: "error", error: "Test charge cannot settle a real payment intent" };

  const now = new Date().toISOString();
  const test = intent.metadata?.test === true;
  const meta = { ...(intent.metadata ?? {}), transactionId: input.transactionId ?? intent.metadata?.transactionId ?? null, settledVia: input.source };

  if (test) {
    // Prove the pipe, move nothing.
    await supabase.from("payment_intents").update({ status: "succeeded", verified_at: now, metadata: { ...meta, test: true, testSettledAt: now } }).eq("id", intent.id);
    if (intent.order_id) {
      await supabase.from("order_events").insert({ order_id: intent.order_id, event_type: "payment.test_received", from_status: "awaiting_payment", to_status: "awaiting_payment", message: `${LABEL[input.provider]} TEST payment received. Nothing delivered, order left unpaid.`, metadata: { provider: input.provider, reference: input.providerReference, amount: input.paidAmount, test: true } });
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
    const { data: order, error: orderError } = await supabase.from("orders").select("id, status, payment_status, supplier_order_reference, supplier_purchase_id, paid_at, wallet_ledger_entry_id, closed_reason").eq("id", intent.order_id).maybeSingle();
    if (orderError) return { status: "error", purpose: intent.purpose, error: orderError.message };
    if (!order) return { status: "error", error: "Order not found" };
    const reopened = await reopenCancelledUnpaidOrder(supabase, order, input.provider, input.providerReference);
    if (!reopened.ok) return { status: "error", error: reopened.error };
    order.status = reopened.status;
    if (["cancelled", "refunded"].includes(order.status) || order.payment_status === "refunded") return { status: "error", error: "Closed order needs manual reconciliation" };
    if (order && order.payment_status !== "succeeded") {
      await supabase.from("orders").update({ payment_status: "succeeded", status: order.status === "awaiting_payment" ? "paid" : order.status, paid_by_user_id: intent.user_id ?? null, paid_at: now, updated_at: now, payment_provider: input.provider }).eq("id", order.id);
      await supabase.from("order_events").insert({ order_id: order.id, event_type: "payment.succeeded", from_status: order.status, to_status: "paid", message: `${LABEL[input.provider]} confirmed data purchase payment${input.source === "reconcile" ? " (reconciled)" : ""}`, metadata: { provider: input.provider, reference: input.providerReference, amount: input.paidAmount, paidByUserId: intent.user_id ?? null } });
    }
    if (order && !order.supplier_order_reference) {
      try { await fulfillOrderWithDataMartGH(supabase, order.id); } catch (e) {
        const message = e instanceof Error ? e.message : "Supplier fulfillment failed";
        await supabase.from("orders").update({ status: "failed_needs_review", failure_reason: message, updated_at: new Date().toISOString() }).eq("id", order.id);
        await supabase.from("order_events").insert({ order_id: order.id, event_type: "supplier.fulfillment_exception", from_status: "paid", to_status: "failed_needs_review", message });
      }
    }
    if (order) { try { await sendOrderConfirmation(supabase, order.id); } catch { /* email is best-effort */ } }
    const { error: settledError } = await supabase.from("payment_intents").update({ status: "succeeded", verified_at: now, metadata: meta }).eq("id", intent.id);
    if (settledError) return { status: "error", error: settledError.message };
    return { status: "settled", purpose: intent.purpose };
  }

  // Unknown purpose: record the money, touch nothing else.
  await supabase.from("payment_intents").update({ status: "succeeded", verified_at: now, metadata: meta }).eq("id", intent.id);
  return { status: "settled_unhandled_purpose", purpose: intent.purpose };
}
