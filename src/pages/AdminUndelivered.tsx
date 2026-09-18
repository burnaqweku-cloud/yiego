import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock, Download, PackageSearch, RefreshCw, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Money, Panel, Pill, Row, Rows, Segmented, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { supabase } from "@/integrations/supabase/client";
import { adminDatabase, formatAdminDate, type AdminOrderRow } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";

/* Paid, not delivered — every order a customer has paid for that has not
   ended in delivered or refunded. Their money is with us; they have no data.
   Grouped by why it's waiting, oldest first, with the fix on each row. */

type Bucket = "all" | "verification" | "in_progress" | "review";
type SortKey = "oldest" | "newest" | "amount";
const FINANCE_START = "2026-09-12";

function bucketOf(o: AdminOrderRow): Exclude<Bucket, "all"> {
  if (o.admin_resolution_status === "awaiting_verification") return "verification";
  if (o.status === "failed_needs_review" || o.status === "failed") return "review";
  return "in_progress";
}
const BUCKET_LABEL: Record<Exclude<Bucket, "all">, string> = { verification: "Held for MTN verification", in_progress: "In progress at supplier", review: "Awaiting your decision" };
const BUCKET_HINT: Record<Exclude<Bucket, "all">, string> = { verification: "MTN checks numbers receiving a first bundle; DBH refunded these to our float. Resubmit on DBH once verified, or refund.", in_progress: "Sent to the supplier and waiting. Normal for a few minutes; look closer past an hour.", review: "Failed at the supplier. Retry, or refund the customer." };
const BUCKET_TONE: Record<Exclude<Bucket, "all">, "warn" | "default" | "bad"> = { verification: "warn", in_progress: "default", review: "bad" };

