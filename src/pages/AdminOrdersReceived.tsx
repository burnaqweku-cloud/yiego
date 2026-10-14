import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ClipboardCopy, Download, Infinity as InfinityIcon, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Money, Panel, Pill, Segmented, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import CopyRef from "@/components/admin/CopyRef";
import SupplierBadge, { useFallbackOrigins } from "@/components/admin/SupplierBadge";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";

/* Orders received, drilled in: every order behind one of the cards on the
   Orders page, for the same day or range. */
type Bucket = "all" | "delivered" | "waiting" | "refunded";
type Source = "all" | "platform" | "agents";
type Stage = "all" | "in_progress" | "awaiting_refund" | "verification" | "review" | "no_float";
const NO_FLOAT = /insufficient (wallet )?balance|insufficient funds|low balance/i;
const FAILED_STATUSES = new Set(["failed", "rejected", "cancelled", "canceled"]);
// "Awaiting refund": the supplier failed it but has not refunded yet; nothing can happen until they do (then it moves on by itself).
const awaitingRefund = (o: Row) => o.status === "processing" && FAILED_STATUSES.has((o.supplier_status ?? "").toLowerCase());
const stageOf = (o: Row): Exclude<Stage, "all"> => o.admin_resolution_status === "awaiting_verification" ? "verification" : o.status.startsWith("failed") ? (NO_FLOAT.test(o.failure_reason ?? "") ? "no_float" : "review") : awaitingRefund(o) ? "awaiting_refund" : "in_progress";
const STAGE_LABEL: Record<Stage, string> = { all: "All", in_progress: "In progress", awaiting_refund: "Awaiting refund", verification: "Verification", review: "Needs review", no_float: "Supplier no money" };
interface Row { id: string; order_reference: string; recipient_phone: string; amount: number; cost_amount: number | null; supplier_order_reference: string | null; status: string; supplier_status: string | null; failure_reason: string | null; admin_resolution_status: string | null; paid_at: string; agent_id: string | null; networks: { name: string } | null; data_products: { name: string; capacity_gb: number } | null; suppliers: { code: string; name: string } | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any };
const startOfDay = (d: Date) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setUTCHours(23, 59, 59, 999); return x; };
const age = (from: string) => { const m = Math.max(0, Math.round((Date.now() - +new Date(from)) / 60000)); return m < 60 ? `${m} min` : m < 2880 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`; };
const BUCKET_TITLE: Record<Bucket, string> = { all: "All orders", delivered: "Delivered", waiting: "Waiting to deliver", refunded: "Refunded" };

export default function AdminOrdersReceived() {
  const [params, setParams] = useSearchParams();
  const bucket = (params.get("bucket") as Bucket) || "all";
  const source = (params.get("source") as Source) || "all";
  const from = params.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = params.get("to") ?? from;
  const allTime = params.get("all") === "1"; // off by default: the date range rules unless the admin switches it on; loads only waiting orders
  const [rows, setRows] = useState<Row[]>([]);
  const origins = useFallbackOrigins(rows);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const stage = (params.get("stage") as Stage) || "all";
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }); };

  const [tick, setTick] = useState(0);
  const [retrying, setRetrying] = useState<string | null>(null);
  // Same retry as the order page: re-sends a failed paid order to the supplier.
  const retry = async (o: Row) => {
    setRetrying(o.id);
    const r = await supabase.functions.invoke<{ error?: string; result?: { status?: string; reason?: string } }>("admin-order-action", { body: { action: "retry", orderReference: o.order_reference } });
    setRetrying(null);
    if (r.error || r.data?.error) return toast.error(r.data?.error ?? r.error?.message ?? "Retry failed.");
    if (r.data?.result?.status === "failed_needs_review") return toast.error(`Not sent: ${(r.data.result.reason ?? "supplier refused").replace(/_/g, " ")}`);
    toast.success(`${o.order_reference} sent to the supplier.`); setTick((t) => t + 1);
  };
  useEffect(() => {
    let mounted = true; setLoading(true);
    // The API returns at most 1000 rows per read. A date range fits; "All time" would not, so it fetches only the
    // orders still waiting (the other buckets are per-range anyway) in pages of 1000.
    const cols = "id, order_reference, recipient_phone, amount, cost_amount, supplier_order_reference, status, supplier_status, failure_reason, admin_resolution_status, paid_at, agent_id, networks(name), data_products(name, capacity_gb), suppliers(code, name)";
    const fetchAll = async () => {
      if (!allTime) { const r = await db().from("orders").select(cols).eq("payment_status", "succeeded").gte("paid_at", startOfDay(new Date(from)).toISOString()).lte("paid_at", endOfDay(new Date(to)).toISOString()).order("paid_at", { ascending: false }).limit(1000); return (r.data ?? []) as Row[]; }
      const out: Row[] = []; for (let page = 0; page < 20; page++) { const r = await db().from("orders").select(cols).eq("payment_status", "succeeded").not("status", "in", "(delivered,refunded,cancelled)").order("paid_at", { ascending: false }).range(page * 1000, page * 1000 + 999); const batch = (r.data ?? []) as Row[]; out.push(...batch); if (batch.length < 1000) break; }
      return out;
    };
    void fetchAll().then((data) => { if (mounted) { setRows(data); setLoading(false); } });
    return () => { mounted = false; };
  }, [from, to, allTime, tick]);

  const inBucket = (o: Row) => bucket === "all" || (bucket === "delivered" && o.status === "delivered") || (bucket === "refunded" && o.status === "refunded") || (bucket === "waiting" && !["delivered", "refunded", "cancelled"].includes(o.status));
  const inSource = (o: Row) => source === "all" || (source === "agents" ? o.agent_id != null : o.agent_id == null);
  const q = search.trim().toLowerCase();
  const inStage = (o: Row) => bucket !== "waiting" || stage === "all" || stageOf(o) === stage;
  const list = useMemo(() => rows.filter((o) => inBucket(o) && inSource(o) && inStage(o) && (!q || o.order_reference.toLowerCase().includes(q) || o.recipient_phone.includes(q) || (o.networks?.name ?? "").toLowerCase().includes(q))), [rows, bucket, source, stage, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const waitingRows = rows.filter((o) => inSource(o) && !["delivered", "refunded", "cancelled"].includes(o.status));
  const stageCounts = (["in_progress", "awaiting_refund", "verification", "review", "no_float"] as const).map((st) => ({ st, n: waitingRows.filter((o) => stageOf(o) === st).length }));
  const counts = { all: rows.filter(inSource).length, delivered: rows.filter((o) => inSource(o) && o.status === "delivered").length, waiting: rows.filter((o) => inSource(o) && !["delivered", "refunded", "cancelled"].includes(o.status)).length, refunded: rows.filter((o) => inSource(o) && o.status === "refunded").length };
  const total = list.reduce((a, o) => a + Number(o.amount), 0);
  const reasonOf = (o: Row) => o.admin_resolution_status === "awaiting_verification" ? "MTN verification" : o.status === "failed_needs_review" ? (o.failure_reason ?? "failed at supplier") : awaitingRefund(o) ? `${o.suppliers?.name ?? "supplier"} ${o.supplier_status} — waiting for their refund, then it moves on by itself` : o.status === "processing" ? `${o.suppliers?.name ?? "supplier"} says ${o.supplier_status ?? "processing"}` : o.status.replace(/_/g, " ");

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
        <Stat loading={loading} label="Waiting" value={String(counts.waiting)} note={(() => { const n = rows.filter((o) => inSource(o) && awaitingRefund(o)).length; return n ? `${n} awaiting a supplier refund` : undefined; })()} tone={bucket === "waiting" ? "warn" : "default"} onClick={() => set("bucket", "waiting")} />
        <Stat loading={loading} label="Refunded" value={String(counts.refunded)} tone={bucket === "refunded" ? "bad" : "default"} onClick={() => set("bucket", "refunded")} />
      </StatGrid>
      <Panel title={BUCKET_TITLE[bucket]} note={`${list.length} orders · ${formatGHS(total)}${allTime ? " · all time" : ""}`} action={<div className="flex items-center gap-1.5">
        {bucket === "waiting" && <Button size="sm" variant={allTime ? "primary" : "ghost"} onClick={() => set("all", allTime ? "0" : "1")} title="Ignore the dates and show every waiting order since launch"><InfinityIcon size={14} />All time</Button>}
        {bucket === "waiting" && stage === "awaiting_refund" && list.length > 0 && <Button size="sm" variant="ghost" title="Copy these orders in a form you can paste to the supplier's support" onClick={() => {
          const bySupplier = new Map<string, Row[]>(); for (const o of list) { const k = o.suppliers?.name ?? "Supplier"; bySupplier.set(k, [...(bySupplier.get(k) ?? []), o]); }
          const text = [...bySupplier.entries()].map(([name, rows]) => `${name} — ${rows.length} order${rows.length === 1 ? "" : "s"} marked ${[...new Set(rows.map((o) => o.supplier_status))].join("/")} but not yet refunded:\n` + rows.map((o, i) => `${i + 1}. Ref ${o.order_reference}${o.supplier_order_reference ? ` (your ID ${o.supplier_order_reference})` : ""} · ${o.networks?.name ?? ""} ${o.data_products?.capacity_gb ?? ""}GB · ${o.recipient_phone} · charged GH₵${Number(o.cost_amount ?? 0).toFixed(2)} · ${formatAdminDate(o.paid_at)} · status ${o.supplier_status}`).join("\n") + "\nPlease refund these to our balance or confirm their status. Thank you.").join("\n\n");
          void navigator.clipboard.writeText(text).then(() => toast.success(`${list.length} order${list.length === 1 ? "" : "s"} copied for the supplier.`));
        }}><ClipboardCopy size={14} />Copy all</Button>}
      </div>}>
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
                <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-foreground"><SupplierBadge supplier={o.suppliers} from={origins[o.id]} /><CopyRef value={o.order_reference} /> <span className="font-normal text-muted-foreground">· {o.networks?.name} {o.data_products?.capacity_gb}GB → {o.recipient_phone}</span></p>
                <p className="text-[11px] text-faint-foreground">paid {formatAdminDate(o.paid_at)} · {age(o.paid_at)} ago · {reasonOf(o)}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5 text-right"><p className="text-[12.5px] font-semibold tabular-nums">{formatGHS(Number(o.amount))}</p><Pill tone={o.status === "delivered" ? "good" : o.status === "refunded" ? "bad" : "warn"}>{o.status === "delivered" ? "delivered" : o.status === "refunded" ? "refunded" : o.admin_resolution_status === "awaiting_verification" ? "verification" : o.admin_resolution_status === "wrong_network" ? "wrong network" : o.status.startsWith("failed") ? "review" : awaitingRefund(o) ? "awaiting refund" : "in progress"}</Pill>{stageOf(o) === "no_float" && <button type="button" disabled={retrying === o.id} onClick={() => void retry(o)} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11.5px] font-medium text-foreground disabled:opacity-50"><RotateCcw size={11} />{retrying === o.id ? "Sending…" : "Retry"}</button>}</div>
            </li>))}
        </ul>
      </Panel>
    </div>
  );
}
