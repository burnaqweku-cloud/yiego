import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, TrendingUp } from "lucide-react";
import { p1, useAgent } from "@/components/agent/AgentShell";
import ComingSoon from "@/components/agent/ComingSoon";
import { formatGHS } from "@/lib/format";
import { barPercent, dayLabel, lastSaleLabel, PERIODS, periodPhrase, saleFreshness, type SalesPeriod } from "@/lib/networkSales";

/* Agents' sales (owner, 23 Nov 2026: a parent asked "how can I identify which of my agents is making sales at the
   moment?"). One page under Your agents: pick a period, see what all your agents sold, what they made and your share,
   sales per day, and every agent ranked by sales with when they last sold. Agents with nothing in the period sit in
   their own closed group at the foot. Figures come from phase1.my_network_sales (the caller's own sub-agents only). */

interface Row { id: string; slug: string; store_name: string; status: string; deactivated: boolean; last_sale_at: string | null; orders: number; sales: number; their_profit: number; my_share: number }
interface Report { period: SalesPeriod; totals: { agents: number; selling: number; orders: number; sales: number; their_profit: number; my_share: number }; agents: Row[]; days: Array<{ day: string; orders: number; sales: number }> | null }

const DOT = { today: "bg-primary", week: "bg-amber", older: "bg-faint-foreground/50", never: "bg-faint-foreground/30" } as const;
const chip = (on: boolean) => `rounded-full px-3.5 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition-colors ${on ? "bg-primary/20 text-primary-glow" : "border border-white/[0.08] text-muted-foreground hover:text-foreground"}`;

