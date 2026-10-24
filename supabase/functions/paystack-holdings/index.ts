import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { getPaystackSecretKey, paystackSubaccount } from "../_shared/paystack.ts";

/* Read-only provider comparison. Internal cron or verified administrator only.
   No combined held-money total is asserted: endpoint overlap is unproven. */

const money = (v: unknown) => Math.round(Number(v ?? 0)) / 100;

async function ps(path: string) {
  const res = await fetch(`https://api.paystack.co${path}`, { headers: { Authorization: `Bearer ${getPaystackSecretKey()}` }, signal: AbortSignal.timeout(15000) });
  const payload = await res.json().catch(() => null);
  return { ok: res.ok && payload?.status === true, status: res.status, message: payload?.message ?? null, data: payload?.data ?? null };
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (!["GET", "POST"].includes(req.method)) return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const db = createSupabaseAdmin();
    if (req.headers.has("x-yiego-internal-secret")) {
      const denied = await requireCronSecret(req, db); if (denied) return denied;
    } else {
      const header = req.headers.get("Authorization");
      if (!header?.startsWith("Bearer ")) return jsonResponse({ error: "Authentication required" }, { status: 401 });
      const { data: auth, error } = await db.auth.getUser(header.slice(7));
      if (error || !auth.user) return jsonResponse({ error: "Invalid session" }, { status: 401 });
      const { data: role, error: roleError } = await db.rpc("admin_role", { p_user: auth.user.id });
      if (roleError || !["master", "admin", "staff"].includes(String(role))) return jsonResponse({ error: "Admin access required" }, { status: 403 });
    }
    const sub = paystackSubaccount();
    const [balance, totals] = await Promise.all([ps("/balance"), ps("/transaction/totals")]);
    const accounts = [null, sub].filter((x, i, a) => a.indexOf(x) === i);
    const settlements: unknown[] = [];
    for (const account of accounts) {
      const list: any[] = [];
      let ok = true, complete = true;
      for (const status of ["pending", "processing"]) {
        let exhausted = false;
        for (let page = 1; page <= 10; page++) {
          const r = await ps(`/settlement?perPage=100&page=${page}&status=${status}${account ? `&subaccount=${encodeURIComponent(account)}` : ""}`);
          if (!r.ok || !Array.isArray(r.data)) { ok = false; break; }
          list.push(...r.data);
          if (r.data.length < 100) { exhausted = true; break; }
        }
        if (!exhausted) complete = false;
      }
      settlements.push({
        account: account ? "subaccount" : "main", ok, complete,
        not_yet_paid: list.filter((s: any) => ["pending", "processing"].includes(String(s.status).toLowerCase())).map((s: any) => ({
          id: s.id, status: s.status, currency: s.currency ?? "", gross: money(s.total_amount), fees: money(s.total_fees), net: money(s.effective_amount), date: s.settlement_date ?? null,
        })),
      });
    }
    // Sales inside each unpaid settlement (to see overlap with pending_transfers).
    const insidePayouts: unknown[] = [];
    for (const group of settlements as any[]) for (const s of group.not_yet_paid) {
      let count = 0, gross = 0, fees = 0;
      for (let page = 1; page <= 20; page++) {
        const r = await ps(`/settlement/${s.id}/transactions?perPage=100&page=${page}`);
        const list = Array.isArray(r.data) ? r.data : [];
        for (const t of list as any[]) { count++; gross += Number(t.amount ?? 0); fees += Number(t.fees ?? 0); }
        if (list.length < 100) break;
      }
      insidePayouts.push({ id: s.id, sales: count, gross: money(gross), fees: money(fees) });
    }
    // Refunds Paystack has not fully taken out of a payout yet.
    const refunds = await ps("/refund?perPage=100");
    const notDeducted = (Array.isArray(refunds.data) ? refunds.data : []).filter((r: any) => !r.fully_deducted)
      .map((r: any) => ({ id: r.id, status: r.status, amount: money(r.amount), deducted: money(r.deducted_amount), created: r.createdAt }));
    return jsonResponse({
      read_at: new Date().toISOString(),
      inside_unpaid_payouts: insidePayouts,
      refunds_not_fully_deducted: { ok: refunds.ok, count: notDeducted.length, total: Math.round(notDeducted.reduce((a: number, r: any) => a + r.amount - r.deducted, 0) * 100) / 100, items: notDeducted },
      balance: { ok: balance.ok, message: balance.ok ? null : balance.message, items: Array.isArray(balance.data) ? balance.data.map((b: any) => ({ currency: b.currency, amount: money(b.balance) })) : null },
      totals: { ok: totals.ok, message: totals.ok ? null : totals.message, pending_transfers: totals.data ? money(totals.data.pending_transfers) : null, pending_by_currency: totals.data?.pending_transfers_by_currency?.map((x: any) => ({ currency: x.currency, amount: money(x.amount) })) ?? null, total_volume: totals.data ? money(totals.data.total_volume) : null },
      settlements,
    });
  } catch {
    return jsonResponse({ error: "Paystack readings are unavailable. Try again later." }, { status: 502 });
  }
});
