import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

function customerDeliveryStatus(orderStatus: string, paymentStatus: string) {
  if (paymentStatus !== "succeeded") return "waiting_for_payment";
  switch (orderStatus) {
    case "delivered": return "completed";
    case "refunded": return "refunded";
    case "cancelled": return "cancelled";
    case "failed": return "needs_support";
    default: return "in_progress";
  }
}

function customerMessage(orderStatus: string, paymentStatus: string, paidAt: string | null, updatedAt: string) {
  if (paymentStatus !== "succeeded") return "Complete payment to continue this order.";
  if (orderStatus === "delivered") return "Your data order has been completed.";
  if (orderStatus === "refunded") return "Your payment has been refunded.";
  if (orderStatus === "cancelled") return "This order has been cancelled.";
  if (orderStatus === "failed") return "We could not complete this order. Please contact YieGo support.";

  const started = new Date(paidAt ?? updatedAt).getTime();
  const ageHours = Number.isFinite(started) ? Math.max(0, (Date.now() - started) / 3_600_000) : 0;
  if (ageHours < 24) return "Your payment was successful. Your order is in progress.";
  if (ageHours < 48) return "Your order is still in progress. We will update this page when delivery is completed.";
  return "Your order is under review. Please contact YieGo support if you need assistance.";
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

  try {
    const url = new URL(req.url);
    const reference = url.searchParams.get("reference")?.trim().toUpperCase();
    if (!reference) return jsonResponse({ error: "reference is required" }, { status: 400 });

    // The order reference is a random, unguessable token (YG- + 10 hex chars),
    // so it acts as the bearer credential: knowing it is enough to see this
    // order's masked, customer-safe status. No phone number is required — a
    // recipient phone would let anyone enumerate orders by number instead.
    const supabase = createSupabaseAdmin();

    const { data: order, error } = await supabase
      .from("orders")
      .select("order_reference, recipient_phone, amount, currency, status, payment_status, paid_at, created_at, updated_at, data_products(name, capacity_gb), networks(name)")
      .eq("order_reference", reference)
      .limit(1)
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    if (!order) return jsonResponse({ error: "Order not found" }, { status: 404 });

    const maskedPhone = order.recipient_phone?.length === 10
      ? `${order.recipient_phone.slice(0, 3)}•••${order.recipient_phone.slice(7)}`
      : "Hidden";
    const deliveryStatus = customerDeliveryStatus(order.status, order.payment_status);

    return jsonResponse({
      status: "success",
      data: {
        reference: order.order_reference,
        recipient: maskedPhone,
        network: order.networks?.name,
        product: order.data_products?.name,
        amount: order.amount,
        currency: order.currency,
        orderStatus: deliveryStatus,
        paymentStatus: order.payment_status,
        deliveryStatus,
        statusMessage: customerMessage(order.status, order.payment_status, order.paid_at, order.updated_at),
        createdAt: order.created_at,
        updatedAt: order.updated_at,
      },
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
