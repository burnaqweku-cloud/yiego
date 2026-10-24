import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { getPaystackSecretKey, paystackSubaccount } from "../_shared/paystack.ts";

/* Read-only: asks Paystack what it reports holding for us (balance, totals with
   pending transfers, and pending/processing settlements for the main account
   and the business subaccount). Writes nothing. Internal secret required. */

const money = (v: unknown) => Math.round(Number(v ?? 0)) / 100;

async function ps(path: string) {
  const res = await fetch(`https://api.paystack.co${path}`, { headers: { Authorization: `Bearer ${getPaystackSecretKey()}` } });
  const payload = await res.json().catch(() => null);
  return { ok: res.ok && payload?.status === true, status: res.status, message: payload?.message ?? null, data: payload?.data ?? null };
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const denied = await requireCronSecret(req, createSupabaseAdmin()); if (denied) return denied;
    const sub = paystackSubaccount();
    const balance = await ps("/balance");
    const totals = await ps("/transaction/totals");
    const accounts = [null, sub].filter((x, i, a) => a.indexOf(x) === i);
    const settlements: unknown[] = [];
    for (const account of accounts) {
      const r = await ps(`/settlement?perPage=20${account ? `&subaccount=${encodeURIComponent(account)}` : ""}`);
      const list = Array.isArray(r.data) ? r.data : [];
      settlements.push({
        account: account ? "subaccount" : "main", ok: r.ok, message: r.ok ? null : r.message,
        not_yet_paid: list.filter((s: any) => !["success", "successful"].includes(String(s.status).toLowerCase())).map((s: any) => ({
          id: s.id, status: s.status, gross: money(s.total_amount), fees: money(s.total_fees), net: money(s.effective_amount), date: s.settlement_date,
        })),
      });
    }
    return jsonResponse({
      balance: { ok: balance.ok, message: balance.ok ? null : balance.message, items: Array.isArray(balance.data) ? balance.data.map((b: any) => ({ currency: b.currency, amount: money(b.balance) })) : null },
      totals: { ok: totals.ok, message: totals.ok ? null : totals.message, pending_transfers: totals.data ? money(totals.data.pending_transfers) : null, pending_by_currency: totals.data?.pending_transfers_by_currency?.map((x: any) => ({ currency: x.currency, amount: money(x.amount) })) ?? null, total_volume: totals.data ? money(totals.data.total_volume) : null },
      settlements,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
