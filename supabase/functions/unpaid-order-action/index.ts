import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { canManageUnpaidOrder, isCancellableUnpaid } from "../_shared/unpaidOrder.ts";
import { clearUnpaidForNumber } from "../_shared/clearUnpaid.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const body = await req.json();
    const reference = String(body.reference ?? "").trim().toUpperCase();
    const action = String(body.action ?? "");
    // clear_for_number (19 Nov 2026, owner): an UNPAID order never blocks a new order for the same number. A signed-in
    // checkout calls this when the number is held; it closes the unpaid order once its gateway confirms it wasn't
    // paid, and answers 409 for a paid one still on its way (_shared/clearUnpaid.ts). Guests: the checkout does it.
    if (action === "clear_for_number") {
      const phone = String(body.phone ?? "").replace(/\D/g, "");
      if (!/^0\d{9}$/.test(phone)) return jsonResponse({ error: "Enter a valid 10-digit Ghana number." }, { status: 400 });
      const db = createSupabaseAdmin();
      const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
      const { data: auth } = token ? await db.auth.getUser(token) : { data: { user: null } };
      if (!auth.user) return jsonResponse({ error: "Sign in to continue." }, { status: 401 });
      await db.rpc("close_expired_unpaid_orders");
      // alsoMine: the first-purchase offer allows one unpaid order per account, so the buyer's own go too.
      const held = await clearUnpaidForNumber(db, phone, auth.user.id, body.alsoMine === true);
      return held.ok ? jsonResponse({ status: "success", data: { closed: held.closed } }) : jsonResponse({ error: held.message, code: "phone_has_paid_open_order" }, { status: 409 });
    }
    if (!/^(YG|AG)-[A-Z0-9]{10}$/.test(reference) || !["lookup", "continue", "cancel"].includes(action)) return jsonResponse({ error: "Invalid request" }, { status: 400 });
    const db = createSupabaseAdmin();
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const { data: auth } = token ? await db.auth.getUser(token) : { data: { user: null } };
    const { data: order, error } = await db.from("orders").select("id,order_reference,user_id,guest_email,management_token,status,payment_status,is_open,paid_at,supplier_purchase_id,supplier_order_reference,recipient_phone,amount,created_at,payment_expires_at,data_products(name),networks(name)").eq("order_reference", reference).maybeSingle();
    if (error || !order) return jsonResponse({ error: "Order not found." }, { status: 404 });
    // An unpaid order holds no money, so anyone buying for this number may see it and clear it (5 Nov 2026: the
    // old "use the checkout email" wall left people stuck). Only its owner can CONTINUE it, since that is a payment.
    const mine = canManageUnpaidOrder(order, auth.user?.id ?? null, String(body.managementToken ?? ""), String(body.email ?? ""));
    if (!isCancellableUnpaid(order) || !order.is_open) return jsonResponse({ error: "This order is no longer awaiting payment. You can choose another bundle; any paid order remains available in tracking." }, { status: 410 });
    if (action === "cancel") {
      const { error: cancelError } = await db.rpc("cancel_unpaid_order", { p_reference: reference, p_actor: auth.user?.id ?? null, p_token: body.managementToken ?? null, p_email: body.email ?? null, p_admin: false, p_anyone: !mine });
      return cancelError ? jsonResponse({ error: "This order can no longer be cancelled. Refresh its status." }, { status: 409 }) : jsonResponse({ status: "success" });
    }
    const { data: intent } = await db.from("payment_intents").select("authorization_url").eq("order_id", order.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (action === "continue" && !mine) return jsonResponse({ error: "This order was placed from another account or device. You can cancel it and order again." }, { status: 403 });
    if (action === "continue" && (!intent?.authorization_url || (order.payment_expires_at && Date.parse(order.payment_expires_at) <= Date.now()))) return jsonResponse({ error: "Payment link expired. Cancel this unpaid order and place a new one." }, { status: 409 });
    return jsonResponse({ status: "success", data: { reference, mine, recipient: order.recipient_phone, network: order.networks?.name, product: order.data_products?.name, amount: order.amount, createdAt: order.created_at, expiresAt: order.payment_expires_at, paymentUrl: !mine ? null : action === "continue" ? intent?.authorization_url : null } });
  } catch { return jsonResponse({ error: "Could not manage this order. Please try again." }, { status: 500 }); }
});