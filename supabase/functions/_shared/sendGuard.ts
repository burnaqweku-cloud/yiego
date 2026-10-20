/* ══════════════════════════════════════════════════════════════
   One payment, one bundle.

   Two rules every send to any supplier passes through (fulfillment.ts calls
   this before it claims the order):

   1. One send at a time per order. A lock on the order row (send_lock_until)
      is taken atomically; a second caller in the same seconds is refused.
      A lock left behind by a crashed run expires after 3 minutes.

   2. No second purchase of the same order while an earlier purchase may still
      be alive. If any supplier ever answered "success" to a purchase for this
      order, a new purchase is refused unless, AFTER that purchase, the supplier
      is on record as having refunded / rejected / cancelled it — in the order's
      timeline (status updates, refund watch, fallback, verification hold) or
      in a status check we logged. Nothing is inferred; no record, no send.

   19 Oct 2026: 123 orders were bought twice from DataBundlesHub because
   neither rule existed. Emma already waited for REFUNDED; this makes every
   supplier wait.
   ══════════════════════════════════════════════════════════════ */

// deno-lint-ignore no-explicit-any
type Db = any;

export const SEND_LOCK_MS = 3 * 60 * 1000;
// "failed" is deliberately NOT here: Emma re-runs a FAILED order on its own and DBH can re-run a failed one too,
// so only a refund/rejection/cancellation proves the supplier will not deliver.
const LOSING = ["refunded", "refund", "rejected", "cancelled", "canceled", "reversed"];
const isLosing = (s: unknown) => typeof s === "string" && LOSING.includes(s.toLowerCase());

export type GuardVerdict = { ok: true } | { ok: false; reason: string; detail: string };

/** Rule 2. Pure read: looks at purchase logs and the timeline. */
export async function earlierAttemptOpen(db: Db, orderId: string): Promise<GuardVerdict> {
  const { data: last } = await db.from("supplier_api_logs").select("id, supplier_id, created_at, response_payload")
    .eq("order_id", orderId).eq("action", "purchase").eq("call_status", "success").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!last) return { ok: true };
  const since = last.created_at;

  // The supplier's own later word, as we recorded it.
  const { data: events } = await db.from("order_events").select("event_type, metadata, message").eq("order_id", orderId).gt("created_at", since)
    .in("event_type", ["supplier.status_update", "supplier.failed_awaiting_refund", "supplier.fallback", "supplier.awaiting_mtn_approval", "supplier.refund_confirmed"]);
  for (const e of events ?? []) {
    const m = (e.metadata ?? {}) as Record<string, unknown>;
    if (e.event_type === "supplier.fallback") return { ok: true }; // only written after a confirmed refund/refusal
    if (e.event_type === "supplier.awaiting_mtn_approval") return { ok: true }; // DBH refunded (silent MTN refund)
    if (isLosing(m.supplierStatus) || isLosing(m.status) || isLosing(m.confirmedStatus)) return { ok: true };
    if (e.event_type === "supplier.status_update" && /refund/i.test(String(e.message ?? ""))) return { ok: true };
  }
  const { data: checks } = await db.from("supplier_api_logs").select("response_payload").eq("order_id", orderId).eq("action", "check_order_status").gt("created_at", since);
  for (const c of checks ?? []) {
    const p = (c.response_payload ?? {}) as { data?: { status?: unknown; orderStatus?: unknown }; status?: unknown };
    if (isLosing(p.data?.status) || isLosing(p.data?.orderStatus) || isLosing(p.status)) return { ok: true };
  }
  const { data: sup } = await db.from("suppliers").select("name").eq("id", last.supplier_id).maybeSingle();
  return { ok: false, reason: "earlier_attempt_open", detail: `${sup?.name ?? "a supplier"} accepted a purchase for this order at ${new Date(since).toLocaleString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} and has not reported it refunded or rejected since` };
}

/** Rule 1. Returns true when this caller now holds the lock. */
export async function takeSendLock(db: Db, orderId: string): Promise<boolean> {
  const now = new Date();
  const { data } = await db.from("orders").update({ send_lock_until: new Date(now.getTime() + SEND_LOCK_MS).toISOString() })
    .eq("id", orderId).or(`send_lock_until.is.null,send_lock_until.lt.${now.toISOString()}`).select("id");
  return Boolean(data?.length);
}

export async function releaseSendLock(db: Db, orderId: string) {
  await db.from("orders").update({ send_lock_until: null }).eq("id", orderId);
}
