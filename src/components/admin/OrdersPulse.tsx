import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Download, RefreshCw } from "lucide-react";
import { Money, Panel, Row, Rows, Segmented, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { adminDatabase } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { csvText } from "@/lib/csv";
import { profitParts, type OrdersProfit } from "@/lib/ordersProfit";

/* Orders pulse — how many orders came in, for any day or range.
   Counts paid orders by the moment the customer paid. Every figure is added up in the database
   (phase1.admin_orders_pulse): a read returns at most 1,000 rows, so counting rows here said "1000" for any
   busy week (20 Nov 2026, owner: "Why does 7 days always filter 1000?"). Days and hours are Ghana time. */

type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";
interface Pulse { orders: number; delivered: number; refunded: number; cancelled: number; revenue: number; gb: number; agent_margin: number; agent_orders: number; by_network: { name: string; n: number; amt: number }[]; by_day: { day: string; n: number }[]; by_hour: number[] }
type Source = "all" | "platform" | "agents";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any };

// Ghana time (GMT): day boundaries are UTC midnight regardless of the device clock.
const startOfDay = (d: Date) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setUTCHours(23, 59, 59, 999); return x; };
const iso = (d: Date) => d.toISOString();
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function rangeFor(p: Preset, from: string, to: string): [Date, Date] {
  const now = new Date();
  if (p === "today") return [startOfDay(now), endOfDay(now)];
  if (p === "yesterday") { const y = new Date(now); y.setDate(y.getDate() - 1); return [startOfDay(y), endOfDay(y)]; }
  if (p === "7d") { const s = new Date(now); s.setDate(s.getDate() - 6); return [startOfDay(s), endOfDay(now)]; }
  if (p === "30d") { const s = new Date(now); s.setDate(s.getDate() - 29); return [startOfDay(s), endOfDay(now)]; }
  const f = from ? new Date(from) : startOfDay(now); const t = to ? new Date(to) : now;
  return [startOfDay(f), endOfDay(t)];
}

