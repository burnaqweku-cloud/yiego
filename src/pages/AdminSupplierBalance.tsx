import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, RefreshCw, Store } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Money, Panel, Pill, Row, Rows, Segmented, Stat, StatGrid } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { RecordTopupModal } from "@/components/admin/FinanceForms";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { useAuth } from "@/store/auth-context";

/* One supplier's money: what they report, what our books say, where it went. */
interface Supplier { id: string; code: string; name: string; status: string; confirmed_balance: number | null; confirmed_at: string | null }
interface Reading { balance: number; observed_at: string; source: string }
interface Topup { id: string; amount: number; occurred_at: string; note: string | null; metadata: { fee?: number } | null }
interface Ord { order_reference: string; recipient_phone: string; cost_amount: number | null; amount: number; status: string; supplier_status: string | null; paid_at: string; data_products: { capacity_gb: number } | null; networks: { name: string } | null }
type Range = "today" | "7d" | "30d" | "all";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any };
const since = (r: Range) => r === "all" ? "2026-09-12" : new Date(Date.now() - (r === "today" ? 0 : r === "7d" ? 6 : 29) * 86400000).toISOString().slice(0, 10);

export default function AdminSupplierBalance() {
  const { code = "" } = useParams(); const { user } = useAuth();
  const [s, setS] = useState<Supplier | null>(null); const [readings, setReadings] = useState<Reading[]>([]); const [topups, setTopups] = useState<Topup[]>([]); const [orders, setOrders] = useState<Ord[]>([]);
  const [float, setFloat] = useState(0); const [range, setRange] = useState<Range>("7d"); const [loading, setLoading] = useState(true); const [topping, setTopping] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const { data: sup } = await db().from("suppliers").select("id, code, name, status, confirmed_balance, confirmed_at").eq("code", code).maybeSingle();
    if (!sup) { setS(null); setLoading(false); return; }
    setS(sup);
    const [r, t, o, f] = await Promise.all([
      db().from("supplier_balance_readings").select("balance, observed_at, source").eq("supplier_id", sup.id).order("observed_at", { ascending: false }).limit(60),
      db().from("finance_entries").select("id, amount, occurred_at, note, metadata").eq("supplier_id", sup.id).eq("kind", "supplier_topup").order("occurred_at", { ascending: false }),
      db().from("orders").select("order_reference, recipient_phone, cost_amount, amount, status, supplier_status, paid_at, data_products(capacity_gb), networks(name)").eq("supplier_id", sup.id).eq("payment_status", "succeeded").gte("paid_at", `${since(range)}T00:00:00`).order("paid_at", { ascending: false }).limit(2000),
      db().from("finance_balances").select("balance").eq("code", `float_${code}`).maybeSingle(),
    ]);
    setReadings(r.data ?? []); setTopups(t.data ?? []); setOrders(o.data ?? []); setFloat(Number(f.data?.balance ?? 0)); setLoading(false);
  }, [code, range]);
  useEffect(() => { void load(); }, [load]);

  const delivered = useMemo(() => orders.filter((o) => o.status === "delivered"), [orders]);
  const spent = delivered.reduce((a, o) => a + Number(o.cost_amount ?? 0), 0);
  const inFlight = orders.filter((o) => !["delivered", "refunded", "cancelled"].includes(o.status));
  const inFlightCost = inFlight.reduce((a, o) => a + Number(o.cost_amount ?? 0), 0);
  const failed = orders.filter((o) => o.status.startsWith("failed") || o.status === "refunded").length;
  const gb = delivered.reduce((a, o) => a + Number(o.data_products?.capacity_gb ?? 0), 0);
  const reported = Number(s?.confirmed_balance ?? 0);
  const topupTotal = topups.reduce((a, t) => a + Number(t.amount), 0);
  const daysCover = spent > 0 && range !== "today" ? reported / (spent / (range === "7d" ? 7 : range === "30d" ? 30 : Math.max(1, Math.ceil((Date.now() - +new Date("2026-09-12")) / 86400000)))) : null;

  const exportCsv = () => {
    const lines = [["paid at", "order", "network", "gb", "recipient", "cost", "status"], ...orders.map((o) => [o.paid_at, o.order_reference, o.networks?.name ?? "", String(o.data_products?.capacity_gb ?? ""), o.recipient_phone, Number(o.cost_amount ?? 0).toFixed(2), o.status])];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")], { type: "text/csv" })); a.download = `datayego-${code}-${range}.csv`; a.click();
  };

  if (!loading && !s) return <div className="text-[13px] text-muted-foreground">No supplier called “{code}”.</div>;
  return (
    <div className="space-y-5">
      <AdminPageHeader title={s?.name ?? "Supplier"} description="Their balance as they report it, what our books say, and where the money went." action={<div className="flex gap-2"><Link to="/admin/finance"><Button variant="ghost" size="sm"><ArrowLeft size={14} />Finance</Button></Link><Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={14} /></Button><Button size="sm" onClick={() => setTopping(true)}>Record top-up</Button></div>} />

      <Panel title="Balance" icon={Store} note={s?.confirmed_at ? `reported ${formatAdminDate(s.confirmed_at)}` : "not reported yet"}>
        <p className={`text-[30px] font-semibold leading-none tabular-nums ${reported < 30 ? "text-ink-rose" : reported < 80 ? "text-amber" : "text-ink-emerald"}`}>{loading ? "…" : formatGHS(reported)}</p>
        <p className="mt-1.5 text-[12px] text-muted-foreground">Books say {formatGHS(float)} · {inFlight.length ? `${formatGHS(inFlightCost)} tied up in ${inFlight.length} order${inFlight.length === 1 ? "" : "s"} in flight` : "nothing in flight"}{daysCover != null ? ` · about ${daysCover.toFixed(1)} days of cover at the current pace` : ""}</p>
        {reported < 50 && <p className="mt-2 text-[12px] text-amber">Running low — top up before orders start failing.</p>}
      </Panel>

      <div className="flex items-center justify-between gap-2"><Segmented<Range> value={range} onChange={setRange} options={[{ value: "today", label: "Today" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "all", label: "Since launch" }]} /><Button variant="ghost" size="sm" onClick={exportCsv}><Download size={14} />CSV</Button></div>
      <StatGrid cols={4}>
        <Stat loading={loading} label="Spent here" value={<Money value={spent} />} note={`${delivered.length} delivered · ${gb} GB`} />
        <Stat loading={loading} label="In flight" value={<Money value={inFlightCost} />} note={`${inFlight.length} orders`} tone={inFlight.length ? "warn" : "default"} />
        <Stat loading={loading} label="Failed / refunded" value={String(failed)} note="in this period" tone={failed ? "bad" : "default"} />
        <Stat loading={loading} label="Topped up (all time)" value={<Money value={topupTotal} />} note={`${topups.length} top-ups`} tone="good" />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Balance readings" note="as the supplier reported it">
          <Rows empty={loading ? "Loading…" : "No readings yet."}>{readings.slice(0, 20).map((r, i) => { const prev = readings[i + 1]; const delta = prev ? Number(r.balance) - Number(prev.balance) : null; return <Row key={r.observed_at} primary={formatGHS(Number(r.balance))} secondary={`${formatAdminDate(r.observed_at)} · ${r.source}`} right={delta == null ? "" : `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`} tone={delta == null ? "default" : delta >= 0 ? "good" : "muted"} />; })}</Rows>
        </Panel>
        <Panel title="Top-ups" note="money sent to this supplier">
          <Rows empty={loading ? "Loading…" : "No top-ups recorded."}>{topups.map((t) => <Row key={t.id} primary={formatGHS(Number(t.amount))} secondary={`${formatAdminDate(t.occurred_at)}${t.note ? ` · ${t.note}` : ""}`} right={t.metadata?.fee ? `+ ${formatGHS(Number(t.metadata.fee))} charge` : ""} tone="good" />)}</Rows>
        </Panel>
      </div>

      <Panel title="Orders through this supplier" note={`${orders.length} in period`}>
        <ul className="divide-y divide-white/[0.06]">
          {!loading && orders.length === 0 && <li className="py-5 text-center text-[12px] text-faint-foreground">No orders in this period.</li>}
          {orders.slice(0, 150).map((o) => <li key={o.order_reference} className="flex items-center justify-between gap-2 py-2"><div className="min-w-0"><p className="text-[12.5px] font-semibold text-foreground"><Link to={`/admin/orders?q=${o.order_reference}`} className="font-mono">{o.order_reference}</Link> <span className="font-normal text-muted-foreground">· {o.networks?.name} {o.data_products?.capacity_gb}GB → {o.recipient_phone}</span></p><p className="text-[11px] text-faint-foreground">{formatAdminDate(o.paid_at)}{o.supplier_status ? ` · supplier says ${o.supplier_status}` : ""}</p></div><div className="text-right"><p className="text-[12.5px] font-semibold tabular-nums">{formatGHS(Number(o.cost_amount ?? 0))}</p><Pill tone={o.status === "delivered" ? "good" : o.status === "refunded" || o.status.startsWith("failed") ? "bad" : "warn"}>{o.status === "delivered" ? "delivered" : o.status.startsWith("failed") ? "failed" : o.status.replace(/_/g, " ")}</Pill></div></li>)}
          {orders.length > 150 && <li className="py-2 text-center text-[11px] text-faint-foreground">Showing 150 of {orders.length} — use CSV for all.</li>}
        </ul>
      </Panel>

      {s && <RecordTopupModal open={topping} onClose={() => setTopping(false)} actorId={user?.id ?? ""} suppliers={[{ code: s.code, name: s.name, fee_rate: 0 }]} onDone={() => { toast.success("Top-up recorded."); void load(); }} />}
    </div>
  );
}
