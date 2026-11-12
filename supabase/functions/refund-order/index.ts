import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sendEmail } from "../_shared/email.ts";
import { initiateKoraRefund, KORA_MIN_REFUND_GHS, koraConfigured, readKoraRefund, verifyKoraWebhookSignature } from "../_shared/kora.ts";

/* Unified refund engine. "Refunded" means money moved.
     wallet-paid   -> instant wallet credit (atomic DB function)
     Paystack-paid -> real Paystack refund of the full charge (fee incl.)
     Kora-paid     -> real Kora refund of the full charge (13 Nov 2026; minimum GHS 10, reaches the customer in 24-48 working hours)
     manual hatch  -> admin sends money outside, records the reference
   Modes: auto (the database's own call, proved by the internal secret) only for out-of-stock failures;
          admin (the owner, signed in with 2FA) any eligible order. Nobody else can start a refund.
   Kora also calls this address to say how a refund ended (signed with x-korapay-signature).
   Admins may also refund orders held for MTN verification (never delivered, nothing charged by the supplier).
   25 Oct 2026: for MTN verification holds only, an admin may refund the Paystack payment minus Paystack's
   actual recorded fee (policy "mtn_verification_fee"), after the customer agreed to the exact amount.
   Every refund first takes the order's send lock so a refund and a supplier send (or two refunds) never overlap. */

const ELIGIBLE = new Set(["failed_needs_review", "paid"]);
const REFUND_LOCK_MS = 5 * 60 * 1000;
const KORA_HOOK = `${(Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "")}/functions/v1/refund-order`;
type Db = ReturnType<typeof createSupabaseAdmin>;

/** The Kora refund reference to use for an order: one Kora already accepted, or the first never used.
 *  Asking Kora first is what makes a second try safe: an accepted refund is found here, not sent again. */
async function koraRefundSlot(orderReference: string): Promise<{ reference: string; state: "processing" | "success" | "free" } | { error: string }> {
  for (let n = 1; n <= 4; n++) {
    const reference = n === 1 ? `RF-${orderReference}` : `RF-${orderReference}-${n}`;
    let seen: Awaited<ReturnType<typeof readKoraRefund>>;
    try { seen = await readKoraRefund(reference); } catch { return { error: "Kora could not be reached. No money moved." }; }
    if (seen.ok && (seen.state === "processing" || seen.state === "success")) return { reference, state: seen.state };
    if (seen.ok && seen.state === "failed") continue; // that attempt failed at Kora: a fresh reference is needed
    // "Refund not found" is Kora's answer for a reference it has never seen.
    if (!seen.ok && (seen.status === 404 || seen.status === 400 || /not found/i.test(String(seen.payload?.message ?? "")))) return { reference, state: "free" };
    return { error: `Kora could not confirm the refund status (${seen.payload?.message ?? seen.status}). No money moved.` };
  }
  return { error: "Kora has failed this refund several times. Refund it from the Kora dashboard or send the money yourself, then record it as a manual refund." };
}

/** Kora telling us how a refund ended. The message is only a nudge: what Kora answers when asked is what is recorded. */
async function koraRefundWebhook(req: Request, signature: string) {
  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object" || !(await verifyKoraWebhookSignature(payload.data, signature))) return jsonResponse({ error: "Invalid signature" }, { status: 401 });
  const reference = String(payload.data?.reference ?? "");
  const match = /^RF-((?:YG|AG)-[A-Z0-9]{10})(?:-\d)?$/.exec(reference);
  if (!match || !String(payload.event ?? "").startsWith("refund.")) return jsonResponse({ received: true });
  const supabase: Db = createSupabaseAdmin();
  const { data: order } = await supabase.from("orders").select("id, order_reference").eq("order_reference", match[1]).maybeSingle();
  if (!order) return jsonResponse({ received: true });
  let state = "unknown";
  try { const seen = await readKoraRefund(reference); if (seen.ok) state = seen.state; } catch { /* Kora sends it again */ }
  if (state !== "success" && state !== "failed") return jsonResponse({ received: true, state });
  const eventType = state === "success" ? "refund.kora_confirmed" : "refund.kora_failed";
  const { data: already } = await supabase.from("order_events").select("id").eq("order_id", order.id).eq("event_type", eventType).contains("metadata", { refundReference: reference }).limit(1).maybeSingle();
  if (!already) {
    await supabase.from("order_events").insert({ order_id: order.id, event_type: eventType, metadata: { refundReference: reference },
      message: state === "success" ? `Kora confirmed the refund reached the customer (ref ${reference})` : `Kora says the refund FAILED (ref ${reference}). The customer has not been paid back: refund them from the Kora dashboard or send the money yourself.` });
    if (state === "failed") await supabase.rpc("admin_alert", { p_key: `kora-refund-failed:${reference}`, p_title: "A Kora refund failed", p_body: `Order ${order.order_reference}: Kora could not pay the customer back. Open the order and refund them another way.`, p_link: "/admin/orders" });
  }
  return jsonResponse({ received: true, state });
}

