import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp, Clipboard, ClipboardCheck, ClipboardList, Clock, FilterX, Loader2, RefreshCw, RotateCcw, Save, Search, X } from "lucide-react";
import { toast } from "sonner";
import AdminListPagination from "@/components/admin/AdminListPagination";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { AdminDetailsButton } from "@/components/admin/AdminRecordModal";
import OrderDetailSheet, { ActionCard } from "@/components/admin/OrderDetailSheet";
import CopyRef from "@/components/admin/CopyRef";
import SupplierBadge, { useFallbackOrigins } from "@/components/admin/SupplierBadge";
import AdminStatStrip from "@/components/admin/AdminStatStrip";
import OrdersPulse from "@/components/admin/OrdersPulse";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import { loadOpsStatus, PROCESSING_DELAY_NOTE } from "@/lib/ops-status";
import { adminDatabase, formatAdminDate, readableStatus, type AdminOrderEventRow, type AdminOrderRow } from "@/lib/admin-data";

const LIFECYCLE_STATUSES = ["created", "awaiting_payment", "paid", "processing", "pending_supplier", "delivered", "failed", "failed_needs_review", "cancelled", "refunded"];
const PAYMENT_STATUSES = ["created", "pending", "succeeded", "failed", "abandoned", "refunded"];
const SUPPLIER_STATUSES = ["not_sent", "waiting", "pending", "processing", "completed", "success", "failed", "refunded", "timeout", "unknown"];
const CUSTOMER_STATUSES = ["processing", "pending_supplier", "awaiting_verification", "wrong_network", "delivered", "failed", "cancelled", "refunded"];
const WRONG_NETWORK = "wrong_network";
const AWAITING_VERIFICATION = "awaiting_verification";
const PENDING_STATUSES = ["created", "awaiting_payment", "paid", "processing", "pending_supplier"];
const FAILED_STATUSES = ["failed_needs_review"];
const isPaymentFailed = (o: { status: string; payment_status: string }) => o.status === "failed" && o.payment_status !== "succeeded";
const orderLabel = (o: { status: string; payment_status: string }) => isPaymentFailed(o) ? "Payment failed" : readableStatus(o.status);

function displayedStatus(order: AdminOrderRow) {
  return order.admin_resolution_status ?? order.status;
}

function normalizedSupplierStatus(order: AdminOrderRow) {
  return (order.supplier_status ?? "not_sent").toLowerCase();
}

/** The supplier an order actually went to, named the way customers see it so a
 *  complaint about "Zola" can be matched to a row without a lookup. */
function routeLabel(order: AdminOrderRow) {
  const supplier = order.suppliers;
  if (!supplier) return "Not routed";
  return supplier.public_name ?? supplier.name;
}

