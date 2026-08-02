import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { fulfillOrderWithDataMartGH } from "../_shared/fulfillment.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

function normalizePhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 10);
}

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

    const body = await req.json();
    const productId = String(body.productId ?? "");
    const recipientPhone = normalizePhone(String(body.recipientPhone ?? ""));

    if (!productId) {
      return jsonResponse({ error: "productId is required" }, { status: 400 });
    }

    if (recipientPhone.length !== 10 || !recipientPhone.startsWith("0")) {
      return jsonResponse({ error: "A valid 10-digit Ghana recipient phone is required" }, { status: 400 });
    }

    const { data: createdOrder, error: orderError } = await supabase.rpc("create_wallet_data_order", {
      p_user_id: authData.user.id,
      p_product_code: productId,
      p_recipient_phone: recipientPhone,
    });

    if (orderError) {
      return jsonResponse({ error: orderError.message }, { status: 400 });
    }

    try {
      const fulfillment = await fulfillOrderWithDataMartGH(supabase, createdOrder.orderId);

      return jsonResponse({
        status: "success",
        data: {
          ...createdOrder,
          fulfillment,
        },
      });
    } catch (fulfillmentError) {
      await supabase
        .from("orders")
        .update({
          status: "failed_needs_review",
          failure_reason:
            fulfillmentError instanceof Error
              ? fulfillmentError.message
              : "Supplier fulfillment failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", createdOrder.orderId);

      return jsonResponse(
        {
          status: "needs_review",
          data: createdOrder,
          error:
            fulfillmentError instanceof Error
              ? fulfillmentError.message
              : "Supplier fulfillment failed",
        },
        { status: 202 },
      );
    }
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
