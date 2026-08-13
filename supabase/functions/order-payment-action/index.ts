import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { paystackFee, paystackTotal } from "../_shared/fees.ts";
import { sendOrderConfirmation } from "../_shared/email.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: "phase1" } });
const ref = (v: unknown) => String(v ?? "").trim().toUpperCase();
const paystackRef = () => `YGORDER-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`.toUpperCase();

async function fulfill(supabase: ReturnType<typeof admin>, orderId: string) {
  const { data: order, error } = await supabase.from("orders").select("*").eq("id", orderId).single();
  if (error || !order) throw new Error(error?.message ?? "order_not_found");
  if (order.supplier_order_reference) return { skipped: true };
  const { data: mapping, error: mappingError } = await supabase.from("supplier_product_mappings").select("*,suppliers(*)").eq("product_id", order.product_id).eq("is_active", true).limit(1).single();
  if (mappingError || !mapping) throw new Error(mappingError?.message ?? "supplier_mapping_not_found");
  const key = Deno.env.get("DATAMARTGH_API_KEY");
  if (!key) throw new Error("DATAMARTGH_API_KEY is not configured");
  await supabase.from("orders").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", order.id);
  const started = Date.now();
  const response = await fetch(`${Deno.env.get("DATAMARTGH_BASE_URL") ?? "https://api.datamartgh.shop/api/developer"}/purchase`, { method: "POST", headers: { "X-API-Key": key, "X-API-Secret": Deno.env.get("DATAMARTGH_API_SECRET") ?? "", "X-Idempotency-Key": order.supplier_idempotency_key, "Content-Type": "application/json" }, body: JSON.stringify({ phoneNumber: order.recipient_phone, network: mapping.supplier_network_code, capacity: mapping.supplier_capacity, gateway: "wallet", ref: order.order_reference }) });
  const payload = await response.json().catch(() => ({}));
  const supplierStatus = payload?.data?.orderStatus ?? payload?.status;
  const normalized = String(supplierStatus ?? "").toLowerCase();
  const next = !response.ok ? "failed_needs_review" : normalized === "completed" ? "delivered" : normalized === "failed" ? "failed_needs_review" : normalized === "refunded" ? "refunded" : "pending_supplier";
  await supabase.from("supplier_api_logs").insert({ supplier_id: mapping.supplier_id, order_id: order.id, action: "purchase", endpoint: "/purchase", request_payload: { phoneNumber: order.recipient_phone, network: mapping.supplier_network_code, capacity: mapping.supplier_capacity }, response_payload: payload, http_status: response.status, call_status: response.ok ? "success" : "error", supplier_reference: payload?.data?.orderReference ?? null, idempotency_key: order.supplier_idempotency_key, error_message: response.ok ? null : payload?.message ?? "DataMartGH purchase failed", duration_ms: Date.now() - started });
  await supabase.from("orders").update({ status: next, supplier_order_reference: payload?.data?.orderReference ?? null, supplier_purchase_id: payload?.data?.purchaseId ?? null, supplier_transaction_reference: payload?.data?.transactionReference ?? null, supplier_status: supplierStatus ?? null, failure_reason: response.ok ? null : payload?.message ?? "DataMartGH purchase failed", updated_at: new Date().toISOString() }).eq("id", order.id);
  await supabase.from("order_events").insert({ order_id: order.id, event_type: response.ok ? "supplier.fulfillment_response" : "supplier.fulfillment_failed", from_status: "processing", to_status: next, message: response.ok ? `Supplier returned ${supplierStatus ?? "a response"}` : "Supplier order placement failed" });
  return { status: next, supplierReference: payload?.data?.orderReference ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Authentication required" }, 401);
    const supabase = admin();
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth.user) return json({ error: "Invalid session" }, 401);
    await supabase.rpc("close_expired_unpaid_orders");
    const body = await req.json();
    const action = String(body.action ?? "");

    if (action === "prepare") {
      const { data, error } = await supabase.rpc("prepare_data_order", { p_user_id: auth.user.id, p_product_code: String(body.productId ?? ""), p_recipient_phone: String(body.recipientPhone ?? "") });
      return error ? json({ error: error.message }, 400) : json({ status: "success", data });
    }
    if (action === "list_pending") {
      const { data, error } = await supabase.from("orders").select("id,order_reference,recipient_phone,amount,currency,status,payment_status,payment_arrangement,selected_payment_method,payment_expires_at,created_at,updated_at,data_products(name,capacity_gb),networks(name,code)").eq("user_id", auth.user.id).eq("is_open", true).order("created_at", { ascending: false });
      return error ? json({ error: error.message }, 500) : json({ status: "success", data: data ?? [] });
    }

    const orderReference = ref(body.orderReference);
    if (!orderReference) return json({ error: "Order ID is required" }, 400);
    const { data: order, error: orderError } = await supabase.from("orders").select("id,order_reference,user_id,recipient_phone,amount,currency,status,payment_status,payment_arrangement,selected_payment_method,payment_expires_at,is_open,data_products(name,capacity_gb),networks(name,code)").eq("order_reference", orderReference).maybeSingle();
    if (orderError) return json({ error: orderError.message }, 500);
    if (!order) return json({ error: "Order not found" }, 404);
    const expired = !order.is_open || (order.payment_expires_at && new Date(order.payment_expires_at).getTime() <= Date.now());
    const payable = order.payment_arrangement === "shared" || order.user_id === auth.user.id;

    if (action === "lookup") {
      if (expired) return json({ error: "This order has expired or is closed" }, 410);
      if (order.payment_status === "succeeded") return json({ error: "This order has already been paid" }, 409);
      return payable ? json({ status: "success", data: order }) : json({ error: "This order is not available for another user to pay" }, 403);
    }
    if (action === "share") {
      if (order.user_id !== auth.user.id) return json({ error: "Only the order creator can share it" }, 403);
      if (expired || order.payment_status === "succeeded") return json({ error: "This order can no longer be shared" }, 409);
      const { error } = await supabase.from("orders").update({ payment_arrangement: "shared", selected_payment_method: null, updated_at: new Date().toISOString() }).eq("id", order.id);
      if (error) return json({ error: error.message }, 500);
      await supabase.from("order_events").insert({ order_id: order.id, event_type: "payment.request.shared", from_status: order.status, to_status: order.status, message: "Order opened for payment by another YieGo user", created_by: auth.user.id });
      return json({ status: "success", data: { orderReference } });
    }
    if (action === "cancel") {
      if (order.user_id !== auth.user.id) return json({ error: "Only the order creator can cancel it" }, 403);
      if (order.payment_status === "succeeded") return json({ error: "Paid orders cannot be cancelled here" }, 409);
      const { error } = await supabase.from("orders").update({ status: "cancelled", payment_status: "abandoned", is_open: false, closed_at: new Date().toISOString(), closed_reason: "cancelled_by_creator", updated_at: new Date().toISOString() }).eq("id", order.id);
      return error ? json({ error: error.message }, 500) : json({ status: "success" });
    }
    if (action === "pay_wallet") {
      if (expired) return json({ error: "This order has expired or is closed" }, 410);
      if (!payable) return json({ error: "This order is not available for payment" }, 403);
      const { data, error } = await supabase.rpc("pay_prepared_order_with_wallet", { p_order_reference: orderReference, p_payer_user_id: auth.user.id });
      if (error) return json({ error: error.message }, 400);
      // Order is paid — email the buyer their confirmation + Order ID (best-effort).
      try { await sendOrderConfirmation(supabase, data.orderId); } catch { /* email must never break payment */ }
      try { return json({ status: "success", data: { ...data, fulfillment: await fulfill(supabase, data.orderId) } }); }
      catch (e) { await supabase.from("orders").update({ status: "failed_needs_review", failure_reason: e instanceof Error ? e.message : "Supplier fulfillment failed", updated_at: new Date().toISOString() }).eq("id", data.orderId); return json({ status: "needs_review", data, error: e instanceof Error ? e.message : "Supplier fulfillment failed" }, 202); }
    }
    if (action === "pay_paystack") {
      if (expired) return json({ error: "This order has expired or is closed" }, 410);
      if (!payable) return json({ error: "This order is not available for payment" }, 403);
      if (!auth.user.email) return json({ error: "Your account needs an email for Paystack payment" }, 400);
      const reference = paystackRef();
      // 4% Paystack fee on top of the order amount; the order value is unchanged.
      const baseAmount = Number(order.amount);
      const feeAmount = paystackFee(baseAmount);
      const chargeAmount = paystackTotal(baseAmount);
      const response = await fetch("https://api.paystack.co/transaction/initialize", { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: auth.user.email, amount: Math.round(chargeAmount * 100), currency: "GHS", reference, callback_url: `${(Deno.env.get("SITE_URL") ?? Deno.env.get("APP_URL") ?? "").replace(/\/$/, "")}/track-order?reference=${encodeURIComponent(orderReference)}`, metadata: { purpose: "guest_data_purchase", checkoutType: "prepared_order", orderId: order.id, orderReference, payerUserId: auth.user.id, recipientPhone: order.recipient_phone, baseAmount, feeAmount } }) });
      const payload = await response.json();
      if (!response.ok || !payload?.status) return json({ error: payload?.message ?? "Could not initialize Paystack transaction" }, response.status || 502);
      const { error } = await supabase.from("payment_intents").insert({ provider: "paystack", purpose: "guest_data_purchase", status: "pending", user_id: auth.user.id, order_id: order.id, amount: chargeAmount, currency: "GHS", provider_reference: reference, authorization_url: payload.data.authorization_url, metadata: { accessCode: payload.data.access_code, orderReference, checkoutType: "prepared_order", payerUserId: auth.user.id, baseAmount, feeAmount } });
      if (error) return json({ error: error.message }, 500);
      await supabase.from("orders").update({ payment_arrangement: order.user_id === auth.user.id ? "self" : "shared", selected_payment_method: "paystack", paystack_reference: reference, updated_at: new Date().toISOString() }).eq("id", order.id);
      return json({ status: "success", data: { authorizationUrl: payload.data.authorization_url, accessCode: payload.data.access_code, paymentReference: reference, orderReference } });
    }
    return json({ error: "Unsupported action" }, 400);
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500); }
});