import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
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
    const productId = String(body.productId ?? "");
    const customerPrice = Number(body.customerPrice);
    const isActive = body.isActive === true;
    const reason = String(body.reason ?? "").trim();

    if (!productId) {
      return jsonResponse({ error: "productId is required" }, { status: 400 });
    }
    if (!Number.isFinite(customerPrice) || customerPrice < 0) {
      return jsonResponse({ error: "A valid selling price is required" }, { status: 400 });
    }
    if (!reason) {
      return jsonResponse({ error: "A reason is required" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("admin_set_product_price", {
      p_product_id: productId,
      p_customer_price: customerPrice,
      p_is_active: isActive,
      p_actor_user_id: authData.user.id,
      p_reason: reason,
    });

    if (error) {
      return jsonResponse({ error: error.message }, { status: 500 });
    }

    return jsonResponse({ status: "success", data });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
