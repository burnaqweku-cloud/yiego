import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Finance — the money page.
 *
 * Everything obeys one date range. The books open at the finance epoch
 * (2026-09-11): the server never counts anything earlier, so pre-launch
 * tests and recovered orders stay out of the numbers permanently.
 *
 * Revenue is bundle prices on paid orders that are not cancelled, refunded
 * or awaiting review. Fees collected is the 4% Paystack surcharge customers
 * actually paid (gross — Paystack's own ~2% cut comes out of it before the
 * bank). Profit = revenue − supplier cost + fees collected.
 */

interface FinanceSummary {
  totals: { orders: number; revenue: number; supplier_cost: number; fees_collected: number; profit: number };
  at_risk: { orders: number; amount: number };
  refunded: { orders: number; amount: number };
  daily: { day: string; revenue: number; profit: number; orders: number }[];
  by_network: { network: string; orders: number; revenue: number; profit: number }[];
  by_supplier: { supplier: string; orders: number; spent: number }[];
  epoch: string;
}

const EPOCH_DAY = "2026-09-11";

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: "Today", range: () => { const d = isoDay(new Date()); return [d, d]; } },
  { label: "Yesterday", range: () => { const d = new Date(); d.setDate(d.getDate() - 1); const y = isoDay(d); return [y, y]; } },
  { label: "Last 7 days", range: () => { const to = new Date(); const from = new Date(); from.setDate(to.getDate() - 6); return [isoDay(from), isoDay(to)]; } },
  { label: "This month", range: () => { const now = new Date(); return [isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), isoDay(now)]; } },
  { label: "All time", range: () => [EPOCH_DAY, isoDay(new Date())] },
];

const supplierLabel = (code: string) =>
  code === "databundleshub" ? "DataBundlesHub" : code === "datamartgh" ? "DataMart" : code;

