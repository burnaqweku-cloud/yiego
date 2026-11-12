import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import * as hub from "../_shared/databundleshub.ts";

/* Public MTN number check and "submit for verification".
   { action: "check", numbers: [...] }  -> status per number (DBH beneficiary list; 10-minute memory)
   { action: "submit", number }         -> re-checks, then makes the one DBH purchase attempt that puts an
                                           unapproved number on MTN's list. Nothing is charged. Once per number per day.
   No login. 13 Nov 2026, because the submit step is a real purchase request to the supplier:
   - it is only made when the supplier itself has just answered "not approved". If the supplier could not be
     reached, nothing is attempted (an approved number must never be sent a real bundle by mistake);
   - each visitor may submit a limited number of new numbers a day (phase1.number_submit_allow: 100 per visitor,
     1,000 overall). Admins are not limited. The saved answers are only refreshed for numbers inside that allowance. */

const MTN = ["024", "025", "053", "054", "055", "059"];
const normalize = (v: string) => { const d = String(v ?? "").replace(/\D/g, ""); return d.startsWith("233") ? `0${d.slice(3)}` : d; };
const isMtn = (n: string) => n.length === 10 && n.startsWith("0") && MTN.includes(n.slice(0, 3));
type Status = "approved" | "not_approved" | "unapproved" | "blocked" | "not_enforced";
/** failed = the supplier did not answer, so the status shown is only a placeholder. Never sent to the browser. */
interface Result { msisdn: string; status: Status | "invalid" | "not_mtn"; message: string | null; failed?: boolean }

