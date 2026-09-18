import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getPaystackSecretKey } from "../_shared/paystack.ts";

/* Pulls Paystack settlements (payouts to the bank) and books each successful
   one in the finance ledger with its gross / net / fee split. Paystack sends
   no webhook for settlements, so this runs on a schedule. Idempotent: a
   settlement already booked is left alone. Body may carry { "days": N }. */

interface Settlement {
  id: number; status: string; currency?: string;
  total_amount?: number; effective_amount?: number; total_fees?: number; total_processed?: number; deductions?: number;
  settlement_date?: string; settled_by?: string | null; created_at?: string; updated_at?: string;
}
const money = (subunit: number | undefined | null) => Math.round(Number(subunit ?? 0)) / 100;

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const days = Math.min(Math.max(Number(body?.days ?? 45), 1), 365);
    const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

    const settlements: Settlement[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const res = await fetch(`https://api.paystack.co/settlement?perPage=50&page=${page}&from=${from}`, { headers: { Authorization: `Bearer ${getPaystackSecretKey()}` } });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.status) return jsonResponse({ error: payload?.message ?? `Paystack returned ${res.status}` }, { status: 502 });
      const list: Settlement[] = payload.data ?? [];
      settlements.push(...list);
      const total = Number(payload.meta?.total ?? list.length);
      if (list.length < 50 || settlements.length >= total) break;
    }

    const supabase = createSupabaseAdmin();
    const results: unknown[] = [];
    for (const s of settlements) {
      const gross = money(s.total_amount);
      const fees = money(s.total_fees);
      const net = s.effective_amount != null ? money(s.effective_amount) : Math.round((gross - fees) * 100) / 100;
      const { data, error } = await supabase.rpc("finance_apply_paystack_settlement", {
        p_id: s.id, p_status: String(s.status ?? "").toLowerCase(), p_gross: gross, p_net: net, p_fees: fees,
        p_settlement_date: s.settlement_date ?? s.updated_at ?? s.created_at ?? null, p_raw: s,
      });
      results.push(error ? { id: s.id, action: "error", message: error.message } : data);
    }
    return jsonResponse({ from, fetched: settlements.length, results });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
