import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* DY Services: paying for a service order with Paystack, and sending what was bought.
   The database owns every rule (stock, prices, who gets which PIN, and that a payment delivers once).
     { action: "start", productCode, quantity, phone, email?, deviceId?, details? }   open a Paystack checkout (guest or signed in; details = the AFA form)
     { action: "confirm", token }                                           on return from Paystack: check the payment, give back the order
     { action: "run" } + internal secret                                    send SMS/email for delivered orders; re-check unpaid ones; send queued texts
     { action: "refund", orderId, reason } + admin sign-in                  send the money back through Paystack
   This file is self-contained on purpose: it shares no code with the data checkout, so changing one can never break the other. */

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-yiego-internal-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const SITE = "https://datayego.com";
const PAYSTACK = "https://api.paystack.co";

const FRIENDLY: Record<string, string> = {
  service_unavailable: "This isn't available right now.",
  quantity_invalid: "Choose between 1 and 1,000.",
  phone_invalid: "That phone number doesn't look right. Use a 10-digit Ghana number.",
  email_invalid: "That email doesn't look right. Fix it, or leave it empty.",
  afa_already_registered: "This number already has an AFA registration with us. You don't need to pay again.",
  afa_name_invalid: "Enter the full name exactly as it is on the Ghana Card (first name and surname).",
  afa_phone_invalid: "That doesn't look like an MTN number. AFA is for MTN only: 024, 025, 053, 054, 055 or 059.",
  afa_card_invalid: "That Ghana Card number doesn't look right. It looks like GHA-123456789-0.",
  afa_dob_invalid: "Check the date of birth. The person must be 16 or older.",
  afa_job_invalid: "Enter the person's occupation.",
  afa_region_invalid: "Choose a region.",
  afa_address_invalid: "Enter the address: town and area or house number.",
};
const friendly = (message: string | undefined, fallback: string) => { for (const key of Object.keys(FRIENDLY)) if (message?.includes(key)) return FRIENDLY[key]; return fallback; };

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: "phase1" } });
}
async function paystack(path: string, init?: RequestInit) {
  const key = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  const res = await fetch(`${PAYSTACK}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000) });
  return { ok: res.ok, status: res.status, payload: await res.json().catch(() => null) };
}
/** Ask Paystack about one of our references and, if it was paid in full in cedis, tell the database. */
// deno-lint-ignore no-explicit-any
async function checkPayment(db: any, reference: string): Promise<string> {
  const v = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  const tx = v.payload?.data;
  if (!v.ok || tx?.status !== "success" || tx?.currency !== "GHS" || tx?.reference !== reference) return "not_paid";
  const { data, error } = await db.rpc("service_payment_received", { p_reference: reference, p_paid: Number(tx.amount) / 100 });
  return error ? "error" : String(data);
}

interface Delivered { id: string; reference: string; kind?: string; name: string; quantity: number; phone: string; email: string | null; token: string; pins: { serial: string; pin: string }[]; afa?: { name?: string; phone?: string } | null }
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function sendSms(to: string, message: string, sender: string): Promise<string> {
  const key = Deno.env.get("VYNFY_API_KEY");
  const digits = to.replace(/\D/g, "");
  const msisdn = /^0\d{9}$/.test(digits) ? "233" + digits.slice(1) : /^233\d{9}$/.test(digits) ? digits : null;
  if (!key || !msisdn) return "skipped";
  try {
    const res = await fetch("https://sms.vynfy.com/api/v1/send", { method: "POST", headers: { "X-API-Key": key, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ sender: sender.slice(0, 11), recipients: [msisdn], message }) });
    const body = await res.json().catch(() => ({}));
    return res.ok && body?.success !== false ? "sent" : "failed";
  } catch { return "failed"; }
}
/* MTN AFA registration through OtessData. One request per order; the order reference is the Idempotency-Key, so a repeat can't be charged twice.
   The reply decides what happens: registered (with what was charged), refused (nothing charged), wallet short, or unclear (a person checks). */
interface Registration { id: string; reference: string; key: string; details: Record<string, string> }
// deno-lint-ignore no-explicit-any
async function registerAfa(db: any, r: Registration, key: string): Promise<string> {
  const d = r.details ?? {};
  // deno-lint-ignore no-explicit-any
  let status = 0; let payload: any = null;
  try {
    const res = await fetch(`${(Deno.env.get("OTESSDATA_BASE_URL") ?? "https://www.otessdata.app/api/v1").replace(/\/$/, "")}/afa/register`, { method: "POST", signal: AbortSignal.timeout(50000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": r.key },
      body: JSON.stringify({ name: d.full_name, phoneNumber: d.afa_phone, idNumber: d.ghana_card, occupation: d.occupation, location: d.address, region: d.region, dateOfBirth: d.dob, reference: r.key }) });
    status = res.status; payload = await res.json().catch(() => null);
  } catch (e) { payload = { error: e instanceof Error ? e.message : String(e) }; }
  const data = payload?.data ?? {};
  const said = String(payload?.message ?? payload?.error?.message ?? (typeof payload?.error === "string" ? payload.error : "") ?? "").slice(0, 200);
  const state = String(data?.status ?? "").toLowerCase();
  const num = (v: unknown) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) ? n : null; };
  let outcome = "unclear"; let note: string | null = status === 0 ? null : said || null;
  if (status >= 200 && status < 300 && payload?.success === true) {
    outcome = ["completed", "success", "successful", "registered", "delivered"].includes(state) ? "done" : ["failed", "refunded", "rejected"].includes(state) ? "rejected" : "submitted";
  } else if (status === 402 || /insufficient|low balance|not enough/i.test(said)) { outcome = "no_funds"; note = null; }
  else if (status === 401 || status === 403) { outcome = "no_funds"; note = "OtessData did not accept our API key. Check the key; these go by themselves once it works."; }
  else if (status === 429) { outcome = "no_funds"; note = "OtessData asked us to slow down. These are tried again shortly."; }
  else if (status === 400 || status === 404 || status === 422) outcome = "rejected";
  else if (status === 502 && payload?.success === false) { outcome = "rejected"; note = said || "OtessData's supplier had an error and OtessData refunded the charge."; }
  const { data: result } = await db.rpc("service_registration_result", { p_order: r.id, p_outcome: outcome, p_cost: num(data?.amount), p_supplier_reference: data?.orderId ? String(data.orderId) : null,
    p_note: note, p_reply: { http: status, body: payload }, p_balance: outcome === "done" && !isTestKey(key) ? num(data?.balance) : null });
  return String(result ?? outcome);
}
/** A sandbox key reports a pretend wallet; that must never reach Finance. */
const isTestKey = (key: string) => /^otess_test_/i.test(key);
/* A registration OtessData accepted but had not finished: ask how it ended (GET /orders/:id, by their order ID or our reference). */
// deno-lint-ignore no-explicit-any
async function checkAfa(db: any, orderId: string, lookup: string, key: string): Promise<void> {
  try {
    const res = await fetch(`${(Deno.env.get("OTESSDATA_BASE_URL") ?? "https://www.otessdata.app/api/v1").replace(/\/$/, "")}/orders/${encodeURIComponent(lookup)}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
    const payload = await res.json().catch(() => null);
    const state = String(payload?.data?.status ?? "").toLowerCase();
    if (!res.ok || payload?.success !== true || !["delivered", "completed", "failed"].includes(state)) return;
    const cost = Number(payload.data.amountCharged ?? payload.data.amount);
    await db.rpc("service_registration_result", { p_order: orderId, p_outcome: state === "failed" ? "rejected" : "done", p_cost: Number.isFinite(cost) ? cost : null, p_supplier_reference: payload.data.orderId ? String(payload.data.orderId) : null,
      p_note: state === "failed" ? "OtessData says this registration failed." : null, p_reply: { http: res.status, body: payload }, p_balance: null });
  } catch { /* try again on the next run */ }
}