export default function AdminFinance() {
  const [from, setFrom] = useState(EPOCH_DAY);
  const [to, setTo] = useState(isoDay(new Date()));
  const [preset, setPreset] = useState("All time");
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fromDay: string, toDay: string) => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await (
      supabase as unknown as {
        schema: (name: string) => { rpc: (fn: string, args: Record<string, string>) => Promise<{ data: unknown; error: { message: string } | null }> };
      }
    ).schema("phase1").rpc("finance_summary", { p_from: fromDay, p_to: toDay });
    if (rpcError) setError(rpcError.message);
    else setSummary(data as FinanceSummary);
    setLoading(false);
  }, []);

  useEffect(() => { void load(from, to); }, [load, from, to]);

  const totals = summary?.totals;
  const marginPct = totals && totals.revenue > 0 ? ((totals.profit / totals.revenue) * 100).toFixed(1) : null;

  const chartData = useMemo(
    () => (summary?.daily ?? []).map((d) => ({
      day: d.day.slice(5), // MM-DD
      Revenue: Number(d.revenue),
      Profit: Number(d.profit),
    })),
    [summary],
  );

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Business" title="Finance" description="Money in, money out and what's left — for any date range. The books open on 11 Sep 2026; earlier activity is never counted." />

    {/* Range */}
    <Card><CardContent>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button key={p.label} type="button"
            onClick={() => { const [f, t] = p.range(); setPreset(p.label); setFrom(f < EPOCH_DAY ? EPOCH_DAY : f); setTo(t); }}
            className={cn("rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold",
              preset === p.label ? "border-primary/40 bg-primary/10 text-primary-glow" : "border-white/10 bg-white/[0.03] text-muted-foreground")}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-muted-foreground">From
          <input type="date" min={EPOCH_DAY} value={from}
            onChange={(e) => { setPreset(""); setFrom(e.target.value); }}
            className="onyx-field mt-1.5 block" />
        </label>
        <label className="text-xs font-semibold text-muted-foreground">To
          <input type="date" min={from} value={to}
            onChange={(e) => { setPreset(""); setTo(e.target.value); }}
            className="onyx-field mt-1.5 block" />
        </label>
      </div>
    </CardContent></Card>

    {loading ? <div className="grid min-h-48 place-items-center"><Loader2 className="animate-spin text-primary-glow" /></div>
      : error ? <Card><CardContent><p className="text-sm text-danger">{error}</p></CardContent></Card>
      : totals && <>
        {/* Headlines */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Revenue", value: formatGHS(Number(totals.revenue)), sub: `${totals.orders} orders` },
            { label: "Supplier cost", value: formatGHS(Number(totals.supplier_cost)), sub: "paid to suppliers" },
            { label: "Fees collected", value: formatGHS(Number(totals.fees_collected)), sub: "4% Paystack surcharge" },
            { label: "Profit", value: formatGHS(Number(totals.profit)), sub: marginPct ? `${marginPct}% margin` : "—", highlight: true },
          ].map((card) => (
            <Card key={card.label}><CardContent>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{card.label}</p>
              <p className={cn("mt-2 font-display text-xl font-semibold", card.highlight ? "text-primary-glow" : "text-white")}>{card.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>
            </CardContent></Card>
          ))}
        </div>

        {(Number(summary?.at_risk.amount) > 0 || Number(summary?.refunded.amount) > 0) && (
          <Card><CardContent><p className="text-xs leading-6 text-muted-foreground">
            {Number(summary?.at_risk.amount) > 0 && <>⚠️ <strong className="text-amber">{formatGHS(Number(summary!.at_risk.amount))}</strong> across {summary!.at_risk.orders} paid order(s) awaiting review — counted only once resolved. </>}
            {Number(summary?.refunded.amount) > 0 && <>↩ {formatGHS(Number(summary!.refunded.amount))} refunded across {summary!.refunded.orders} order(s).</>}
          </p></CardContent></Card>
        )}

        {/* Daily chart */}
        <Card><CardContent>
          <div className="mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-primary-glow" /><h2 className="font-display text-base font-semibold text-white">Per day</h2></div>
          {chartData.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No paid orders in this range yet.</p> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="day" tick={{ fill: "#8a968f", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#8a968f", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#101b17", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }} formatter={(value: number) => formatGHS(value)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Revenue" fill="#2f6f5a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Profit" fill="#22c387" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent></Card>

        {/* Breakdowns */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Card><CardContent>
            <h2 className="mb-3 font-display text-base font-semibold text-white">By network</h2>
            {summary!.by_network.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : (
              <table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="pb-2">Network</th><th className="pb-2 text-right">Orders</th><th className="pb-2 text-right">Revenue</th><th className="pb-2 text-right">Profit</th></tr></thead>
                <tbody>{summary!.by_network.map((row) => (
                  <tr key={row.network} className="border-t border-white/[0.06]"><td className="py-2.5 font-semibold text-white">{row.network}</td><td className="py-2.5 text-right text-muted-foreground">{row.orders}</td><td className="py-2.5 text-right text-white">{formatGHS(Number(row.revenue))}</td><td className="py-2.5 text-right text-primary-glow">{formatGHS(Number(row.profit))}</td></tr>
                ))}</tbody></table>
            )}
          </CardContent></Card>
          <Card><CardContent>
            <h2 className="mb-3 font-display text-base font-semibold text-white">By supplier</h2>
            {summary!.by_supplier.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : (
              <table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="pb-2">Supplier</th><th className="pb-2 text-right">Orders</th><th className="pb-2 text-right">Spent</th></tr></thead>
                <tbody>{summary!.by_supplier.map((row) => (
                  <tr key={row.supplier} className="border-t border-white/[0.06]"><td className="py-2.5 font-semibold text-white">{supplierLabel(row.supplier)}</td><td className="py-2.5 text-right text-muted-foreground">{row.orders}</td><td className="py-2.5 text-right text-white">{formatGHS(Number(row.spent))}</td></tr>
                ))}</tbody></table>
            )}
          </CardContent></Card>
        </div>
      </>}
  </div>;
}
