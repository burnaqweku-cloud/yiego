import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import * as hub from "../_shared/databundleshub.ts";
import { fulfillOrder } from "../_shared/fulfillment.ts";
import { z } from "npm:zod@3.25.76";

/* Admin → MTN verification. Nothing here runs on a schedule; an admin presses every button.

   { action: "check_all" }            ask DBH, in batches of 100, which held numbers (orders + submitted numbers) are approved.
                                      Writes the report; sends nothing.
   { action: "send", orderIds: [] }   send approved orders to DBH, each exactly once. Guards, in order:
                                        1. a lock row per order (unique) — a second press, a second admin or a refresh does nothing;
                                        2. the number must be approved by DBH on the latest check (not older than 24h);
                                        3. if the order already has a DBH attempt, DBH is asked about it: a live or delivered
                                           attempt is adopted, never bought again;
                                        4. no successful DBH purchase to the same number in the last 10 minutes;
                                        5. fulfillOrder's own "already sent" check on top.
                                      Every outcome is written on the lock row and in the order timeline with the admin's id. */

const sessionHasMfa = (token: string) => { try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))?.aal === "aal2"; } catch { return false; } };
const normalize = (v: string) => { const d = String(v ?? "").replace(/\D/g, ""); return d.startsWith("233") ? `0${d.slice(3)}` : d; };
const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("check_all") }).strict(),
  z.object({ action: z.literal("send"), orderIds: z.array(z.string().uuid()).min(1).max(100) }).strict(),
]);
const CHECK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RECENT_PURCHASE_MS = 10 * 60 * 1000;

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return jsonResponse({ error: "Authentication required" }, { status: 401 });
    const db = createSupabaseAdmin();
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user) return jsonResponse({ error: "Invalid session" }, { status: 401 });
    const { data: admin } = await db.from("admin_users").select("user_id").eq("user_id", auth.user.id).eq("is_active", true).maybeSingle();
    if (!admin) return jsonResponse({ error: "Admin access required" }, { status: 403 });
    if (!sessionHasMfa(token)) return jsonResponse({ error: "Two-factor verification required. Sign in to the admin panel again." }, { status: 403 });
    const adminId = auth.user.id;

    const parsed = Input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonResponse({ error: "Invalid request" }, { status: 400 });
    const input = parsed.data;
    const { data: dbh } = await db.from("suppliers").select("id, name").eq("code", "databundleshub").maybeSingle();
    if (!dbh) return jsonResponse({ error: "DataBundlesHub is not set up" }, { status: 500 });

    /* ── Check all ─────────────────────────────────────────────────────────────── */
    if (input.action === "check_all") {
      const { data: queue } = await db.from("orders").select("id, order_reference, recipient_phone").eq("admin_resolution_status", "awaiting_verification").eq("status", "processing").eq("payment_status", "succeeded");
      const { data: submitted } = await db.from("submitted_numbers").select("msisdn").eq("status", "pending");
      const numbers = [...new Set([...(queue ?? []).map((o: { recipient_phone: string }) => normalize(o.recipient_phone)), ...(submitted ?? []).map((s: { msisdn: string }) => normalize(s.msisdn))])].filter((n) => /^0\d{9}$/.test(n));
      const status = new Map<string, { status: string; message: string | null }>();
      let batches = 0; const failedBatches: number[] = [];
      for (let i = 0; i < numbers.length; i += 100) {
        const chunk = numbers.slice(i, i + 100); batches += 1;
        const r = await hub.checkBeneficiaries(chunk);
        await db.from("supplier_api_logs").insert({ supplier_id: dbh.id, action: "check_beneficiaries", endpoint: "/api/beneficiaries/check", request_payload: { count: chunk.length, batch: batches, by: adminId }, response_payload: r.payload ?? {}, call_status: r.ok ? "success" : "error", http_status: r.status ?? null, duration_ms: r.durationMs ?? null });
        if (!r.ok) { failedBatches.push(batches); continue; }
        const rows = Array.isArray(r.payload?.data) ? r.payload!.data as Array<{ msisdn?: string; status?: string; message?: string | null }> : [];
        for (const row of rows) status.set(normalize(String(row.msisdn ?? "")), { status: String(row.status ?? "not_approved").toLowerCase(), message: row.message ?? null });
      }
      const now = new Date().toISOString();
      for (const [n, s] of status) await db.from("beneficiary_checks").upsert({ msisdn: n, status: s.status, message: s.message, checked_at: now });

      const isApproved = (s?: { status: string }) => Boolean(s && (s.status === "approved" || s.status === "not_enforced"));
      // Submitted numbers: record what DBH said.
      for (const sN of (submitted ?? []) as Array<{ msisdn: string }>) {
        const s = status.get(normalize(sN.msisdn)); if (!s) continue;
        if (isApproved(s)) await db.from("submitted_numbers").update({ status: "approved", approved_at: now, last_checked_at: now, dbh_message: null }).eq("msisdn", sN.msisdn);
        else if (s.status === "blocked") await db.from("submitted_numbers").update({ status: "blocked", last_checked_at: now, dbh_message: s.message }).eq("msisdn", sN.msisdn);
        else await db.from("submitted_numbers").update({ last_checked_at: now, dbh_message: s.message }).eq("msisdn", sN.msisdn);
      }
      // Held orders: mark approved ones (reason text only; nothing is sent) and log once per approval.
      const report: Array<{ phone: string; status: string; message: string | null; orders: string[] }> = [];
      let approved = 0, notYet = 0, blocked = 0, unknown = 0;
      const byNumber = new Map<string, string[]>();
      for (const o of (queue ?? []) as Array<{ id: string; order_reference: string; recipient_phone: string }>) { const n = normalize(o.recipient_phone); byNumber.set(n, [...(byNumber.get(n) ?? []), o.order_reference]); }
      for (const n of numbers) {
        const s = status.get(n);
        const st = !s ? "unknown" : isApproved(s) ? "approved" : s.status === "blocked" ? "blocked" : "not_yet";
        if (st === "approved") approved++; else if (st === "blocked") blocked++; else if (st === "unknown") unknown++; else notYet++;
        report.push({ phone: n, status: st, message: s?.message ?? null, orders: byNumber.get(n) ?? [] });
      }
      for (const o of (queue ?? []) as Array<{ id: string; order_reference: string; recipient_phone: string }>) {
        const s = status.get(normalize(o.recipient_phone)); if (!isApproved(s)) continue;
        const { data: already } = await db.from("order_events").select("id").eq("order_id", o.id).eq("event_type", "supplier.number_approved").limit(1);
        if (already?.length) continue;
        await db.from("order_events").insert({ order_id: o.id, event_type: "supplier.number_approved", from_status: "processing", to_status: "processing", message: "MTN has approved this number. Waiting for an admin to send it from MTN verification; nothing was sent.", metadata: { source: "admin-mtn-verification", by: adminId } });
      }
      const { data: run } = await db.from("mtn_verification_checks").insert({ run_by: adminId, numbers: numbers.length, batches, approved, not_yet: notYet, blocked, unknown, report }).select("id, run_at").maybeSingle();
      return jsonResponse({ ok: true, runId: run?.id ?? null, runAt: run?.run_at ?? now, numbers: numbers.length, batches, failedBatches, approved, notYet, blocked, unknown, report });
    }

    /* ── Send ──────────────────────────────────────────────────────────────────── */
    const results: Array<{ orderId: string; reference: string | null; outcome: string; detail: string }> = [];
    for (const orderId of input.orderIds) {
      const { data: o } = await db.from("orders").select("id, order_reference, recipient_phone, status, payment_status, admin_resolution_status, supplier_purchase_id, supplier_order_reference, supplier_id").eq("id", orderId).maybeSingle();
      if (!o) { results.push({ orderId, reference: null, outcome: "refused", detail: "Order not found" }); continue; }
      const refuse = async (detail: string) => {
        await db.from("order_events").insert({ order_id: o.id, event_type: "admin.mtn_send_refused", from_status: o.status, to_status: o.status, message: `Not sent: ${detail}`, metadata: { by: adminId } });
        results.push({ orderId, reference: o.order_reference, outcome: "refused", detail });
      };
      if (o.payment_status !== "succeeded" || o.status !== "processing" || o.admin_resolution_status !== "awaiting_verification") { await refuse("the order is no longer on verification hold"); continue; }

      // 1. Lock first. The unique key is the whole protection against a second send.
      const { error: lockError } = await db.from("mtn_verification_sends").insert({ order_id: o.id, sent_by: adminId, outcome: "sending" });
      if (lockError) {
        // A refused or failed earlier try may be taken over (nothing was bought). Sent, adopted or in-progress never.
        const { data: taken } = await db.from("mtn_verification_sends").update({ sent_by: adminId, sent_at: new Date().toISOString(), outcome: "sending", detail: null }).eq("order_id", o.id).in("outcome", ["refused", "failed"]).select("order_id");
        if (!taken?.length) {
          const { data: prior } = await db.from("mtn_verification_sends").select("outcome, sent_at").eq("order_id", o.id).maybeSingle();
          results.push({ orderId, reference: o.order_reference, outcome: "refused", detail: `Already sent from this page (${prior?.outcome ?? "in progress"} at ${prior?.sent_at ?? "?"})` });
          continue;
        }
      }
      const finish = async (outcome: "sent" | "adopted" | "refused" | "failed", detail: string, ids?: { purchaseId?: string | null; reference?: string | null }) => {
        await db.from("mtn_verification_sends").update({ outcome, detail, supplier_purchase_id: ids?.purchaseId ?? null, supplier_order_reference: ids?.reference ?? null }).eq("order_id", o.id);
        await db.from("order_events").insert({ order_id: o.id, event_type: outcome === "refused" ? "admin.mtn_send_refused" : "admin.mtn_send", from_status: o.status, to_status: o.status, message: outcome === "refused" ? `Not sent: ${detail}` : detail, metadata: { by: adminId, outcome } });
        results.push({ orderId, reference: o.order_reference, outcome, detail });
      };

      // 2. Approved on a recent check.
      const { data: chk } = await db.from("beneficiary_checks").select("status, checked_at").eq("msisdn", normalize(o.recipient_phone)).maybeSingle();
      const fresh = chk?.checked_at && Date.now() - new Date(chk.checked_at).getTime() < CHECK_MAX_AGE_MS;
      if (!chk || !fresh || !(chk.status === "approved" || chk.status === "not_enforced")) { await finish("refused", chk ? (fresh ? `DBH says the number is ${chk.status}; run Check all again when MTN has approved it` : "the last check is older than 24 hours; run Check all first") : "this number has never been checked; run Check all first"); continue; }

      // 3. An earlier DBH attempt that is still alive is adopted, not bought again.
      if (o.supplier_purchase_id) {
        const look = await hub.checkOrderStatus(o.supplier_purchase_id);
        const dbhStatus = String(look.payload?.data?.status ?? look.payload?.data?.orderStatus ?? "").toLowerCase();
        await db.from("supplier_api_logs").insert({ supplier_id: dbh.id, order_id: o.id, action: "check_order_status", endpoint: "/api/developer/purchase-status", request_payload: { request_id: o.supplier_purchase_id, reason: "admin send: is the earlier attempt still alive?", by: adminId }, response_payload: look.payload ?? {}, call_status: look.ok ? "success" : "error", http_status: look.status ?? null });
        const dead = look.ok && ["failed", "refunded", "refund", "rejected", "cancelled", "reversed"].includes(dbhStatus);
        if (!look.ok) { await finish("refused", "DBH could not be reached to check the earlier attempt; try again in a minute"); continue; }
        if (!dead) {
          const adopted = hub.mapStatus(dbhStatus);
          await db.from("orders").update({ admin_resolution_status: null, admin_resolution_reason: null, admin_resolution_updated_at: new Date().toISOString(), status: adopted, supplier_status: dbhStatus || o.supplier_status, failure_reason: null, updated_at: new Date().toISOString() }).eq("id", o.id);
          await finish("adopted", `DBH already holds this order (attempt ${o.supplier_purchase_id}, ${dbhStatus || "open"}); hold lifted, nothing bought`, { purchaseId: o.supplier_purchase_id, reference: o.supplier_order_reference });
          continue;
        }
        // Dead attempt: clear it so a fresh purchase can be made.
        await db.from("orders").update({ supplier_purchase_id: null, supplier_order_reference: null, supplier_transaction_reference: null, supplier_status: null, supplier_idempotency_key: null, updated_at: new Date().toISOString() }).eq("id", o.id);
      }

      // 4. Nothing bought for this number in the last 10 minutes (any order).
      const { data: recent } = await db.from("supplier_api_logs").select("id, order_id, created_at").eq("supplier_id", dbh.id).eq("action", "purchase").eq("call_status", "success").gte("created_at", new Date(Date.now() - RECENT_PURCHASE_MS).toISOString()).in("order_id", (await db.from("orders").select("id").eq("recipient_phone", o.recipient_phone)).data?.map((x: { id: string }) => x.id) ?? []).limit(1);
      if (recent?.length) { await finish("refused", "a bundle went to this number in the last 10 minutes; wait and try again"); continue; }

      // Lift the hold and send through DBH. fulfillOrder refuses if supplier ids are set, and checks DBH for a held order.
      const now = new Date().toISOString();
      await db.from("orders").update({ admin_resolution_status: null, admin_resolution_reason: null, admin_resolution_updated_at: now, failure_reason: null, supplier_id: dbh.id, supplier_retry_after: null, supplier_retry_count: 0, updated_at: now }).eq("id", o.id);
      try {
        const r = await fulfillOrder(db, o.id, { supplierId: dbh.id, viaFallback: true });
        const { data: after } = await db.from("orders").select("supplier_purchase_id, supplier_order_reference, status, supplier_status, failure_reason").eq("id", o.id).maybeSingle();
        if (r?.skipped && r.reason === "already_held_by_supplier") await finish("adopted", `DBH already held this order; adopted (${after?.supplier_status ?? r.status})`, { purchaseId: after?.supplier_purchase_id, reference: after?.supplier_order_reference });
        else if (r?.skipped) { await db.from("orders").update({ admin_resolution_status: "awaiting_verification", admin_resolution_reason: `Send refused: ${String(r.reason).replace(/_/g, " ")}`, updated_at: new Date().toISOString() }).eq("id", o.id); await finish("refused", String(r.reason).replace(/_/g, " ")); }
        else if (after?.supplier_purchase_id || after?.supplier_order_reference) await finish("sent", `Sent to DBH (attempt ${after.supplier_purchase_id ?? after.supplier_order_reference}, ${after.supplier_status ?? "pending"})`, { purchaseId: after?.supplier_purchase_id, reference: after?.supplier_order_reference });
        else await finish("failed", `DBH did not accept it: ${after?.failure_reason ?? r?.status ?? "no reference returned"}`);
      } catch (e) {
        await finish("failed", `Send error: ${(e as Error).message}`);
      }
    }
    return jsonResponse({ ok: true, results });
  } catch (e) { return jsonResponse({ error: "Verification action unavailable", detail: (e as Error).message }, { status: 500 }); }
});
