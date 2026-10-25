import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { calculateRefundQuote, validateRefundAgreement } from "../_shared/refundPolicy.ts";

// MTN verification fee deduction: refund-order re-verifies the actual fee, locks the order and books the retained fee.
const REDUCED_ENABLED = true;
const Body = z.object({
  orderReference: z.string().trim().min(3).max(120),
  action: z.enum(["quote", "refund"]).default("quote"),
  policy: z.enum(["full", "mtn_verification_fee"]).default("full"),
  reason: z.string().trim().max(300).optional(), expectedRefund: z.number().positive().optional(),
  supplierCreditConfirmed: z.boolean().optional(), supplierCreditNote: z.string().trim().max(500).optional(),
  customerAccepted: z.boolean().optional(), customerAcceptanceNote: z.string().trim().max(500).optional(),
  manual: z.boolean().optional(), manualReference: z.string().trim().max(120).optional(),
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const checked = <T>(result: { data: T; error: { message: string } | null }): T => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer /i, "");
  if (!token) return json({ error: "Authentication required" }, 401);
  try {
    const db = createSupabaseAdmin();
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user) return json({ error: "Invalid session" }, 401);
    const admin = checked(await db.from("admin_users").select("user_id").eq("user_id", auth.user.id).eq("is_active", true).maybeSingle());
    if (!admin) return json({ error: "Administrator required" }, 403);
    let aal = "";
    try { aal = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).aal; } catch { /* invalid token rejected above */ }
    if (aal !== "aal2") return json({ error: "Two-factor verification required" }, 403);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "Invalid refund request" }, 400);
    const b = parsed.data;
    const order = checked(await db.from("orders").select("*").eq("order_reference", b.orderReference.toUpperCase()).maybeSingle());
    if (!order) return json({ error: "Order not found" }, 404);
    if (order.payment_status !== "succeeded") return json({ error: "Order is not paid" }, 409);
    const hold = order.status === "processing" && order.admin_resolution_status === "awaiting_verification";
    if (!["paid", "failed_needs_review"].includes(order.status) && !hold) return json({ error: "This order is not eligible for a refund" }, 409);
    if (order.send_lock_until && new Date(order.send_lock_until).getTime() > Date.now()) return json({ error: "Supplier send is in progress" }, 409);
    // Fail closed on unavailable supplier history. A failure label alone is not recovered funds.
    const purchases = checked(await db.from("supplier_api_logs").select("created_at,call_status").eq("order_id", order.id).eq("action", "purchase").order("created_at", { ascending: false }));
    const events = checked(await db.from("order_events").select("created_at,event_type,metadata").eq("order_id", order.id).order("created_at", { ascending: false }));
    const last = purchases?.[0];
    const recovered = last && events?.some((e) => e.created_at > last.created_at && (
      ["supplier.refund_confirmed", "supplier.fallback", "supplier.awaiting_mtn_approval"].includes(e.event_type)
      || (e.event_type === "supplier.status_update" && ["refunded", "refund", "reversed", "cancelled", "canceled"].includes(String(e.metadata?.supplierStatus ?? e.metadata?.status ?? e.metadata?.confirmedStatus).toLowerCase()))));
    const unresolved = Boolean(last && !recovered && last.call_status !== "failed");
    const purchased = Boolean(purchases?.some((p) => p.call_status === "success"));
    const wallet = Boolean(order.wallet_ledger_entry_id);
    let paidPesewas: number | undefined;
    let feePesewas: number | undefined;
    if (!wallet) {
      if (!order.paystack_reference) return json({ error: "No supported payment channel found" }, 409);
      const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
      if (!secret) return json({ error: "Paystack is not configured" }, 503);
      const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(order.paystack_reference)}`, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(20000) });
      const payload = await res.json();
      const tx = payload?.data;
      const intent = checked(await db.from("payment_intents").select("amount").eq("order_id", order.id).eq("status", "succeeded").eq("provider", "paystack").order("verified_at", { ascending: false }).limit(1).maybeSingle());
      if (!res.ok || payload.status !== true || !intent || tx.status !== "success" || tx.currency !== "GHS" || tx.reference !== order.paystack_reference
        || typeof tx.amount !== "number" || Math.abs(tx.amount - Math.round(Number(intent.amount) * 100)) > 2) return json({ error: "Verified payment does not match this order" }, 409);
      paidPesewas = tx.amount;
      feePesewas = typeof tx.fees === "number" ? tx.fees : undefined;
    }
    // Manual credit confirmation can resolve an admin-reviewed supplier failure, never a verification fee exception.
    const manualRecovery = !hold && b.supplierCreditConfirmed === true && (b.supplierCreditNote?.length ?? 0) >= 5;
    const inputs = { wallet, orderAmount: Number(order.amount), paidPesewas, feePesewas, verificationHold: hold,
      supplierAttemptOpen: unresolved && !manualRecovery, supplierPurchased: purchased || Boolean(last), policy: b.policy, reducedEnabled: REDUCED_ENABLED };
    if (b.action === "quote") {
      const fullInputs = { ...inputs, policy: "full" as const, supplierAttemptOpen: false };
      const quote = calculateRefundQuote(fullInputs);
      let alternative = null;
      if (hold && !wallet && !unresolved) {
        try { alternative = calculateRefundQuote({ ...inputs, policy: "mtn_verification_fee", reducedEnabled: true }); } catch { /* no guessed fee */ }
      }
      return json({ quote, alternative, reducedEnabled: REDUCED_ENABLED,
        blockedReason: hold && unresolved ? "A supplier purchase is still unresolved. Confirm recovery before any refund." : null });
    }
    const quote = calculateRefundQuote(inputs);
    validateRefundAgreement(quote, b);
    if (!b.reason || b.expectedRefund === undefined || Math.round(b.expectedRefund * 100) !== Math.round(quote.refund * 100)) return json({ error: "Refresh the quote and confirm its amount and reason" }, 409);
    if (b.manual && (!b.manualReference || b.policy !== "full")) return json({ error: "Manual refunds require a full refund and transfer reference" }, 400);
    // refund-order stays the money authority; it re-verifies the fee and amount before refunding.
    const { data, error } = await db.functions.invoke("refund-order", {
      headers: { Authorization: `Bearer ${token}` },
      body: { orderReference: order.order_reference, reason: b.reason, ...(b.manual ? { manual: true, manualReference: b.manualReference } : {}),
        ...(quote.policy === "mtn_verification_fee" ? { policy: "mtn_verification_fee", refundPesewas: Math.round(quote.refund * 100), customerAcceptanceNote: b.customerAcceptanceNote } : {}) },
    });
    if (error || data?.error) return json({ error: "Refund could not be confirmed. Review the order before retrying." }, 409);
    checked(await db.from("order_events").insert({ order_id: order.id, event_type: "refund.policy_confirmation", message: quote.policy === "mtn_verification_fee" ? "Administrator confirmed the fee-deducted refund the customer accepted" : "Administrator confirmed the full refund quote", metadata: { adminId: auth.user.id, quote, supplierCreditNote: b.supplierCreditNote, customerAcceptanceNote: b.customerAcceptanceNote, manualReference: b.manualReference } }));
    return json(data);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Refund quote is unavailable" }, 409); }
});