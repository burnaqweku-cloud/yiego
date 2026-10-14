import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { fulfillOrder } from "../_shared/fulfillment.ts";
import { checkOrderStatus, mapStatus } from "../_shared/emmadataking.ts";
import { edkRef } from "../_shared/supplierAdapters.ts";
import { rerouteToFallback } from "../_shared/fallback.ts";

/* EmmaDataKing, every minute from cron:
   1. Re-send orders parked with a retry time (verification-queue orders whose number got approved,
      cooldown retries), exactly like the DBH loop does for its own orders.
   2. Poll /order-status/:ref for orders they have accepted but not yet completed.
   A losing status writes failed_needs_review; COMPLETED writes delivered. */
const MAX_PER_RUN = 40;
const MAX_RESENDS_PER_RUN = 10;

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const supabase = createSupabaseAdmin();
    const denied = await requireCronSecret(req, supabase); if (denied) return denied;
    const { data: supplier } = await supabase.from("suppliers").select("id").eq("code", "emmadataking").maybeSingle();
    if (!supplier) return jsonResponse({ error: "supplier_not_found" }, { status: 404 });

    const resent: unknown[] = [];
    const { data: due } = await supabase.from("orders").select("id, order_reference")
      .eq("supplier_id", supplier.id).eq("payment_status", "succeeded").eq("status", "processing")
      .is("supplier_purchase_id", null).is("supplier_order_reference", null)
      .lte("supplier_retry_after", new Date().toISOString()).order("supplier_retry_after", { ascending: true }).limit(MAX_RESENDS_PER_RUN);
    for (const row of due ?? []) {
      try { const r = await fulfillOrder(supabase, row.id, { supplierId: supplier.id }); resent.push({ reference: row.order_reference, outcome: r.skipped ? `skipped_${r.reason}` : r.status }); }
      catch (error) { resent.push({ reference: row.order_reference, outcome: "exception", message: error instanceof Error ? error.message : String(error) }); }
    }

    const { data: orders } = await supabase.from("orders").select("id, order_reference, status, supplier_status, supplier_purchase_id, network_id, product_id, supplier_id")
      .eq("supplier_id", supplier.id).in("status", ["processing", "pending_supplier"]).not("supplier_purchase_id", "is", null)
      .or("admin_resolution_status.is.null,admin_resolution_status.neq.awaiting_verification")
      .order("updated_at", { ascending: true }).limit(MAX_PER_RUN);
    const results: unknown[] = [];
    for (const order of orders ?? []) {
      try {
        const r = await checkOrderStatus(order.supplier_purchase_id);
        const p = r.payload ?? {};
        const supplierStatus = String((p as any).data?.status ?? "").toUpperCase();
        await supabase.from("supplier_api_logs").insert({ supplier_id: supplier.id, order_id: order.id, action: "check_order_status", endpoint: "/api/v1/order-status", request_payload: { reference: order.supplier_purchase_id }, response_payload: p, http_status: r.status, call_status: r.ok ? "success" : "error", duration_ms: r.durationMs });
        if (!r.ok || !supplierStatus) { results.push({ reference: order.order_reference, outcome: "status_unavailable" }); continue; }
        const next = mapStatus(supplierStatus);
        if (next === "processing") { if (order.supplier_status !== supplierStatus) await supabase.from("orders").update({ supplier_status: supplierStatus, updated_at: new Date().toISOString() }).eq("id", order.id); results.push({ reference: order.order_reference, outcome: "still_processing", supplierStatus }); continue; }
        if (next === "failed_needs_review" && supplierStatus !== "REFUNDED") {
          // FAILED/REJECTED but not refunded: nothing can be done yet, so it stays in progress (refund watch below).
          if (order.supplier_status !== supplierStatus) {
            await supabase.from("orders").update({ supplier_status: supplierStatus, failure_reason: `EmmaDataKing reported ${supplierStatus} — waiting for their refund before anything else can happen`, updated_at: new Date().toISOString() }).eq("id", order.id);
            await supabase.from("order_events").insert({ order_id: order.id, event_type: "supplier.failed_awaiting_refund", from_status: order.status, to_status: order.status, message: `EmmaDataKing reported ${supplierStatus}. Waiting for their refund; nothing to do yet.`, metadata: { supplier: "emmadataking", supplierStatus } });
          }
          results.push({ reference: order.order_reference, outcome: "failed_awaiting_refund", supplierStatus }); continue;
        }
        if (next === "failed_needs_review") {
          // REFUNDED: money confirmed back. The fallback may take it; otherwise a person decides.
          const fb = await rerouteToFallback(supabase, order, "EmmaDataKing", supplierStatus);
          if (fb) { results.push({ reference: order.order_reference, outcome: `rerouted_to_${fb.code}`, supplierStatus }); continue; }
        }
        await supabase.from("orders").update({ status: next, supplier_status: supplierStatus, failure_reason: next === "delivered" ? null : "EmmaDataKing REFUNDED — money is back on our float; safe to Retry or refund the customer", updated_at: new Date().toISOString() }).eq("id", order.id);
        await supabase.from("order_events").insert({ order_id: order.id, event_type: "supplier.status_update", from_status: order.status, to_status: next, message: `EmmaDataKing reported ${supplierStatus} (status sync)`, metadata: { supplier: "emmadataking", supplierStatus } });
        results.push({ reference: order.order_reference, outcome: next, supplierStatus });
      } catch (error) { results.push({ reference: order.order_reference, outcome: "exception", message: error instanceof Error ? error.message : String(error) }); }
    }
    /* 3. Refund watch: orders they FAILED after a timeout sit in Needs review as "NOT refunded yet". Once they flip
          the last attempt to REFUNDED the money is back, so the order may move: to the network's fallback if one
          is set, otherwise its reason changes to "safe to Retry" for a person. */
    const refunds: unknown[] = [];
    const { data: waiting } = await supabase.from("orders").select("id, order_reference, status, network_id, product_id, supplier_id, failure_reason")
      .eq("supplier_id", supplier.id).eq("payment_status", "succeeded").in("status", ["processing", "failed_needs_review"]).is("supplier_purchase_id", null)
      .or("failure_reason.ilike.%waiting for their refund%,failure_reason.ilike.%NOT refunded yet%").order("updated_at", { ascending: true }).limit(MAX_PER_RUN);
    for (const order of waiting ?? []) {
      try {
        const { count } = await supabase.from("supplier_api_logs").select("id", { count: "exact", head: true }).eq("order_id", order.id).eq("supplier_id", supplier.id).eq("action", "purchase");
        let ref = edkRef(order.order_reference, Math.max(0, (count ?? 1) - 1));
        let r = await checkOrderStatus(ref);
        // Retries sent before per-attempt references exist under the plain reference.
        if (r.status === 404 && ref !== order.order_reference) { ref = order.order_reference; r = await checkOrderStatus(ref); }
        const st = String((r.payload as any)?.data?.status ?? "").toUpperCase();
        if (!r.ok || st !== "REFUNDED") { refunds.push({ reference: order.order_reference, outcome: "still_waiting", supplierStatus: st || null }); continue; }
        const fb = await rerouteToFallback(supabase, order, "EmmaDataKing", "REFUNDED after a failed attempt");
        if (fb) { refunds.push({ reference: order.order_reference, outcome: `rerouted_to_${fb.code}` }); continue; }
        await supabase.from("orders").update({ status: "failed_needs_review", supplier_status: "REFUNDED", failure_reason: "EmmaDataKing REFUNDED the failed attempt — money is back on our float; safe to Retry or refund the customer", updated_at: new Date().toISOString() }).eq("id", order.id);
        await supabase.from("order_events").insert({ order_id: order.id, event_type: "supplier.status_update", from_status: order.status, to_status: "failed_needs_review", message: "EmmaDataKing refunded the failed attempt (refund watch); safe to retry.", metadata: { supplier: "emmadataking", supplierStatus: "REFUNDED", ref } });
        refunds.push({ reference: order.order_reference, outcome: "refunded_safe_to_retry" });
      } catch (error) { refunds.push({ reference: order.order_reference, outcome: "exception", message: error instanceof Error ? error.message : String(error) }); }
    }
    return jsonResponse({ checked: results.length, resent, results, refunds });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
