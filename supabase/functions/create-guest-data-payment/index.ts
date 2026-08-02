import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { initializePaystackTransaction, makePaystackReference } from "../_shared/paystack.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

function makeOrderReference() {
  return `YG-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

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
    const body = await req.json();
    const productId = String(body.productId ?? "");
    const recipientPhone = normalizePhone(String(body.recipientPhone ?? ""));
    const guestEmail = String(body.guestEmail ?? "").trim();
    const guestPhone = body.guestPhone ? normalizePhone(String(body.guestPhone)) : recipientPhone;

    if (!productId) {
      return jsonResponse({ error: "productId is required" }, { status: 400 });
    }

    if (recipientPhone.length !== 10 || !recipientPhone.startsWith("0")) {
      return jsonResponse({ error: "A valid 10-digit Ghana recipient phone is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    const { data: authData } = token
      ? await supabase.auth.getUser(token)
      : { data: { user: null } };
    const authenticatedUser = authData.user ?? null;
    const paymentEmail = authenticatedUser?.email ?? guestEmail;

    if (!paymentEmail) {
      return jsonResponse({ error: "An email is required for receipt and Paystack payment" }, { status: 400 });
    }

    const productIdLooksLikeUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        productId,
      );

    const productQuery = supabase
      .from("data_products")
      .select("*, networks(*)")
      .eq("is_active", true);

    const { data: product, error: productError } = await (productIdLooksLikeUuid
      ? productQuery.eq("id", productId)
      : productQuery.eq("app_product_code", productId)
    ).maybeSingle();

    if (productError) {
      return jsonResponse({ error: productError.message }, { status: 500 });
    }

    if (!product) {
      return jsonResponse({ error: "Product not found or inactive" }, { status: 404 });
    }

    if (product.networks?.is_paused) {
      return jsonResponse(
        { error: product.networks.pause_reason ?? "This network is temporarily paused" },
        { status: 409 },
      );
    }

    const { data: mapping, error: mappingError } = await supabase
      .from("supplier_product_mappings")
      .select("supplier_id")
      .eq("product_id", product.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (mappingError) {
      return jsonResponse({ error: mappingError.message }, { status: 500 });
    }

    if (!mapping) {
      return jsonResponse({ error: "No active supplier mapping for this product" }, { status: 409 });
    }

    const orderReference = makeOrderReference();
    const paystackReference = makePaystackReference("YGDATA");

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_reference: orderReference,
        user_id: authenticatedUser?.id ?? null,
        guest_email: authenticatedUser ? null : paymentEmail,
        guest_phone: authenticatedUser ? null : guestPhone,
        recipient_phone: recipientPhone,
        network_id: product.network_id,
        product_id: product.id,
        supplier_id: mapping.supplier_id,
        amount: product.customer_price,
        cost_amount: product.cost_price,
        currency: "GHS",
        status: "awaiting_payment",
        payment_status: "pending",
        paystack_reference: paystackReference,
      })
      .select("id, order_reference")
      .single();

    if (orderError) {
      return jsonResponse({ error: orderError.message }, { status: 500 });
    }

    const appUrl = Deno.env.get("SITE_URL") ?? Deno.env.get("APP_URL");
    const callbackUrl = appUrl
      ? `${appUrl.replace(/\/$/, "")}/track-order?reference=${encodeURIComponent(orderReference)}`
      : undefined;

    const paystack = await initializePaystackTransaction({
      email: paymentEmail,
      amount: Number(product.customer_price),
      reference: paystackReference,
      currency: "GHS",
      callbackUrl,
      metadata: {
        purpose: "guest_data_purchase",
        checkoutType: authenticatedUser ? "account_paystack" : "guest_paystack",
        userId: authenticatedUser?.id ?? null,
        orderId: order.id,
        orderReference,
        recipientPhone,
      },
    });

    if (!paystack.ok || !paystack.payload?.status) {
      await supabase
        .from("orders")
        .update({
          status: "failed",
          payment_status: "failed",
          failure_reason: paystack.payload?.message ?? "Could not initialize Paystack transaction",
        })
        .eq("id", order.id);

      return jsonResponse(
        {
          error: paystack.payload?.message ?? "Could not initialize Paystack transaction",
          provider: paystack.payload,
        },
        { status: paystack.status || 502 },
      );
    }

    const { error: paymentError } = await supabase.from("payment_intents").insert({
      provider: "paystack",
      purpose: "guest_data_purchase",
      status: "pending",
      user_id: authenticatedUser?.id ?? null,
      order_id: order.id,
      amount: product.customer_price,
      currency: "GHS",
      provider_reference: paystackReference,
      authorization_url: paystack.payload.data.authorization_url,
      metadata: {
        accessCode: paystack.payload.data.access_code,
        orderReference,
        checkoutType: authenticatedUser ? "account_paystack" : "guest_paystack",
      },
    });

    if (paymentError) {
      return jsonResponse({ error: paymentError.message }, { status: 500 });
    }

    await supabase.from("order_events").insert({
      order_id: order.id,
      event_type: "payment.created",
      from_status: "created",
      to_status: "awaiting_payment",
      message: authenticatedUser
        ? "Account Paystack payment initialized"
        : "Guest Paystack payment initialized",
      metadata: {
        provider: "paystack",
        reference: paystackReference,
      },
    });

    return jsonResponse({
      status: "success",
      data: {
        orderId: order.id,
        orderReference,
        authorizationUrl: paystack.payload.data.authorization_url,
        accessCode: paystack.payload.data.access_code,
        paymentReference: paystackReference,
      },
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