export default function AgentNetworkSales() {
  const { networkOpen } = useAgent();
  const [period, setPeriod] = useState<SalesPeriod>("7d");
  const [data, setData] = useState<Report | null>(null);
  const [failed, setFailed] = useState(false);
  const [showQuiet, setShowQuiet] = useState(false);

  useEffect(() => {
    let alive = true; setData(null); setFailed(false);
    void p1().rpc("my_network_sales", { p_period: period }).then(({ data: d, error }) => { if (!alive) return; if (error) setFailed(true); else setData(d as Report); });
    return () => { alive = false; };
  }, [period]);

  if (!networkOpen) return <ComingSoon title="Coming soon" blurb="Once you have agents selling under you, you'll see each one's sales here." />;
  const t = data?.totals;
  const selling = (data?.agents ?? []).filter((a) => Number(a.orders) > 0);
  const quiet = (data?.agents ?? []).filter((a) => !(Number(a.orders) > 0));
  const maxDay = Math.max(1, ...(data?.days ?? []).map((d) => Number(d.sales)));
  const now = new Date();

  return (
    <div className="space-y-4">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Your agents</p><h1 className="font-display text-[22px] font-semibold text-foreground">Agents' sales</h1>
        <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">See which of your agents are selling, how much they sold and what you made from them.</p></div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Period">
        {PERIODS.map((p) => <button key={p.id} type="button" aria-pressed={period === p.id} className={chip(period === p.id)} onClick={() => setPeriod(p.id)}>{p.label}</button>)}
      </div>

      {failed ? <div className="onyx-panel rounded-2xl p-4 text-[13px] text-muted-foreground">Couldn't load your agents' sales. Refresh the page or try again in a minute.</div> : <>
        <div className="grid grid-cols-2 gap-2">
          {([["Sales", t ? formatGHS(Number(t.sales)) : "…", true], ["Orders", t ? String(t.orders) : "…", false], ["Your share", t ? formatGHS(Number(t.my_share)) : "…", true], ["Your agents made", t ? formatGHS(Number(t.their_profit)) : "…", false]] as const).map(([label, value, strong]) => (
            <div key={label} className="onyx-panel rounded-2xl p-3.5"><p className="text-[11.5px] text-faint-foreground">{label}</p><p className={`mt-0.5 font-display text-[20px] font-semibold tabular-nums ${strong ? "text-foreground" : "text-foreground/90"}`}>{value}</p></div>
          ))}
        </div>
        {t && <p className="text-[12.5px] text-muted-foreground"><b className="text-foreground">{t.selling} of {t.agents}</b> {t.agents === 1 ? "agent" : "agents"} sold {periodPhrase(period)}.</p>}

        {data?.days && <div className="onyx-panel rounded-2xl p-4">
          <p className="text-[13px] font-semibold text-foreground">Sales per day</p>
          <div className="mt-3 flex h-[92px] items-end gap-[3px]" aria-label="Sales per day">
            {data.days.map((d) => (
              <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${d.day}: ${formatGHS(Number(d.sales))}, ${d.orders} orders`}>
                <div className={`w-full rounded-t-[4px] ${Number(d.sales) > 0 ? "bg-primary" : "bg-white/[0.08]"}`} style={{ height: `${Number(d.sales) > 0 ? Math.max(6, Math.round((Number(d.sales) / maxDay) * 72)) : 3}px` }} />
                {(data.days!.length <= 7 || Number(d.day.slice(8)) % 5 === 0 || d === data.days![data.days!.length - 1]) && <span className="text-[10px] leading-none text-faint-foreground">{dayLabel(d.day, data.days!.length > 7)}</span>}
              </div>
            ))}
          </div>
          {data.days.length <= 7 && <div className="mt-2 grid text-center text-[10.5px] tabular-nums text-muted-foreground" style={{ gridTemplateColumns: `repeat(${data.days.length}, minmax(0, 1fr))` }}>{data.days.map((d) => <span key={d.day}>{Number(d.sales) > 0 ? Math.round(Number(d.sales)) : "–"}</span>)}</div>}
        </div>}

        <div className="onyx-panel rounded-2xl p-4">
          <div className="flex items-baseline justify-between gap-3"><p className="text-[13px] font-semibold text-foreground">Each agent</p><p className="text-[11px] text-faint-foreground">most sales first</p></div>
          {!data ? <p className="mt-3 text-[13px] text-muted-foreground">Loading…</p>
            : data.agents.length === 0 ? <p className="mt-3 text-[13px] text-muted-foreground">No agents yet. <Link to="/agent/network/programme" className="font-semibold text-primary-glow">Share your invite link</Link> to get your first agent.</p>
            : <>
              {selling.length === 0 && <p className="mt-3 text-[13px] text-muted-foreground">None of your agents sold {periodPhrase(period)}.</p>}
              <ol className="mt-2 divide-y divide-border">
                {selling.map((a, i) => (
                  <li key={a.id} className="py-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/12 text-[12px] font-semibold text-primary-glow">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 break-words text-[14px] font-semibold text-foreground">{a.store_name}{a.deactivated && <span className="ml-1.5 rounded-full bg-amber/15 px-2 py-0.5 text-[10.5px] text-amber">Deactivated</span>}</p>
                          <p className="shrink-0 font-display text-[16px] font-semibold tabular-nums text-foreground">{formatGHS(Number(a.sales))}</p>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
                          <p className="flex min-w-0 items-center gap-1.5"><span className={`h-2 w-2 shrink-0 rounded-full ${DOT[saleFreshness(a.last_sale_at, now)]}`} aria-hidden="true" /><span className="truncate">Last sale: {lastSaleLabel(a.last_sale_at, now)}</span></p>
                          <p className="shrink-0 tabular-nums">{a.orders} {Number(a.orders) === 1 ? "order" : "orders"}</p>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-primary" style={{ width: `${barPercent(Number(a.sales), Number(t?.sales ?? 0))}%` }} /></div>
                        <p className="mt-1.5 text-[11.5px] tabular-nums text-faint-foreground">They made {formatGHS(Number(a.their_profit))} · Your share <b className="font-semibold text-foreground/80">{formatGHS(Number(a.my_share))}</b></p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              {quiet.length > 0 && <div className="mt-1 border-t border-border pt-3">
                <button type="button" className="flex w-full items-center justify-between gap-2 text-left text-[13px] font-semibold text-foreground" aria-expanded={showQuiet} onClick={() => setShowQuiet(!showQuiet)}>
                  <span>No sales {periodPhrase(period)} ({quiet.length})</span><ChevronDown size={16} className={`shrink-0 text-muted-foreground transition-transform ${showQuiet ? "rotate-180" : ""}`} />
                </button>
                {showQuiet && <ul className="mt-2 divide-y divide-border">
                  {quiet.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                      <p className="min-w-0 break-words text-[13px] text-foreground">{a.store_name}{a.deactivated && <span className="ml-1.5 rounded-full bg-amber/15 px-2 py-0.5 text-[10.5px] text-amber">Deactivated</span>}</p>
                      <p className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted-foreground"><span className={`h-2 w-2 rounded-full ${DOT[saleFreshness(a.last_sale_at, now)]}`} aria-hidden="true" />{lastSaleLabel(a.last_sale_at, now)}</p>
                    </li>
                  ))}
                </ul>}
              </div>}
            </>}
        </div>
        <p className="flex items-start gap-2 text-[11.5px] leading-5 text-faint-foreground"><TrendingUp size={14} className="mt-0.5 shrink-0" />A sale counts from the moment the customer pays, even while the order is still on its way. Refunded orders are left out. "Your share" is what you earn on their sales; it reaches your balance when each order is delivered.</p>
      </>}
    </div>
  );
}
