import { useCallback, useEffect, useMemo, useState } from "react";
import { Clipboard, ClipboardCheck, ClipboardList, FilterX, Loader2, RefreshCw, RotateCcw, Save, Search } from "lucide-react";
import { toast } from "sonner";
import AdminListPagination from "@/components/admin/AdminListPagination";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminRecordModal, { AdminDetailsButton } from "@/components/admin/AdminRecordModal";
import AdminStatStrip from "@/components/admin/AdminStatStrip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import { adminDatabase, formatAdminDate, readableStatus, type AdminOrderEventRow, type AdminOrderRow } from "@/lib/admin-data";

const LIFECYCLE_STATUSES = ["created", "awaiting_payment", "paid", "processing", "pending_supplier", "delivered", "failed", "failed_needs_review", "cancelled", "refunded"];
const PAYMENT_STATUSES = ["created", "pending", "succeeded", "failed", "abandoned", "refunded"];
const SUPPLIER_STATUSES = ["not_sent", "waiting", "pending", "processing", "completed", "success", "failed", "refunded", "timeout", "unknown"];
const CUSTOMER_STATUSES = ["processing", "pending_supplier", "delivered", "failed", "cancelled", "refunded"];
const PENDING_STATUSES = ["created", "awaiting_payment", "paid", "processing", "pending_supplier"];
const FAILED_STATUSES = ["failed", "failed_needs_review"];

function displayedStatus(order: AdminOrderRow) {
  return order.admin_resolution_status ?? order.status;
}

function normalizedSupplierStatus(order: AdminOrderRow) {
  return (order.supplier_status ?? "not_sent").toLowerCase();
}