const sessionHasMfa = (token: string) => { try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))?.aal === "aal2"; } catch { return false; } };

function refundEmailHtml(reference: string, amount: string, reason: string, method: string) {
  const timing = method === "wallet" ? "The amount is already back in your DataYego wallet." : method === "kora" ? "The amount is on its way back to the mobile money or card you paid with. This usually takes 24 to 48 working hours." : "The amount is on its way back to the card or mobile money you paid with — this usually takes 1–10 business days depending on your provider.";
  return `<!doctype html><html><body style="margin:0;background:#f2f7f4;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101e1c;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:18px;overflow:hidden;"><tr><td style="background:#0b1512;padding:18px 28px;"><span style="color:#7cf0b4;font-size:20px;font-weight:700;">DataYego</span></td></tr><tr><td style="padding:28px;"><p style="margin:0 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#c3762f;">Refund issued</p><h1 style="margin:0 0 14px;font-size:22px;">Your order ${reference} has been refunded</h1><p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#3c4a46;">We could not deliver this order, so we have refunded <strong>GHS ${amount}</strong>.</p><p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#3c4a46;">Reason: ${reason}</p><p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3c4a46;">${timing}</p><p style="margin:0;font-size:12px;line-height:1.6;color:#8a968f;">Questions? Just reply to this email or reach us on the site — we're happy to help.</p></td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const koraSignature = req.headers.get("x-korapay-signature");
    if (koraSignature) return await koraRefundWebhook(req, koraSignature);
    const supabase = createSupabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const orderReference = String(body.orderReference ?? "").trim().toUpperCase();
    if (!orderReference) return jsonResponse({ error: "orderReference is required" }, { status: 400 });

    let adminId: string | null = null;
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (token) {
      const { data: authData } = await supabase.auth.getUser(token);
      if (authData?.user) {
        const { data: admin } = await supabase.from("admin_users").select("user_id").eq("user_id", authData.user.id).eq("is_active", true).eq("role", "master").maybeSingle();
        if (admin) {
          if (!sessionHasMfa(token)) return jsonResponse({ error: "Two-factor verification required. Sign in to the admin panel again." }, { status: 403 });
          adminId = authData.user.id;
        }
      }
    }
    const isAuto = !adminId;
    // Without the owner's session, only the database's own nudge (which carries the internal secret) may ask for a refund.
    if (isAuto) {
      const given = req.headers.get("x-yiego-internal-secret") ?? "";
      const { data: secret } = await supabase.from("internal_secrets").select("value").eq("key", "cron").maybeSingle();
      if (!secret?.value || given.length !== secret.value.length || given !== secret.value) return jsonResponse({ error: "Not allowed" }, { status: 401 });
    }
    const reason = String(body.reason ?? "").trim().slice(0, 300) || (isAuto ? "Supplier out of stock" : "");
    if (!isAuto && !reason) return jsonResponse({ error: "A reason is required" }, { status: 400 });

    const { data: order } = await supabase.from("orders").select("id, order_reference, status, payment_status, admin_resolution_status, failure_reason, amount, guest_email, user_id, wallet_ledger_entry_id, paystack_reference").eq("order_reference", orderReference).maybeSingle();
    if (!order) return jsonResponse({ error: "order_not_found" }, { status: 404 });
    if (order.payment_status !== "succeeded") return jsonResponse({ error: "order_not_paid" }, { status: 409 });
    const verificationHold = !isAuto && order.status === "processing" && order.admin_resolution_status === "awaiting_verification";
    if (!ELIGIBLE.has(order.status) && !verificationHold) return jsonResponse({ error: `not_refundable_from_${order.status}` }, { status: 409 });
    if (isAuto && !/out of stock/i.test(order.failure_reason ?? "")) return jsonResponse({ skipped: "auto_only_for_out_of_stock" });

    // Which gateway took the money: the confirmed payment record says, not the order's checkout choice.
    const { data: paidIntent } = order.wallet_ledger_entry_id ? { data: null } : await supabase.from("payment_intents").select("provider, amount").eq("order_id", order.id).eq("status", "succeeded").order("verified_at", { ascending: false }).limit(1).maybeSingle();
    const viaKora = paidIntent?.provider === "kora";
    const reducedPolicy = body.policy === "mtn_verification_fee";
    if (reducedPolicy && (isAuto || !verificationHold || body.manual === true || order.wallet_ledger_entry_id || !order.paystack_reference || viaKora)) {
      return jsonResponse({ error: "The fee deduction applies only to Paystack orders held for MTN verification" }, { status: 409 });
    }
    const { data: priorRefund } = await supabase.from("order_events").select("id").eq("order_id", order.id).eq("event_type", "refund.completed").limit(1).maybeSingle();
    if (priorRefund) return jsonResponse({ error: "already_refunded" }, { status: 409 });

    // One actor at a time: the same lock every supplier send takes.
    const lockNow = new Date();
    const { data: locked } = await supabase.from("orders").update({ send_lock_until: new Date(lockNow.getTime() + REFUND_LOCK_MS).toISOString() })
      .eq("id", order.id).eq("status", order.status).eq("payment_status", "succeeded")
      .or(`send_lock_until.is.null,send_lock_until.lt.${lockNow.toISOString()}`).select("id");
    if (!locked?.length) return jsonResponse({ error: "Order is busy (supplier send or another refund). Try again shortly." }, { status: 409 });
    const release = () => supabase.from("orders").update({ send_lock_until: null }).eq("id", order.id);
    let refundedAmount = Number(order.amount);
    let retainedFee = 0;
    let method = "";
    let refundReference: string | null = null;
    try {
    if (!isAuto && body.manual === true) {
      refundReference = String(body.manualReference ?? "").trim().slice(0, 120) || null;
      if (!refundReference) return jsonResponse({ error: "manualReference is required for a manual refund" }, { status: 400 });
      method = "manual";
      await supabase.from("orders").update({ status: "refunded", payment_status: "refunded", refunded_at: new Date().toISOString(), refund_method: method, refund_reference: refundReference, refund_reason: reason, admin_resolution_status: null, admin_resolution_reason: null, updated_at: new Date().toISOString() }).eq("id", order.id);
    } else if (order.wallet_ledger_entry_id) {
      const { error } = await supabase.rpc("refund_order_to_wallet", { p_order_id: order.id, p_reason: reason });
      if (error) { await release(); return jsonResponse({ error: error.message }, { status: 500 }); }
      if (verificationHold) await supabase.from("orders").update({ admin_resolution_status: null, admin_resolution_reason: null }).eq("id", order.id);
      method = "wallet";
    } else if (viaKora && order.paystack_reference) {
      // Kora-paid: the order keeps Kora's payment reference in the same column Paystack orders use.
      if (!koraConfigured()) { await release(); return jsonResponse({ error: "kora_not_configured" }, { status: 500 }); }
      const charged = Number(paidIntent?.amount ?? 0);
      if (!(charged > 0)) { await release(); return jsonResponse({ error: "The Kora payment for this order could not be confirmed. No money moved." }, { status: 409 }); }
      if (charged < KORA_MIN_REFUND_GHS) { await release(); return jsonResponse({ error: `Kora cannot refund less than GHS ${KORA_MIN_REFUND_GHS}. Send the money yourself and record it as a manual refund.` }, { status: 409 }); }
      const slot = await koraRefundSlot(order.order_reference);
      if ("error" in slot) { await release(); return jsonResponse({ status: "refund_declined", detail: slot.error }, { status: 502 }); }
      if (slot.state === "free") {
        let accepted = false; let detail: string | null = null;
        try {
          const r = await initiateKoraRefund({ paymentReference: order.paystack_reference, reference: slot.reference, reason, webhookUrl: KORA_HOOK });
          accepted = r.ok && (r.state === "processing" || r.state === "success");
          detail = r.payload?.message ?? null;
        } catch (e) { detail = e instanceof Error ? e.message : "no answer"; }
        if (!accepted) {
          // The answer was lost or unclear: ask Kora whether this exact refund exists before deciding it did not happen.
          try { const again = await readKoraRefund(slot.reference); accepted = again.ok && (again.state === "processing" || again.state === "success"); } catch { /* still unknown */ }
        }
        if (!accepted) {
          // No clear yes. It may still have gone through, so nothing is marked; the next try asks Kora about this same reference first.
          await supabase.from("order_events").insert({ order_id: order.id, event_type: "refund.declined", from_status: order.status, to_status: order.status, message: `Kora refund not accepted: ${detail ?? "no answer"}. Nothing was marked refunded. Trying again is safe: the system asks Kora first, so the customer cannot be paid twice.`, metadata: { adminId, koraReference: slot.reference } });
          await release();
          return jsonResponse({ status: "refund_declined", detail }, { status: 502 });
        }
      }
      method = "kora";
      refundReference = slot.reference;
      await supabase.from("orders").update({ status: "refunded", payment_status: "refunded", refunded_at: new Date().toISOString(), refund_method: method, refund_reference: refundReference, refund_reason: reason, admin_resolution_status: null, admin_resolution_reason: null, updated_at: new Date().toISOString() }).eq("id", order.id);
    } else if (order.paystack_reference) {
      const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
      if (!secretKey) return jsonResponse({ error: "paystack_not_configured" }, { status: 500 });
      let refundPesewas: number | null = null;
      if (reducedPolicy) {
        const vr = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(order.paystack_reference)}`, { headers: { Authorization: `Bearer ${secretKey}` }, signal: AbortSignal.timeout(20000) });
        const vp = await vr.json().catch(() => null);
        const tx = vp?.data;
        if (!vr.ok || vp?.status !== true || tx?.status !== "success" || tx?.currency !== "GHS" || tx?.reference !== order.paystack_reference
          || !Number.isSafeInteger(tx?.amount) || !Number.isSafeInteger(tx?.fees) || tx.fees < 0 || tx.fees >= tx.amount || tx.amount < Math.round(Number(order.amount) * 100)) {
          await release();
          return jsonResponse({ error: "Paystack's actual fee could not be confirmed. No money moved." }, { status: 409 });
        }
        refundPesewas = tx.amount - tx.fees;
        if (!Number.isSafeInteger(body.refundPesewas) || body.refundPesewas !== refundPesewas) {
          await release();
          return jsonResponse({ error: "Refund amount changed. Refresh the quote. No money moved." }, { status: 409 });
        }
        refundedAmount = refundPesewas / 100;
        retainedFee = tx.fees / 100;
      }
      const res = await fetch("https://api.paystack.co/refund", { method: "POST", headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ transaction: order.paystack_reference, merchant_note: reason, ...(refundPesewas !== null ? { amount: refundPesewas } : {}) }) });
      const payload = await res.json().catch(() => null);
      if (!res.ok || payload?.status !== true) {
        await supabase.from("order_events").insert({ order_id: order.id, event_type: "refund.declined", from_status: order.status, to_status: order.status, message: `Paystack refund declined: ${payload?.message ?? res.status}. Use the manual refund if you send the money yourself.`, metadata: { httpStatus: res.status, adminId } });
        await release();
        return jsonResponse({ status: "refund_declined", detail: payload?.message ?? null }, { status: 502 });
      }
      method = "paystack";
      refundReference = payload?.data?.id != null ? String(payload.data.id) : order.paystack_reference;
      await supabase.from("orders").update({ status: "refunded", payment_status: "refunded", refunded_at: new Date().toISOString(), refund_method: method, refund_reference: refundReference, refund_reason: reason, admin_resolution_status: null, admin_resolution_reason: null, updated_at: new Date().toISOString() }).eq("id", order.id);
    } else {
      await release();
      return jsonResponse({ error: "no_payment_channel", hint: "Use the manual refund with a reference." }, { status: 409 });
    }
    } catch (e) { await release(); throw e; }
    await release();

    await supabase.from("order_events").insert({ order_id: order.id, event_type: "refund.completed", from_status: order.status, to_status: "refunded", message: `Refunded via ${method}${refundReference ? ` (ref ${refundReference})` : ""}${retainedFee > 0 ? ` — GHS ${refundedAmount.toFixed(2)} after Paystack fee GHS ${retainedFee.toFixed(2)}` : ""} — ${reason}`, metadata: { method, refundReference, adminId, auto: isAuto, ...(reducedPolicy ? { policy: "mtn_verification_fee", refundAmount: refundedAmount, retainedFee, customerAcceptanceNote: String(body.customerAcceptanceNote ?? "").slice(0, 500) } : {}) } });

    try {
      let to = order.guest_email as string | null;
      if (!to && order.user_id) { const { data: userData } = await supabase.auth.admin.getUserById(order.user_id); to = userData?.user?.email ?? null; }
      if (to) {
        const { data: already } = await supabase.from("order_events").select("id").eq("order_id", order.id).eq("event_type", "notification.refund_email_sent").maybeSingle();
        if (!already) {
          const sent = await sendEmail({ to, subject: `Refund issued — order ${order.order_reference}`, html: refundEmailHtml(order.order_reference, refundedAmount.toFixed(2), reason, method), replyTo: "support@yiego.shop" });
          if (!("skipped" in sent && sent.skipped)) await supabase.from("order_events").insert({ order_id: order.id, event_type: "notification.refund_email_sent", message: `Refund email sent to ${to}` });
        }
      }
    } catch { /* mail must never break money */ }

    return jsonResponse({ status: "refunded", method, refundReference, refundAmount: refundedAmount, retainedFee });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
