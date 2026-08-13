import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { initializePaystackTransaction, makePaystackReference } from "../_shared/paystack.ts";
import { paystackFee, paystackTotal } from "../_shared/fees.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

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
    const amount = Number(body.amount);

    if (!Number.isFinite(amount) || amount < 1) {
      return jsonResponse({ error: "Deposit amount must be at least GH₵1" }, { status: 400 });
    }

    const email = authData.user.email;

    if (!email) {
      return jsonResponse({ error: "User email is required for Paystack" }, { status: 400 });
    }

    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("id")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (walletError) {
      return jsonResponse({ error: walletError.message }, { status: 500 });
    }

    if (!wallet) {
      return jsonResponse({ error: "Wallet not found" }, { status: 404 });
    }

    const reference = makePaystackReference("YGDEP");
    const appUrl = (Deno.env.get("SITE_URL") ?? Deno.env.get("APP_URL") ?? "https://yiego.shop").replace(/\/$/, "");
    const callbackUrl = `${appUrl}/payment/success?reference=${encodeURIComponent(reference)}&type=deposit`;

    // The customer is charged the deposit + 4% Paystack fee, but the wallet is
    // credited only the base deposit — so a "GH₵50 top-up" lands as GH₵50.
    const feeAmount = paystackFee(amount);
    const chargeAmount = paystackTotal(amount);

    const paystack = await initializePaystackTransaction({
      email,
      amount: chargeAmount,
      reference,
      currency: "GHS",
      callbackUrl,
      metadata: {
        purpose: "wallet_deposit",
        userId: authData.user.id,
        walletId: wallet.id,
        baseAmount: amount,
        feeAmount,
      },
    });

    if (!paystack.ok || !paystack.payload?.status) {
      return jsonResponse(
        {
          error: paystack.payload?.message ?? "Could not initialize Paystack transaction",
          provider: paystack.payload,
        },
        { status: paystack.status || 502 },
      );
    }

    const { error: insertError } = await supabase.from("payment_intents").insert({
      provider: "paystack",
      purpose: "wallet_deposit",
      status: "pending",
      user_id: authData.user.id,
      wallet_id: wallet.id,
      amount,
      currency: "GHS",
      provider_reference: reference,
      authorization_url: paystack.payload.data.authorization_url,
      metadata: {
        accessCode: paystack.payload.data.access_code,
        callbackUrl,
        chargedAmount: chargeAmount,
        feeAmount,
      },
    });

    if (insertError) {
      return jsonResponse({ error: insertError.message }, { status: 500 });
    }

    return jsonResponse({
      status: "success",
      data: {
        authorizationUrl: paystack.payload.data.authorization_url,
        accessCode: paystack.payload.data.access_code,
        reference,
        callbackUrl,
      },
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
