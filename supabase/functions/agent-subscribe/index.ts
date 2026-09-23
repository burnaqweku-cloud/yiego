import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { initializePaystackTransaction, makePaystackReference } from "../_shared/paystack.ts";
import { paystackFee, paystackTotal } from "../_shared/fees.ts";

/* Agent pays for 1, 3 or 12 months through Paystack. The webhook activates the
   month once Paystack confirms. */
Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "Authentication required" }, { status: 401 });
    const supabase = createSupabaseAdmin();
    const { data: auth } = await supabase.auth.getUser(token);
    if (!auth?.user?.email) return jsonResponse({ error: "Invalid session" }, { status: 401 });
    const { data: agent } = await supabase.from("agents").select("id, slug, status, paid_until").eq("user_id", auth.user.id).maybeSingle();
    if (!agent) return jsonResponse({ error: "You're not an approved agent yet." }, { status: 403 });
    if (agent.status === "suspended") return jsonResponse({ error: "This agent account is suspended." }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const months = [1, 3, 12].includes(Number(body?.months)) ? Number(body.months) : 1;
    const { data: quote } = await supabase.rpc("agent_plan_quote");
    const plan = (quote?.plans as Array<{ months: number; pay_now: number; promo_id: string | null }> | undefined)?.find((p) => p.months === months);
    const amount = Number(plan?.pay_now ?? 0);
    const promoId = plan?.promo_id ?? null;
    if (!(amount > 0)) return jsonResponse({ error: "Plan price not set." }, { status: 500 });
    // Same 4% checkout fee as everywhere else; the plan itself is booked at `amount`.
    const fee = paystackFee(amount); const charge = paystackTotal(amount);
    const reference = makePaystackReference("YGAGENT");
    const site = (Deno.env.get("SITE_URL") ?? Deno.env.get("APP_URL") ?? "https://datayego.com").replace(/\/$/, "");
    const init = await initializePaystackTransaction({ email: auth.user.email, amount: charge, reference, currency: "GHS", callbackUrl: `${site}/agent?paid=1`, metadata: { purpose: "agent_subscription", agentId: agent.id, promoId, months, baseAmount: amount, feeAmount: fee } });
    if (!init.ok || !init.payload?.status) return jsonResponse({ error: init.payload?.message ?? "Could not start payment" }, { status: 502 });
    const { error } = await supabase.from("payment_intents").insert({ provider: "paystack", purpose: "agent_subscription", status: "pending", user_id: auth.user.id, amount: charge, currency: "GHS", provider_reference: reference, authorization_url: init.payload.data.authorization_url, metadata: { accessCode: init.payload.data.access_code, agent_id: agent.id, promo_id: promoId, months, monthly: quote?.monthly, percent_off: promoId ? (quote?.promo?.percent_off ?? 0) : 0, baseAmount: amount, feeAmount: fee } });
    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    return jsonResponse({ status: "success", data: { authorizationUrl: init.payload.data.authorization_url, amount: charge, base: amount, fee, months, reference } });
  } catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 }); }
});
