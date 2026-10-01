import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import * as hub from "../_shared/databundleshub.ts";

/* Hourly. Asks DBH which held MTN numbers are now approved.
   - Verification-queue orders whose number is approved are re-sent (the DBH resend loop picks them up).
   - Submitted numbers (no order) are simply marked approved.
   Nothing else is retried. */
const normalize = (v: string) => { const d = String(v ?? "").replace(/\D/g, ""); return d.startsWith("233") ? `0${d.slice(3)}` : d; };

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const supabase = createSupabaseAdmin();
    const denied = await requireCronSecret(req, supabase); if (denied) return denied;
    const { data: dbh } = await supabase.from("suppliers").select("id").eq("code", "databundleshub").maybeSingle();
    const { data: queue } = await supabase.from("orders").select("id, order_reference, recipient_phone, supplier_purchase_id").eq("admin_resolution_status", "awaiting_verification").eq("status", "processing").eq("payment_status", "succeeded");
    const { data: submitted } = await supabase.from("submitted_numbers").select("msisdn").eq("status", "pending");
    const numbers = [...new Set([...(queue ?? []).map((o: { recipient_phone: string }) => normalize(o.recipient_phone)), ...(submitted ?? []).map((s: { msisdn: string }) => s.msisdn)])];
    const status = new Map<string, { status: string; message: string | null }>();
    for (let i = 0; i < numbers.length; i += 100) {
      const chunk = numbers.slice(i, i + 100);
      const r = await hub.checkBeneficiaries(chunk);
      const rows = Array.isArray(r.payload?.data) ? r.payload!.data as Array<{ msisdn?: string; status?: string; message?: string | null }> : [];
      if (!r.ok) continue;
      for (const row of rows) status.set(normalize(String(row.msisdn ?? "")), { status: String(row.status ?? "not_approved"), message: row.message ?? null });
    }
    const now = new Date().toISOString();
    for (const [n, s] of status) await supabase.from("beneficiary_checks").upsert({ msisdn: n, status: s.status, message: s.message, checked_at: now });

    const resent: string[] = [];
    for (const o of (queue ?? []) as Array<{ id: string; order_reference: string; recipient_phone: string; supplier_purchase_id: string | null }>) {
      const s = status.get(normalize(o.recipient_phone));
      if (!s || (s.status !== "approved" && s.status !== "not_enforced")) continue;
      await supabase.from("orders").update({ supplier_purchase_id: null, supplier_order_reference: null, supplier_transaction_reference: null, supplier_status: null, supplier_idempotency_key: null, failure_reason: null, supplier_id: dbh?.id ?? null, supplier_retry_after: now, supplier_retry_count: 0, updated_at: now }).eq("id", o.id);
      await supabase.from("order_events").insert({ order_id: o.id, event_type: "supplier.number_approved", from_status: "processing", to_status: "processing", message: "MTN has approved this number. Re-sending to DataBundlesHub now." + (o.supplier_purchase_id ? ` Previous attempt ${o.supplier_purchase_id} set aside.` : ""), metadata: { source: "verify-mtn-numbers" } });
      resent.push(o.order_reference);
    }
    const approvedSubmitted: string[] = [];
    for (const sN of (submitted ?? []) as Array<{ msisdn: string }>) {
      const s = status.get(sN.msisdn);
      if (!s) continue;
      if (s.status === "approved" || s.status === "not_enforced") { await supabase.from("submitted_numbers").update({ status: "approved", approved_at: now, last_checked_at: now, dbh_message: null }).eq("msisdn", sN.msisdn); approvedSubmitted.push(sN.msisdn); }
      else if (s.status === "blocked") await supabase.from("submitted_numbers").update({ status: "blocked", last_checked_at: now, dbh_message: s.message }).eq("msisdn", sN.msisdn);
      else await supabase.from("submitted_numbers").update({ last_checked_at: now, dbh_message: s.message }).eq("msisdn", sN.msisdn);
    }
    return jsonResponse({ checked: numbers.length, queueOrders: (queue ?? []).length, resent, approvedSubmitted });
  } catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 }); }
});