function supportMessage(order: AdminOrderRow) {
  const reference = order.order_reference;
  const status = displayedStatus(order);
  if (order.admin_resolution_reason) return `Hello, your YieGo order ${reference} is currently ${readableStatus(status).toLowerCase()}. ${order.admin_resolution_reason}`;
  if (order.payment_status === "failed") return `Hello, payment for your YieGo order ${reference} was not completed. No successful payment has been confirmed.`;
  if (["created", "pending"].includes(order.payment_status) || status === "awaiting_payment") return `Hello, your YieGo order ${reference} is awaiting payment. You can continue the payment before the order expires.`;
  if (["paid", "processing"].includes(status)) return `Hello, payment for your YieGo order ${reference} has been confirmed and your data order is being prepared.`;
  if (status === "pending_supplier") return `Hello, your YieGo order ${reference} is currently being delivered. Delivery is taking a little longer than usual, and we are monitoring it.`;
  if (status === "delivered") return `Hello, your YieGo order ${reference} is marked as completed. Please contact support if the data has not appeared on the recipient number.`;
  if (status === "refunded") return `Hello, your YieGo order ${reference} is marked as refunded. The refund is returned through the original payment channel.`;
  if (status === "cancelled") return `Hello, your YieGo order ${reference} has been cancelled and will not be delivered.`;
  if (FAILED_STATUSES.includes(status)) return `Hello, your YieGo order ${reference} could not be completed. Our team can review the order and advise on the next step.`;
  return `Hello, your YieGo order ${reference} is currently ${readableStatus(status).toLowerCase()}.`;
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [lookup, setLookup] = useState("");
  const [lookedUp, setLookedUp] = useState<AdminOrderRow | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<AdminOrderRow | null>(null);
  const [events, setEvents] = useState<AdminOrderEventRow[]>([]);
  const [displayStatus, setDisplayStatus] = useState("processing");
  const [reason, setReason] = useState("");
  const [runningAction, setRunningAction] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const { data, error } = await adminDatabase().from<AdminOrderRow>("orders").select("id, order_reference, recipient_phone, guest_email, amount, cost_amount, currency, status, payment_status, supplier_status, supplier_order_reference, failure_reason, admin_resolution_status, admin_resolution_reason, admin_resolution_updated_at, created_at, updated_at, data_products(name, capacity_gb), networks(name, code)").order("created_at", { ascending: false });
    if (error) { toast.error("Could not load orders."); setOrders([]); }
    else {
      const next = (data ?? []) as AdminOrderRow[];
      setOrders(next);
      setSelected((current) => current ? next.find((order) => order.id === current.id) ?? null : null);
      setLookedUp((current) => current ? next.find((order) => order.id === current.id) ?? current : null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);
  useEffect(() => { setPage(1); }, [search, lifecycleFilter, paymentFilter, supplierFilter, customerFilter, pageSize]);

  const loadEvents = useCallback(async (orderId: string) => {
    const { data } = await adminDatabase().from<AdminOrderEventRow>("order_events").select("id, event_type, from_status, to_status, message, created_at").eq("order_id", orderId).order("created_at", { ascending: false });
    setEvents((data ?? []) as AdminOrderEventRow[]);
  }, []);

  const openDetails = (order: AdminOrderRow) => {
    setSelected(order);
    setDisplayStatus(order.admin_resolution_status ?? "processing");
    setReason("");
    void loadEvents(order.id);
  };

  const pending = orders.filter((order) => PENDING_STATUSES.includes(order.status)).length;
  const delivered = orders.filter((order) => order.status === "delivered").length;
  const failed = orders.filter((order) => FAILED_STATUSES.includes(order.status)).length;

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return orders.filter((order) => {
      const customerStatus = displayedStatus(order);
      const supplierStatus = normalizedSupplierStatus(order);
      const matchesLifecycle = lifecycleFilter === "all" || (lifecycleFilter === "in_progress" && PENDING_STATUSES.includes(order.status)) || (lifecycleFilter === "failed_group" && FAILED_STATUSES.includes(order.status)) || order.status === lifecycleFilter;
      const matchesPayment = paymentFilter === "all" || order.payment_status === paymentFilter;
      const matchesSupplier = supplierFilter === "all" || supplierStatus === supplierFilter;
      const matchesCustomer = customerFilter === "all" || customerStatus === customerFilter;
      const matchesSearch = !needle || [order.order_reference, order.recipient_phone, order.supplier_order_reference ?? "", order.status, order.payment_status, supplierStatus, customerStatus, order.networks?.name ?? "", order.data_products?.name ?? ""].some((value) => value.toLowerCase().includes(needle));
      return matchesLifecycle && matchesPayment && matchesSupplier && matchesCustomer && matchesSearch;
    });
  }, [orders, search, lifecycleFilter, paymentFilter, supplierFilter, customerFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const clearFilters = () => {
    setSearch("");
    setLifecycleFilter("all");
    setPaymentFilter("all");
    setSupplierFilter("all");
    setCustomerFilter("all");
  };

  const findOrder = () => {
    const needle = lookup.trim().toLowerCase();
    if (!needle) return toast.error("Enter an order reference, phone number or supplier reference.");
    const match = orders.find((order) => order.order_reference.toLowerCase() === needle || order.recipient_phone.replace(/\s/g, "").includes(needle.replace(/\s/g, "")) || order.supplier_order_reference?.toLowerCase() === needle);
    if (!match) { setLookedUp(null); setMessage(""); return toast.error("No matching order was found."); }
    setLookedUp(match);
    setMessage(supportMessage(match));
    setCopied(false);
  };

  const copyMessage = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(true); toast.success("Message copied."); }
    catch { toast.error("Could not copy the message."); }
  };

  const runAction = async (action: string, body: Record<string, unknown> = {}) => {
    if (!selected) return;
    setRunningAction(action);
    const { data, error } = await supabase.functions.invoke<{ status?: string; error?: string }>("admin-order-action", { body: { action, orderReference: selected.order_reference, ...body } });
    setRunningAction(null);
    if (error || data?.error) return toast.error(data?.error ?? error?.message ?? "The order action failed.");
    toast.success(action === "clear_display_status" ? "Automatic status restored." : "Order updated.");
    await loadOrders();
    await loadEvents(selected.id);
    setReason("");
  };

  const saveDisplayStatus = () => {
    if (!reason.trim()) return toast.error("Add a customer update message for this status change.");
    if (["delivered", "refunded"].includes(displayStatus) && !window.confirm(`Show this order as ${readableStatus(displayStatus)} to the customer?`)) return;
    void runAction("set_display_status", { displayStatus, reason: reason.trim() });
  };

  const clearDisplayStatus = () => {
    if (!reason.trim()) return toast.error("Add a reason before returning to automatic status.");
    void runAction("clear_display_status", { reason: reason.trim() });
  };

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Operations" title="Order management" description="Search, filter and manage every stage of payment, fulfilment, delivery and customer communication." />
    <AdminStatStrip loading={loading} items={[
      { label: "All", value: orders.length, active: lifecycleFilter === "all", onClick: () => setLifecycleFilter("all") },
      { label: "In progress", value: pending, active: lifecycleFilter === "in_progress", onClick: () => setLifecycleFilter("in_progress") },
      { label: "Delivered", value: delivered, tone: "success", active: lifecycleFilter === "delivered", onClick: () => setLifecycleFilter("delivered") },
      { label: "Failed/review", value: failed, tone: failed ? "warning" : "default", active: lifecycleFilter === "failed_group", onClick: () => setLifecycleFilter("failed_group") },
    ]} />

    <Card><CardContent>
      <div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-lg font-semibold text-white">Track and assist with an order</h2><p className="mt-1 text-sm text-muted-foreground">Search by YieGo reference, recipient phone or supplier reference.</p></div><Badge variant="mint">AI-ready fallback</Badge></div>
      <div className="mt-4 flex gap-2"><label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3"><Search size={17} className="text-faint-foreground" /><input value={lookup} onChange={(event) => setLookup(event.target.value)} onKeyDown={(event) => event.key === "Enter" && findOrder()} placeholder="YG-..., phone or supplier reference" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint-foreground" /></label><Button onClick={findOrder}>Check</Button></div>
      {lookedUp && <div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-white">{lookedUp.order_reference}</p><p className="mt-1 text-xs text-muted-foreground">{lookedUp.recipient_phone} · {lookedUp.networks?.name ?? "Network"}</p></div><AdminDetailsButton label={`View ${lookedUp.order_reference}`} onClick={() => openDetails(lookedUp)} /></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-faint-foreground">Order</p><p className="mt-1 font-semibold text-foreground">{readableStatus(lookedUp.status)}</p></div><div><p className="text-faint-foreground">Payment</p><p className="mt-1 font-semibold text-foreground">{readableStatus(lookedUp.payment_status)}</p></div><div><p className="text-faint-foreground">Supplier</p><p className="mt-1 font-semibold text-foreground">{readableStatus(normalizedSupplierStatus(lookedUp))}</p></div><div><p className="text-faint-foreground">Customer sees</p><p className="mt-1 font-semibold text-foreground">{readableStatus(displayedStatus(lookedUp))}</p></div></div></div><div className="rounded-2xl border border-primary-glow/15 bg-primary/[0.045] p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-glow">Suggested customer response</p><Button variant="ghost" size="sm" onClick={copyMessage} disabled={!message}>{copied ? <ClipboardCheck /> : <Clipboard />}{copied ? "Copied" : "Copy"}</Button></div><textarea value={message} onChange={(event) => { setMessage(event.target.value); setCopied(false); }} className="onyx-field mt-4 min-h-36 resize-y text-sm leading-6" /></div></div>}
    </CardContent></Card>

    <Card><CardContent>
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_repeat(4,minmax(145px,0.55fr))_auto]">
        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3"><Search size={17} className="text-faint-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search orders" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint-foreground" /></label>
        <select value={lifecycleFilter} onChange={(event) => setLifecycleFilter(event.target.value)} className="onyx-field"><option value="all">All order stages</option><option value="in_progress">All in progress</option><option value="failed_group">All failed/review</option>{LIFECYCLE_STATUSES.map((status) => <option key={status} value={status}>{readableStatus(status)}</option>)}</select>
        <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="onyx-field"><option value="all">All payments</option>{PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{readableStatus(status)}</option>)}</select>
        <select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)} className="onyx-field"><option value="all">All delivery responses</option>{SUPPLIER_STATUSES.map((status) => <option key={status} value={status}>{readableStatus(status)}</option>)}</select>
        <select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)} className="onyx-field"><option value="all">All customer views</option>{CUSTOMER_STATUSES.map((status) => <option key={status} value={status}>{readableStatus(status)}</option>)}</select>
        <Button variant="ghost" onClick={clearFilters}><FilterX />Reset</Button>
      </div>
      <div className="mt-5 space-y-3 md:hidden">{visible.map((order) => <article key={order.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="min-w-0 flex-1"><p className="truncate font-semibold text-white">{order.order_reference}</p><p className="mt-1 text-xs text-muted-foreground">{order.recipient_phone} · {formatGHS(Number(order.amount))}</p><div className="mt-2 flex flex-wrap gap-2"><Badge variant={order.status === "delivered" ? "success" : FAILED_STATUSES.includes(order.status) ? "amber" : "neutral"}>{readableStatus(order.status)}</Badge><Badge variant={order.payment_status === "succeeded" ? "success" : "neutral"}>{readableStatus(order.payment_status)}</Badge></div></div><AdminDetailsButton label={`View order ${order.order_reference}`} onClick={() => openDetails(order)} /></article>)}</div>
      <div className="mt-5 hidden overflow-x-auto md:block"><table className="w-full min-w-[1050px] text-left text-sm"><thead><tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-[0.15em] text-faint-foreground"><th className="pb-3">Order</th><th className="pb-3">Amount</th><th className="pb-3">Order stage</th><th className="pb-3">Payment</th><th className="pb-3">Delivery response</th><th className="pb-3">Customer sees</th><th className="pb-3">Created</th><th className="pb-3 text-right">Details</th></tr></thead><tbody>{visible.map((order) => <tr key={order.id} className="border-b border-white/[0.055] last:border-0"><td className="py-4"><p className="font-semibold text-white">{order.order_reference}</p><p className="mt-1 text-xs text-muted-foreground">{order.recipient_phone}</p></td><td className="py-4 font-display font-semibold text-white">{formatGHS(Number(order.amount))}</td><td className="py-4"><Badge variant={order.status === "delivered" ? "success" : FAILED_STATUSES.includes(order.status) ? "amber" : "neutral"}>{readableStatus(order.status)}</Badge></td><td className="py-4"><Badge variant={order.payment_status === "succeeded" ? "success" : order.payment_status === "failed" ? "amber" : "neutral"}>{readableStatus(order.payment_status)}</Badge></td><td className="py-4 text-muted-foreground">{readableStatus(normalizedSupplierStatus(order))}</td><td className="py-4"><Badge variant={displayedStatus(order) === "delivered" ? "success" : "neutral"}>{readableStatus(displayedStatus(order))}</Badge></td><td className="py-4 text-xs text-muted-foreground">{formatAdminDate(order.created_at)}</td><td className="py-4 text-right"><AdminDetailsButton label={`View order ${order.order_reference}`} onClick={() => openDetails(order)} /></td></tr>)}</tbody></table></div>
      {!loading && filtered.length === 0 && <div className="grid min-h-48 place-items-center text-center"><div><ClipboardList className="mx-auto text-faint-foreground" /><p className="mt-3 font-semibold text-foreground">No matching orders</p><p className="mt-1 text-sm text-muted-foreground">Change the filters or search term.</p></div></div>}
      <AdminListPagination page={safePage} pageSize={pageSize} totalItems={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="orders" />
      <div className="mt-3 flex justify-end"><Button variant="ghost" size="sm" onClick={() => void loadOrders()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />Refresh data</Button></div>
    </CardContent></Card>

    <AdminRecordModal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.order_reference ?? "Order"} subtitle={`${selected?.networks?.name ?? "Network"} · ${selected?.data_products?.name ?? "Data bundle"}`} fields={selected ? [
      { label: "Recipient", value: selected.recipient_phone }, { label: "Customer email", value: selected.guest_email ?? "Signed-in customer" }, { label: "Amount", value: formatGHS(Number(selected.amount)) }, { label: "Supplier cost", value: selected.cost_amount === null ? "Not recorded" : formatGHS(Number(selected.cost_amount)) }, { label: "System order status", value: readableStatus(selected.status) }, { label: "Customer sees", value: readableStatus(displayedStatus(selected)) }, { label: "Payment", value: readableStatus(selected.payment_status) }, { label: "Supplier", value: readableStatus(normalizedSupplierStatus(selected)) }, { label: "Supplier reference", value: selected.supplier_order_reference ?? "Not assigned" }, { label: "Created", value: formatAdminDate(selected.created_at) }, { label: "Failure reason", value: selected.failure_reason ?? "None" }, { label: "Admin reason", value: selected.admin_resolution_reason ?? "Automatic status" },
    ] : []}>
      <div className="space-y-6"><section><h3 className="font-display text-lg font-semibold text-white">Customer-visible status</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">This changes what the customer sees without overwriting payment or delivery records.</p><div className="mt-4 grid gap-3"><select value={displayStatus} onChange={(event) => setDisplayStatus(event.target.value)} className="onyx-field">{CUSTOMER_STATUSES.map((status) => <option key={status} value={status}>{readableStatus(status)}</option>)}</select><textarea className="onyx-field min-h-24 resize-y" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Customer update message and audit reason" /><div className="grid gap-2 sm:grid-cols-2"><Button onClick={saveDisplayStatus} disabled={Boolean(runningAction)}>{runningAction === "set_display_status" ? <Loader2 className="animate-spin" /> : <Save />}Save customer status</Button><Button variant="ghost" onClick={clearDisplayStatus} disabled={Boolean(runningAction) || !selected?.admin_resolution_status}>{runningAction === "clear_display_status" ? <Loader2 className="animate-spin" /> : <RotateCcw />}Use automatic status</Button></div></div></section><section><h3 className="font-display text-lg font-semibold text-white">Operational actions</h3><div className="mt-3 flex flex-wrap gap-2"><Button variant="ghost" size="sm" onClick={() => void runAction("recheck")} disabled={Boolean(runningAction) || !selected?.supplier_order_reference}><RefreshCw />Recheck delivery</Button><Button variant="ghost" size="sm" onClick={() => void runAction("retry")} disabled={Boolean(runningAction) || !selected || !FAILED_STATUSES.includes(selected.status)}><RotateCcw />Retry fulfilment</Button></div></section><section><h3 className="font-display text-lg font-semibold text-white">Order timeline</h3>{events.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No status events recorded yet.</p> : <div className="mt-3 space-y-2">{events.map((event) => <div key={event.id} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-white">{readableStatus(event.event_type)}</p><p className="text-[11px] text-faint-foreground">{formatAdminDate(event.created_at)}</p></div>{event.message && <p className="mt-2 text-sm text-muted-foreground">{event.message}</p>}</div>)}</div>}</section></div>
    </AdminRecordModal>
  </div>;
}
