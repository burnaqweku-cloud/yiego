import { useEffect, useState } from "react";
import { p1, useAgent } from "@/components/agent/AgentShell";
import { formatGHS } from "@/lib/format";

/* Store traffic and sales, their store only. */
interface A { series: Array<{ day: string; views: number; orders: number; sales: number; margin: number }>; top: Array<{ name: string; orders: number }>; totals: { views: number; orders: number; sales: number; margin: number } }
export default function AgentAnalytics() {
  const { agent } = useAgent();
  const [days, setDays] = useState(30); const [a, setA] = useState<A | null>(null);
  useEffect(() => { void p1().rpc("agent_analytics", { p_days: days }).then(({ data }) => setA(data as A)); }, [days]);
  const max = Math.max(1, ...(a?.series.map((s) => s.views) ?? [1]));
  const conv = a && a.totals.views > 0 ? (100 * a.totals.orders / a.totals.views) : 0;
  return (
    <div className="space-y-5">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Analytics</p><h1 className="font-display text-[24px] font-semibold text-foreground">How {agent.store_name} is doing</h1></div>
      <div className="flex gap-1 rounded-full border border-white/[0.07] bg-white/[0.02] p-0.5 w-fit">{[7, 30, 90].map((d) => <button key={d} type="button" onClick={() => setDays(d)} className={`rounded-full px-3 py-1 text-[12px] ${days === d ? "bg-white/[0.08] text-foreground" : "text-muted-foreground"}`}>{d} days</button>)}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Store visits", a ? a.totals.views.toLocaleString() : "…"], ["Paid orders", a ? a.totals.orders.toLocaleString() : "…"], ["Sales", a ? formatGHS(Number(a.totals.sales)) : "…"], ["Your profit", a ? formatGHS(Number(a.totals.margin)) : "…"]].map(([l, v]) => <div key={l} className="onyx-panel rounded-2xl p-3 text-center"><p className="text-[17px] font-semibold tabular-nums text-foreground">{v}</p><p className="text-[11px] text-faint-foreground">{l}</p></div>)}
      </div>
      <section className="onyx-panel rounded-[22px] p-4">
        <div className="flex items-center justify-between"><h2 className="text-[13px] font-semibold text-foreground">Visits per day</h2><span className="text-[11.5px] text-faint-foreground">{a ? `${conv.toFixed(1)}% of visits become orders` : ""}</span></div>
        <div className="mt-3 flex h-28 items-end gap-[2px]">{(a?.series ?? []).map((s) => <div key={s.day} title={`${s.day}: ${s.views} visits, ${s.orders} orders`} className="flex-1 rounded-t bg-primary/60" style={{ height: `${Math.max(2, (100 * s.views) / max)}%` }} />)}</div>
        <p className="mt-1 text-[10.5px] text-faint-foreground">Visits are counted from the day the store got analytics; earlier days show zero.</p>
      </section>
      <section className="onyx-panel rounded-[22px] p-4">
        <h2 className="text-[13px] font-semibold text-foreground">Best sellers</h2>
        {a && a.top.length === 0 ? <p className="mt-2 text-[12.5px] text-muted-foreground">No paid orders in this period yet.</p> : <ul className="mt-2 divide-y divide-white/[0.06]">{(a?.top ?? []).map((t) => <li key={t.name} className="flex items-center justify-between py-2 text-[13px]"><span className="text-foreground">{t.name.replace(" Data — ", " ")}</span><span className="tabular-nums text-muted-foreground">{t.orders}</span></li>)}</ul>}
      </section>
    </div>
  );
}
