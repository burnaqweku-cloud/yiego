// Pulls the authoritative delivery status for a DataBundlesHub order and
// applies it. DBH has no webhooks, so this is the only way our record moves
// past "processing" — polled by requestId (stored as supplier_purchase_id).
//
// Silent MTN refunds (status "refunded", errorCode null, MTN/YELLO number)
// mean the number is under MTN first-time verification, not that the order
// failed. Those are held as admin_resolution_status = 'awaiting_verification'
// so the customer sees a calm message and the admin gets a resubmit queue,
// instead of the order landing in the plain refund queue. First case:
// YG-C62E960906 (2026-09-12).
//
// This file is the canonical source for the deployed function of the same
// name — deploy it with `supabase functions deploy sync-dbh-order-status`.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import * as hub from "../_shared/databundleshub.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { AWAITING_VERIFICATION, isSilentMtnRefund, markAwaitingVerification } from "../_shared/verification.ts";

const TERMINAL_ORDER_STATUSES = new Set(["delivered", "refunded", "cancelled"]);

/** DBH's purchase-status reply, plus the refund-only fields it adds. */
interface DbhStatusData {
  order_id?: number;
  status?: string;
  status_description?: string;
  is_completed?: boolean;
  errorCode?: string | number | null;
  error_code?: string | number | null;
}

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
      .select("id, order_reference, recipient_phone, status, payment_status, supplier_status, supplier_purchase_id, supplier_order_reference, supplier_id, admin_resolution_status, networks(name, code)")
      .eq("order_reference", orderReference)
      .maybeSingle();
    if (orderError) return jsonResponse({ error: orderError.message }, { status: 500 });
    if (!order) return jsonResponse({ error: "Order not found" }, { status: 404 });

    const requestId = order.supplier_purchase_id;
    if (!requestId) {
      return jsonResponse({ status: "no_supplier_reference", orderReference, orderStatus: order.status });
    }

    const result = await hub.checkOrderStatus(requestId);
    const payload = result.payload;
    const data = (payload?.data ?? {}) as DbhStatusData;

    await supabase.from("supplier_api_logs").insert({
      supplier_id: order.supplier_id,
      order_id: order.id,
      action: "check_order_status",
      endpoint: `/api/developer/purchase-status?request_id=${requestId}`,
      response_payload: payload,
      http_status: result.status,
      call_status: result.ok ? "success" : "error",
      supplier_reference: String(requestId),
      error_message: result.ok ? null : payload?.message ?? payload?.error ?? "DataBundlesHub status check failed",
      duration_ms: result.durationMs,
    });

    if (!result.ok) {
      return jsonResponse({ error: payload?.message ?? payload?.error ?? "DataBundlesHub status check failed", provider: payload }, { status: 502 });
    }

    const supplierStatus = data.status ?? null;
    const errorCode = data.errorCode ?? data.error_code ?? null;

    if (TERMINAL_ORDER_STATUSES.has(order.status)) {
      return jsonResponse({ status: "synced", orderReference, supplierStatus, orderStatus: order.status, changed: false, reason: "order_already_terminal" });
    }
    if (order.payment_status !== "succeeded") {
      return jsonResponse({ status: "synced", orderReference, supplierStatus, orderStatus: order.status, changed: false, reason: "order_not_paid" });
    }

    /* ── Silent MTN refund → verification hold ─────────────────── */
    if (isSilentMtnRefund(order, { status: supplierStatus, errorCode })) {
      const held = await markAwaitingVerification(supabase, order, "status_sync", {
        requestId: String(requestId),
        supplierStatus,
        statusDescription: data.status_description ?? null,
      });
      // Record what DBH said without moving the lifecycle status: the order
      // is still "processing" from the customer's point of view, and the
      // admin resubmits it once MTN clears the number.
      if ((order.supplier_status ?? null) !== supplierStatus) {
        await supabase.from("orders")
          .update({ supplier_status: supplierStatus, updated_at: new Date().toISOString() })
          .eq("id", order.id);
      }
      return jsonResponse({
        status: "synced",
        orderReference,
        supplierStatus,
        orderStatus: order.status,
        displayStatus: AWAITING_VERIFICATION,
        changed: held.changed,
        reason: held.changed ? "held_for_mtn_verification" : held.reason,
      });
    }

    /* ── Ordinary status → lifecycle mapping ───────────────────── */
    const refundedWithError = (supplierStatus ?? "").toLowerCase() === "refunded";
    const mapped = refundedWithError ? "failed_needs_review" : hub.mapStatus(supplierStatus);

    if (order.status === mapped && (order.supplier_status ?? null) === supplierStatus) {
      return jsonResponse({ status: "synced", orderReference, supplierStatus, orderStatus: mapped, changed: false, reason: "no_change" });
    }

    const now = new Date().toISOString();
    await supabase.from("orders")
      .update({
        status: mapped,
        supplier_status: supplierStatus ?? order.supplier_status ?? null,
        failure_reason: refundedWithError ? `supplier_refunded${errorCode ? `_${errorCode}` : ""}` : undefined,
        updated_at: now,
      })
      .eq("id", order.id);

    await supabase.from("order_events").insert({
      order_id: order.id,
      event_type: "supplier.status_update",
      from_status: order.status,
      to_status: mapped,
      message: `DataBundlesHub reported ${supplierStatus ?? "an unknown status"}${errorCode ? ` (errorCode ${errorCode})` : ""} (status_sync)`,
      metadata: { supplier: "databundleshub", supplierStatus, errorCode, statusDescription: data.status_description ?? null, source: "status_sync" },
    });

    return jsonResponse({ status: "synced", orderReference, supplierStatus, orderStatus: mapped, changed: true });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
