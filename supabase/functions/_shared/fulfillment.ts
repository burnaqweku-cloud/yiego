import { mapDataMartGHStatusToYieGo } from "./datamartgh.ts";
import { adapterFor, isAmbiguousOutcome, type PurchaseContext, type PurchaseOutcome } from "./supplierAdapters.ts";
import { sendOrderConfirmation } from "./email.ts";
import { FALLBACK_EVENT, fallbackFor } from "./fallback.ts";

// Deliberately loose: these helpers are handed a real supabase-js client and
// only need it to be chainable.
// deno-lint-ignore no-explicit-any
type SupabaseAdminClient = any;

const TERMINAL_ORDER_STATUSES = new Set(["delivered", "refunded", "cancelled"]);

/** DataBundlesHub refuses a second order to the same number within 10 minutes
 *  of the previous one, delivered or not. Wait a little longer than that. */
const COOLDOWN_RETRY_MS = 11 * 60 * 1000;
const MAX_COOLDOWN_RETRIES = 3;

function isDuplicateWindow(outcome: { ok: boolean; responsePayload: unknown; message: string | null }) {
  if (outcome.ok) return false;
  const code = String((outcome.responsePayload as { code?: string } | null)?.code ?? "");
  return code === "DUPLICATE_BENEFICIARY_WINDOW" || /recent order already exists/i.test(outcome.message ?? "");
}

interface OrderStatusSnapshot {
  id: string;
  status: string;
  payment_status: string;
  supplier_status?: string | null;
}

/**
 * Applies a supplier-reported status onto an order, with guards so a late or
 * replayed report can never resurrect a terminal order or touch an unpaid one.
 * Shared by the DataMartGH webhook and the admin "recheck" action.
 */
