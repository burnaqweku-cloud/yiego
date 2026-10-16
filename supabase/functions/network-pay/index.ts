import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { initializePaystackTransaction, makePaystackReference } from "../_shared/paystack.ts";
import { paystackFee, paystackTotal } from "../_shared/fees.ts";

/* A sub-agent pays their parent's monthly fee. { months, coupon? } -> Paystack link. The fee goes to the parent;
   DataYego keeps only the processor fee added on top. A parent whose own plan has lapsed does not block their
   agents from renewing (the parent's store being closed is the parent's problem, not the sub's); only a parent the
   admin has suspended, or who has closed the programme, stops renewals. */
Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const supabase = createSupabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "Authentication required" }, { status: 401 });
    const { data: auth } = await supabase.auth.getUser(token);
    if (!auth?.user?.email) return jsonResponse({ error: "Invalid session" }, { status: 401 });
    const { data: agent } = await supabase.from("agents").select("id, slug, store_name, status, parent_agent_id").eq("user_id", auth.user.id).maybeSingle();
    if (!agent?.parent_agent_id) return jsonResponse({ error: "Not an agent under a network" }, { status: 403 });
    if (agent.status === "suspended") return jsonResponse({ error: "This store has been suspended. Contact support." }, { status: 409 });
    const { data: parent } = await supabase.from("agents").select("id, slug, store_name, network_fee, network_on, status").eq("id", agent.parent_agent_id).maybeSingle();
    if (!parent || parent.status === "suspended") return jsonResponse({ error: "This network isn't active right now." }, { status: 409 });
    const months = Math.min(Math.max(Number(body.months ?? 1), 1), 12);
    let base = Math.round(Number(parent.network_fee) * months * 100) / 100;
    let couponId: string | null = null; let percentOff = 0;
    const code = String(body.coupon ?? "").trim().toUpperCase();
    if (code) {
      const { data: c } = await supabase.from("network_coupons").select("id, percent_off, max_uses, uses, expires_at, is_active").eq("agent_id", parent.id).eq("code", code).maybeSingle();
      const ok = c && c.is_active && (!c.expires_at || new Date(c.expires_at) > new Date()) && (c.max_uses == null || c.uses < c.max_uses);
      if (!ok) return jsonResponse({ error: "That code isn't valid." }, { status: 400 });
      couponId = c.id; percentOff = c.percent_off; base = Math.round(base * (100 - percentOff)) / 100;
    }
    if (!(base > 0)) return jsonResponse({ error: "Nothing to pay." , free: true }, { status: 400 });
    const fee = paystackFee(base); const charge = paystackTotal(base);
    const reference = makePaystackReference("YGNET");
    const site = (Deno.env.get("SITE_URL") ?? "https://datayego.com").replace(/\/$/, "");
    const init = await initializePaystackTransaction({ email: auth.user.email, amount: charge, reference, currency: "GHS", callbackUrl: `${site}/agent?paid=1`, metadata: { purpose: "network_fee", agentId: agent.id, parentAgentId: parent.id, months, baseAmount: base, fee, couponId } });
    if (!init.ok || !init.payload?.status) return jsonResponse({ error: init.payload?.message ?? "Could not start payment" }, { status: 502 });
    const { error } = await supabase.from("payment_intents").insert({ provider: "paystack", purpose: "network_fee", status: "pending", user_id: auth.user.id, amount: charge, currency: "GHS", provider_reference: reference, authorization_url: init.payload.data.authorization_url, metadata: { accessCode: init.payload.data.access_code, agent_id: agent.id, parent_agent_id: parent.id, months, baseAmount: base, feeAmount: fee, coupon_id: couponId, percent_off: percentOff } });
    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    return jsonResponse({ authorizationUrl: init.payload.data.authorization_url, amount: charge, base, fee, months, parent: parent.store_name, percentOff });
  } catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 }); }
});
