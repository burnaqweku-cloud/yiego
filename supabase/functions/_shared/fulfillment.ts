import { mapDataMartGHStatusToYieGo } from "./datamartgh.ts";
import { adapterFor, type PurchaseContext } from "./supplierAdapters.ts";

// Deliberately loose: these helpers are handed a real supabase-js client and
// only need it to be chainable.
// deno-lint-ignore no-explicit-any
type SupabaseAdminClient = any;

const TERMINAL_ORDER_STATUSES = new Set(["delivered", "refunded", "cancelled"]);

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
    message: `DataMartGH reported ${supplierStatus ?? "an unknown status"} (${source})`,
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
 * The supplier is whichever the customer chose (orders.supplier_id); with no
 * choice recorded it falls back to the lowest display_order among the active
 * suppliers that stock the bundle. That ordering is what keeps routing
 * deterministic once more than one supplier can serve the same product —
 * previously this took the first row the database happened to return.
 *
 * Every supplier-specific detail lives behind an adapter, so a new supplier is
 * an entry in supplierAdapters.ts and no change here.
 */
export async function fulfillOrder(supabase: SupabaseAdminClient, orderId: string) {
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

  let query = supabase
    .from("supplier_product_mappings")
    .select("*, suppliers!inner(id, code, name, status, display_order)")
    .eq("product_id", order.product_id)
    .eq("is_active", true)
    .eq("suppliers.status", "active");

  // A recorded choice is honoured exactly; otherwise pick by a stable order.
  if (order.supplier_id) query = query.eq("supplier_id", order.supplier_id);

  // Ordering by a column on an embedded table does not reorder the parent rows,
  // so asking the database for the best row and taking limit(1) silently
  // returned an arbitrary supplier. Fetch the candidates and rank them here,
  // where the comparison is explicit and testable.
  const { data: candidates, error: mappingError } = await query;
  if (mappingError) throw new Error(mappingError.message);

  const mapping = (candidates ?? [])
    .slice()
    .sort((a: any, b: any) => {
      const byPriority = (a.suppliers?.display_order ?? 100) - (b.suppliers?.display_order ?? 100);
      if (byPriority !== 0) return byPriority;
      return String(a.id).localeCompare(String(b.id));
    })[0];
  if (!mapping) throw new Error("supplier_mapping_not_found");

  const supplier = mapping.suppliers as { id: string; code: string; name: string };
  const adapter = adapterFor(supplier.code);
  if (!adapter) throw new Error(`no_adapter_for_supplier_${supplier.code}`);
  if (!adapter.isConfigured()) throw new Error(`supplier_not_configured_${supplier.code}`);

  const idempotencyKey = order.supplier_idempotency_key ?? crypto.randomUUID();
  const context: PurchaseContext = {
    recipientPhone: order.recipient_phone,
    orderReference: order.order_reference,
    idempotencyKey,
    supplierNetworkCode: mapping.supplier_network_code ?? null,
    supplierCapacity: mapping.supplier_capacity ?? null,
  };

  // Refuse an order this supplier cannot serve before any money moves.
  const preflight = adapter.preflight(context);
  if (!preflight.ok) {
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

  await supabase
    .from("orders")
    .update({
      status: "processing",
      supplier_id: supplier.id,
      supplier_idempotency_key: idempotencyKey,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  await supabase.from("order_events").insert({
    order_id: order.id,
    event_type: "supplier.fulfillment_started",
    from_status: order.status,
    to_status: "processing",
    message: `Sending paid order to ${supplier.name}`,
    metadata: { supplier: supplier.code, idempotencyKey },
  });

  const outcome = await adapter.purchase(context);
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

  await supabase
    .from("orders")
    .update({
      status: nextStatus,
      supplier_order_reference: outcome.supplierReference ?? order.supplier_order_reference,
      supplier_purchase_id: outcome.purchaseId ?? order.supplier_purchase_id,
      supplier_transaction_reference: outcome.transactionReference ?? order.supplier_transaction_reference,
      supplier_status: outcome.supplierStatus ?? order.supplier_status,
      failure_reason: outcome.ok ? null : outcome.message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

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
