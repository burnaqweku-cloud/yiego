import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { fulfillOrder } from "../_shared/fulfillment.ts";
import { checkOrderStatus, mapStatus } from "../_shared/datasika.ts";
import { rerouteToFallback } from "../_shared/fallback.ts";

/* DataSika, from cron (same shape as the EmmaDataKing loop):
   1. Re-send orders parked with a retry time (no-answer cooldowns, approved verification resends).
      A no-answer resend reuses the same Idempotency-Key, so DataSika returns the original order, never a second one.
   2. Poll /api-order-status for orders they accepted. delivered → delivered.
      failed / refund_processing → stays in progress, waiting for their automatic wallet refund.
      refunded (money back on our DataSika wallet) → fallback if one is set, else Needs review "safe to Retry". */
const MAX_PER_RUN = 40;
const MAX_RESENDS_PER_RUN = 10;

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const supabase = createSupabaseAdmin();
    const denied = await requireCronSecret(req, supabase); if (denied) return denied;
    const { data: supplier } = await supabase.from("suppliers").select("id").eq("code", "datasika").maybeSingle();
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
        const st = String((p as any).status ?? "").toLowerCase();
        await supabase.from("supplier_api_logs").insert({ supplier_id: supplier.id, order_id: order.id, action: "check_order_status", endpoint: "/api-order-status", request_payload: { order_id: order.supplier_purchase_id }, response_payload: p, http_status: r.status, call_status: r.ok ? "success" : "error", duration_ms: r.durationMs });
        if (!r.ok || !st) { results.push({ reference: order.order_reference, outcome: "status_unavailable" }); continue; }
        const next = mapStatus(st);
        if (next === "processing") {
          if (order.supplier_status !== st) await supabase.from("orders").update({ supplier_status: st, updated_at: new Date().toISOString() }).eq("id", order.id);
          results.push({ reference: order.order_reference, outcome: "still_processing", supplierStatus: st }); continue;
        }
        if (next === "failed_needs_review" && st !== "refunded") {
          if (order.supplier_status !== st) {
            await supabase.from("orders").update({ supplier_status: st, failure_reason: `DataSika reported ${st} — waiting for their automatic refund before anything else can happen`, updated_at: new Date().toISOString() }).eq("id", order.id);
            await supabase.from("order_events").insert({ order_id: order.id, event_type: "supplier.failed_awaiting_refund", from_status: order.status, to_status: order.status, message: `DataSika reported ${st}. Waiting for their refund; nothing to do yet.`, metadata: { supplier: "datasika", supplierStatus: st } });
          }
          results.push({ reference: order.order_reference, outcome: "failed_awaiting_refund", supplierStatus: st }); continue;
        }
        if (next === "failed_needs_review") {
          const fb = await rerouteToFallback(supabase, order, "DataSika", "REFUNDED");
          if (fb) { results.push({ reference: order.order_reference, outcome: `rerouted_to_${fb.code}`, supplierStatus: st }); continue; }
        }
        await supabase.from("orders").update({ status: next, supplier_status: st, failure_reason: next === "delivered" ? null : "DataSika REFUNDED — money is back on our DataSika wallet; safe to Retry or refund the customer", updated_at: new Date().toISOString() }).eq("id", order.id);
        await supabase.from("order_events").insert({ order_id: order.id, event_type: "supplier.status_update", from_status: order.status, to_status: next, message: `DataSika reported ${st} (status sync)`, metadata: { supplier: "datasika", supplierStatus: st } });
        results.push({ reference: order.order_reference, outcome: next, supplierStatus: st });
      } catch (error) { results.push({ reference: order.order_reference, outcome: "exception", message: error instanceof Error ? error.message : String(error) }); }
    }
    return jsonResponse({ checked: results.length, resent, results });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