export async function applySupplierStatusToOrder(
  supabase: SupabaseAdminClient,
  order: OrderStatusSnapshot,
  supplierStatus: string | undefined,
  source: string,
) {
  const mapped = mapDataMartGHStatusToYieGo(supplierStatus);

  if (TERMINAL_ORDER_STATUSES.has(order.status)) {
    return { changed: false, reason: "order_already_terminal", mapped };
  }
  if (order.payment_status !== "succeeded") {
    return { changed: false, reason: "order_not_paid", mapped };
  }
  if (order.status === mapped && (order.supplier_status ?? null) === (supplierStatus ?? null)) {
    return { changed: false, reason: "no_change", mapped };
  }

  await supabase
    .from("orders")
    .update({
      status: mapped,
      supplier_status: supplierStatus ?? order.supplier_status ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  await supabase.from("order_events").insert({
    order_id: order.id,
    event_type: "supplier.status_update",
    from_status: order.status,
    to_status: mapped,
    message: `Supplier reported ${supplierStatus ?? "an unknown status"} (${source})`,
    metadata: {
      supplier: "datamartgh",
      supplierStatus: supplierStatus ?? null,
      source,
    },
  });

  return { changed: true, mapped };
}

/**
 * Sends a paid order to its supplier.
 *
 * One rule: the network's supplier (networks.preferred_supplier_id, set from
 * Admin → Suppliers → "Delivered by") delivers every order on that network.
 * There is no customer choice and no priority fallback; if the network has no
 * supplier, or the supplier doesn't map the bundle, the order is held for a
 * person (failed_needs_review) rather than quietly sent somewhere else.
 *
 * Every supplier-specific detail lives behind an adapter, so a new supplier is
 * an entry in supplierAdapters.ts and no change here.
 */
export interface FulfillOptions {
  /** Send through this supplier instead of the network's main one (the resend loops pass their own). */
  supplierId?: string;
  /** Already the second attempt: no further fallback. */
  viaFallback?: boolean;
}

export async function fulfillOrder(supabase: SupabaseAdminClient, orderId: string, opts: FulfillOptions = {}) {
  const result = await sendToSupplier(supabase, orderId, opts);
  // Email follows the real outcome: "on its way" once the supplier has it, "verifying" if held.
  try { await sendOrderConfirmation(supabase, orderId); } catch { /* email is best-effort */ }
  return result;
}

async function sendToSupplier(supabase: SupabaseAdminClient, orderId: string, opts: FulfillOptions = {}): Promise<any> {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) throw new Error(orderError.message);
  if (!order) throw new Error("order_not_found");

  if (order.supplier_order_reference || order.supplier_purchase_id) {
    return { skipped: true, reason: "already_sent_to_supplier", order };
  }

  // One rule: the network's supplier (Admin → Suppliers → "Delivered by")
  // delivers every order on that network. No customer choice, no priority
  // fallback. If the network has no supplier or the supplier can't take the
  // bundle, the order waits for a person rather than being re-routed.
  const { data: network } = await supabase.from("networks").select("name, preferred_supplier_id, fallback_supplier_id").eq("id", order.network_id).maybeSingle();
  const routedSupplierId: string | null = opts.supplierId ?? network?.preferred_supplier_id ?? null;
  /** Hand the order to the network's fallback supplier (once). Returns null when there is none. */
  const tryFallback = async (fromName: string, why: string) => {
    if (opts.viaFallback) return null;
    const fb = await fallbackFor(supabase, order, routedSupplierId);
    if (!fb) return null;
    await supabase.from("order_events").insert({ order_id: order.id, event_type: FALLBACK_EVENT, from_status: order.status, to_status: "processing", message: `${fromName} could not take this order (${why}). Sending to ${fb.name} instead.`, metadata: { from: fromName, to: fb.code, why, stage: "at_purchase" } });
    return await sendToSupplier(supabase, orderId, { supplierId: fb.id, viaFallback: true });
  };
  const hold = async (why: string, reason: string) => {
    await supabase.from("orders").update({ status: "failed_needs_review", failure_reason: `Not sent: ${why}. Set the network's supplier under Admin → Suppliers and resend, or refund.`, updated_at: new Date().toISOString() }).eq("id", order.id);
    await supabase.from("order_events").insert({ order_id: order.id, event_type: "supplier.fulfillment_blocked", from_status: order.status, to_status: "failed_needs_review", message: `Not sent: ${why}`, metadata: { routedSupplierId, reason } });
    return { skipped: true, reason, orderId: order.id, status: "failed_needs_review" };
  };
  if (!routedSupplierId) return await hold(`${network?.name ?? "this network"} has no supplier set`, "network_has_no_supplier");

  const { data: candidates, error: mappingError } = await supabase
    .from("supplier_product_mappings")
    .select("*, suppliers!inner(id, code, name, status)")
    .eq("product_id", order.product_id)
    .eq("supplier_id", routedSupplierId)
    .eq("is_active", true)
    .eq("suppliers.status", "active");
  if (mappingError) throw new Error(mappingError.message);
  const mapping = (candidates ?? []).slice().sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))[0];
  if (!mapping) {
    const { data: routed } = await supabase.from("suppliers").select("name, status").eq("id", routedSupplierId).maybeSingle();
    const why = routed ? (routed.status === "active" ? `${routed.name} doesn't know this bundle` : `${routed.name} is ${routed.status}`) : "chosen supplier not found";
    const viaFb = await tryFallback(routed?.name ?? "The main supplier", why);
    if (viaFb) return viaFb;
    return await hold(why, "routed_supplier_unavailable");
  }

  const supplier = mapping.suppliers as { id: string; code: string; name: string };
  const adapter = adapterFor(supplier.code);
  if (!adapter) throw new Error(`no_adapter_for_supplier_${supplier.code}`);
  if (!adapter.isConfigured()) throw new Error(`supplier_not_configured_${supplier.code}`);

  // Claim the order atomically before anything is sent. Two callers (the
  // Paystack webhook and the tracker page's reconcile) can both see the order
  // as paid in the same instant; the read-then-act check above is not enough.
  // Only the caller whose update actually matches a row gets to purchase —
  // the other sees zero rows and stops. YG-E4B46D7A20 was sent twice this way.
  // Idempotency key: reused when the last attempt at THIS supplier got no answer (timeout, connection
  // error, server error), so a supplier that did take the order recognises the repeat instead of selling
  // twice. A fresh key only after a clear refusal, or when this supplier was never tried for the order.
  const { data: tries } = await supabase.from("supplier_api_logs").select("http_status, call_status").eq("order_id", order.id).eq("supplier_id", supplier.id).eq("action", "purchase").order("created_at", { ascending: false });
  const lastTry = (tries ?? [])[0] ?? null;
  const attempt: number = (tries ?? []).length; // 0 = first send to this supplier
  const triedBefore = attempt > 0;
  const lastWasAmbiguous = Boolean(lastTry) && lastTry.call_status !== "success" && (lastTry.http_status === 0 || lastTry.http_status === 408 || lastTry.http_status >= 500);
  const idempotencyKey = (lastWasAmbiguous && order.supplier_idempotency_key) ? order.supplier_idempotency_key : crypto.randomUUID();
  const { data: claimed, error: claimError } = await supabase
    .from("orders")
    .update({
      status: "processing",
      supplier_id: supplier.id,
      supplier_idempotency_key: idempotencyKey,
      // The cost is whatever the supplier we actually use charges.
      ...(mapping.supplier_price != null ? { cost_amount: mapping.supplier_price } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("status", order.status)
    .is("supplier_purchase_id", null)
    .is("supplier_order_reference", null)
    .select("id");
  if (claimError) throw new Error(claimError.message);
  if (!claimed || claimed.length === 0) {
    return { skipped: true, reason: "already_claimed_by_concurrent_fulfillment", order };
  }

  const context: PurchaseContext = {
    recipientPhone: order.recipient_phone,
    orderReference: order.order_reference,
    idempotencyKey,
    supplierNetworkCode: mapping.supplier_network_code ?? null,
    supplierCapacity: mapping.supplier_capacity ?? null,
    attempt,
  };

  // Refuse an order this supplier cannot serve before any money moves.
  // Exception: a ported number the customer (or an admin) confirmed is on the
  // network they picked. Only the prefix mismatch is waived; other checks still apply.
  const preflight = adapter.preflight(context);
  const prefixWaived = !preflight.ok && order.prefix_mismatch_confirmed === true && preflight.reason.startsWith("number_prefix_is_");
  if (prefixWaived) {
    await supabase.from("order_events").insert({
      order_id: order.id,
      event_type: "supplier.prefix_mismatch_override",
      from_status: order.status,
      to_status: "processing",
      message: "Prefix mismatch confirmed by customer, sent anyway",
      metadata: { supplier: supplier.code, reason: (preflight as { reason: string }).reason },
    });
  }
  if (!preflight.ok && !prefixWaived) {
    await supabase
      .from("orders")
      .update({
        status: "failed_needs_review",
        supplier_id: supplier.id,
        failure_reason: `preflight_${preflight.reason}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    await supabase.from("order_events").insert({
      order_id: order.id,
      event_type: "supplier.fulfillment_blocked",
      from_status: order.status,
      to_status: "failed_needs_review",
      message: `Not sent: ${preflight.reason.replace(/_/g, " ")}`,
      metadata: { supplier: supplier.code, reason: preflight.reason },
    });
    return { skipped: true, reason: preflight.reason, orderId: order.id, status: "failed_needs_review" };
  }

  // Tried this supplier before (a retry or a resend): ask whether they already hold the order under our
  // reference before buying again. If they do, adopt it; nothing is sent.
  if (triedBefore && adapter.findByReference) {
    try {
      // Every earlier attempt has its own reference at the supplier; any of them still held means it is theirs.
      let look: Awaited<ReturnType<NonNullable<typeof adapter.findByReference>>> | null = null;
      for (let a = attempt - 1; a >= 0; a--) { const l = await adapter.findByReference(order.order_reference, a); if (l.found && l.held) { look = l; break; } }
      if (look && look.found && look.held) {
        const adopted = adapter.mapStatus(look.supplierStatus);
        await supabase.from("orders").update({ status: adopted, supplier_order_reference: look.supplierReference, supplier_purchase_id: look.purchaseId, supplier_transaction_reference: look.transactionReference, supplier_status: look.supplierStatus, supplier_retry_after: null, failure_reason: null, updated_at: new Date().toISOString() }).eq("id", order.id);
        await supabase.from("order_events").insert({ order_id: order.id, event_type: "supplier.already_held", from_status: "processing", to_status: adopted, message: `${supplier.name} already has this order (${look.supplierStatus ?? "accepted"}); not sent again.`, metadata: { supplier: supplier.code, supplierReference: look.supplierReference, supplierStatus: look.supplierStatus } });
        return { skipped: true, reason: "already_held_by_supplier", orderId: order.id, status: adopted };
      }
    } catch { /* lookup unavailable: fall through to a normal send, which the ambiguity handling below still guards */ }
  }

  await supabase.from("order_events").insert({
    order_id: order.id,
    event_type: "supplier.fulfillment_started",
    from_status: order.status,
    to_status: "processing",
    message: `Sending paid order to ${supplier.name}`,
    metadata: { supplier: supplier.code, idempotencyKey },
  });

  let outcome: PurchaseOutcome;
  try {
    outcome = await adapter.purchase(context);
  } catch (e) {
    // No reply at all (connection refused, DNS, our 30s timeout). The supplier may still have it.
    outcome = { ok: false, httpStatus: 0, durationMs: 0, endpoint: "purchase", requestPayload: { recipientPhone: context.recipientPhone, orderReference: context.orderReference }, responsePayload: null, supplierReference: null, purchaseId: null, transactionReference: null, supplierStatus: null, message: `${supplier.name}: ${e instanceof Error ? e.message : "no response"}` };
  }

  // No answer (timeout, gateway or server error) is NOT a refusal: the supplier may have taken the order
  // and simply not replied in time. Ask them by our reference before deciding anything. Found and held →
  // carry on as an accepted order; found but refunded/failed or not found → it is a real failure (fallback
  // allowed); lookup impossible → a failure that a person must check, never a fallback (no double sends).
  let fallbackAllowed = true; let parkForRecheck = false;
  if (isAmbiguousOutcome(outcome)) {
    fallbackAllowed = false;
    if (adapter.findByReference) {
      try {
        let look = await adapter.findByReference(order.order_reference, attempt);
        if (!look.found) { await new Promise((r) => setTimeout(r, 5000)); look = await adapter.findByReference(order.order_reference, attempt); }
        if (look.found && look.held) {
          await supabase.from("order_events").insert({ order_id: order.id, event_type: "supplier.recovered_after_timeout", from_status: "processing", to_status: "processing", message: `${supplier.name} did not answer in time (HTTP ${outcome.httpStatus}) but has the order (${look.supplierStatus ?? "accepted"}). Keeping it there.`, metadata: { supplier: supplier.code, httpStatus: outcome.httpStatus, supplierReference: look.supplierReference, supplierStatus: look.supplierStatus } });
          outcome = { ...outcome, ok: true, supplierReference: look.supplierReference, purchaseId: look.purchaseId, transactionReference: look.transactionReference, supplierStatus: look.supplierStatus, message: null };
        } else if (look.found && !look.refunded) {
          // FAILED/REJECTED but not refunded: nothing can be done yet (they may still re-run it or refund it), so
          // the order stays IN PROGRESS, not in Needs review. The supplier's refund watch moves it on once REFUNDED.
          await supabase.from("supplier_api_logs").insert({ supplier_id: supplier.id, order_id: order.id, action: "purchase", endpoint: outcome.endpoint, request_payload: outcome.requestPayload, response_payload: outcome.responsePayload, http_status: outcome.httpStatus, call_status: "error", idempotency_key: idempotencyKey, error_message: `${supplier.name} did not answer in time and then reported ${look.supplierStatus}`, duration_ms: outcome.durationMs });
          await supabase.from("orders").update({ status: "processing", supplier_status: look.supplierStatus, supplier_retry_after: null, failure_reason: `${supplier.name} reported ${look.supplierStatus} — waiting for their refund before anything else can happen`, updated_at: new Date().toISOString() }).eq("id", order.id).is("supplier_purchase_id", null).is("supplier_order_reference", null);
          await supabase.from("order_events").insert({ order_id: order.id, event_type: "supplier.failed_awaiting_refund", from_status: "processing", to_status: "processing", message: `${supplier.name} did not answer in time (HTTP ${outcome.httpStatus}) and then reported ${look.supplierStatus}. Waiting for their refund; nothing to do yet.`, metadata: { supplier: supplier.code, httpStatus: outcome.httpStatus, supplierStatus: look.supplierStatus, supplierReference: look.supplierReference } });
          return { skipped: true, reason: "awaiting_supplier_refund", orderId: order.id, status: "processing" };
        } else {
          // No record of it, or the money is back: a real failure. Another supplier may take it.
          fallbackAllowed = true;
          outcome = { ...outcome, message: look.found ? `${supplier.name} did not answer in time and then reported ${look.supplierStatus ?? "failed"} (money returned)` : `${supplier.name} did not answer in time (HTTP ${outcome.httpStatus}) and has no record of this order` };
        }
      } catch (e) {
        outcome = { ...outcome, message: `${supplier.name} did not answer in time (HTTP ${outcome.httpStatus}) and could not be asked whether it has the order (${e instanceof Error ? e.message : "lookup failed"}).` };
        parkForRecheck = true;
      }
    } else {
      outcome = { ...outcome, message: `${supplier.name} did not answer in time (HTTP ${outcome.httpStatus}). It may still have the order.` };
      parkForRecheck = true;
    }
  }
  // The supplier may have the order and we cannot tell yet: keep it "processing" and let this supplier's
  // resend loop come back in a few minutes (it looks the order up, or re-sends under the same idempotency
  // key). Only after MAX_COOLDOWN_RETRIES unanswered attempts does a person get it.
  if (parkForRecheck) {
    const attempt = (order.supplier_retry_count ?? 0) + 1;
    await supabase.from("supplier_api_logs").insert({ supplier_id: supplier.id, order_id: order.id, action: "purchase", endpoint: outcome.endpoint, request_payload: outcome.requestPayload, response_payload: outcome.responsePayload, http_status: outcome.httpStatus, call_status: "error", idempotency_key: idempotencyKey, error_message: outcome.message, duration_ms: outcome.durationMs });
    if (attempt <= MAX_COOLDOWN_RETRIES) {
      const retryAt = new Date(Date.now() + 3 * 60 * 1000).toISOString();
      await supabase.from("orders").update({ status: "processing", supplier_retry_after: retryAt, supplier_retry_count: attempt, failure_reason: null, updated_at: new Date().toISOString() }).eq("id", order.id).is("supplier_purchase_id", null).is("supplier_order_reference", null);
      await supabase.from("order_events").insert({ order_id: order.id, event_type: "supplier.no_answer", from_status: "processing", to_status: "processing", message: `${outcome.message} Checking again at ${retryAt.slice(11, 16)} UTC (attempt ${attempt} of ${MAX_COOLDOWN_RETRIES}).`, metadata: { supplier: supplier.code, httpStatus: outcome.httpStatus, attempt, retryAt } });
      return { skipped: true, reason: "retry_scheduled", orderId: order.id, status: "processing", retryAt };
    }
    outcome = { ...outcome, message: `${outcome.message} No answer after ${MAX_COOLDOWN_RETRIES} attempts: check with the supplier before re-sending or refunding.` };
  }

  // DBH "recent order already exists": either a concurrent attempt of ours
  // won the race (keep it), or the customer bought twice within DBH's
  // 10-minute per-number cooldown (park it and re-send later).
  if (isDuplicateWindow(outcome)) {
    const { data: current } = await supabase
      .from("orders")
      .select("supplier_purchase_id, supplier_order_reference, status, supplier_retry_count")
      .eq("id", order.id)
      .maybeSingle();
    if (current?.supplier_purchase_id || current?.supplier_order_reference) {
      await supabase.from("order_events").insert({
        order_id: order.id,
        event_type: "supplier.duplicate_attempt_ignored",
        from_status: "processing",
        to_status: current.status,
        message: `${supplier.name} rejected a second send as a duplicate; the first send already succeeded and is kept.`,
        metadata: { supplier: supplier.code, idempotencyKey, httpStatus: outcome.httpStatus },
      });
      return { skipped: true, reason: "duplicate_of_own_successful_send", orderId: order.id, status: current.status };
    }

    // A cooldown, not a failure. The order stays "processing" (which is what
    // the customer sees) with a retry time; sync-dbh-order-status re-sends it.
    const attempt = (current?.supplier_retry_count ?? 0) + 1;
    if (attempt <= MAX_COOLDOWN_RETRIES) {
      const retryAt = new Date(Date.now() + COOLDOWN_RETRY_MS).toISOString();
      await supabase.from("supplier_api_logs").insert({
        supplier_id: supplier.id,
        order_id: order.id,
        action: "purchase",
        endpoint: outcome.endpoint,
        request_payload: outcome.requestPayload,
        response_payload: outcome.responsePayload,
        http_status: outcome.httpStatus,
        call_status: "error",
        idempotency_key: idempotencyKey,
        error_message: outcome.message,
        duration_ms: outcome.durationMs,
      });
      await supabase.from("orders").update({
        status: "processing",
        failure_reason: null,
        supplier_retry_after: retryAt,
        supplier_retry_count: attempt,
        updated_at: new Date().toISOString(),
      }).eq("id", order.id);
      await supabase.from("order_events").insert({
        order_id: order.id,
        event_type: "supplier.retry_scheduled",
        from_status: "processing",
        to_status: "processing",
        message: `${supplier.name} asked us to wait (a bundle went to this number in the last 10 minutes). Re-sending automatically at ${retryAt.slice(11, 16)} UTC (attempt ${attempt} of ${MAX_COOLDOWN_RETRIES}).`,
        metadata: { supplier: supplier.code, idempotencyKey, retryAt, attempt, httpStatus: outcome.httpStatus },
      });
      return { skipped: true, reason: "retry_scheduled", orderId: order.id, status: "processing", retryAt };
    }
    // Out of retries — fall through and record it as a real failure.
  }

  // Refused outright by this supplier (not approved, no stock, rejected): give the fallback supplier the
  // order now, before anything is held or marked failed. The refusal is still logged.
  if (!outcome.ok && fallbackAllowed) {
    const fb = opts.viaFallback ? null : await fallbackFor(supabase, order, supplier.id);
    if (fb) {
      await supabase.from("supplier_api_logs").insert({ supplier_id: supplier.id, order_id: order.id, action: "purchase", endpoint: outcome.endpoint, request_payload: outcome.requestPayload, response_payload: outcome.responsePayload, http_status: outcome.httpStatus, call_status: "error", idempotency_key: idempotencyKey, error_message: outcome.message, duration_ms: outcome.durationMs });
      await supabase.from("order_events").insert({ order_id: order.id, event_type: FALLBACK_EVENT, from_status: "processing", to_status: "processing", message: `${supplier.name} refused this order (${outcome.message ?? "no reason given"}). Sending to ${fb.name} instead.`, metadata: { from: supplier.code, to: fb.code, why: outcome.message, httpStatus: outcome.httpStatus, stage: "at_purchase" } });
      return await sendToSupplier(supabase, orderId, { supplierId: fb.id, viaFallback: true });
    }
  }

  const nextStatus = outcome.ok ? adapter.mapStatus(outcome.supplierStatus) : "failed_needs_review";

  await supabase.from("supplier_api_logs").insert({
    supplier_id: supplier.id,
    order_id: order.id,
    action: "purchase",
    endpoint: outcome.endpoint,
    request_payload: outcome.requestPayload,
    response_payload: outcome.responsePayload,
    http_status: outcome.httpStatus,
    call_status: outcome.ok ? "success" : "error",
    supplier_reference: outcome.supplierReference,
    idempotency_key: idempotencyKey,
    error_message: outcome.message,
    duration_ms: outcome.durationMs,
  });

  // A failed attempt only writes if no attempt has stored a supplier reference
  // yet, so a late failure can never erase a success already on the row.
  let finalUpdate = supabase
    .from("orders")
    .update({
      status: nextStatus,
      supplier_retry_after: null,
      supplier_order_reference: outcome.supplierReference ?? order.supplier_order_reference,
      supplier_purchase_id: outcome.purchaseId ?? order.supplier_purchase_id,
      supplier_transaction_reference: outcome.transactionReference ?? order.supplier_transaction_reference,
      supplier_status: outcome.supplierStatus ?? order.supplier_status,
      failure_reason: outcome.ok ? null : outcome.message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);
  if (!outcome.ok) finalUpdate = finalUpdate.is("supplier_purchase_id", null).is("supplier_order_reference", null);
  await finalUpdate;

  await supabase.from("order_events").insert({
    order_id: order.id,
    event_type: outcome.ok ? "supplier.fulfillment_response" : "supplier.fulfillment_failed",
    from_status: "processing",
    to_status: nextStatus,
    message: outcome.ok
      ? `${supplier.name} returned ${outcome.supplierStatus ?? "a response"}`
      : `${supplier.name} order placement failed`,
    metadata: {
      supplier: supplier.code,
      supplierReference: outcome.supplierReference,
      httpStatus: outcome.httpStatus,
    },
  });

  return {
    skipped: false,
    orderId: order.id,
    status: nextStatus,
    supplierReference: outcome.supplierReference,
  };
}

/** Previous name, kept so existing call sites keep working. */
export const fulfillOrderWithDataMartGH = fulfillOrder;