function age(from: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(from).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60); if (h < 48) return `${h} h ${mins % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export default function AdminUndelivered() {
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bucket, setBucket] = useState<Bucket>("all");
  const [sort, setSort] = useState<SortKey>("oldest");
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState<{ order: AdminOrderRow; action: "retry" | "refund" | "mark_delivered" } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (adminDatabase() as unknown as { from: (t: string) => any }).from("orders")
      .select("id, order_reference, recipient_phone, guest_email, amount, cost_amount, currency, status, payment_status, supplier_status, supplier_order_reference, supplier_retry_after, supplier_retry_count, failure_reason, admin_resolution_status, admin_resolution_reason, admin_resolution_updated_at, paid_at, created_at, updated_at, data_products(name, capacity_gb), networks(name, code), suppliers(code, name, public_name)")
      .eq("payment_status", "succeeded").gte("paid_at", FINANCE_START).not("status", "in", "(delivered,refunded,cancelled)").order("paid_at", { ascending: true });
    if (error) toast.error(error.message);
    setOrders((data ?? []) as AdminOrderRow[]); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = orders.filter((o) => (bucket === "all" || bucketOf(o) === bucket) && (!q || o.order_reference.toLowerCase().includes(q) || (o.recipient_phone ?? "").includes(q) || (o.guest_email ?? "").toLowerCase().includes(q) || (o.networks?.name ?? "").toLowerCase().includes(q) || (o.suppliers?.name ?? "").toLowerCase().includes(q)));
    return list.sort((a, b) => sort === "amount" ? Number(b.amount) - Number(a.amount) : sort === "newest" ? +new Date(b.paid_at ?? b.created_at) - +new Date(a.paid_at ?? a.created_at) : +new Date(a.paid_at ?? a.created_at) - +new Date(b.paid_at ?? b.created_at));
  }, [orders, bucket, q, sort]);
  const byBucket = useMemo(() => (["verification", "in_progress", "review"] as const).map((b) => { const mine = orders.filter((o) => bucketOf(o) === b); return { b, n: mine.length, total: mine.reduce((a, o) => a + Number(o.amount), 0), oldest: mine[0]?.paid_at ?? null }; }), [orders]);
  const total = orders.reduce((a, o) => a + Number(o.amount), 0);
  const oldest = orders[0]?.paid_at ?? null;

  const exportCsv = () => {
    const rows = [["paid at", "waiting", "reason", "order", "network", "bundle", "recipient", "amount", "supplier", "supplier status", "note"], ...filtered.map((o) => [o.paid_at ?? "", age(o.paid_at ?? o.created_at), BUCKET_LABEL[bucketOf(o)], o.order_reference, o.networks?.name ?? "", o.data_products?.name ?? "", o.recipient_phone ?? "", Number(o.amount).toFixed(2), o.suppliers?.name ?? "", o.supplier_status ?? "", (o.failure_reason ?? o.admin_resolution_reason ?? "").replace(/"/g, "'")])];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")], { type: "text/csv" })); a.download = `datayego-undelivered-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const run = async () => {
    if (!acting) return;
    const { order, action } = acting;
    if (action !== "retry" && !reason.trim()) return toast.error("Write a short reason — the customer sees it.");
    setBusy(true);
    let error: string | null = null;
    if (action === "refund") {
      const r = await supabase.functions.invoke<{ error?: string; detail?: string; method?: string }>("refund-order", { body: { orderReference: order.order_reference, reason: reason.trim() } });
      error = r.data?.detail ?? r.data?.error ?? r.error?.message ?? null;
      if (!error) toast.success(r.data?.method === "wallet" ? "Refunded to their wallet." : "Paystack refund created.");
    } else if (action === "retry") {
      const r = await supabase.functions.invoke<{ error?: string }>("admin-order-action", { body: { action: "retry", orderReference: order.order_reference } });
      error = r.data?.error ?? r.error?.message ?? null;
      if (!error) toast.success("Sent to the supplier again.");
    } else {
      const r = await supabase.functions.invoke<{ error?: string }>("admin-order-action", { body: { action: "set_display_status", displayStatus: "delivered", orderReference: order.order_reference, reason: reason.trim() } });
      error = r.data?.error ?? r.error?.message ?? null;
      if (!error) toast.success("Marked delivered.");
    }
    setBusy(false);
    if (error) return toast.error(error);
    setActing(null); setReason(""); void load();
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Paid, not delivered" description="Customers who have paid and don't have their data yet. Their money is with us until each one is delivered or refunded." action={<div className="flex gap-2"><Link to="/admin/finance"><Button variant="ghost" size="sm"><ArrowLeft size={14} />Finance</Button></Link><Button variant="ghost" size="sm" onClick={exportCsv}><Download size={14} />CSV</Button><Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={14} /></Button></div>} />

      <StatGrid cols={3}>
        <Stat loading={loading} label="Owed in data" value={<Money value={total} />} note={`${orders.length} order${orders.length === 1 ? "" : "s"}`} icon={PackageSearch} tone="warn" />
        <Stat loading={loading} label="Oldest waiting" value={oldest ? age(oldest) : "—"} note={oldest ? `paid ${formatAdminDate(oldest)}` : "nothing waiting"} icon={Clock} tone={oldest && Date.now() - +new Date(oldest) > 86400000 ? "bad" : "default"} />
        <Stat loading={loading} label="Needs you now" value={String(byBucket.find((x) => x.b === "review")?.n ?? 0)} note="failed at supplier" tone={(byBucket.find((x) => x.b === "review")?.n ?? 0) > 0 ? "bad" : "good"} />
      </StatGrid>

      <Panel title="Why they're waiting" note="tap to filter">
        <Rows empty="">{byBucket.map(({ b, n, total: t, oldest: o }) => <Row key={b} onClick={() => setBucket(bucket === b ? "all" : b)} primary={<>{BUCKET_LABEL[b]} {bucket === b && <Pill tone="good">filtering</Pill>}</>} secondary={n ? `${n} order${n === 1 ? "" : "s"} · oldest ${o ? age(o) : "—"} · ${BUCKET_HINT[b]}` : BUCKET_HINT[b]} right={formatGHS(t)} rightNote={`${n} orders`} tone={n ? BUCKET_TONE[b] : "default"} />)}</Rows>
      </Panel>

      <Panel title="Orders" note={`${filtered.length} shown`}>
        <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="relative block"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order, phone, email, network, supplier" className={`${inputCls} pl-8`} /></label>
          <Segmented<SortKey> value={sort} onChange={setSort} options={[{ value: "oldest", label: "Oldest first" }, { value: "newest", label: "Newest" }, { value: "amount", label: "Amount" }]} />
        </div>
        <Rows empty={loading ? "Loading…" : "Nothing waiting. Every paid order is delivered or refunded."}>
          {filtered.map((o) => { const b = bucketOf(o); const paid = o.paid_at ?? o.created_at; return (
            <li key={o.id} className="py-2">
              <div className="flex items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-foreground"><Link to={`/admin/orders?q=${o.order_reference}`} className="font-mono">{o.order_reference}</Link> <span className="font-normal text-muted-foreground">· {o.networks?.name} {o.data_products?.capacity_gb}GB → {o.recipient_phone}</span></p>
                  <p className="text-[11px] text-faint-foreground">paid {formatAdminDate(paid)} · waiting <b className={Date.now() - +new Date(paid) > 86400000 ? "text-amber" : ""}>{age(paid)}</b> · {o.suppliers?.name ?? "no supplier"}{o.supplier_status ? ` says ${o.supplier_status}` : ""}{o.guest_email ? ` · ${o.guest_email}` : ""}</p>
                  {(o.failure_reason || o.admin_resolution_reason) && <p className="mt-0.5 text-[11px] text-muted-foreground">{b === "verification" ? "Held: MTN first-time verification" : o.failure_reason}</p>}
                </div>
                <div className="text-right"><p className="text-[12.5px] font-semibold tabular-nums">{formatGHS(Number(o.amount))}</p><Pill tone={BUCKET_TONE[b]}>{b === "verification" ? "verification" : b === "review" ? "review" : "in progress"}</Pill></div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {b !== "in_progress" && <Button size="sm" variant="soft" onClick={() => { setActing({ order: o, action: "retry" }); setReason(""); }}>Retry</Button>}
                <Button size="sm" variant="quiet" onClick={() => { setActing({ order: o, action: "refund" }); setReason(""); }}>Refund</Button>
                <Button size="sm" variant="quiet" onClick={() => { setActing({ order: o, action: "mark_delivered" }); setReason(""); }}>Mark delivered</Button>
              </div>
            </li>); })}
        </Rows>
      </Panel>

      <Modal open={acting !== null} onClose={() => setActing(null)} label="Order action">
        <div className="w-[min(92vw,400px)] p-5">
          <h2 className="text-[16px] font-semibold text-foreground">{acting?.action === "retry" ? "Send again" : acting?.action === "refund" ? "Refund the customer" : "Mark as delivered"} · {acting?.order.order_reference}</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">{acting?.action === "retry" ? `Sends ${acting.order.networks?.name} ${acting.order.data_products?.capacity_gb}GB to the network's current supplier. Costs money if it goes through.` : acting?.action === "refund" ? `${formatGHS(Number(acting.order.amount))} goes back to the customer — wallet instantly, Paystack in a few days. The order closes.` : "Only if you know the data arrived (e.g. you resubmitted it on the supplier's portal). Books it as revenue."}</p>
          {acting?.action !== "retry" && <div className="mt-3"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={acting?.action === "refund" ? "Reason the customer will see" : "How you know it was delivered"} className={inputCls} /></div>}
          <div className="mt-4 flex justify-end gap-2"><Button variant="quiet" onClick={() => setActing(null)}>Cancel</Button><Button onClick={() => void run()} disabled={busy}>{busy ? "Working…" : acting?.action === "retry" ? "Send again" : acting?.action === "refund" ? "Refund" : "Mark delivered"}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
