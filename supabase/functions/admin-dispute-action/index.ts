import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return jsonResponse({ error: "Authentication required" }, { status: 401 });
    const supabase = createSupabaseAdmin();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return jsonResponse({ error: "Invalid session" }, { status: 401 });
    const { data: admin } = await supabase.from("admin_users").select("user_id").eq("user_id", authData.user.id).eq("is_active", true).maybeSingle();
    if (!admin) return jsonResponse({ error: "Admin access required" }, { status: 403 });

    const body = await req.json();
    const action = String(body.action ?? "");
    if (action === "open") {
      const { data, error } = await supabase.rpc("admin_open_dispute", {
        p_order_reference: String(body.orderReference ?? ""),
        p_category: String(body.category ?? "other"),
        p_internal_reason: String(body.internalReason ?? ""),
        p_customer_message: body.customerMessage ? String(body.customerMessage) : null,
        p_priority: String(body.priority ?? "normal"),
        p_actor_user_id: authData.user.id,
      });
      if (error) return jsonResponse({ error: error.message }, { status: error.message.includes("duplicate key") ? 409 : 400 });
      return jsonResponse({ status: "success", data });
    }

    if (action === "update") {
      const refundStatus = body.refundStatus ? String(body.refundStatus) : null;
      if (["submitted", "processing", "completed"].includes(refundStatus ?? "")) {
        return jsonResponse({ error: "Money movement must be confirmed by a dedicated refund processor before using this refund state" }, { status: 409 });
      }
      const { data, error } = await supabase.rpc("admin_update_dispute", {
        p_dispute_id: String(body.disputeId ?? ""),
        p_status: String(body.status ?? "investigating"),
        p_message: String(body.message ?? ""),
        p_resolution: body.resolution ? String(body.resolution) : null,
        p_refund_status: refundStatus,
        p_actor_user_id: authData.user.id,
      });
      if (error) return jsonResponse({ error: error.message }, { status: 400 });
      return jsonResponse({ status: "success", data });
    }

    return jsonResponse({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Dispute action failed" }, { status: 500 });
  }
});
