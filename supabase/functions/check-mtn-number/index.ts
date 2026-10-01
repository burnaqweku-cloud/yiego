import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import * as hub from "../_shared/databundleshub.ts";

/* Public MTN number check and "submit for verification".
   { action: "check", numbers: [...] }  -> status per number (DBH beneficiary list; 10-minute memory)
   { action: "submit", number }         -> re-checks, then makes the one DBH purchase attempt that puts an
                                           unapproved number on MTN's list. Nothing is charged. Once per number per day.
   No login, no per-user limits. */

const MTN = ["024", "025", "053", "054", "055", "059"];
const normalize = (v: string) => { const d = String(v ?? "").replace(/\D/g, ""); return d.startsWith("233") ? `0${d.slice(3)}` : d; };
const isMtn = (n: string) => n.length === 10 && n.startsWith("0") && MTN.includes(n.slice(0, 3));
type Status = "approved" | "not_approved" | "unapproved" | "blocked" | "not_enforced";
interface Result { msisdn: string; status: Status | "invalid" | "not_mtn"; message: string | null }

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createSupabaseAdmin();
    const action = String(body.action ?? "check");

    // ---- check ----------------------------------------------------------
    const fetchStatuses = async (numbers: string[]): Promise<Map<string, Result>> => {
      const out = new Map<string, Result>();
      const toAsk: string[] = [];
      const { data: cached } = await supabase.from("beneficiary_checks").select("msisdn, status, message, checked_at").in("msisdn", numbers);
      const fresh = new Date(Date.now() - 10 * 60_000).toISOString();
      for (const n of numbers) {
        const c = (cached ?? []).find((x: { msisdn: string; checked_at: string }) => x.msisdn === n && x.checked_at >= fresh);
        if (c) out.set(n, { msisdn: n, status: c.status, message: c.message }); else toAsk.push(n);
      }
      for (let i = 0; i < toAsk.length; i += 100) {
        const chunk = toAsk.slice(i, i + 100);
        const r = await hub.checkBeneficiaries(chunk);
        const rows = Array.isArray(r.payload?.data) ? r.payload!.data as Array<{ msisdn?: string; status?: string; message?: string | null }> : [];
        if (!r.ok) { for (const n of chunk) out.set(n, { msisdn: n, status: "not_approved", message: "Could not reach the supplier. Try again in a moment." }); continue; }
        const now = new Date().toISOString();
        for (const n of chunk) {
          const row = rows.find((x) => normalize(String(x.msisdn ?? "")) === n);
          const status = (row?.status ?? (r.payload?.enforced === false ? "not_enforced" : "not_approved")) as Status;
          out.set(n, { msisdn: n, status, message: row?.message ?? null });
          await supabase.from("beneficiary_checks").upsert({ msisdn: n, status, message: row?.message ?? null, checked_at: now });
        }
      }
      return out;
    };

    if (action === "check") {
      const raw: string[] = Array.isArray(body.numbers) ? body.numbers : [body.number ?? ""];
      const seen = new Set<string>(); const results: Result[] = []; const valid: string[] = [];
      for (const v of raw.slice(0, 100)) {
        const n = normalize(String(v)); if (!n || seen.has(n)) continue; seen.add(n);
        if (n.length !== 10 || !n.startsWith("0")) results.push({ msisdn: n, status: "invalid", message: null });
        else if (!isMtn(n)) results.push({ msisdn: n, status: "not_mtn", message: null });
        else valid.push(n);
      }
      const statuses = await fetchStatuses(valid);
      for (const n of valid) results.push(statuses.get(n)!);
      // Numbers we have already delivered to are approved by definition.
      const { data: delivered } = valid.length ? await supabase.from("orders").select("recipient_phone_normalized").in("recipient_phone_normalized", valid).eq("status", "delivered").limit(valid.length) : { data: [] };
      const known = new Set((delivered ?? []).map((o: { recipient_phone_normalized: string }) => o.recipient_phone_normalized));
      for (const r of results) if (known.has(r.msisdn) && r.status !== "blocked") { r.status = "approved"; r.message = null; }
      const { data: submitted } = valid.length ? await supabase.from("submitted_numbers").select("msisdn, status, submitted_at").in("msisdn", valid) : { data: [] };
      return jsonResponse({ results: results.map((r) => ({ ...r, submitted: (submitted ?? []).find((s: { msisdn: string }) => s.msisdn === r.msisdn)?.submitted_at ?? null })) });
    }

    // ---- submit for verification ----------------------------------------
    if (action === "submit") {
      const raw: string[] = Array.isArray(body.numbers) ? body.numbers : [body.number ?? ""];
      const source = ["shop", "checker", "checker_bulk", "checkout"].includes(String(body.source)) ? String(body.source) : "shop";
      const numbers = [...new Set(raw.slice(0, 100).map((v) => normalize(String(v))))].filter(isMtn);
      if (numbers.length === 0) return jsonResponse({ error: "No valid MTN numbers" }, { status: 400 });
      // fresh look, no memory: we must not attempt a purchase for a number that just got approved
      await supabase.from("beneficiary_checks").delete().in("msisdn", numbers);
      const statuses = await fetchStatuses(numbers);
      const { data: existing } = await supabase.from("submitted_numbers").select("msisdn, submitted_at, status").in("msisdn", numbers);
      const dayAgo = Date.now() - 24 * 3_600_000;
      const outcomes: Array<{ msisdn: string; outcome: string; message?: string | null }> = [];
      for (const n of numbers) {
        const st = statuses.get(n)?.status;
        const prev = (existing ?? []).find((x: { msisdn: string }) => x.msisdn === n);
        if (st === "approved" || st === "not_enforced") { outcomes.push({ msisdn: n, outcome: "already_approved" }); continue; }
        if (st === "blocked") { outcomes.push({ msisdn: n, outcome: "blocked" }); continue; }
        if (st === "unapproved" || (prev && new Date(prev.submitted_at).getTime() > dayAgo)) {
          // Already on MTN's list (or submitted today): record it so it shows in the admin list, nothing else.
          if (!prev) await supabase.from("submitted_numbers").insert({ msisdn: n, source, status: "pending", dbh_message: statuses.get(n)?.message ?? null, last_checked_at: new Date().toISOString() });
          outcomes.push({ msisdn: n, outcome: "already_submitted" }); continue;
        }
        // The one purchase attempt that puts the number on MTN's list. DBH refuses unapproved numbers (422) and charges nothing.
        const r = await hub.purchase({ phoneNumber: n, capacityGb: 1, idempotencyKey: crypto.randomUUID() });
        const msg = r.payload?.message ?? r.payload?.error ?? null;
        const accepted = r.ok && ((r.payload?.data as { requestId?: number; purchaseId?: number } | undefined)?.requestId != null || (r.payload?.data as { purchaseId?: number } | undefined)?.purchaseId != null);
        await supabase.from("supplier_api_logs").insert({ supplier_id: (await supabase.from("suppliers").select("id").eq("code", "databundleshub").maybeSingle()).data?.id ?? null, action: "submit_for_verification", endpoint: "/api/developer/purchase", request_payload: { phoneNumber: n, capacity: "1", purpose: "submit_for_verification", source }, response_payload: r.payload ?? {}, http_status: r.status, call_status: accepted ? "success" : "error", error_message: accepted ? "UNEXPECTED: purchase accepted during verification submit" : msg, duration_ms: r.durationMs });
        if (accepted) { outcomes.push({ msisdn: n, outcome: "already_approved", message: "Number was approved; a 1GB bundle was sent to it." }); continue; }
        const onList = /not approved|saved for approval|beneficiary/i.test(String(msg ?? "")) || r.status === 422;
        await supabase.from("submitted_numbers").upsert({ msisdn: n, source, status: "pending", dbh_message: msg, last_checked_at: new Date().toISOString(), submitted_at: new Date().toISOString(), submit_count: (prev?.submit_count ?? 0) + 1 }, { onConflict: "msisdn" });
        outcomes.push({ msisdn: n, outcome: onList ? "submitted" : "submitted_unconfirmed", message: msg });
      }
      return jsonResponse({ outcomes });
    }
    return jsonResponse({ error: "Unsupported action" }, { status: 400 });
  } catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 }); }
});
