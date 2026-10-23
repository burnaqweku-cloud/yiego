import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { canManageUnpaidOrder, isCancellableUnpaid } from "../_shared/unpaidOrder.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const body = await req.json();
    const reference = String(body.reference ?? "").trim().toUpperCase();
    const action = String(body.action ?? "");
    if (!/^(YG|AG)-[A-Z0-9]{10}$/.test(reference) || !["lookup", "continue", "cancel"].includes(action)) return jsonResponse({ error: "Invalid request" }, { status: 400 });
    const db = createSupabaseAdmin();
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const { data: auth } = token ? await db.auth.getUser(token) : { data: { user: null } };
    const { data: order, error } = await db.from("orders").select("id,order_reference,user_id,guest_email,management_token,status,payment_status,is_open,paid_at,supplier_purchase_id,supplier_order_reference,recipient_phone,amount,created_at,payment_expires_at,data_products(name),networks(name)").eq("order_reference", reference).maybeSingle();
    if (error || !order || !canManageUnpaidOrder(order, auth.user?.id ?? null, String(body.managementToken ?? ""), String(body.email ?? ""))) return jsonResponse({ error: "Use the account or email used at checkout, or contact support." }, { status: 403 });
    if (!isCancellableUnpaid(order) || !order.is_open) return jsonResponse({ error: "This order is paid or closed. Refresh its status." }, { status: 409 });
    if (action === "cancel") {
      const { error: cancelError } = await db.rpc("cancel_unpaid_order", { p_reference: reference, p_actor: auth.user?.id ?? null, p_token: body.managementToken ?? null, p_email: body.email ?? null, p_admin: false });
      return cancelError ? jsonResponse({ error: "This order can no longer be cancelled. Refresh its status." }, { status: 409 }) : jsonResponse({ status: "success" });
    }
    const { data: intent } = await db.from("payment_intents").select("authorization_url").eq("order_id", order.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (action === "continue" && (!intent?.authorization_url || (order.payment_expires_at && Date.parse(order.payment_expires_at) <= Date.now()))) return jsonResponse({ error: "Payment link expired. Cancel this unpaid order and place a new one." }, { status: 409 });
    return jsonResponse({ status: "success", data: { reference, recipient: order.recipient_phone, network: order.networks?.name, product: order.data_products?.name, amount: order.amount, createdAt: order.created_at, expiresAt: order.payment_expires_at, paymentUrl: action === "continue" ? intent?.authorization_url : null } });
  } catch { return jsonResponse({ error: "Could not manage this order. Please try again." }, { status: 500 }); }
});