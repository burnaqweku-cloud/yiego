/* 19 Nov 2026 (owner): an UNPAID order never stops a new order for the same number. Before a new checkout, the
   number's open unpaid order closes by itself, after its gateway is asked whether it was really not paid (a MoMo
   prompt approved seconds ago may not have reached our webhook yet; Kora confirms slower than Paystack).
   - Paid in our records (payment received, with a supplier, or waiting for review): the number stays held until
     that order is delivered, as before ("already paid and on its way").
   - The gateway now says paid: not closed, the number stays held; the webhook delivers it.
   - Otherwise: closed through cancel_unpaid_order (closed_reason cancelled_by_customer_unpaid), so a payment that
     still lands later goes the usual safe way: reopened and delivered if the new order is unpaid
     (reopenCancelledUnpaidOrder), held for the admin if the new order was paid too (guard_cancelled_unpaid_payment).
     Never delivered twice. */
import { verifyPaystackTransaction } from "./paystack.ts";
import { verifyWithGateway } from "./gateway.ts";
import { isCancellableUnpaid } from "./unpaidOrder.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export type ClearUnpaidResult =
  | { ok: true; closed: string[] }
  | { ok: false; reference: string; message: string };

export const PAID_OPEN_MESSAGE = "An order for this number is already paid and on its way. Track it with the reference from your confirmation instead of paying again.";

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/** True only when the gateway says this reference was paid. Not paid, unknown or no answer in time: false. */
export async function paidAtGateway(provider: string | null, reference: string | null): Promise<boolean> {
  if (!reference) return false;
  if (provider === "kora" || provider === "flutterwave") {
    const v = await withTimeout(verifyWithGateway(provider, reference), 6000);
    return Boolean(v?.ok);
  }
  const v = await withTimeout(verifyPaystackTransaction(reference), 6000);
  return Boolean(v?.ok && v.payload?.data?.status === "success");
}

const ORDER_COLS = "id, order_reference, user_id, status, payment_status, is_open, paid_at, supplier_purchase_id, supplier_order_reference, wallet_ledger_entry_id, paystack_reference, payment_provider";

/** Close the unpaid open order(s) holding this number, or say which paid one holds it.
 *  `alsoMine`: the signed-in buyer's own unpaid orders for other numbers too (the first-purchase offer allows one at a time). */
export async function clearUnpaidForNumber(db: Db, phone: string, actor: string | null, alsoMine = false): Promise<ClearUnpaidResult> {
  const { data: forNumber } = await db.from("orders").select(ORDER_COLS).eq("recipient_phone_normalized", phone).eq("is_open", true).order("created_at", { ascending: false }).limit(5);
  let open = (forNumber ?? []) as Record<string, string | null>[];
  if (alsoMine && actor) {
    const { data: mine } = await db.from("orders").select(ORDER_COLS).eq("user_id", actor).eq("is_open", true).in("payment_status", ["created", "pending"]).limit(5);
    for (const o of (mine ?? []) as Record<string, string | null>[]) if (!open.some((x) => x.id === o.id)) open = [...open, o];
  }
  const closed: string[] = [];
  for (const o of open) {
    const ref = String(o.order_reference);
    // deno-lint-ignore no-explicit-any
    if (!isCancellableUnpaid(o as any)) return { ok: false, reference: ref, message: PAID_OPEN_MESSAGE };
    const { data: intents } = await db.from("payment_intents").select("provider, provider_reference, status").eq("order_id", o.id).order("created_at", { ascending: false }).limit(3);
    if ((intents ?? []).some((i: { status: string }) => i.status === "succeeded")) return { ok: false, reference: ref, message: PAID_OPEN_MESSAGE };
    const checks: Array<{ provider: string | null; reference: string | null }> = (intents ?? []).filter((i: { status: string }) => i.status === "pending").map((i: { provider: string; provider_reference: string }) => ({ provider: i.provider, reference: i.provider_reference }));
    if (!checks.length && o.paystack_reference) checks.push({ provider: o.payment_provider ?? "paystack", reference: o.paystack_reference });
    const paid = (await Promise.all(checks.map((c) => paidAtGateway(c.provider, c.reference)))).some(Boolean);
    if (paid) return { ok: false, reference: ref, message: PAID_OPEN_MESSAGE };
    const { error } = await db.rpc("cancel_unpaid_order", { p_reference: ref, p_actor: actor, p_token: null, p_email: null, p_admin: false, p_anyone: true });
    if (error) {
      // Refused: either another checkout closed it a moment ago (fine) or it was paid in between (it holds the number).
      const { data: now } = await db.from("orders").select("status, is_open, payment_status, paid_at").eq("id", o.id).maybeSingle();
      if (now && !now.is_open && now.status === "cancelled" && now.payment_status !== "succeeded" && !now.paid_at) continue;
      return { ok: false, reference: ref, message: PAID_OPEN_MESSAGE };
    }
    closed.push(ref);
    await db.from("order_events").insert({ order_id: o.id, event_type: "order.replaced_unpaid", from_status: "cancelled", to_status: "cancelled", message: "Closed by itself: a new order was placed for this number. The gateway was checked: not paid. No money moved.", metadata: { checked: checks.length }, created_by: actor });
  }
  return { ok: true, closed };
}
