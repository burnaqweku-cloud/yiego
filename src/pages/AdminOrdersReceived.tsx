import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Download, Search } from "lucide-react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Money, Panel, Pill, Segmented, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";

/* Orders received, drilled in: every order behind one of the cards on the
   Orders page, for the same day or range. */
type Bucket = "all" | "delivered" | "waiting" | "refunded";
type Source = "all" | "platform" | "agents";
type Stage = "all" | "in_progress" | "verification" | "review" | "no_float";
const NO_FLOAT = /insufficient (wallet )?balance|insufficient funds|low balance/i;
const stageOf = (o: Row): Exclude<Stage, "all"> => o.admin_resolution_status === "awaiting_verification" ? "verification" : o.status.startsWith("failed") ? (NO_FLOAT.test(o.failure_reason ?? "") ? "no_float" : "review") : "in_progress";
const STAGE_LABEL: Record<Stage, string> = { all: "All", in_progress: "In progress", verification: "Verification", review: "Needs review", no_float: "Supplier no money" };
interface Row { id: string; order_reference: string; recipient_phone: string; amount: number; status: string; supplier_status: string | null; failure_reason: string | null; admin_resolution_status: string | null; paid_at: string; agent_id: string | null; networks: { name: string } | null; data_products: { name: string; capacity_gb: number } | null; suppliers: { name: string } | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any };
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const age = (from: string) => { const m = Math.max(0, Math.round((Date.now() - +new Date(from)) / 60000)); return m < 60 ? `${m} min` : m < 2880 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`; };
const BUCKET_TITLE: Record<Bucket, string> = { all: "All orders", delivered: "Delivered", waiting: "Waiting to deliver", refunded: "Refunded" };

export default function AdminOrdersReceived() {
  const [params, setParams] = useSearchParams();
  const bucket = (params.get("bucket") as Bucket) || "all";
  const source = (params.get("source") as Source) || "all";
  const from = params.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = params.get("to") ?? from;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const stage = (params.get("stage") as Stage) || "all";
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }); };

  useEffect(() => {
    let mounted = true; setLoading(true);
    db().from("orders").select("id, order_reference, recipient_phone, amount, status, supplier_status, failure_reason, admin_resolution_status, paid_at, agent_id, networks(name), data_products(name, capacity_gb), suppliers(name)")
      .eq("payment_status", "succeeded").gte("paid_at", startOfDay(new Date(from)).toISOString()).lte("paid_at", endOfDay(new Date(to)).toISOString()).order("paid_at", { ascending: false }).limit(5000)
      .then((r: { data: Row[] | null }) => { if (mounted) { setRows(r.data ?? []); setLoading(false); } });
    return () => { mounted = false; };
  }, [from, to]);

  const inBucket = (o: Row) => bucket === "all" || (bucket === "delivered" && o.status === "delivered") || (bucket === "refunded" && o.status === "refunded") || (bucket === "waiting" && !["delivered", "refunded", "cancelled"].includes(o.status));
  const inSource = (o: Row) => source === "all" || (source === "agents" ? o.agent_id != null : o.agent_id == null);
  const q = search.trim().toLowerCase();
  const inStage = (o: Row) => bucket !== "waiting" || stage === "all" || stageOf(o) === stage;
  const list = useMemo(() => rows.filter((o) => inBucket(o) && inSource(o) && inStage(o) && (!q || o.order_reference.toLowerCase().includes(q) || o.recipient_phone.includes(q) || (o.networks?.name ?? "").toLowerCase().includes(q))), [rows, bucket, source, stage, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const waitingRows = rows.filter((o) => inSource(o) && !["delivered", "refunded", "cancelled"].includes(o.status));
  const stageCounts = (["in_progress", "verification", "review", "no_float"] as const).map((st) => ({ st, n: waitingRows.filter((o) => stageOf(o) === st).length }));
  const counts = { all: rows.filter(inSource).length, delivered: rows.filter((o) => inSource(o) && o.status === "delivered").length, waiting: rows.filter((o) => inSource(o) && !["delivered", "refunded", "cancelled"].includes(o.status)).length, refunded: rows.filter((o) => inSource(o) && o.status === "refunded").length };
  const total = list.reduce((a, o) => a + Number(o.amount), 0);
  const reasonOf = (o: Row) => o.admin_resolution_status === "awaiting_verification" ? "MTN verification" : o.status === "failed_needs_review" ? (o.failure_reason ?? "failed at supplier") : o.status === "processing" ? `${o.suppliers?.name ?? "supplier"} says ${o.supplier_status ?? "processing"}` : o.status.replace(/_/g, " ");

  const exportCsv = () => {
    const lines = [["paid at", "order", "network", "bundle", "recipient", "amount", "status", "detail", "source"], ...list.map((o) => [o.paid_at, o.order_reference, o.networks?.name ?? "", o.data_products?.name ?? "", o.recipient_phone, Number(o.amount).toFixed(2), o.status, reasonOf(o).replace(/"/g, "'"), o.agent_id ? "agent" : "platform"])];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")], { type: "text/csv" })); a.download = `datayego-orders-${bucket}-${from}-${to}.csv`; a.click();
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title={`${BUCKET_TITLE[bucket]} · ${from === to ? from : `${from} → ${to}`}`} description="Every order behind the card, for the same day or range." action={<div className="flex gap-2"><Link to="/admin/orders"><Button variant="ghost" size="sm"><ArrowLeft size={14} />Orders</Button></Link><Button variant="ghost" size="sm" onClick={exportCsv}><Download size={14} />CSV</Button></div>} />
      <StatGrid cols={4}>
        <Stat loading={loading} label="All" value={String(counts.all)} tone={bucket === "all" ? "good" : "default"} onClick={() => set("bucket", "all")} />
        <Stat loading={loading} label="Delivered" value={String(counts.delivered)} tone={bucket === "delivered" ? "good" : "default"} onClick={() => set("bucket", "delivered")} />
        <Stat loading={loading} label="Waiting" value={String(counts.waiting)} tone={bucket === "waiting" ? "warn" : "default"} onClick={() => set("bucket", "waiting")} />
        <Stat loading={loading} label="Refunded" value={String(counts.refunded)} tone={bucket === "refunded" ? "bad" : "default"} onClick={() => set("bucket", "refunded")} />
      </StatGrid>
      <Panel title={BUCKET_TITLE[bucket]} note={`${list.length} orders · ${formatGHS(total)}`}>
        <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label className="relative block"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order, phone, network" className={`${inputCls} pl-8`} /></label>
          <Segmented<Source> value={source} onChange={(v) => set("source", v)} options={[{ value: "all", label: "All" }, { value: "platform", label: "YG" }, { value: "agents", label: "Agents" }]} />
          <div className="flex items-center gap-1.5"><input type="date" value={from} max={to} onChange={(e) => set("from", e.target.value)} className={`${inputCls} w-auto`} /><span className="text-[11px] text-faint-foreground">to</span><input type="date" value={to} min={from} onChange={(e) => set("to", e.target.value)} className={`${inputCls} w-auto`} /></div>
        </div>
        {bucket === "waiting" && (
          <div className="mb-2"><Segmented<Stage> value={stage} onChange={(v) => set("stage", v)} options={[{ value: "all", label: `All (${waitingRows.length})` }, ...stageCounts.filter((x) => x.n > 0).map((x) => ({ value: x.st, label: `${STAGE_LABEL[x.st]} (${x.n})` }))]} /></div>
        )}
        <ul className="divide-y divide-white/[0.06]">
          {!loading && list.length === 0 && <li className="py-5 text-center text-[12px] text-faint-foreground">Nothing here for this filter.</li>}
          {list.map((o) => (
            <li key={o.id} className="flex items-start gap-2.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold text-foreground"><Link to={`/admin/orders?q=${o.order_reference}`} className="font-mono">{o.order_reference}</Link> <span className="font-normal text-muted-foreground">· {o.networks?.name} {o.data_products?.capacity_gb}GB → {o.recipient_phone}</span></p>
                <p className="text-[11px] text-faint-foreground">paid {formatAdminDate(o.paid_at)} · {age(o.paid_at)} ago · {reasonOf(o)}</p>
              </div>
              <div className="text-right"><p className="text-[12.5px] font-semibold tabular-nums">{formatGHS(Number(o.amount))}</p><Pill tone={o.status === "delivered" ? "good" : o.status === "refunded" ? "bad" : "warn"}>{o.status === "delivered" ? "delivered" : o.status === "refunded" ? "refunded" : o.admin_resolution_status === "awaiting_verification" ? "verification" : o.status.startsWith("failed") ? "review" : "in progress"}</Pill></div>
            </li>))}
        </ul>
      </Panel>
    </div>
  );
}
