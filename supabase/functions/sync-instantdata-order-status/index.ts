import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { checkOrderStatus, mapStatus } from "../_shared/instantdatagh.ts";

/* InstantDataGH order status — polled per order (no webhooks, no batch
   endpoint). A losing status writes failed_needs_review; completed writes
   delivered. Runs every minute from cron. */
const MAX_PER_RUN = 40;

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const supabase = createSupabaseAdmin();
    const denied = await requireCronSecret(req, supabase); if (denied) return denied;
    const { data: supplier } = await supabase.from("suppliers").select("id").eq("code", "instantdatagh").maybeSingle();
    if (!supplier) return jsonResponse({ error: "supplier_not_found" }, { status: 404 });
    const { data: orders } = await supabase.from("orders").select("id, order_reference, status, supplier_status, supplier_purchase_id")
      .eq("supplier_id", supplier.id).in("status", ["processing", "pending_supplier"]).not("supplier_purchase_id", "is", null).order("updated_at", { ascending: true }).limit(MAX_PER_RUN);
    const results: unknown[] = [];
    for (const order of orders ?? []) {
      try {
        const r = await checkOrderStatus(order.supplier_purchase_id);
        const p = r.payload ?? {};
        const supplierStatus = String((p as any).data?.status ?? (p as any).status ?? "").toLowerCase();
        await supabase.from("supplier_api_logs").insert({ supplier_id: supplier.id, order_id: order.id, action: "check_order_status", endpoint: "/order-status", request_payload: { order_id: order.supplier_purchase_id }, response_payload: p, http_status: r.status, call_status: r.ok ? "success" : "error", duration_ms: r.durationMs });
        if (!r.ok || !supplierStatus || supplierStatus === "success") { results.push({ reference: order.order_reference, outcome: "status_unavailable" }); continue; }
        const next = mapStatus(supplierStatus);
        if (next === "processing") { if (order.supplier_status !== supplierStatus) await supabase.from("orders").update({ supplier_status: supplierStatus, updated_at: new Date().toISOString() }).eq("id", order.id); results.push({ reference: order.order_reference, outcome: `still_${supplierStatus}` }); continue; }
        await supabase.from("orders").update({ status: next, supplier_status: supplierStatus, failure_reason: next === "delivered" ? null : `Supplier ${supplierStatus} — money returned to our float; customer not yet refunded or delivered. Retry or refund.`, updated_at: new Date().toISOString() }).eq("id", order.id);
        await supabase.from("order_events").insert({ order_id: order.id, event_type: "supplier.status_update", from_status: order.status, to_status: next, message: `InstantDataGH reported ${supplierStatus} (status sync)`, metadata: { supplier: "instantdatagh", supplierStatus, source: "status sync" } });
        results.push({ reference: order.order_reference, outcome: next, supplierStatus });
      } catch (error) { results.push({ reference: order.order_reference, outcome: "exception", message: error instanceof Error ? error.message : String(error) }); }
    }
    return jsonResponse({ checked: results.length, results });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
