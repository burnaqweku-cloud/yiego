import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { verifyPaystackTransaction } from "../_shared/paystack.ts";

/* Backup for domain payments (18 Nov 2026). Paystack's signal normally marks a domain order paid
   (paystack-webhook -> payment_events -> zz_payment_events_domain_trg). If that signal never arrives, this asks
   Paystack directly about each domain payment still waiting. When Paystack says it succeeded, it records the same
   charge.success event the signal would have, so the same database step marks the order paid, books
   "Domains paid, not yet completed" and alerts the admins. That step only acts on a pending order, so a late
   signal after this (or this after a signal) never books anything twice.
     POST + internal secret {}                              every 5 minutes: waiting domain payments from the last 3 days
     POST + internal secret { days: 60, dryRun: true }      report only, nothing written */

interface Intent { id: string; amount: number | string; currency: string | null; provider_reference: string; created_at: string; metadata: Record<string, unknown> | null }

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const db = createSupabaseAdmin();
    const denied = await requireCronSecret(req, db); if (denied) return denied;
    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body.days) || 3, 1), 90);
    const dryRun = body.dryRun === true;

    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const settle = new Date(Date.now() - 2 * 60_000).toISOString(); // give Paystack's own signal two minutes first
    const { data: intents, error } = await db.from("payment_intents")
      .select("id, amount, currency, provider_reference, created_at, metadata")
      .eq("provider", "paystack").eq("purpose", "domain_purchase").eq("status", "pending")
      .gte("created_at", since).lte("created_at", settle)
      .order("created_at", { ascending: true }).limit(50);
    if (error) return jsonResponse({ error: error.message }, { status: 500 });

    const results: Record<string, unknown>[] = [];
    for (const i of (intents ?? []) as Intent[]) {
      const ref = i.provider_reference; const domain = i.metadata?.domain ?? null;
      const { data: seen } = await db.from("payment_events").select("id")
        .eq("provider", "paystack").eq("event_type", "charge.success").eq("provider_reference", ref).maybeSingle();
      if (seen) { results.push({ ref, domain, result: "signal_already_recorded_needs_review" }); continue; }

      const v = await verifyPaystackTransaction(ref);
      const d = v.payload?.data;
      if (!v.ok || !d) { results.push({ ref, domain, result: "paystack_lookup_failed", http: v.status, message: v.payload?.message ?? null }); continue; }
      if (d.status !== "success") { results.push({ ref, domain, result: "not_paid", paystack: d.status }); continue; }
      const paid = Number(d.amount) / 100;
      if (d.currency !== "GHS" || paid + 0.005 < Number(i.amount)) { results.push({ ref, domain, result: "amount_mismatch", paid, expected: Number(i.amount), currency: d.currency }); continue; }
      if (dryRun) { results.push({ ref, domain, result: "paid_would_record", paid, paidAt: d.paid_at ?? null }); continue; }

      const { error: insErr } = await db.from("payment_events").insert({
        provider: "paystack", event_type: "charge.success", provider_reference: ref, payment_intent_id: i.id,
        payload: { event: "charge.success", data: d, recovered_by: "domain-payment-check" },
      });
      if (insErr && insErr.code !== "23505") { results.push({ ref, domain, result: "record_failed", error: insErr.message }); continue; }
      const { data: after } = await db.from("payment_intents").select("status").eq("id", i.id).maybeSingle();
      results.push({ ref, domain, result: after?.status === "succeeded" ? "recorded_paid" : "recorded_not_applied", paid });
    }
    return jsonResponse({ checked: results.length, dryRun, results });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
});