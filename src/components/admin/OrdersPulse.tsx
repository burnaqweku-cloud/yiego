import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Download } from "lucide-react";
import { Money, Panel, Row, Rows, Segmented, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { adminDatabase } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";

/* Orders pulse — how many orders came in, for any day or range.
   Counts paid orders by the moment the customer paid. */

type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";
interface Row_ { paid_at: string; status: string; amount: number; networks: { name: string } | null; data_products: { capacity_gb: number } | null; guest_email: string | null; user_id: string | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any };

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
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

export default function OrdersPulse() {
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(ymd(new Date()));
  const [to, setTo] = useState(ymd(new Date()));
  const [rows, setRows] = useState<Row_[]>([]);
  const [loading, setLoading] = useState(true);
  const [start, end] = useMemo(() => rangeFor(preset, from, to), [preset, from, to]);

  useEffect(() => {
    let mounted = true; setLoading(true);
    db().from("orders").select("paid_at, status, amount, guest_email, user_id, networks(name), data_products(capacity_gb)").eq("payment_status", "succeeded").gte("paid_at", iso(start)).lte("paid_at", iso(end)).order("paid_at", { ascending: true }).limit(5000)
      .then((r: { data: Row_[] | null }) => { if (mounted) { setRows(r.data ?? []); setLoading(false); } });
    return () => { mounted = false; };
  }, [start, end]);

  const days = Math.max(1, Math.round((endOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000));
  const n = rows.length;
  const delivered = rows.filter((r) => r.status === "delivered").length;
  const refunded = rows.filter((r) => r.status === "refunded").length;
  const waiting = n - delivered - refunded - rows.filter((r) => r.status === "cancelled").length;
  const revenue = rows.reduce((a, r) => a + Number(r.amount), 0);
  const gb = rows.reduce((a, r) => a + Number(r.data_products?.capacity_gb ?? 0), 0);
  const byNetwork = useMemo(() => { const m = new Map<string, { n: number; amt: number }>(); for (const r of rows) { const k = r.networks?.name ?? "—"; const v = m.get(k) ?? { n: 0, amt: 0 }; v.n += 1; v.amt += Number(r.amount); m.set(k, v); } return [...m.entries()].sort((a, b) => b[1].n - a[1].n); }, [rows]);
  const byDay = useMemo(() => { if (days <= 1) return []; const m = new Map<string, number>(); for (const r of rows) { const k = ymd(new Date(r.paid_at)); m.set(k, (m.get(k) ?? 0) + 1); } return [...m.entries()].sort(); }, [rows, days]);
  const byHour = useMemo(() => { if (days > 1) return []; const h = Array(24).fill(0) as number[]; for (const r of rows) h[new Date(r.paid_at).getHours()] += 1; return h; }, [rows, days]);
  const peakHour = byHour.length ? byHour.indexOf(Math.max(...byHour)) : -1;
  const uniqueBuyers = new Set(rows.map((r) => r.user_id ?? r.guest_email ?? "")).size;

  const exportCsv = () => {
    const lines = [["day", "orders"], ...(byDay.length ? byDay : [[ymd(start), String(n)]]).map(([d, c]) => [d, String(c)])];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.map((r) => r.join(",")).join("\n")], { type: "text/csv" })); a.download = `datayego-orders-${ymd(start)}-to-${ymd(end)}.csv`; a.click();
  };

  return (
    <Panel title="Orders received" icon={CalendarDays} note={days === 1 ? ymd(start) : `${ymd(start)} → ${ymd(end)} · ${days} days`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Segmented<Preset> value={preset} onChange={setPreset} options={[{ value: "today", label: "Today" }, { value: "yesterday", label: "Yesterday" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "custom", label: "Pick dates" }]} />
        {preset === "custom" && <div className="flex items-center gap-1.5"><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} w-auto`} /><span className="text-[11px] text-faint-foreground">to</span><input type="date" value={to} min={from} max={ymd(new Date())} onChange={(e) => setTo(e.target.value)} className={`${inputCls} w-auto`} /></div>}
        <Button variant="ghost" size="sm" onClick={exportCsv} aria-label="Export"><Download size={13} /></Button>
      </div>
      <StatGrid cols={4}>
        <Stat loading={loading} label="Orders" value={String(n)} note={days > 1 ? `${(n / days).toFixed(1)} a day` : `${uniqueBuyers} buyer${uniqueBuyers === 1 ? "" : "s"}`} tone="good" />
        <Stat loading={loading} label="Sales" value={<Money value={revenue} />} note={`${gb} GB`} />
        <Stat loading={loading} label="Delivered" value={String(delivered)} note={n ? `${Math.round((delivered / n) * 100)}%` : "—"} tone="good" />
        <Stat loading={loading} label="Waiting / refunded" value={`${waiting} / ${refunded}`} note={waiting ? "still to deliver" : "all settled"} tone={waiting ? "warn" : "default"} />
      </StatGrid>
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
