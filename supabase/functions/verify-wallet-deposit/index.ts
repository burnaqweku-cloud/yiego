import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Authentication required" }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!url || !serviceKey || !paystackKey) return json({ error: "Payment verification is not configured" }, 503);

    const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: "phase1" } });
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

    const body = await req.json().catch(() => ({}));
    const reference = String(body.reference ?? "").trim();
    if (!reference || reference.length > 100) return json({ error: "A valid payment reference is required" }, 400);

    const { data: intent, error: intentError } = await supabase.from("payment_intents").select("id,user_id,wallet_id,amount,currency").eq("provider", "paystack").eq("provider_reference", reference).eq("purpose", "wallet_deposit").maybeSingle();
    if (intentError) return json({ error: intentError.message }, 500);
    if (!intent || intent.user_id !== authData.user.id) return json({ error: "Payment not found" }, 404);

    const verification = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${paystackKey}` } });
    const payload = await verification.json().catch(() => null);
    if (!verification.ok) return json({ error: "Paystack could not verify this payment yet", status: "pending" }, 202);
    const providerStatus = String(payload?.data?.status ?? "");
    if (providerStatus !== "success") return json({ status: providerStatus === "failed" ? "failed" : "pending", message: "Payment confirmation is still pending" }, 202);

    const paidAmount = Number(payload?.data?.amount ?? 0) / 100;
    const paidCurrency = String(payload?.data?.currency ?? "").toUpperCase();
    if (paidCurrency !== String(intent.currency).toUpperCase() || paidAmount < Number(intent.amount)) return json({ error: "Verified payment details do not match the deposit request" }, 409);

    const { error: creditError } = await supabase.rpc("credit_wallet_deposit", { p_payment_intent_id: intent.id, p_provider_reference: reference });
    if (creditError) return json({ error: creditError.message }, 500);
    const { data: wallet, error: walletError } = await supabase.from("wallets").select("balance,currency").eq("id", intent.wallet_id).single();
    if (walletError) return json({ error: walletError.message }, 500);
    return json({ status: "success", balance: Number(wallet.balance), currency: wallet.currency, amount: Number(intent.amount), reference });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not verify wallet deposit" }, 500);
  }
});
