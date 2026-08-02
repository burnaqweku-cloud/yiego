import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const reference = url.searchParams.get("reference")?.trim();
    const phone = url.searchParams.get("phone")?.replace(/\D/g, "");

    if (!reference) {
      return jsonResponse({ error: "reference is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: authData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };

    if (!authData.user && (!phone || phone.length !== 10)) {
      return jsonResponse({ error: "Recipient phone is required" }, { status: 400 });
    }

    const { data: order, error } = await supabase
      .from("orders")
      .select("user_id, order_reference, recipient_phone, amount, currency, status, payment_status, supplier_status, admin_resolution_status, admin_resolution_reason, admin_resolution_updated_at, created_at, updated_at, data_products(name, capacity_gb), networks(name)")
      .eq("order_reference", reference)
      .limit(1)
      .maybeSingle();

    if (error) {
      return jsonResponse({ error: error.message }, { status: 500 });
    }

    if (!order) {
      return jsonResponse({ error: "Order not found" }, { status: 404 });
    }

    const isOwner = Boolean(authData.user && order.user_id === authData.user.id);
    if (!isOwner) {
      if (!phone || phone.length !== 10) {
        return jsonResponse({ error: "Recipient phone is required" }, { status: 400 });
      }
      if (order.recipient_phone !== phone) {
        return jsonResponse({ error: "Order not found" }, { status: 404 });
      }
    }

    const maskedPhone =
      order.recipient_phone?.length === 10
        ? `${order.recipient_phone.slice(0, 3)}•••${order.recipient_phone.slice(7)}`
        : "Hidden";

    return jsonResponse({
      status: "success",
      data: {
        reference: order.order_reference,
        recipient: maskedPhone,
        network: order.networks?.name,
        product: order.data_products?.name,
        amount: order.amount,
        currency: order.currency,
        orderStatus: order.admin_resolution_status ?? order.status,
        systemOrderStatus: order.status,
        statusMessage: order.admin_resolution_status ? order.admin_resolution_reason : null,
        statusUpdatedAt: order.admin_resolution_status ? order.admin_resolution_updated_at : null,
        paymentStatus: order.payment_status,
        supplierStatus: order.supplier_status,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
      },
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
