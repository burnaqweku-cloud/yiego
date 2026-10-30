import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { applySupplierStatusToOrder, fulfillOrder, fulfillOrderWithDataMartGH } from "../_shared/fulfillment.ts";
import { callDataMartGH } from "../_shared/datamartgh.ts";
import * as hub from "../_shared/databundleshub.ts";
import * as instant from "../_shared/instantdatagh.ts";
import * as ds from "../_shared/datasika.ts";

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
      .select("id, order_reference, status, payment_status, admin_resolution_status, supplier_id, product_id, supplier_order_reference, supplier_purchase_id, supplier_status, suppliers(code)")
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
      if (supplierCode === "datasika") {
        const r = await ds.checkOrderStatus(ref); ok = r.ok; status = r.status; durationMs = r.durationMs; payload = r.payload; endpoint = "/api-order-status";
        supplierStatus = String(payload?.status ?? "").toLowerCase() || undefined;
      } else if (supplierCode === "instantdatagh") {
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
      if (supplierCode === "datasika") {
        if (!supplierStatus) return jsonResponse({ error: "Supplier returned no order status" }, { status: 502 });
        if (["delivered", "refunded", "cancelled"].includes(order.status) || order.payment_status !== "succeeded") return jsonResponse({ status: "success", action, data: payload, applied: { changed: false, reason: "terminal_or_unpaid" } });
        const next = ds.deliveryState(supplierStatus);
        const { data: changed, error } = await supabase.from("orders").update({ status: next, supplier_status: supplierStatus, failure_reason: next === "delivered" ? null : supplierStatus === "refunded" ? "Supplier refund confirmed; safe to retry or refund" : ["failed", "refund_processing", "cancelled", "canceled"].includes(supplierStatus) ? "Waiting for supplier refund confirmation" : null, updated_at: new Date().toISOString() }).eq("id", order.id).eq("status", order.status).eq("supplier_purchase_id", order.supplier_purchase_id).eq("payment_status", "succeeded").select("id");
        if (error) throw new Error(error.message);
        if (changed?.length) await supabase.from("order_events").insert({ order_id: order.id, event_type: "supplier.status_update", from_status: order.status, to_status: next, message: `Supplier reported ${supplierStatus} (admin recheck)`, metadata: { supplier: "datasika", supplierStatus }, created_by: authData.user.id });
        return jsonResponse({ status: "success", action, data: payload, applied: { changed: Boolean(changed?.length), mapped: next } });
      }
      // Normalise the supplier's word into DataMartGH's vocabulary, which applySupplierStatusToOrder understands.
      const normalised = supplierStatus === "delivered" ? "completed" : supplierStatus === "awaiting_delivery" ? "processing" : supplierStatus;
      const applied = await applySupplierStatusToOrder(supabase, order, normalised, `admin_recheck:${supplierCode}`);
      return jsonResponse({ status: "success", action, data: payload, applied });
    }
    if (action === "release_ported") {
      // Wrong-network hold on a ported number: admin confirms it's on the chosen network and re-sends.
      if (order.admin_resolution_status !== "wrong_network" || order.status !== "failed_needs_review") {
        return jsonResponse({ error: "Only wrong-network orders waiting for review can be released" }, { status: 409 });
      }
      if (order.payment_status !== "succeeded") return jsonResponse({ error: "Only successfully paid orders can be released" }, { status: 409 });
      const at = new Date().toISOString();
      await supabase.from("orders").update({ prefix_mismatch_confirmed: true, prefix_mismatch_confirmed_at: at, admin_resolution_status: null, admin_resolution_reason: null, admin_resolution_updated_at: at, supplier_purchase_id: null, supplier_order_reference: null, supplier_transaction_reference: null, supplier_status: null, supplier_retry_after: null, supplier_idempotency_key: null, failure_reason: null, updated_at: at }).eq("id", order.id);
      await supabase.from("order_events").insert({ order_id: order.id, event_type: "admin.release_ported", from_status: order.status, to_status: order.status, message: `Released as ported by ${authData.user.email ?? authData.user.id} at ${at}`, created_by: authData.user.id, metadata: { releasedBy: authData.user.id, releasedByEmail: authData.user.email ?? null, releasedAt: at } });
      const result = await fulfillOrderWithDataMartGH(supabase, order.id);
      if (result.skipped) return jsonResponse({ status: "skipped", action, error: `Not sent: ${String(result.reason).replace(/_/g, " ")}`, result });
      return jsonResponse({ status: "success", action, result });
    }

    if (action === "retry") {
      const retryableStatuses = new Set(["failed", "failed_needs_review", "cancelled"]);
      // Verification-held orders are sent only from Admin → MTN verification, which locks each order so it can't
      // be bought twice (19 Oct: 123 double purchases). Retry here is refused for them.
      if (order.admin_resolution_status === "awaiting_verification") {
        return jsonResponse({ error: "This order is on MTN verification hold. Send it from Admin → MTN verification, not from here." }, { status: 409 });
      }
      if (!retryableStatuses.has(order.status)) {
        return jsonResponse({ error: "Only failed or cancelled orders can be retried" }, { status: 409 });
      }
      if (order.payment_status !== "succeeded") {
        return jsonResponse({ error: "Only successfully paid orders can be retried" }, { status: 409 });
      }

      // A failed attempt leaves the supplier's reference on the order; clear it so this is a fresh send. The
      // idempotency key stays: fulfillment reuses it when the last attempt got no answer, so a supplier that
      // did take the order recognises the repeat. The old attempt stays in the timeline and logs.
      await supabase.from("orders").update({ supplier_purchase_id: null, supplier_order_reference: null, supplier_transaction_reference: null, supplier_status: null, supplier_retry_after: null, failure_reason: null, updated_at: new Date().toISOString() }).eq("id", order.id);
      await supabase.from("order_events").insert({ order_id: order.id, event_type: "admin.retry", from_status: order.status, to_status: order.status, message: `Admin retry: previous supplier attempt ${order.supplier_purchase_id ?? order.supplier_order_reference ?? ""} set aside, sending afresh`.trim(), created_by: authData.user.id });
      const result = await fulfillOrderWithDataMartGH(supabase, order.id);
      if (result.skipped) return jsonResponse({ status: "skipped", action, error: `Not sent: ${String(result.reason).replace(/_/g, " ")}`, result });
      return jsonResponse({ status: "success", action, result });
    }

    if (action === "try_supplier") {
      // "Try another supplier": send a REFUNDED (or never-sent) paid order to a supplier the admin picks. Safe by the
      // same rules as every send: refused while the current supplier may still hold it (processing / FAILED but not
      // refunded), and fulfillment asks the chosen supplier first if it was ever tried for this order.
      const supplierCode = String(body.supplierCode ?? "");
      if (!supplierCode) return jsonResponse({ error: "supplierCode required" }, { status: 400 });
      if (order.payment_status !== "succeeded") return jsonResponse({ error: "Only successfully paid orders can be sent" }, { status: 409 });
      if (order.status === "delivered" || order.status === "refunded" || order.status === "cancelled") return jsonResponse({ error: `Order is already ${order.status}` }, { status: 409 });
      const st = String(order.supplier_status ?? "").toLowerCase();
      const refunded = ["refunded", "refund"].includes(st);
      // DBH "not approved" (MTN verification hold) is a refusal at purchase: no money was taken, so it is safe to offer elsewhere.
      const heldUnpaid = order.admin_resolution_status === "awaiting_verification" || st === "not_approved";
      const neverSent = !order.supplier_purchase_id && !order.supplier_order_reference && !order.supplier_status;
      if (!refunded && !neverSent && !heldUnpaid) return jsonResponse({ error: `Not safe yet: ${order.supplier_status ?? "the current supplier"} is not a confirmed refund. Wait until the supplier reports REFUNDED.` }, { status: 409 });
      const { data: target } = await supabase.from("suppliers").select("id, code, name, status").eq("code", supplierCode).maybeSingle();
      if (!target || target.status !== "active") return jsonResponse({ error: "That supplier is not active" }, { status: 409 });
      const { data: mapping } = await supabase.from("supplier_product_mappings").select("id").eq("product_id", order.product_id).eq("supplier_id", target.id).eq("is_active", true).limit(1).maybeSingle();
      if (!mapping) return jsonResponse({ error: `${target.name} does not sell this bundle` }, { status: 409 });
      await supabase.from("orders").update({ supplier_purchase_id: null, supplier_order_reference: null, supplier_transaction_reference: null, supplier_status: null, supplier_retry_after: null, failure_reason: null, admin_resolution_status: null, admin_resolution_reason: null, status: "processing", updated_at: new Date().toISOString() }).eq("id", order.id);
      // A fresh attempt: the fallback chance resets (fallback.ts counts hand-offs since the latest admin.retry).
      await supabase.from("order_events").insert({ order_id: order.id, event_type: "admin.retry", from_status: order.status, to_status: order.status, message: `Admin chose ${target.name} for a fresh attempt`, created_by: authData.user.id });
      await supabase.from("order_events").insert({ order_id: order.id, event_type: "supplier.fallback", from_status: order.status, to_status: "processing", message: `Admin sent this order to ${target.name} (previous supplier ${refunded ? "refunded it" : heldUnpaid ? "held it unpaid for MTN verification" : "never had it"}).`, metadata: { from: (Array.isArray(order.suppliers) ? order.suppliers[0]?.code : (order.suppliers as { code?: string } | null)?.code) ?? null, to: target.code, stage: "admin_try_supplier" }, created_by: authData.user.id });
      const result = await fulfillOrder(supabase, order.id, { supplierId: target.id, viaFallback: true });
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
