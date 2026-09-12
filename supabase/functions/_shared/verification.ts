/* ══════════════════════════════════════════════════════════════
   MTN first-time number verification.

   When an MTN/YELLO number has never received a bundle from
   DataBundlesHub's channel, MTN holds it for verification.
   DBH reacts by refunding the order to our float — silently:
   status "refunded" and errorCode null. That is not a failure.
   MTN clears the number in a few days, after which the same
   bundle goes through on the DBH portal and every later order
   is normal.

   Treating that as an ordinary refund tells the customer their
   order failed and drops the number into the refund queue. So
   a silent MTN refund is instead held as `awaiting_verification`
   on admin_resolution_status: the customer sees a calm message,
   and the admin has a queue of numbers to resubmit.
   ══════════════════════════════════════════════════════════════ */

import { networkFromPrefix } from "./databundleshub.ts";

// deno-lint-ignore no-explicit-any
type SupabaseAdminClient = any;

export const AWAITING_VERIFICATION = "awaiting_verification";

export const AWAITING_VERIFICATION_REASON =
  "MTN is verifying this number before its first bundle. This usually takes a few days. " +
  "The order has not failed and will be delivered automatically once verification is complete.";

/** Customer-facing copy, shared by track-order and the support message. */
export const AWAITING_VERIFICATION_CUSTOMER_MESSAGE =
  "Your order has not failed. MTN verifies numbers that are receiving a bundle for the first time, " +
  "and this usually takes a few days. Your data will be delivered automatically once MTN completes " +
  "the check — you don't need to do anything. Future orders to this number will go through normally.";

interface VerificationOrder {
  recipient_phone: string;
  networks?: { name?: string | null; code?: string | null } | null;
}

/** True for MTN, however the network is labelled (mtn, mtn-1, YELLO, …).
 *  Falls back to the number prefix, which is what DBH itself goes by. */
export function isMtnOrder(order: VerificationOrder) {
  const code = (order.networks?.code ?? "").toLowerCase();
  const name = (order.networks?.name ?? "").toLowerCase();
  if (code.startsWith("mtn") || code.includes("yello") || name.includes("mtn") || name.includes("yello")) return true;
  return networkFromPrefix(order.recipient_phone) === "MTN";
}

interface DbhStatusSnapshot {
  status?: string | null;
  errorCode?: string | number | null;
}

/** DBH said "refunded" with no error code on an MTN number: the silent
 *  refund that means "number under verification". Any real errorCode (or a
 *  non-MTN network) is a genuine refund and stays on the normal path. */
export function isSilentMtnRefund(order: VerificationOrder, dbh: DbhStatusSnapshot) {
  const status = (dbh.status ?? "").toLowerCase();
  if (status !== "refunded" && status !== "refund") return false;
  if (dbh.errorCode !== null && dbh.errorCode !== undefined && String(dbh.errorCode).trim() !== "") return false;
  return isMtnOrder(order);
}

/** Puts an order into the verification hold. Idempotent — a replayed status
 *  check never re-writes the reason or adds a duplicate event. */
export async function markAwaitingVerification(
  supabase: SupabaseAdminClient,
  order: { id: string; status: string; admin_resolution_status?: string | null },
  source: string,
  metadata: Record<string, unknown> = {},
) {
  if (order.admin_resolution_status === AWAITING_VERIFICATION) {
    return { changed: false, reason: "already_awaiting_verification" };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("orders")
    .update({
      admin_resolution_status: AWAITING_VERIFICATION,
      admin_resolution_reason: AWAITING_VERIFICATION_REASON,
      admin_resolution_updated_at: now,
      updated_at: now,
    })
    .eq("id", order.id);
  if (error) throw new Error(error.message);

  await supabase.from("order_events").insert({
    order_id: order.id,
    event_type: "supplier.awaiting_verification",
    from_status: order.admin_resolution_status ?? order.status,
    to_status: AWAITING_VERIFICATION,
    message: "DataBundlesHub refunded silently (no errorCode) on an MTN number — held for MTN first-time verification. Resubmit on the DBH portal once verified.",
    metadata: { supplier: "databundleshub", source, ...metadata },
  });

  return { changed: true };
}
