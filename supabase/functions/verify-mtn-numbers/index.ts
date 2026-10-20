import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import * as hub from "../_shared/databundleshub.ts";

/* Hourly. Asks DBH which held MTN numbers are now approved.
   - Verification-queue orders whose number is approved are MARKED approved and left in the queue for an admin to
     press Retry. They are never re-sent automatically (19 Oct: automatic re-sends bought 123 orders twice).
   - Submitted numbers (no order) are simply marked approved. */
const normalize = (v: string) => { const d = String(v ?? "").replace(/\D/g, ""); return d.startsWith("233") ? `0${d.slice(3)}` : d; };

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const supabase = createSupabaseAdmin();
    const denied = await requireCronSecret(req, supabase); if (denied) return denied;
    const { data: dbh } = await supabase.from("suppliers").select("id").eq("code", "databundleshub").maybeSingle();
    // The approval is on DBH's channel, so the re-send goes through DBH (its resend loop sends by its own supplier id,
    // whichever supplier is "main" for MTN at the time).
    const targetId = dbh?.id ?? null; const targetName = "DataBundlesHub";
    const { data: queue } = await supabase.from("orders").select("id, order_reference, recipient_phone, supplier_purchase_id, admin_resolution_reason").eq("admin_resolution_status", "awaiting_verification").eq("status", "processing").eq("payment_status", "succeeded");
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

    // Approved numbers are NOT re-sent automatically any more (19 Oct: automatic re-sends bought 123 orders twice).
    // The order stays in the verification queue, marked approved; an admin presses Retry when ready.
    const approved: string[] = [];
    for (const o of (queue ?? []) as Array<{ id: string; order_reference: string; recipient_phone: string; supplier_purchase_id: string | null; admin_resolution_reason: string | null }>) {
      const s = status.get(normalize(o.recipient_phone));
      if (!s || (s.status !== "approved" && s.status !== "not_enforced")) continue;
      if ((o.admin_resolution_reason ?? "").startsWith("MTN approved")) continue; // already marked on an earlier run
      const stamp = new Date().toLocaleString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      await supabase.from("orders").update({ admin_resolution_reason: `MTN approved this number on ${stamp}. Not sent again automatically: open the order and press Retry.`, admin_resolution_updated_at: now, updated_at: now }).eq("id", o.id);
      await supabase.from("order_events").insert({ order_id: o.id, event_type: "supplier.number_approved", from_status: "processing", to_status: "processing", message: `MTN has approved this number. Waiting for an admin to press Retry; nothing was sent.${o.supplier_purchase_id ? ` Earlier ${targetName} attempt ${o.supplier_purchase_id} left as is.` : ""}`, metadata: { source: "verify-mtn-numbers", autoResend: false } });
      approved.push(o.order_reference);
    }
    const approvedSubmitted: string[] = [];
    for (const sN of (submitted ?? []) as Array<{ msisdn: string }>) {
      const s = status.get(sN.msisdn);
      if (!s) continue;
      if (s.status === "approved" || s.status === "not_enforced") { await supabase.from("submitted_numbers").update({ status: "approved", approved_at: now, last_checked_at: now, dbh_message: null }).eq("msisdn", sN.msisdn); approvedSubmitted.push(sN.msisdn); }
      else if (s.status === "blocked") await supabase.from("submitted_numbers").update({ status: "blocked", last_checked_at: now, dbh_message: s.message }).eq("msisdn", sN.msisdn);
      else await supabase.from("submitted_numbers").update({ last_checked_at: now, dbh_message: s.message }).eq("msisdn", sN.msisdn);
    }
    return jsonResponse({ checked: numbers.length, queueOrders: (queue ?? []).length, approved, approvedSubmitted });
  } catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 }); }
});
