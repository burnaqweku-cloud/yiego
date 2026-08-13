// Pulls the authoritative delivery status for an order from DataMartGH and
// applies it, so our record reflects the supplier's truth instead of freezing
// at "pending_supplier" when DataMartGH never calls the webhook back. Reuses
// the exact mapping + guards the admin "recheck" and DataMart webhook use.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { callDataMartGH } from "../_shared/datamartgh.ts";
import { applySupplierStatusToOrder } from "../_shared/fulfillment.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

  try {
    const body = await req.json();
    const orderReference = String(body.orderReference ?? "").trim().toUpperCase();
    if (!orderReference) return jsonResponse({ error: "orderReference is required" }, { status: 400 });

    const supabase = createSupabaseAdmin();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, payment_status, supplier_status, supplier_order_reference, supplier_id")
      .eq("order_reference", orderReference)
      .maybeSingle();
    if (orderError) return jsonResponse({ error: orderError.message }, { status: 500 });
    if (!order) return jsonResponse({ error: "Order not found" }, { status: 404 });
    if (!order.supplier_order_reference) {
      return jsonResponse({ status: "no_supplier_reference", orderReference, orderStatus: order.status });
    }

    const result = await callDataMartGH(`/order-status/${encodeURIComponent(order.supplier_order_reference)}`);
    const payload = result.payload as { message?: string; data?: { orderStatus?: string; status?: string } } | null;

    await supabase.from("supplier_api_logs").insert({
      supplier_id: order.supplier_id,
      order_id: order.id,
      action: "check_order_status",
      endpoint: `/order-status/${order.supplier_order_reference}`,
      response_payload: payload,
      http_status: result.status,
      call_status: result.ok ? "success" : "error",
      supplier_reference: order.supplier_order_reference,
      error_message: result.ok ? null : payload?.message ?? "DataMartGH status check failed",
      duration_ms: result.durationMs,
    });

    if (!result.ok) {
      return jsonResponse({ error: payload?.message ?? "DataMartGH status check failed", provider: payload }, { status: 502 });
    }

    const supplierStatus = payload?.data?.orderStatus ?? payload?.data?.status;
    const applied = await applySupplierStatusToOrder(supabase, order, supplierStatus, "status_sync");

    return jsonResponse({
      status: "synced",
      orderReference,
      supplierStatus: supplierStatus ?? null,
      orderStatus: applied.mapped,
      changed: applied.changed,
      reason: applied.reason ?? null,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