/** `onRefresh` lets the page reload whatever else it shows (the order list) from the same button. */
export default function OrdersPulse({ onRefresh }: { onRefresh?: () => void } = {}) {
  // Bumped by the refresh button: re-reads the orders and the profit, and moves "today" on if the day has changed.
  const [tick, setTick] = useState(0);
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(ymd(new Date()));
  const [to, setTo] = useState(ymd(new Date()));
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [source, setSource] = useState<Source>("all");
  const agentOrders = Number(pulse?.agent_orders ?? 0);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tick is the refresh signal
  const [start, end] = useMemo(() => rangeFor(preset, from, to), [preset, from, to, tick]);
  // Strict profit on the range's delivered orders, dated by purchase day: what is left after the supplier cost,
  // the agents' earnings (and a parent agent's share), and what Paystack or Kora actually took from each payment,
  // plus the checkout fee the customer paid. Worked out per order by phase1.admin_orders_profit from the orders'
  // own records. Top-up fees, subscriptions and other spending live on Finance and never move this number.
  const [profit, setProfit] = useState<OrdersProfit | null>(null);
  useEffect(() => {
    let mounted = true; setProfit(null);
    (db() as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: OrdersProfit | null }> })
      .rpc("admin_orders_profit", { p_from: iso(startOfDay(start)), p_to: iso(new Date(endOfDay(end).getTime() + 1)), p_source: source })
      .then((r) => { if (mounted) setProfit(r.data?.profit == null ? null : r.data); })
      .catch(() => { if (mounted) setProfit(null); });
    return () => { mounted = false; };
  }, [start, end, source]);

  useEffect(() => {
    let mounted = true; setLoading(true);
    (db() as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: Pulse | null }> })
      .rpc("admin_orders_pulse", { p_from: iso(start), p_to: iso(end), p_source: source })
      .then((r) => { if (mounted) { setPulse(r.data ?? null); setLoading(false); } }, () => { if (mounted) { setPulse(null); setLoading(false); } });
    return () => { mounted = false; };
  }, [start, end, source]);

  const days = Math.max(1, Math.round((endOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000));
  const n = Number(pulse?.orders ?? 0);
  const delivered = Number(pulse?.delivered ?? 0);
  const refunded = Number(pulse?.refunded ?? 0);
  const waiting = n - delivered - refunded - Number(pulse?.cancelled ?? 0);
  const revenue = Number(pulse?.revenue ?? 0);
  const gb = Number(pulse?.gb ?? 0);
  const byNetwork: [string, { n: number; amt: number }][] = (pulse?.by_network ?? []).map((x) => [x.name, { n: Number(x.n), amt: Number(x.amt) }]);
  const byDay: [string, number][] = days <= 1 ? [] : (pulse?.by_day ?? []).map((x) => [x.day, Number(x.n)]);
  const byHour: number[] = days > 1 ? [] : (pulse?.by_hour ?? Array(24).fill(0)).map(Number);
  const peakHour = byHour.length ? byHour.indexOf(Math.max(...byHour)) : -1;

  const drill = (bucket: string) => `/admin/orders/received?bucket=${bucket}&source=${source}&from=${ymd(start)}&to=${ymd(end)}`;
  const exportCsv = () => {
    const lines = [["day", "orders"], ...(byDay.length ? byDay : [[ymd(start), String(n)]]).map(([d, c]) => [d, String(c)])];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csvText(lines)], { type: "text/csv" })); a.download = `datayego-orders-${ymd(start)}-to-${ymd(end)}.csv`; a.click();
  };

  return (
    <Panel title="Orders received" icon={CalendarDays}
      action={<Button variant="ghost" size="sm" onClick={() => { setTick((t) => t + 1); onRefresh?.(); }} disabled={loading} aria-label="Refresh orders" title="Refresh"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></Button>}
      note={days === 1 ? ymd(start) : `${ymd(start)} → ${ymd(end)} · ${days} days`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Segmented<Preset> value={preset} onChange={setPreset} options={[{ value: "today", label: "Today" }, { value: "yesterday", label: "Yesterday" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "custom", label: "Pick dates" }]} />
        <Segmented<Source> value={source} onChange={setSource} options={[{ value: "all", label: "All" }, { value: "platform", label: "YG" }, { value: "agents", label: `Agents${agentOrders ? ` (${agentOrders})` : ""}` }]} />
        {preset === "custom" && <div className="flex items-center gap-1.5"><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} w-auto`} /><span className="text-[11px] text-faint-foreground">to</span><input type="date" value={to} min={from} max={ymd(new Date())} onChange={(e) => setTo(e.target.value)} className={`${inputCls} w-auto`} /></div>}
        <Button variant="ghost" size="sm" onClick={exportCsv} aria-label="Export"><Download size={13} /></Button>
      </div>
      <StatGrid cols={4}>
        <Stat loading={loading} label="Orders" value={String(n)} note={days > 1 ? `${(n / days).toFixed(1)} a day` : "paid"} tone="good" to={drill("all")} />
        <Stat loading={loading} label="Sales" value={<Money value={revenue} />} note={source === "agents" ? `${gb} GB · agents earn ${formatGHS(Number(pulse?.agent_margin ?? 0))}` : `${gb} GB`} to={drill("all")} />
        <Stat loading={loading} label="Delivered" value={String(delivered)} note={`${n ? `${Math.round((delivered / n) * 100)}%` : "—"}${profit != null ? ` · profit ${formatGHS(Number(profit.profit))}` : ""}`} tone="good" to={drill("delivered")} />
        <Stat loading={loading} label="Waiting / refunded" value={`${waiting} / ${refunded}`} note={waiting ? "still to deliver" : "all settled"} tone={waiting ? "warn" : "default"} to={drill("waiting")} />
      </StatGrid>
      {profit != null && Number(profit.delivered) > 0 && <p className="mt-2 px-1 text-[11.5px] leading-5 text-faint-foreground">
        Profit on delivered orders: {profitParts(profit).map((x, i) => <span key={x.label}>{i === 0 ? "" : x.sign > 0 ? " + " : " − "}{formatGHS(x.amount)} {x.label}</span>)} = <span className="font-semibold text-foreground">{formatGHS(Number(profit.profit))}</span>.
        {Number(profit.no_charge_recorded) > 0 && <span className="text-amber"> {profit.no_charge_recorded} of these have no payment charge on record, so nothing was taken off for them.</span>}
        {Number(profit.no_cost_recorded) > 0 && <span className="text-amber"> {profit.no_cost_recorded} have no supplier cost on record.</span>}
      </p>}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Rows empty="">{byNetwork.map(([name, v]) => <Row key={name} primary={name} secondary={`${v.n} order${v.n === 1 ? "" : "s"}`} right={formatGHS(v.amt)} />)}</Rows>
        {days > 1
          ? <Rows empty="">{byDay.map(([d, c]) => <Row key={d} primary={d} right={String(c)} rightNote="orders" />)}</Rows>
          : <div className="px-1 py-1">
              <p className="mb-1 text-[11px] text-faint-foreground">By hour{peakHour >= 0 && byHour[peakHour] ? ` · busiest ${peakHour}:00–${peakHour + 1}:00` : ""}</p>
              <div className="flex h-12 items-end gap-[2px]">{byHour.map((c, h) => <div key={h} title={`${h}:00 · ${c}`} className="flex-1 rounded-t bg-primary-glow/70" style={{ height: `${Math.max(2, (c / Math.max(1, ...byHour)) * 100)}%`, opacity: c ? 1 : 0.25 }} />)}</div>
              <div className="mt-0.5 flex justify-between text-[9px] text-faint-foreground"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div>
            </div>}
      </div>
    </Panel>
  );
}
