import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { fulfillOrderWithDataMartGH } from "../_shared/fulfillment.ts";

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
      .select("id, order_reference, status, payment_status, supplier_order_reference, supplier_status")
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
      if (!order.supplier_order_reference) {
        return jsonResponse({ error: "No supplier reference available yet" }, { status: 409 });
      }

      const { data, error } = await supabase.functions.invoke("datamartgh-check-order-status", {
        body: { reference: order.supplier_order_reference },
        headers: { "X-YieGo-Internal-Secret": Deno.env.get("YIEGO_INTERNAL_FUNCTION_SECRET") ?? "" },
      });

      if (error) {
        return jsonResponse({ error: error.message }, { status: 500 });
      }

      return jsonResponse({ status: "success", action, data });
    }

    if (action === "retry") {
      const retryableStatuses = new Set(["failed", "failed_needs_review", "cancelled"]);
      if (!retryableStatuses.has(order.status)) {
        return jsonResponse({ error: "Only failed or cancelled orders can be retried" }, { status: 409 });
      }
      if (order.payment_status !== "succeeded") {
        return jsonResponse({ error: "Only successfully paid orders can be retried" }, { status: 409 });
      }

      const result = await fulfillOrderWithDataMartGH(supabase, order.id);
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