async function sendEmail(o: Delivered): Promise<string> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key || !o.email || /@guest\.datayego\.com$/i.test(o.email)) return "skipped";
  const isAfa = o.kind === "afa";
  const rows = o.pins.map((p, i) => `<tr><td style="padding:10px 12px;border-top:1px solid #e3ebe6;font-size:13px;color:#5a6a64;">${o.pins.length > 1 ? `#${i + 1}` : "Your checker"}</td><td style="padding:10px 12px;border-top:1px solid #e3ebe6;font-size:14px;"><b>Serial:</b> ${esc(p.serial)}<br /><b>PIN:</b> ${esc(p.pin)}</td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f2f7f4;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101e1c;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:18px;overflow:hidden;"><tr><td style="background:#0b1512;padding:18px 28px;"><span style="color:#7cf0b4;font-size:20px;font-weight:700;">DataYego</span></td></tr><tr><td style="padding:28px;"><h1 style="margin:0 0 8px;font-size:21px;">${esc(o.name)}</h1>${isAfa ? `<p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#3c4a46;">Thank you. ${esc(o.afa?.phone ?? o.phone)} is now registered on MTN AFA${o.afa?.name ? `, in the name of ${esc(o.afa.name)}` : ""}. Order ${esc(o.reference)}.</p>` : `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3c4a46;">Thank you. Here ${o.pins.length > 1 ? "are your checkers" : "is your checker"} for order ${esc(o.reference)}. Keep this email safe: anyone with the serial and PIN can use it.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3ebe6;border-radius:12px;">${rows}</table>`}<a href="${SITE}/services/order/${o.token}" style="display:block;margin:20px 0 0;background:#22c387;color:#04120c;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:12px;">View it on DataYego</a></td></tr></table></td></tr></table></body></html>`;
  try {
    const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `service-${o.id}` },
      body: JSON.stringify({ from: Deno.env.get("EMAIL_FROM") ?? "DataYego <noreply@datayego.com>", to: [o.email], reply_to: "support@yiego.shop", subject: isAfa ? `Your AFA registration is done: order ${o.reference}` : `Your ${o.name}: order ${o.reference}`, html }) });
    return res.ok ? "sent" : "failed";
  } catch { return "failed"; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const db = admin();
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "run") {
      const given = req.headers.get("x-yiego-internal-secret") ?? "";
      const { data: secret } = await db.from("internal_secrets").select("value").eq("key", "cron").maybeSingle();
      if (!secret?.value || given !== secret.value) return json({ error: "Forbidden" }, 403);
      const { data: work, error } = await db.rpc("service_outbox_claim");
      if (error) return json({ error: error.message }, 500);
      let confirmed = 0, sent = 0;
      for (const reference of ((work?.check ?? []) as string[]).slice(0, 25)) { if ((await checkPayment(db, reference)) === "delivered") confirmed += 1; }
      // Anything the checks above just delivered is picked up on the next run (two minutes at most); the buyer already sees it on screen.
      for (const o of (work?.deliver ?? []) as Delivered[]) {
        // A few checkers fit in a text; a big order points to the email instead. The network drops texts with links or the word "data", so neither appears here.
        const list = o.pins.map((p, i) => `${o.pins.length > 1 ? `${i + 1}) ` : ""}Serial ${p.serial} PIN ${p.pin}`).join("; ");
        const text = o.kind === "afa" ? `DY Services: ${o.afa?.phone ?? o.phone} is now registered on AFA. Order ${o.reference}.` : o.pins.length <= 3 ? `DY Services: your ${o.name}. ${list}. Order ${o.reference}.` : `DY Services: your ${o.pins.length} ${o.name}s are ready. ${o.email && !/@guest\.datayego\.com$/i.test(o.email) ? "Open the email we sent you" : `Track order ${o.reference} on our site`} to see every serial number and PIN.`;
        // SMS for services has its own switch and sender ID (Admin → DY Services); off means on screen and by email only.
        const sms = work?.sms?.enabled ? await sendSms(o.phone, text.slice(0, 640), String(work.sms.sender ?? "Dyservice")) : "off";
        const email = await sendEmail(o);
        await db.rpc("service_outbox_done", { p_order: o.id, p_sms: sms, p_email: email });
        sent += 1;
      }
      // One-off texts queued by the database (an agent being approved, for example), each with its own sender ID.
      let texts = 0;
      for (const q of (work?.queue ?? []) as { id: number; phone: string; message: string; sender: string }[]) {
        await db.rpc("sms_queue_done", { p_id: q.id, p_result: await sendSms(q.phone, q.message, q.sender) });
        texts += 1;
      }
      // AFA forms waiting to be registered. Without the API key nothing is sent: the admins are told and register by hand.
      const afaKey = Deno.env.get("OTESSDATA_API_KEY")?.trim() ?? "";
      const { data: forms } = await db.rpc("service_registration_claim", { p_auto: Boolean(afaKey) });
      let registered = 0;
      for (const f of (forms ?? []) as Registration[]) { if ((await registerAfa(db, f, afaKey)) === "delivered") registered += 1; }
      if (afaKey) {
        const { data: open } = await db.from("service_registrations").select("order_id, supplier_reference, service_orders(reference)").eq("status", "submitted").limit(10);
        // deno-lint-ignore no-explicit-any
        for (const s of (open ?? []) as any[]) await checkAfa(db, s.order_id, s.supplier_reference ?? s.service_orders?.reference ?? "", afaKey);
      }
      return json({ confirmed, sent, texts, registered });
    }

    // Who is calling (optional for start/confirm; required for refund).
    let userId: string | null = null; let userEmail: string | null = null;
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (bearer && bearer.split(".").length === 3) { const { data } = await db.auth.getUser(bearer); userId = data?.user?.id ?? null; userEmail = data?.user?.email ?? null; }

    if (action === "start") {
      const phone = String(body.phone ?? ""); const email = String(body.email ?? "").trim();
      const { data: o, error } = await db.rpc("service_checkout_start", { p_user: userId, p_product: String(body.productCode ?? ""), p_qty: Number(body.quantity ?? 1), p_phone: phone, p_email: email || null, p_device: typeof body.deviceId === "string" ? body.deviceId : null,
        ...(body.details && typeof body.details === "object" ? { p_details: body.details } : {}) });
      if (error || !o) return json({ error: friendly(error?.message, "We couldn't start this order. Please try again.") }, 400);
      const sub = Deno.env.get("PAYSTACK_SUBACCOUNT")?.trim();
      const init = await paystack("/transaction/initialize", { method: "POST", body: JSON.stringify({
        email: userEmail ?? (o.email || `${o.phone}@guest.datayego.com`), amount: Math.round(Number(o.total) * 100), reference: o.pay_reference, currency: "GHS", channels: ["card", "mobile_money"],
        callback_url: `${SITE}/services/order/${o.token}`, metadata: { purpose: "service_purchase", orderReference: o.reference, product: o.name },
        ...(sub ? { subaccount: sub, bearer: "subaccount" } : {}) }) });
      if (!init.ok || !init.payload?.status || !init.payload?.data?.authorization_url) {
        await db.rpc("service_checkout_abort", { p_order: o.id });
        return json({ error: "We couldn't open the payment page. Please try again." }, 502);
      }
      return json({ status: "success", data: { authorizationUrl: init.payload.data.authorization_url, token: o.token, reference: o.reference, total: o.total } });
    }

    if (action === "confirm") {
      const token = String(body.token ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ error: "Order not found" }, 404);
      const { data: row } = await db.from("service_orders").select("pay_reference, paid_at").eq("token", token).maybeSingle();
      if (!row) return json({ error: "Order not found" }, 404);
      if (!row.paid_at && row.pay_reference) await checkPayment(db, row.pay_reference);
      const { data: view } = await db.rpc("service_order_view", { p_token: token });
      return json({ status: "success", data: view });
    }

    if (action === "refund") {
      if (!userId) return json({ error: "Sign in first" }, 401);
      const { data: role } = await db.from("admin_users").select("role").eq("user_id", userId).eq("is_active", true).maybeSingle();
      if (role?.role !== "master") return json({ error: "Only the owner can refund" }, 403);
      const { data: o } = await db.from("service_orders").select("id, reference, pay_reference, payment_method, status, paid_at").eq("id", String(body.orderId ?? "")).maybeSingle();
      if (!o || !o.paid_at || o.status === "refunded") return json({ error: "This order can't be refunded" }, 409);
      if (o.payment_method !== "paystack" || !o.pay_reference) return json({ error: "This order was paid from the wallet. Refund it to the wallet instead." }, 409);
      const reason = String(body.reason ?? "Refund").slice(0, 200);
      const refund = await paystack("/refund", { method: "POST", body: JSON.stringify({ transaction: o.pay_reference, merchant_note: reason }) });
      if (!refund.ok || refund.payload?.status !== true) return json({ error: `Paystack declined the refund: ${refund.payload?.message ?? refund.status}. No money moved.` }, 502);
      // The database records it as done by the owner; this call runs with the server key, which the refund function accepts.
      const { error } = await db.rpc("admin_service_refund", { p_order: o.id, p_method: "paystack", p_reference: String(refund.payload?.data?.id ?? o.pay_reference), p_reason: reason });
      if (error) return json({ error: `Paystack accepted the refund but we couldn't record it: ${error.message}. Tell support before retrying.` }, 500);
      return json({ status: "success" });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
