import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, ClipboardList, Loader2, RefreshCw, RotateCcw, Save, Search, XCircle } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminRecordModal, { AdminDetailsButton } from "@/components/admin/AdminRecordModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import { adminDatabase, formatAdminDate, readableStatus, type AdminOrderEventRow, type AdminOrderRow } from "@/lib/admin-data";

type OrderFilter = "all" | "pending" | "delivered" | "failed";
const PENDING_STATUSES = ["awaiting_payment", "paid", "processing", "pending_supplier"];
const FAILED_STATUSES = ["failed", "failed_needs_review", "cancelled"];
const CUSTOMER_STATUSES = ["processing", "pending_supplier", "delivered", "failed", "cancelled", "refunded"];

function displayedStatus(order: AdminOrderRow) {
  return order.admin_resolution_status ?? order.status;
}

export default function AdminOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFilter = searchParams.get("status");
  const filter: OrderFilter = requestedFilter === "pending" || requestedFilter === "delivered" || requestedFilter === "failed" ? requestedFilter : "all";
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdminOrderRow | null>(null);
  const [events, setEvents] = useState<AdminOrderEventRow[]>([]);
  const [displayStatus, setDisplayStatus] = useState("processing");
  const [reason, setReason] = useState("");
  const [runningAction, setRunningAction] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const { data, error } = await adminDatabase()
      .from<AdminOrderRow>("orders")
      .select("id, order_reference, recipient_phone, guest_email, amount, cost_amount, currency, status, payment_status, supplier_status, supplier_order_reference, failure_reason, admin_resolution_status, admin_resolution_reason, admin_resolution_updated_at, created_at, updated_at, data_products(name, capacity_gb), networks(name, code)")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Could not load orders.");
      setOrders([]);
    } else {
      const next = (data ?? []) as AdminOrderRow[];
      setOrders(next);
      setSelected((current) => current ? next.find((order) => order.id === current.id) ?? null : null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const loadEvents = useCallback(async (orderId: string) => {
    const { data } = await adminDatabase()
      .from<AdminOrderEventRow>("order_events")
      .select("id, event_type, from_status, to_status, message, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });
    setEvents((data ?? []) as AdminOrderEventRow[]);
  }, []);

  const openDetails = (order: AdminOrderRow) => {
    setSelected(order);
    setDisplayStatus(order.admin_resolution_status ?? "processing");
    setReason("");
    void loadEvents(order.id);
  };

  const completed = orders.filter((order) => displayedStatus(order) === "delivered").length;
  const pending = orders.filter((order) => PENDING_STATUSES.includes(displayedStatus(order))).length;
  const failed = orders.filter((order) => FAILED_STATUSES.includes(displayedStatus(order))).length;
  const visible = useMemo(() => orders.filter((order) => {
    const currentStatus = displayedStatus(order);
    const matchesFilter = filter === "all"
      || (filter === "pending" && PENDING_STATUSES.includes(currentStatus))
      || (filter === "delivered" && currentStatus === "delivered")
      || (filter === "failed" && FAILED_STATUSES.includes(currentStatus));
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle
      || order.order_reference.toLowerCase().includes(needle)
      || order.recipient_phone.includes(needle)
      || currentStatus.toLowerCase().includes(needle)
      || order.payment_status.toLowerCase().includes(needle)
      || order.supplier_status?.toLowerCase().includes(needle);
    return matchesFilter && matchesSearch;
  }), [filter, orders, search]);

  const setFilter = (next: OrderFilter) => {
    if (next === "all") setSearchParams({});
    else setSearchParams({ status: next });
  };

  const runAction = async (action: string, body: Record<string, unknown> = {}) => {
    if (!selected) return;
    setRunningAction(action);
    const { data, error } = await supabase.functions.invoke<{ status?: string; error?: string }>("admin-order-action", {
      body: { action, orderReference: selected.order_reference, ...body },
    });
    setRunningAction(null);
    if (error || data?.error) {
      toast.error(data?.error ?? error?.message ?? "The order action failed.");
      return;
    }
    toast.success(action === "clear_display_status" ? "Automatic status restored." : "Order updated.");
    await loadOrders();
    await loadEvents(selected.id);
    setReason("");
  };

  const saveDisplayStatus = () => {
    if (!reason.trim()) {
      toast.error("Add a reason for the customer-visible status change.");
      return;
    }
    if ((displayStatus === "delivered" || displayStatus === "refunded") && !window.confirm(`Show this order as ${readableStatus(displayStatus)} to the customer?`)) return;
    void runAction("set_display_status", { displayStatus, reason: reason.trim() });
  };

  const clearDisplayStatus = () => {
    if (!reason.trim()) {
      toast.error("Add a reason before returning to automatic status.");
      return;
    }
    void runAction("clear_display_status", { reason: reason.trim() });
  };

  const summaries = [
    { label: "All orders", value: orders.length, icon: ClipboardList, filter: "all" as const },
    { label: "In progress", value: pending, icon: Activity, filter: "pending" as const },
    { label: "Delivered", value: completed, icon: CheckCircle2, filter: "delivered" as const },
    { label: "Failed & review", value: failed, icon: XCircle, filter: "failed" as const },
  ];

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Operations" title="Orders" description="Search, filter and manage customer-visible order progress from one focused workspace." />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaries.map((item) => <button key={item.label} type="button" onClick={() => setFilter(item.filter)} className="text-left"><Card className={filter === item.filter ? "border-primary-glow/30 bg-primary/[0.055]" : "transition-colors hover:border-white/20"}><CardContent className="flex items-center gap-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.04]"><item.icon size={19} className="text-primary-glow" /></span><div><p className="text-xs text-muted-foreground">{item.label}</p><p className="font-display text-2xl font-semibold text-white">{loading ? "—" : item.value}</p></div></CardContent></Card></button>)}
      </section>

      <Card>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_220px_auto]">
            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3"><Search size={17} className="text-faint-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, phone or status" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint-foreground" /></label>
            <select value={filter} onChange={(event) => setFilter(event.target.value as OrderFilter)} className="onyx-field" aria-label="Filter orders by status"><option value="all">All statuses</option><option value="pending">In progress</option><option value="delivered">Delivered</option><option value="failed">Failed & review</option></select>
            <Button variant="ghost" onClick={() => void loadOrders()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />Refresh</Button>
          </div>

          <div className="mt-5 space-y-3 md:hidden">
            {visible.map((order) => (
              <article key={order.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                <div className="min-w-0 flex-1"><p className="truncate font-semibold text-white">{order.order_reference}</p><p className="mt-1 text-xs text-muted-foreground">{order.recipient_phone} · {formatGHS(Number(order.amount))}</p><div className="mt-2 flex flex-wrap gap-2"><Badge variant={displayedStatus(order) === "delivered" ? "success" : displayedStatus(order).includes("failed") ? "amber" : "neutral"}>{readableStatus(displayedStatus(order))}</Badge>{order.admin_resolution_status && <Badge variant="mint">Admin status</Badge>}</div></div>
                <AdminDetailsButton label={`View order ${order.order_reference}`} onClick={() => openDetails(order)} />
              </article>
            ))}
          </div>

          <div className="mt-5 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead><tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-[0.15em] text-faint-foreground"><th className="pb-3">Order</th><th className="pb-3">Amount</th><th className="pb-3">Customer sees</th><th className="pb-3">Payment</th><th className="pb-3">Supplier</th><th className="pb-3">Created</th><th className="pb-3 text-right">Details</th></tr></thead>
              <tbody>{visible.map((order) => <tr key={order.id} className="border-b border-white/[0.055] last:border-0"><td className="py-4"><p className="font-semibold text-white">{order.order_reference}</p><p className="mt-1 text-xs text-muted-foreground">{order.recipient_phone}</p></td><td className="py-4 font-display font-semibold text-white">{formatGHS(Number(order.amount))}</td><td className="py-4"><div className="flex flex-wrap gap-2"><Badge variant={displayedStatus(order) === "delivered" ? "success" : "neutral"}>{readableStatus(displayedStatus(order))}</Badge>{order.admin_resolution_status && <Badge variant="mint">Manual</Badge>}</div></td><td className="py-4"><Badge variant={order.payment_status === "succeeded" ? "success" : "amber"}>{readableStatus(order.payment_status)}</Badge></td><td className="py-4 text-muted-foreground">{readableStatus(order.supplier_status ?? "waiting")}</td><td className="py-4 text-xs text-muted-foreground">{formatAdminDate(order.created_at)}</td><td className="py-4 text-right"><AdminDetailsButton label={`View order ${order.order_reference}`} onClick={() => openDetails(order)} /></td></tr>)}</tbody>
            </table>
          </div>

          {!loading && visible.length === 0 && <div className="grid min-h-48 place-items-center text-center"><div><ClipboardList className="mx-auto text-faint-foreground" /><p className="mt-3 font-semibold text-foreground">No matching orders</p><p className="mt-1 text-sm text-muted-foreground">Change the status filter or search term.</p></div></div>}
        </CardContent>
      </Card>

      <AdminRecordModal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.order_reference ?? "Order"}
        subtitle={`${selected?.networks?.name ?? "Network"} · ${selected?.data_products?.name ?? "Data bundle"}`}
        fields={selected ? [
          { label: "Recipient", value: selected.recipient_phone },
          { label: "Customer email", value: selected.guest_email ?? "Signed-in customer" },
          { label: "Amount", value: formatGHS(Number(selected.amount)) },
          { label: "Supplier cost", value: selected.cost_amount === null ? "Not recorded" : formatGHS(Number(selected.cost_amount)) },
          { label: "System order status", value: readableStatus(selected.status) },
          { label: "Customer sees", value: readableStatus(displayedStatus(selected)) },
          { label: "Payment", value: readableStatus(selected.payment_status) },
          { label: "Supplier", value: readableStatus(selected.supplier_status ?? "Waiting") },
          { label: "Supplier reference", value: selected.supplier_order_reference ?? "Not assigned" },
          { label: "Created", value: formatAdminDate(selected.created_at) },
          { label: "Failure reason", value: selected.failure_reason ?? "None" },
          { label: "Admin reason", value: selected.admin_resolution_reason ?? "Automatic status" },
        ] : []}
      >
        <div className="space-y-6">
          <section>
            <h3 className="font-display text-lg font-semibold text-white">Customer-visible status</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">This changes what the customer sees without overwriting Paystack or supplier records.</p>
            <div className="mt-4 grid gap-3">
              <select value={displayStatus} onChange={(event) => setDisplayStatus(event.target.value)} className="onyx-field" aria-label="Customer-visible order status">{CUSTOMER_STATUSES.map((status) => <option key={status} value={status}>{readableStatus(status)}</option>)}</select>
              <textarea className="onyx-field min-h-24 resize-y" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Customer update message (also saved in the audit history)" />
              <div className="grid gap-2 sm:grid-cols-2">
                <Button onClick={saveDisplayStatus} disabled={Boolean(runningAction)}>{runningAction === "set_display_status" ? <Loader2 className="animate-spin" /> : <Save />}Save customer status</Button>
                <Button variant="ghost" onClick={clearDisplayStatus} disabled={Boolean(runningAction) || !selected?.admin_resolution_status}>{runningAction === "clear_display_status" ? <Loader2 className="animate-spin" /> : <RotateCcw />}Use automatic status</Button>
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-display text-lg font-semibold text-white">Operational actions</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => void runAction("recheck")} disabled={Boolean(runningAction) || !selected?.supplier_order_reference}>{runningAction === "recheck" ? <Loader2 className="animate-spin" /> : <RefreshCw />}Recheck supplier</Button>
              <Button variant="ghost" size="sm" onClick={() => void runAction("retry")} disabled={Boolean(runningAction) || !selected || !FAILED_STATUSES.includes(selected.status)}>{runningAction === "retry" ? <Loader2 className="animate-spin" /> : <RotateCcw />}Retry fulfillment</Button>
            </div>
          </section>

          <section>
            <h3 className="font-display text-lg font-semibold text-white">Order timeline</h3>
            {events.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No status events recorded yet.</p> : <div className="mt-3 space-y-2">{events.map((event) => <article key={event.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-white">{readableStatus(event.event_type)}</p><p className="text-xs text-faint-foreground">{formatAdminDate(event.created_at)}</p></div><p className="mt-1 text-xs text-muted-foreground">{readableStatus(event.from_status ?? "Start")} → {readableStatus(event.to_status ?? "Updated")}</p>{event.message && <p className="mt-2 text-sm text-muted-foreground">{event.message}</p>}</article>)}</div>}
          </section>
        </div>
      </AdminRecordModal>
    </div>
  );
}