async function sha256Hex(value: string) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join(""); }
function clientIp(req: Request) { return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"; }

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createSupabaseAdmin();
    const action = String(body.action ?? "check");

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
        let r: Awaited<ReturnType<typeof hub.checkBeneficiaries>> | null = null;
        try { r = await hub.checkBeneficiaries(chunk); } catch { /* no answer: handled below */ }
        const rows = Array.isArray(r?.payload?.data) ? r!.payload!.data as Array<{ msisdn?: string; status?: string; message?: string | null }> : [];
        if (!r?.ok) { for (const n of chunk) out.set(n, { msisdn: n, status: "not_approved", message: "Could not reach the supplier. Try again in a moment.", failed: true }); continue; }
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
      const { data: delivered } = valid.length ? await supabase.from("orders").select("recipient_phone_normalized").in("recipient_phone_normalized", valid).eq("status", "delivered").limit(valid.length) : { data: [] };
      const known = new Set((delivered ?? []).map((o: { recipient_phone_normalized: string }) => o.recipient_phone_normalized));
      for (const r of results) if (known.has(r.msisdn) && r.status !== "blocked") { r.status = "approved"; r.message = null; }
      const { data: submitted } = valid.length ? await supabase.from("submitted_numbers").select("msisdn, status, submitted_at").in("msisdn", valid) : { data: [] };
      return jsonResponse({ results: results.map((r) => ({ msisdn: r.msisdn, status: r.status, message: r.message, submitted: (submitted ?? []).find((s: { msisdn: string }) => s.msisdn === r.msisdn)?.submitted_at ?? null })) });
    }

    if (action === "submit") {
      const raw: string[] = Array.isArray(body.numbers) ? body.numbers : [body.number ?? ""];
      const source = ["shop", "checker", "checker_bulk", "checkout"].includes(String(body.source)) ? String(body.source) : "shop";
      const numbers = [...new Set(raw.slice(0, 100).map((v) => normalize(String(v))))].filter(isMtn);
      if (numbers.length === 0) return jsonResponse({ error: "No valid MTN numbers" }, { status: 400 });
      const { data: existing } = await supabase.from("submitted_numbers").select("msisdn, submitted_at, status, submit_count").in("msisdn", numbers);
      const prevOf = (n: string) => (existing ?? []).find((x: { msisdn: string }) => x.msisdn === n) as { submitted_at: string; submit_count: number | null } | undefined;
      const dayAgo = Date.now() - 24 * 3_600_000;
      const outcomes: Array<{ msisdn: string; outcome: string; message?: string | null }> = [];
      /* Deals with a number that needs no purchase attempt. False = the supplier says "not approved" and it was not submitted today. */
      const settled = async (n: string, r: Result | undefined): Promise<boolean> => {
        const st = r?.status; const prev = prevOf(n);
        if (st === "approved" || st === "not_enforced") { outcomes.push({ msisdn: n, outcome: "already_approved" }); return true; }
        if (st === "blocked") { outcomes.push({ msisdn: n, outcome: "blocked" }); return true; }
        if (st === "unapproved" || (prev && new Date(prev.submitted_at).getTime() > dayAgo)) {
          if (!prev) await supabase.from("submitted_numbers").insert({ msisdn: n, source, status: "pending", dbh_message: r?.message ?? null, last_checked_at: new Date().toISOString() });
          outcomes.push({ msisdn: n, outcome: "already_submitted" }); return true;
        }
        // No answer from the supplier: we do not know this number is unapproved, so no purchase request is made.
        if (!r || r.failed || st !== "not_approved") { outcomes.push({ msisdn: n, outcome: "try_later" }); return true; }
        return false;
      };

      // First sort with what we already know (answers up to 10 minutes old are fine for this).
      const known = await fetchStatuses(numbers);
      const wanting: string[] = [];
      for (const n of numbers) if (!(await settled(n, known.get(n)))) wanting.push(n);

      // The daily allowance: how many of these this visitor may still submit today.
      let allowed = wanting.length;
      if (wanting.length && !(await isAdmin(req, supabase))) {
        const ipHash = await sha256Hex(clientIp(req) + "|" + (Deno.env.get("RATE_LIMIT_SALT") ?? "yiego-number-submit"));
        const { data, error } = await supabase.rpc("number_submit_allow", { p_ip_hash: ipHash, p_wanted: wanting.length });
        if (error) { for (const n of wanting) outcomes.push({ msisdn: n, outcome: "try_later" }); return jsonResponse({ outcomes }); }
        allowed = Math.max(0, Math.min(wanting.length, Number(data ?? 0)));
      }
      for (const n of wanting.slice(allowed)) outcomes.push({ msisdn: n, outcome: "limit_reached" });
      const go = wanting.slice(0, allowed);

      if (go.length) {
        // Ask the supplier again right now: a number approved a minute ago must not get a real bundle.
        await supabase.from("beneficiary_checks").delete().in("msisdn", go);
        const fresh = await fetchStatuses(go);
        const { data: dbh } = await supabase.from("suppliers").select("id").eq("code", "databundleshub").maybeSingle();
        for (const n of go) {
          if (await settled(n, fresh.get(n))) continue;
          const prev = prevOf(n);
          const r = await hub.purchase({ phoneNumber: n, capacityGb: 1, idempotencyKey: crypto.randomUUID() });
          const msg = r.payload?.message ?? r.payload?.error ?? null;
          const d = r.payload?.data as { requestId?: number; purchaseId?: number } | undefined;
          const accepted = r.ok && (d?.requestId != null || d?.purchaseId != null);
          await supabase.from("supplier_api_logs").insert({ supplier_id: dbh?.id ?? null, action: "submit_for_verification", endpoint: "/api/developer/purchase", request_payload: { phoneNumber: n, capacity: "1", purpose: "submit_for_verification", source }, response_payload: r.payload ?? {}, http_status: r.status, call_status: accepted ? "success" : "error", error_message: accepted ? "UNEXPECTED: purchase accepted during verification submit" : msg, duration_ms: r.durationMs });
          if (accepted) { outcomes.push({ msisdn: n, outcome: "already_approved", message: "Number was approved; a 1GB bundle was sent to it." }); continue; }
          const onList = /not approved|saved for approval|beneficiary/i.test(String(msg ?? "")) || r.status === 422;
          await supabase.from("submitted_numbers").upsert({ msisdn: n, source, status: "pending", dbh_message: msg, last_checked_at: new Date().toISOString(), submitted_at: new Date().toISOString(), submit_count: (prev?.submit_count ?? 0) + 1 }, { onConflict: "msisdn" });
          outcomes.push({ msisdn: n, outcome: onList ? "submitted" : "submitted_unconfirmed", message: msg });
        }
      }
      return jsonResponse({ outcomes });
    }
    return jsonResponse({ error: "Unsupported action" }, { status: 400 });
  } catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 }); }
});

/** An active admin, signed in. Anyone else (including the public site key) is a visitor. */
// deno-lint-ignore no-explicit-any
async function isAdmin(req: Request, supabase: any): Promise<boolean> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer /i, "");
  if (!token || token.split(".").length !== 3) return false;
  try {
    const { data } = await supabase.auth.getUser(token);
    if (!data?.user) return false;
    const { data: admin } = await supabase.from("admin_users").select("user_id").eq("user_id", data.user.id).eq("is_active", true).maybeSingle();
    return Boolean(admin);
  } catch { return false; }
}
