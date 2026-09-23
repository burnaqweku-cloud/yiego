import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { applySupplierStatusToOrder, fulfillOrderWithDataMartGH } from "../_shared/fulfillment.ts";
import { callDataMartGH } from "../_shared/datamartgh.ts";
import * as hub from "../_shared/databundleshub.ts";
import * as instant from "../_shared/instantdatagh.ts";

// Admin sessions must have passed two-factor (aal2). The database applies the same rule.
const sessionHasMfa = (token: string) => { try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))?.aal === "aal2"; } catch { return false; } };

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return jsonResponse({ error: "Authentication required" }, { status: 401 });
    }

    const supabase = createSupabaseAdmin();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      return jsonResponse({ error: "Invalid session" }, { status: 401 });
    }

    const { data: admin } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", authData.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!admin) {
      return jsonResponse({ error: "Admin access required" }, { status: 403 });
    }
    if (!sessionHasMfa(token)) return jsonResponse({ error: "Two-factor verification required. Sign in to the admin panel again." }, { status: 403 });

    const body = await req.json();
    const action = String(body.action ?? "");
    const orderReference = body.orderReference ? String(body.orderReference) : "";
    const networkCode = body.networkCode ? String(body.networkCode) : "";
    const reason = body.reason ? String(body.reason) : null;
    const displayStatus = body.displayStatus ? String(body.displayStatus) : "";

    if (!action) {
      return jsonResponse({ error: "action is required" }, { status: 400 });
    }

    if (action === "pause_network" || action === "resume_network") {
      if (!networkCode) {
        return jsonResponse({ error: "networkCode is required" }, { status: 400 });
      }

      const paused = action === "pause_network";
      const { error } = await supabase
        .from("networks")
        .update({
          is_paused: paused,
          pause_reason: paused ? reason ?? "Paused by admin" : null,
        })
        .eq("code", networkCode);

      if (error) {
        return jsonResponse({ error: error.message }, { status: 500 });
      }

      return jsonResponse({ status: "success", action, networkCode, paused });
    }

    if (!orderReference) {
      return jsonResponse({ error: "orderReference is required" }, { status: 400 });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, order_reference, status, payment_status, supplier_id, supplier_order_reference, supplier_purchase_id, supplier_status, suppliers(code)")
      .eq("order_reference", orderReference)
      .maybeSingle();

    if (orderError) {
      return jsonResponse({ error: orderError.message }, { status: 500 });
    }

    if (!order) {
      return jsonResponse({ error: "Order not found" }, { status: 404 });
    }

    if (action === "set_display_status" || action === "clear_display_status") {
      const supportedDisplayStatuses = new Set([
        "processing",
        "pending_supplier",
        "awaiting_verification",
        "delivered",
        "failed",
        "cancelled",
        "refunded",
      ]);

      if (action === "set_display_status" && !supportedDisplayStatuses.has(displayStatus)) {
        return jsonResponse({ error: "Unsupported customer-visible status" }, { status: 400 });
      }

      if (!reason?.trim()) {
        return jsonResponse({ error: "A reason is required" }, { status: 400 });
      }

      const { data, error } = await supabase.rpc("admin_set_order_display_status", {
        p_order_reference: order.order_reference,
        p_display_status: action === "clear_display_status" ? "" : displayStatus,
        p_reason: reason.trim(),
        p_actor_user_id: authData.user.id,
      });

      if (error) {
        return jsonResponse({ error: error.message }, { status: 500 });
      }

      return jsonResponse({ status: "success", action, data });
    }

    if (action === "recheck") {
      // Each supplier has its own status call; ask the one that holds the order.
      const supplierCode = String((order as { suppliers?: { code?: string } | null }).suppliers?.code ?? "datamartgh");
      const ref = order.supplier_purchase_id ?? order.supplier_order_reference;
      if (!ref) return jsonResponse({ error: "No supplier reference available yet" }, { status: 409 });
      let ok = false; let status = 0; let durationMs = 0; let payload: any = null; let supplierStatus: string | undefined; let endpoint = "";
      if (supplierCode === "instantdatagh") {
        const r = await instant.checkOrderStatus(ref); ok = r.ok; status = r.status; durationMs = r.durationMs; payload = r.payload; endpoint = "/order-status";
        supplierStatus = String(payload?.data?.status ?? payload?.status ?? "").toLowerCase() || undefined;
      } else if (supplierCode === "databundleshub") {
        const r = await hub.checkOrderStatus(ref); ok = r.ok; status = r.status; durationMs = r.durationMs; payload = r.payload; endpoint = "/api/developer/purchase-status";
        supplierStatus = payload?.data?.orderStatus ?? payload?.data?.status ?? undefined;
      } else {
        const r = await callDataMartGH(`/order-status/${encodeURIComponent(ref)}`); ok = r.ok; status = r.status; durationMs = r.durationMs; payload = r.payload; endpoint = `/order-status/${ref}`;
        supplierStatus = payload?.data?.orderStatus ?? payload?.data?.status;
      }
      await supabase.from("supplier_api_logs").insert({ supplier_id: order.supplier_id, order_id: order.id, action: "check_order_status", endpoint, response_payload: payload, http_status: status, call_status: ok ? "success" : "error", supplier_reference: String(ref), error_message: ok ? null : payload?.message ?? "Status check failed", duration_ms: durationMs });
      if (!ok) return jsonResponse({ error: payload?.message ?? "Supplier status check failed", provider: payload }, { status: 502 });
      // Normalise the supplier's word into DataMartGH's vocabulary, which applySupplierStatusToOrder understands.
      const normalised = supplierStatus === "delivered" ? "completed" : supplierStatus === "awaiting_delivery" ? "processing" : supplierStatus;
      const applied = await applySupplierStatusToOrder(supabase, order, normalised, `admin_recheck:${supplierCode}`);
      return jsonResponse({ status: "success", action, data: payload, applied });
    }
    if (action === "retry") {
      const retryableStatuses = new Set(["failed", "failed_needs_review", "cancelled"]);
      if (!retryableStatuses.has(order.status)) {
        return jsonResponse({ error: "Only failed or cancelled orders can be retried" }, { status: 409 });
      }
      if (order.payment_status !== "succeeded") {
        return jsonResponse({ error: "Only successfully paid orders can be retried" }, { status: 409 });
      }

      // A failed attempt leaves the supplier's reference on the order; clear it
      // so this is a fresh send. The old attempt stays in the timeline and logs.
      await supabase.from("orders").update({ supplier_purchase_id: null, supplier_order_reference: null, supplier_transaction_reference: null, supplier_status: null, supplier_retry_after: null, supplier_idempotency_key: null, failure_reason: null, updated_at: new Date().toISOString() }).eq("id", order.id);
      await supabase.from("order_events").insert({ order_id: order.id, event_type: "admin.retry", from_status: order.status, to_status: order.status, message: `Admin retry: previous supplier attempt ${order.supplier_purchase_id ?? order.supplier_order_reference ?? ""} set aside, sending afresh`.trim(), created_by: authData.user.id });
      const result = await fulfillOrderWithDataMartGH(supabase, order.id);
      if (result.skipped) return jsonResponse({ status: "skipped", action, error: `Not sent: ${String(result.reason).replace(/_/g, " ")}`, result });
      return jsonResponse({ status: "success", action, result });
    }

    if (action === "refund") {
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          status: "refunded",
          payment_status: "refunded",
          failure_reason: reason ?? "Refunded by admin",
        })
        .eq("id", order.id);

      if (updateError) {
        return jsonResponse({ error: updateError.message }, { status: 500 });
      }

      await supabase.from("order_events").insert({
        order_id: order.id,
        event_type: "admin.refund",
        from_status: order.status,
        to_status: "refunded",
        message: reason ?? "Refunded by admin",
      });

      return jsonResponse({ status: "success", action });
    }

    return jsonResponse({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