function supportMessage(order: AdminOrderRow, processingDelay = false) {
  const reference = order.order_reference;
  const status = displayedStatus(order);
  if (status === AWAITING_VERIFICATION) return `Hello, your DataYego order ${reference} has not failed. MTN verifies numbers receiving a bundle for the first time, which usually takes a few days. Your data will be delivered automatically once MTN completes the check, and future orders to this number will go through normally.`;
  if (order.admin_resolution_reason) return `Hello, your DataYego order ${reference} is currently ${readableStatus(status).toLowerCase()}. ${order.admin_resolution_reason}`;
  if (order.payment_status === "failed") return `Hello, payment for your DataYego order ${reference} was not completed. No successful payment has been confirmed.`;
  if (["created", "pending"].includes(order.payment_status) || status === "awaiting_payment") return `Hello, your DataYego order ${reference} is awaiting payment. You can continue the payment before the order expires.`;
  if (["paid", "processing"].includes(status)) return `Hello, payment for your DataYego order ${reference} has been confirmed and your data order is still being processed.${processingDelay ? ` ${PROCESSING_DELAY_NOTE}` : ""}`;
  if (status === "pending_supplier") return `Hello, your DataYego order ${reference} is currently being delivered. Delivery is taking a little longer than usual, and we are monitoring it.`;
  if (status === "delivered") return `Hello, your DataYego order ${reference} is marked as completed. Please contact support if the data has not appeared on the recipient number.`;
  if (status === "refunded") return `Hello, your DataYego order ${reference} is marked as refunded. The refund is returned through the original payment channel.`;
  if (status === "cancelled") return `Hello, your DataYego order ${reference} has been cancelled and will not be delivered.`;
  if (FAILED_STATUSES.includes(status)) return `Hello, your DataYego order ${reference} could not be completed. Our team can review the order and advise on the next step.`;
  return `Hello, your DataYego order ${reference} is currently ${readableStatus(status).toLowerCase()}.`;
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const origins = useFallbackOrigins(orders);
  // "Try another supplier": every active supplier that sells the selected order's bundle (loaded with the orders).
  const [supplierOptions, setSupplierOptions] = useState<{ code: string; name: string; product_ids: Set<string> }[]>([]);
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = adminDatabase() as unknown as { from: (t: string) => any };
    void Promise.all([db.from("suppliers").select("id, code, name, status").eq("status", "active"), db.from("supplier_product_mappings").select("supplier_id, product_id").eq("is_active", true)])
      .then(([s, m]: [{ data: { id: string; code: string; name: string }[] | null }, { data: { supplier_id: string; product_id: string }[] | null }]) => {
        setSupplierOptions((s.data ?? []).map((x) => ({ code: x.code, name: x.name, product_ids: new Set((m.data ?? []).filter((r) => r.supplier_id === x.id).map((r) => r.product_id)) })));
      });
  }, []);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [lifecycleFilter, setLifecycleFilter] = useState(() => ({ failed: "failed_group", pending: "in_progress", payment_failed: "payment_failed" } as Record<string, string>)[searchParams.get("status") ?? ""] ?? "all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [lookup, setLookup] = useState("");
  const [lookedUp, setLookedUp] = useState<AdminOrderRow | null>(null);
  type Summary = { all: number; pending: number; delivered: number; failed: number; wrong_network: number; payment_failed: number; verification: number };
  const [summary, setSummary] = useState<Summary | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<AdminOrderRow | null>(null);
  const [events, setEvents] = useState<AdminOrderEventRow[]>([]);
  const [displayStatus, setDisplayStatus] = useState("processing");
  const [reason, setReason] = useState("");
  const [runningAction, setRunningAction] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    // Recent orders for browsing, plus EVERY order that still needs a hand (any age), plus true counts from the whole table.
    const [recent, open, summary] = await Promise.all([
      adminDatabase().from<AdminOrderRow>("orders").select("id, order_reference, product_id, recipient_phone, guest_email, amount, cost_amount, paid_at, currency, status, payment_status, supplier_status, supplier_order_reference, supplier_purchase_id, supplier_retry_after, supplier_retry_count, failure_reason, admin_resolution_status, admin_resolution_reason, admin_resolution_updated_at, wallet_ledger_entry_id, created_at, updated_at, data_products(name, capacity_gb), networks(name, code), suppliers(code, name, public_name), agent_id, agent_price, agent_margin, agents(slug, store_name)").order("created_at", { ascending: false }).limit(1000),
      adminDatabase().from<AdminOrderRow>("orders").select("id, order_reference, product_id, recipient_phone, guest_email, amount, cost_amount, paid_at, currency, status, payment_status, supplier_status, supplier_order_reference, supplier_purchase_id, supplier_retry_after, supplier_retry_count, failure_reason, admin_resolution_status, admin_resolution_reason, admin_resolution_updated_at, wallet_ledger_entry_id, created_at, updated_at, data_products(name, capacity_gb), networks(name, code), suppliers(code, name, public_name), agent_id, agent_price, agent_margin, agents(slug, store_name)").or("status.eq.failed_needs_review,admin_resolution_status.eq.awaiting_verification,admin_resolution_status.eq.wrong_network").order("created_at", { ascending: false }),
      (adminDatabase() as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown }> }).rpc("admin_orders_summary", {}),
    ]);
    const { data, error } = recent;
    if (error) { toast.error("Could not load orders."); setOrders([]); }
    else {
      const seen = new Set<string>();
      const next = ([...((data ?? []) as AdminOrderRow[]), ...(((open.data ?? []) as AdminOrderRow[]))]).filter((o) => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });
      setSummary((summary.data as Summary | null) ?? null);
      setOrders(next);
      setSelected((current) => current ? next.find((order) => order.id === current.id) ?? null : null);
      setLookedUp((current) => current ? next.find((order) => order.id === current.id) ?? current : null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);
  useEffect(() => { setPage(1); }, [search, lifecycleFilter, paymentFilter, supplierFilter, routeFilter, customerFilter, pageSize]);

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

  // Counts come from the whole table; the loaded list is only for browsing.
  const pending = summary?.pending ?? orders.filter((order) => PENDING_STATUSES.includes(order.status)).length;
  const delivered = summary?.delivered ?? orders.filter((order) => order.status === "delivered").length;
  const failed = summary?.failed ?? orders.filter((order) => FAILED_STATUSES.includes(order.status) && order.admin_resolution_status !== WRONG_NETWORK).length;
  const wrongNetwork = summary?.wrong_network ?? orders.filter((order) => order.admin_resolution_status === WRONG_NETWORK).length;
  const paymentFailed = summary?.payment_failed ?? orders.filter(isPaymentFailed).length;
  const totalAll = summary?.all ?? orders.length;

  // Numbers MTN is still verifying. Once MTN clears one, the bundle is
  // resubmitted by hand on the DBH portal, so this list is what the admin
  // works from — oldest first, since those are the likeliest to be cleared.
  const verificationQueue = useMemo(
    () => orders.filter((order) => order.admin_resolution_status === AWAITING_VERIFICATION).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [orders],
  );
  // The queue will grow. It shows the newest few by default, opens out on
  // request, and can be searched by number or order reference — the two
  // things an admin has in hand when a customer asks.
  const QUEUE_PREVIEW = 5;
  const [queueSearch, setQueueSearch] = useState("");
  const [queueOpen, setQueueOpen] = useState(false);
  const queueMatches = useMemo(() => {
    const q = queueSearch.trim().toLowerCase().replace(/\s+/g, "");
    if (!q) return verificationQueue;
    return verificationQueue.filter((order) => order.recipient_phone.includes(q) || order.order_reference.toLowerCase().includes(q));
  }, [verificationQueue, queueSearch]);
  const queueShown = queueOpen || queueSearch.trim() ? queueMatches : queueMatches.slice(0, QUEUE_PREVIEW);
  const queueHidden = queueMatches.length - queueShown.length;
  const [queueCopied, setQueueCopied] = useState(false);
  const copyQueue = async () => {
    // Numbers only, one per line — pasted straight into the DBH portal.
    // Copies the whole queue, or just the search matches while searching.
    const lines = queueMatches.map((order) => order.recipient_phone);
    try { await navigator.clipboard.writeText(lines.join("\n")); setQueueCopied(true); toast.success(`Copied ${lines.length} number${lines.length === 1 ? "" : "s"}.`); }
    catch { toast.error("Could not copy the list."); }
  };
  useEffect(() => { setQueueCopied(false); }, [queueSearch, verificationQueue.length]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return orders.filter((order) => {
      const customerStatus = displayedStatus(order);
      const supplierStatus = normalizedSupplierStatus(order);
      const matchesLifecycle = lifecycleFilter === "all" || (lifecycleFilter === "in_progress" && PENDING_STATUSES.includes(order.status)) || (lifecycleFilter === "failed_group" && FAILED_STATUSES.includes(order.status) && (customerFilter === WRONG_NETWORK || order.admin_resolution_status !== WRONG_NETWORK)) || (lifecycleFilter === "payment_failed" && isPaymentFailed(order)) || (lifecycleFilter === "agent_orders" && order.order_reference.startsWith("AG-")) || (order.status === lifecycleFilter && !(lifecycleFilter === "failed" && isPaymentFailed(order)));
      const matchesPayment = paymentFilter === "all" || order.payment_status === paymentFilter;
      const matchesSupplier = supplierFilter === "all" || supplierStatus === supplierFilter;
      const matchesRoute = routeFilter === "all" || routeLabel(order) === routeFilter;
      const matchesCustomer = customerFilter === "all" || customerStatus === customerFilter;
      const matchesSearch = !needle || [order.order_reference, order.recipient_phone, order.supplier_order_reference ?? "", order.status, order.payment_status, supplierStatus, customerStatus, order.networks?.name ?? "", order.data_products?.name ?? "", routeLabel(order)].some((value) => value.toLowerCase().includes(needle));
      return matchesLifecycle && matchesPayment && matchesSupplier && matchesRoute && matchesCustomer && matchesSearch;
    });
  }, [orders, search, lifecycleFilter, paymentFilter, supplierFilter, routeFilter, customerFilter]);

  // Only the routes that actually appear, so the filter never offers an empty one.
  const routes = useMemo(
    () => [...new Set(orders.map(routeLabel))].sort(),
    [orders],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const clearFilters = () => {
    setSearch("");
    setLifecycleFilter("all");
    setPaymentFilter("all");
    setSupplierFilter("all");
    setRouteFilter("all");
    setCustomerFilter("all");
  };

  const findOrder = async () => {
    const needle = lookup.trim().toLowerCase();
    if (!needle) return toast.error("Enter an order reference, phone number or supplier reference.");
    const match = orders.find((order) => order.order_reference.toLowerCase() === needle || order.recipient_phone.replace(/\s/g, "").includes(needle.replace(/\s/g, "")) || order.supplier_order_reference?.toLowerCase() === needle);
    if (!match) { setLookedUp(null); setMessage(""); return toast.error("No matching order was found."); }
    setLookedUp(match);
    const ops = await loadOpsStatus().catch(() => null);
    setMessage(supportMessage(match, Boolean(ops?.processing_delay)));
    setCopied(false);
  };

  const copyMessage = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(true); toast.success("Message copied."); }
    catch { toast.error("Could not copy the message."); }
  };

  // Default refund message: depends on how they paid. Anything typed in the box replaces it.
  const defaultRefundMessage = (o: AdminOrderRow, manual: boolean) => o.wallet_ledger_entry_id && !manual
    ? `Your order ${o.order_reference} has been refunded in full. The amount is already back in your DataYego wallet.`
    : `Your order ${o.order_reference} has been refunded in full. The amount is on its way back to the MoMo or card you paid with.`;
  const refundOrder = async (manual: boolean) => {
    if (!selected) return;
    const why = reason.trim() || defaultRefundMessage(selected, manual);
    let manualReference = "";
    if (manual) {
      manualReference = window.prompt("You sent the money yourself. Enter the transfer reference (e.g. MoMo TXN id):")?.trim() ?? "";
      if (!manualReference) return;
    }
    if (!window.confirm(`${manual ? "Mark this order refunded (money already sent by you)?" : "Refund this customer now? Money will move."}\n\nMessage to the customer:\n"${why}"`)) return;
    setRunningAction("refund");
    const { data, error } = await supabase.functions.invoke<{ status?: string; method?: string; error?: string; detail?: string }>("refund-order", {
      body: { orderReference: selected.order_reference, reason: why, ...(manual ? { manual: true, manualReference } : {}) },
    });
    setRunningAction(null);
    if (error || data?.error) return toast.error(data?.detail ?? data?.error ?? error?.message ?? "Refund failed.");
    toast.success(data?.method === "wallet" ? "Refunded to the customer's wallet — instant." : data?.method === "manual" ? "Recorded as manually refunded. Customer emailed." : "Paystack refund created — money returns to the customer in a few business days.");
    await loadOrders();
    if (selected) await loadEvents(selected.id);
  };

  const [retryingRef, setRetryingRef] = useState<string | null>(null);
  const retryOrder = async (order: AdminOrderRow) => {
    setRetryingRef(order.order_reference);
    const { data, error } = await supabase.functions.invoke<{ status?: string; error?: string }>("admin-order-action", { body: { action: "retry", orderReference: order.order_reference } });
    setRetryingRef(null);
    if (error || data?.error) return toast.error(data?.error ?? error?.message ?? "Retry failed.");
    toast.success(`${order.order_reference} sent to the supplier.`);
    await loadOrders(); if (selected?.id === order.id) await loadEvents(order.id);
  };
  const canRetry = (o: AdminOrderRow) => FAILED_STATUSES.includes(o.status) || o.admin_resolution_status === AWAITING_VERIFICATION;
  const runAction = async (action: string, body: Record<string, unknown> = {}) => {
    if (!selected) return;
    setRunningAction(action);
    const { data, error } = await supabase.functions.invoke<{ status?: string; error?: string }>("admin-order-action", { body: { action, orderReference: selected.order_reference, ...body } });
    setRunningAction(null);
    if (error || data?.error) return toast.error(data?.error ?? error?.message ?? "The order action failed.");
    toast.success(action === "clear_display_status" ? "Automatic status restored." : action === "release_ported" ? "Released and sent to the supplier." : action === "try_supplier" ? `Sent to ${String(body.supplierName ?? "the supplier")}.` : "Order updated.");
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
    <OrdersPulse />
    <AdminStatStrip loading={loading} items={[
      { label: "All", value: totalAll, active: lifecycleFilter === "all", onClick: () => { setLifecycleFilter("all"); setCustomerFilter("all"); } },
      { label: "In progress", value: pending, active: lifecycleFilter === "in_progress", onClick: () => { setLifecycleFilter("in_progress"); setCustomerFilter("all"); } },
      { label: "Delivered", value: delivered, tone: "success", active: lifecycleFilter === "delivered", onClick: () => { setLifecycleFilter("delivered"); setCustomerFilter("all"); } },
      { label: "Failed delivery", value: failed, tone: failed ? "warning" : "default", active: lifecycleFilter === "failed_group", onClick: () => { setLifecycleFilter("failed_group"); setCustomerFilter("all"); } },
      { label: "Payment failed", value: paymentFailed, active: lifecycleFilter === "payment_failed", onClick: () => { setLifecycleFilter("payment_failed"); setCustomerFilter("all"); } },
      { label: "Wrong network", value: wrongNetwork, tone: wrongNetwork ? "warning" : "default", active: customerFilter === WRONG_NETWORK, onClick: () => { setLifecycleFilter("all"); setCustomerFilter(customerFilter === WRONG_NETWORK ? "all" : WRONG_NETWORK); } },
      { label: "Awaiting verification", value: verificationQueue.length, active: customerFilter === AWAITING_VERIFICATION, onClick: () => { setLifecycleFilter("all"); setCustomerFilter(customerFilter === AWAITING_VERIFICATION ? "all" : AWAITING_VERIFICATION); } },
    ]} />

    {verificationQueue.length > 0 && <Card><CardContent className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2"><Clock size={15} className="shrink-0 text-primary-glow" /><h2 className="truncate font-display text-base font-semibold text-white">MTN verification queue</h2><Badge variant="mint">{verificationQueue.length}</Badge></div>
        <Button variant="ghost" size="sm" onClick={copyQueue} title="Copy every number, one per line, for the DBH portal">{queueCopied ? <ClipboardCheck /> : <Clipboard />}<span className="hidden sm:inline">{queueCopied ? "Copied" : queueSearch.trim() ? `Copy ${queueMatches.length}` : "Copy all"}</span></Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Silent DBH refunds on MTN numbers. Resubmit on the DBH portal once MTN clears the number, then mark delivered.</p>
      <label className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/10 px-3 py-2"><Search size={14} className="shrink-0 text-faint-foreground" /><input value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="Find a number or order ID" inputMode="search" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint-foreground" />{queueSearch && <button type="button" onClick={() => setQueueSearch("")} aria-label="Clear search" className="text-faint-foreground hover:text-foreground"><X size={14} /></button>}</label>
      <ul className="mt-2 divide-y divide-white/[0.055]">
        {queueShown.length === 0 && <li className="py-3 text-center text-xs text-muted-foreground">No number in the queue matches.</li>}
        {queueShown.map((order) => <li key={order.id} className="flex items-center gap-3 py-2">
          <button type="button" onClick={() => openDetails(order)} className="min-w-0 flex-1 text-left" title={`View order ${order.order_reference}`}>
            <span className="flex items-baseline gap-2"><span className="font-mono text-sm font-semibold text-white">{order.recipient_phone}</span><span className="truncate text-xs text-muted-foreground">{(order.data_products?.name ?? "").replace(/^MTN Data — /, "") || "—"}</span></span>
            <span className="block truncate text-[11px] text-faint-foreground"><CopyRef value={order.order_reference} /> · {formatAdminDate(order.admin_resolution_updated_at ?? order.created_at)}</span>
          </button>
          <AdminDetailsButton label={`View order ${order.order_reference}`} onClick={() => openDetails(order)} />
        </li>)}
      </ul>
      {!queueSearch.trim() && queueMatches.length > QUEUE_PREVIEW && <button type="button" onClick={() => setQueueOpen((value) => !value)} className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold text-primary-glow hover:bg-white/[0.04]">{queueOpen ? <><ChevronUp size={14} /> Show latest {QUEUE_PREVIEW} only</> : <><ChevronDown size={14} /> Show {queueHidden} older</>}</button>}
    </CardContent></Card>}

    <Card><CardContent>
      <div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-lg font-semibold text-white">Track and assist with an order</h2><p className="mt-1 text-sm text-muted-foreground">Search by DataYego reference, recipient phone or supplier reference.</p></div><Badge variant="mint">AI-ready fallback</Badge></div>
      <div className="mt-4 flex gap-2"><label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3"><Search size={17} className="text-faint-foreground" /><input value={lookup} onChange={(event) => setLookup(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void findOrder()} placeholder="YG-..., phone or supplier reference" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint-foreground" /></label><Button onClick={() => void findOrder()}>Check</Button></div>
      {lookedUp && <div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-white">{lookedUp.order_reference}</p><p className="mt-1 text-xs text-muted-foreground">{lookedUp.recipient_phone} · {lookedUp.networks?.name ?? "Network"}</p></div><div className="flex shrink-0 items-center gap-2">{canRetry(lookedUp) && <Button size="sm" variant="ghost" disabled={retryingRef === lookedUp.order_reference} onClick={() => void retryOrder(lookedUp)}><RotateCcw />{retryingRef === lookedUp.order_reference ? "Sending…" : "Retry"}</Button>}<AdminDetailsButton label={`View ${lookedUp.order_reference}`} onClick={() => openDetails(lookedUp)} /></div></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-faint-foreground">Order</p><p className="mt-1 font-semibold text-foreground">{readableStatus(lookedUp.status)}</p></div><div><p className="text-faint-foreground">Payment</p><p className="mt-1 font-semibold text-foreground">{readableStatus(lookedUp.payment_status)}</p></div><div><p className="text-faint-foreground">Supplier</p><p className="mt-1 font-semibold text-foreground">{readableStatus(normalizedSupplierStatus(lookedUp))}</p></div><div><p className="text-faint-foreground">Customer sees</p><p className="mt-1 font-semibold text-foreground">{readableStatus(displayedStatus(lookedUp))}</p></div></div></div><div className="rounded-2xl border border-primary-glow/15 bg-primary/[0.045] p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-glow">Suggested customer response</p><Button variant="ghost" size="sm" onClick={copyMessage} disabled={!message}>{copied ? <ClipboardCheck /> : <Clipboard />}{copied ? "Copied" : "Copy"}</Button></div><textarea value={message} onChange={(event) => { setMessage(event.target.value); setCopied(false); }} className="onyx-field mt-4 min-h-36 resize-y text-sm leading-6" /></div></div>}
    </CardContent></Card>

    <Card><CardContent>
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_repeat(4,minmax(145px,0.55fr))_auto]">
        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3"><Search size={17} className="text-faint-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search orders" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint-foreground" /></label>
        <select value={lifecycleFilter} onChange={(event) => setLifecycleFilter(event.target.value)} className="onyx-field"><option value="all">All order stages</option><option value="agent_orders">Agent store orders (AG-)</option><option value="in_progress">All in progress</option><option value="failed_group">Failed delivery</option><option value="payment_failed">Payment failed</option>{LIFECYCLE_STATUSES.filter((status) => status !== "failed").map((status) => <option key={status} value={status}>{readableStatus(status)}</option>)}</select>
        <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="onyx-field"><option value="all">All payments</option>{PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{readableStatus(status)}</option>)}</select>
        <select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)} className="onyx-field"><option value="all">All delivery responses</option>{SUPPLIER_STATUSES.map((status) => <option key={status} value={status}>{readableStatus(status)}</option>)}</select>
        <select value={routeFilter} onChange={(event) => setRouteFilter(event.target.value)} className="onyx-field" aria-label="Filter by supplier"><option value="all">All suppliers</option>{routes.map((route) => <option key={route} value={route}>{route}</option>)}</select>
        <select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)} className="onyx-field"><option value="all">All customer views</option>{CUSTOMER_STATUSES.map((status) => <option key={status} value={status}>{readableStatus(status)}</option>)}</select>
        <Button variant="ghost" onClick={clearFilters}><FilterX />Reset</Button>
      </div>
      <div className="mt-5 space-y-3 md:hidden">{visible.map((order) => <article key={order.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="truncate font-semibold text-white">{order.order_reference}</p><p className="shrink-0 text-right text-[11px] leading-tight text-faint-foreground">{order.paid_at ? <>Paid<br />{formatAdminDate(order.paid_at)}</> : <>Placed<br />{formatAdminDate(order.created_at)}</>}</p></div><p className="mt-1 text-xs text-muted-foreground">{order.recipient_phone} · {formatGHS(Number(order.amount))}</p><div className="mt-2 flex flex-wrap items-center gap-2"><SupplierBadge supplier={order.suppliers} from={origins[order.id]} />{displayedStatus(order) === AWAITING_VERIFICATION ? <Badge variant="mint">{readableStatus(AWAITING_VERIFICATION)}</Badge> : displayedStatus(order) === WRONG_NETWORK ? <Badge variant="amber">Wrong network</Badge> : <Badge variant={order.status === "delivered" ? "success" : FAILED_STATUSES.includes(order.status) ? "amber" : "neutral"}>{orderLabel(order)}</Badge>}<Badge variant={order.payment_status === "succeeded" ? "success" : "neutral"}>{readableStatus(order.payment_status)}</Badge></div>{order.supplier_retry_after && !order.supplier_order_reference && <p className="mt-1 text-[11px] text-faint-foreground">Supplier cooldown · re-sending {formatAdminDate(order.supplier_retry_after)}</p>}</div><AdminDetailsButton label={`View order ${order.order_reference}`} onClick={() => openDetails(order)} /></article>)}</div>
      <div className="mt-5 hidden overflow-x-auto md:block"><table className="w-full min-w-[1180px] text-left text-sm"><thead><tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-[0.15em] text-faint-foreground"><th className="pb-3">Order</th><th className="pb-3">Amount</th><th className="pb-3">Order stage</th><th className="pb-3">Payment</th><th className="pb-3">Supplier</th><th className="pb-3">Delivery response</th><th className="pb-3">Customer sees</th><th className="pb-3">Created</th><th className="pb-3 text-right">Details</th></tr></thead><tbody>{visible.map((order) => <tr key={order.id} className="border-b border-white/[0.055] last:border-0"><td className="py-4"><p className="font-semibold text-white">{order.order_reference}</p><p className="mt-1 text-xs text-muted-foreground">{order.recipient_phone}</p></td><td className="py-4 font-display font-semibold text-white">{formatGHS(Number(order.amount))}</td><td className="py-4"><Badge variant={order.status === "delivered" ? "success" : FAILED_STATUSES.includes(order.status) ? "amber" : "neutral"}>{orderLabel(order)}</Badge></td><td className="py-4"><Badge variant={order.payment_status === "succeeded" ? "success" : order.payment_status === "failed" ? "amber" : "neutral"}>{readableStatus(order.payment_status)}</Badge></td><td className="py-4 text-muted-foreground"><span className="inline-flex items-center gap-1.5"><SupplierBadge supplier={order.suppliers} from={origins[order.id]} />{routeLabel(order)}</span></td><td className="py-4 text-muted-foreground">{readableStatus(normalizedSupplierStatus(order))}</td><td className="py-4"><Badge variant={displayedStatus(order) === "delivered" ? "success" : displayedStatus(order) === AWAITING_VERIFICATION ? "mint" : displayedStatus(order) === WRONG_NETWORK ? "amber" : "neutral"}>{readableStatus(displayedStatus(order))}</Badge></td><td className="py-4 text-xs text-muted-foreground">{formatAdminDate(order.created_at)}</td><td className="py-4 text-right"><AdminDetailsButton label={`View order ${order.order_reference}`} onClick={() => openDetails(order)} /></td></tr>)}</tbody></table></div>
      {!loading && filtered.length === 0 && <div className="grid min-h-48 place-items-center text-center"><div><ClipboardList className="mx-auto text-faint-foreground" /><p className="mt-3 font-semibold text-foreground">No matching orders</p><p className="mt-1 text-sm text-muted-foreground">Change the filters or search term.</p></div></div>}
      <AdminListPagination page={safePage} pageSize={pageSize} totalItems={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="orders" />
      <div className="mt-3 flex justify-end"><Button variant="ghost" size="sm" onClick={() => void loadOrders()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />Refresh data</Button></div>
    </CardContent></Card>

    {selected && (() => { const s = selected; const shown = displayedStatus(s); const tone = (v: string): "good" | "warn" | "bad" | "muted" => ["delivered", "succeeded", "completed", "success"].includes(v) ? "good" : ["failed", "failed_needs_review", "refunded", "cancelled", "abandoned"].includes(v) ? "bad" : [AWAITING_VERIFICATION, WRONG_NETWORK, "processing", "pending_supplier", "pending"].includes(v) ? "warn" : "muted"; const busy = Boolean(runningAction); const refundable = ["failed_needs_review", "paid"].includes(s.status) || s.admin_resolution_status === AWAITING_VERIFICATION; return (
    <OrderDetailSheet open onClose={() => setSelected(null)} reference={s.order_reference} subtitle={`${s.networks?.name ?? "Network"} · ${s.data_products?.name ?? "Data bundle"} → ${s.recipient_phone}`} amount={formatGHS(Number(s.amount))}
      chips={[{ label: `Order: ${orderLabel(s)}`, tone: tone(s.status) }, { label: `Payment: ${readableStatus(s.payment_status)}`, tone: tone(s.payment_status) }, { label: `Customer sees: ${readableStatus(shown)}`, tone: tone(shown) }]}
      groups={[
        { title: "Customer", rows: [{ label: "Recipient", value: s.recipient_phone }, { label: "Customer email", value: s.guest_email ?? "Signed-in customer" }, ...(s.agents ? [{ label: "Sold through", value: `${s.agents.store_name} (/s/${s.agents.slug})` }] : []), { label: "Created", value: formatAdminDate(s.created_at) }] },
        { title: "Money", rows: [{ label: "Amount", value: formatGHS(Number(s.amount)) }, ...(s.agents ? [{ label: "Agent price", value: formatGHS(Number(s.agent_price ?? 0)) }, { label: "Agent's share", value: formatGHS(Number(s.agent_margin ?? 0)) }] : []), { label: "Supplier cost", value: s.cost_amount === null ? "Not recorded" : formatGHS(Number(s.cost_amount)), tone: s.cost_amount === null ? "muted" as const : undefined }] },
        { title: "Delivery", rows: [{ label: "System order status", value: readableStatus(s.status), tone: tone(s.status) }, { label: "Customer sees", value: readableStatus(shown), tone: tone(shown) }, { label: "Payment", value: readableStatus(s.payment_status), tone: tone(s.payment_status) }, { label: "Delivery response", value: readableStatus(normalizedSupplierStatus(s)) }, { label: "Supplier", value: origins[s.id] && origins[s.id].code !== s.suppliers?.code ? `${origins[s.id].name} → ${routeLabel(s)} (moved by the fallback)` : routeLabel(s) }, { label: "Supplier reference", value: s.supplier_order_reference ?? (s.supplier_retry_after ? `Not yet — re-sending at ${formatAdminDate(s.supplier_retry_after)} (attempt ${s.supplier_retry_count} of 3)` : "Not assigned"), tone: s.supplier_order_reference ? undefined : "muted" as const }] },
        { title: "Notes", rows: [{ label: "Failure reason", value: s.failure_reason ?? "None", tone: s.failure_reason ? "bad" as const : "muted" as const }, { label: "Admin reason", value: s.admin_resolution_reason ?? "Automatic status", tone: s.admin_resolution_reason ? undefined : "muted" as const }] },
      ]}
      timeline={events.map((e) => ({ id: e.id, title: readableStatus(e.event_type), at: formatAdminDate(e.created_at), message: e.message }))}
      actions={<>
        {s.admin_resolution_status === WRONG_NETWORK && s.status === "failed_needs_review" && <ActionCard tone="warn" title="Wrong network hold" note={`The number's prefix doesn't match ${s.networks?.name ?? "the chosen network"}. If the customer's SIM is ported, release it to the supplier. Otherwise refund.`}><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => { if (window.confirm(`Release ${s.order_reference} as a ported number and send it to the supplier on ${s.networks?.name ?? "the chosen network"}?`)) void runAction("release_ported"); }} disabled={busy}>{runningAction === "release_ported" ? <Loader2 className="animate-spin" /> : <RotateCcw />}Release as ported</Button><Button variant="ghost" size="sm" onClick={() => void refundOrder(false)} disabled={busy}><RotateCcw />Refund</Button></div></ActionCard>}
        <ActionCard title="Customer-visible status" note="Changes what the customer sees. Choosing Delivered also closes the order so the number can buy again."><div className="grid gap-2.5"><select value={displayStatus} onChange={(event) => setDisplayStatus(event.target.value)} className="onyx-field">{CUSTOMER_STATUSES.map((status) => <option key={status} value={status}>{readableStatus(status)}</option>)}</select><textarea className="onyx-field min-h-20 resize-y" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={`Customer update message and audit reason. For a refund you can leave this empty: "${defaultRefundMessage(s, false)}"`} /><div className="grid gap-2 sm:grid-cols-2"><Button onClick={saveDisplayStatus} disabled={busy}>{runningAction === "set_display_status" ? <Loader2 className="animate-spin" /> : <Save />}Save customer status</Button><Button variant="ghost" onClick={clearDisplayStatus} disabled={busy || !s.admin_resolution_status}>{runningAction === "clear_display_status" ? <Loader2 className="animate-spin" /> : <RotateCcw />}Use automatic status</Button></div></div></ActionCard>
        <ActionCard title="Delivery actions"><div className="flex flex-wrap items-center gap-2"><Button variant="ghost" size="sm" onClick={() => void runAction("recheck")} disabled={busy || !s.supplier_order_reference}><RefreshCw />Recheck delivery</Button><Button variant="ghost" size="sm" onClick={() => void runAction("retry")} disabled={busy || !(FAILED_STATUSES.includes(s.status) || s.admin_resolution_status === AWAITING_VERIFICATION)}><RotateCcw />Retry fulfilment</Button>{(() => { const st = (s.supplier_status ?? "").toLowerCase(); const safe = !s.supplier_retry_after && (["refunded", "refund", "not_approved"].includes(st) || s.admin_resolution_status === "awaiting_verification" || (!s.supplier_purchase_id && !s.supplier_order_reference && !s.supplier_status)); const others = supplierOptions.filter((o) => o.code !== s.suppliers?.code && o.product_ids.has(s.product_id ?? "")); return safe && others.length > 0 && !["delivered", "refunded", "cancelled"].includes(s.status) ? <label className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">Try another supplier<select className="onyx-field !py-1.5 !text-[12.5px]" value="" disabled={busy} onChange={(e) => { const o = others.find((x) => x.code === e.target.value); if (o && window.confirm(`Send ${s.order_reference} to ${o.name} now? The previous supplier has not charged us for it (refunded or held unpaid), so this is a fresh send.`)) void runAction("try_supplier", { supplierCode: o.code, supplierName: o.name }); }}><option value="">choose…</option>{others.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}</select></label> : null; })()}</div></ActionCard>
        <ActionCard title="Refund" note="Moves real money back the way it came in — wallet credits instantly, Paystack refunds to the card or MoMo. The customer is emailed automatically. Leave the message box empty to send the standard refund message, or write your own."><div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" onClick={() => void refundOrder(false)} disabled={busy || !refundable}><RotateCcw />Refund customer</Button><Button variant="ghost" size="sm" onClick={() => void refundOrder(true)} disabled={busy || !refundable}><Save />Mark refunded manually</Button></div></ActionCard>
      </>}
    />); })()}
  </div>;
}
