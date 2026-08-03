import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminStatStrip from "@/components/admin/AdminStatStrip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { adminDatabase, formatAdminDate, readableStatus } from "@/lib/admin-data";

interface DisputeCase {
  id: string;
  case_reference: string;
  order_reference: string;
  category: string;
  status: string;
  resolution: string | null;
  priority: string;
  internal_reason: string;
  customer_message: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  refund_status: string;
  refund_amount: number | string | null;
  refund_destination: string | null;
  created_at: string;
  updated_at: string;
}

const categories = ["not_received", "duplicate_payment", "payment_not_confirmed", "wrong_recipient", "wrong_network", "delivery_delay", "delivered_disputed", "refund_issue", "other"];
const workflowStatuses = ["new", "investigating", "waiting_for_update", "action_required", "resolved", "rejected", "cancelled"];
const resolutions = ["no_refund", "retry_delivery", "completed", "refund_approved", "refund_rejected", "customer_error", "supplier_confirmed_delivery", "other"];
const safeRefundStatuses = ["not_requested", "review_required", "approved", "needs_attention", "failed", "rejected", "cancelled"];

export default function AdminDisputes() {
  const [cases, setCases] = useState<DisputeCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("open");
  const [selected, setSelected] = useState<DisputeCase | null>(null);
  const [orderReference, setOrderReference] = useState("");
  const [category, setCategory] = useState("not_received");
  const [priority, setPriority] = useState("normal");
  const [reason, setReason] = useState("");
  const [customerMessage, setCustomerMessage] = useState("");
  const [nextStatus, setNextStatus] = useState("investigating");
  const [resolution, setResolution] = useState("");
  const [refundStatus, setRefundStatus] = useState("");
  const [updateMessage, setUpdateMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const loadCases = useCallback(async () => {
    setLoading(true);
    const { data, error } = await adminDatabase().from<DisputeCase>("dispute_cases").select("id, case_reference, order_reference, category, status, resolution, priority, internal_reason, customer_message, payment_method, payment_reference, refund_status, refund_amount, refund_destination, created_at, updated_at").order("created_at", { ascending: false });
    if (error) { toast.error("Could not load disputes."); setCases([]); }
    else { const rows = (data ?? []) as DisputeCase[]; setCases(rows); setSelected((current) => current ? rows.find((item) => item.id === current.id) ?? null : null); }
    setLoading(false);
  }, []);

  useEffect(() => { void loadCases(); }, [loadCases]);

  const visible = useMemo(() => cases.filter((item) => {
    const closed = ["resolved", "rejected", "cancelled"].includes(item.status);
    const matchesFilter = filter === "all" || (filter === "open" && !closed) || item.status === filter;
    const needle = search.trim().toLowerCase();
    return matchesFilter && (!needle || item.case_reference.toLowerCase().includes(needle) || item.order_reference.toLowerCase().includes(needle) || item.category.toLowerCase().includes(needle) || item.internal_reason.toLowerCase().includes(needle));
  }), [cases, filter, search]);

  const counts = {
    new: cases.filter((item) => item.status === "new").length,
    investigating: cases.filter((item) => ["investigating", "waiting_for_update"].includes(item.status)).length,
    action: cases.filter((item) => item.status === "action_required").length,
    resolved: cases.filter((item) => ["resolved", "rejected", "cancelled"].includes(item.status)).length,
  };

  const openCase = async () => {
    if (!orderReference.trim() || !reason.trim()) return toast.error("Enter the order reference and internal reason.");
    setSaving(true);
    const { data, error } = await supabase.functions.invoke<{ error?: string }>("admin-dispute-action", { body: { action: "open", orderReference: orderReference.trim().toUpperCase(), category, priority, internalReason: reason.trim(), customerMessage: customerMessage.trim() || null } });
    setSaving(false);
    if (error || data?.error) return toast.error(data?.error ?? error?.message ?? "Could not open the dispute.");
    toast.success("Dispute opened."); setOrderReference(""); setReason(""); setCustomerMessage(""); await loadCases();
  };

  const updateCase = async () => {
    if (!selected || !updateMessage.trim()) return toast.error("Add an internal update message.");
    setSaving(true);
    const { data, error } = await supabase.functions.invoke<{ error?: string }>("admin-dispute-action", { body: { action: "update", disputeId: selected.id, status: nextStatus, message: updateMessage.trim(), resolution: resolution || null, refundStatus: refundStatus || null } });
    setSaving(false);
    if (error || data?.error) return toast.error(data?.error ?? error?.message ?? "Could not update the dispute.");
    toast.success("Dispute updated."); setUpdateMessage(""); await loadCases();
  };

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Operations" title="Disputes" description="Investigate customer complaints, delivery disagreements and refund decisions without treating every issue as an automatic refund." />
    <AdminStatStrip loading={loading} items={[
      { label: "New", value: counts.new, tone: counts.new ? "warning" : "default", onClick: () => setFilter("new") },
      { label: "Investigating", value: counts.investigating, onClick: () => setFilter("investigating") },
      { label: "Action required", value: counts.action, tone: counts.action ? "warning" : "default", onClick: () => setFilter("action_required") },
      { label: "Closed", value: counts.resolved, tone: "success", onClick: () => setFilter("resolved") },
    ]} />

    <Card><CardContent>
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/[0.1] text-primary-glow"><Plus size={18} /></span><div><h2 className="font-display text-lg font-semibold text-white">Open a dispute</h2><p className="mt-1 text-sm text-muted-foreground">Use the order reference. YieGo automatically records the original payer, payment channel, amount and correct refund destination.</p></div></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><input className="onyx-field" value={orderReference} onChange={(e) => setOrderReference(e.target.value)} placeholder="YG-ORDER REFERENCE" /><select className="onyx-field" value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item} value={item}>{readableStatus(item)}</option>)}</select><select className="onyx-field" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="low">Low priority</option><option value="normal">Normal priority</option><option value="high">High priority</option><option value="urgent">Urgent</option></select><Button onClick={() => void openCase()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Plus />}Open dispute</Button></div>
      <textarea className="onyx-field mt-3 min-h-24 resize-y" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Internal reason and evidence for opening this case" />
      <textarea className="onyx-field mt-3 min-h-20 resize-y" value={customerMessage} onChange={(e) => setCustomerMessage(e.target.value)} placeholder="Optional customer-safe explanation" />
    </CardContent></Card>

    <Card><CardContent>
      <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_220px_auto]"><label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3"><Search size={17} className="text-faint-foreground" /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search disputes or orders" /></label><select className="onyx-field" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="open">All open cases</option><option value="all">All cases</option>{workflowStatuses.map((item) => <option key={item} value={item}>{readableStatus(item)}</option>)}</select><Button variant="ghost" onClick={() => void loadCases()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />Refresh</Button></div>
      {!loading && visible.length === 0 && <div className="py-12 text-center"><ShieldCheck className="mx-auto text-faint-foreground" /><p className="mt-3 text-sm text-muted-foreground">No disputes match this view.</p></div>}
      <div className="mt-5 grid gap-3 lg:grid-cols-2">{visible.map((item) => <button type="button" key={item.id} onClick={() => { setSelected(item); setNextStatus(item.status === "new" ? "investigating" : item.status); setResolution(item.resolution ?? ""); setRefundStatus(item.refund_status); }} className={`rounded-2xl border p-4 text-left transition ${selected?.id === item.id ? "border-primary-glow/35 bg-primary/[0.07]" : "border-white/[0.08] bg-white/[0.025] hover:border-white/15"}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{item.case_reference}</p><p className="mt-1 text-xs text-muted-foreground">Order {item.order_reference} · {formatAdminDate(item.created_at)}</p></div><Badge variant={item.status === "resolved" ? "success" : item.priority === "urgent" || item.priority === "high" ? "amber" : "neutral"}>{readableStatus(item.status)}</Badge></div><p className="mt-3 text-sm font-semibold text-foreground">{readableStatus(item.category)}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.internal_reason}</p><div className="mt-4 flex flex-wrap gap-2"><Badge variant="neutral">{readableStatus(item.payment_method ?? "Unknown payment")}</Badge><Badge variant={item.refund_status === "completed" ? "success" : item.refund_status !== "not_requested" ? "amber" : "neutral"}>Refund: {readableStatus(item.refund_status)}</Badge></div></button>)}</div>
    </CardContent></Card>

    {selected && <Card><CardContent>
      <div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-lg font-semibold text-white">{selected.case_reference}</h2><p className="mt-1 text-sm text-muted-foreground">Order {selected.order_reference}</p></div><Badge variant="mint">{readableStatus(selected.priority)} priority</Badge></div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><div><p className="text-xs text-faint-foreground">Payment method</p><p className="mt-1 text-sm font-semibold text-white">{readableStatus(selected.payment_method ?? "Unknown")}</p></div><div><p className="text-xs text-faint-foreground">Refund destination</p><p className="mt-1 text-sm font-semibold text-white">{readableStatus(selected.refund_destination ?? "Not resolved")}</p></div><div><p className="text-xs text-faint-foreground">Refund amount</p><p className="mt-1 text-sm font-semibold text-white">{selected.refund_amount == null ? "—" : `GH₵${Number(selected.refund_amount).toFixed(2)}`}</p></div><div><p className="text-xs text-faint-foreground">Payment reference</p><p className="mt-1 truncate text-sm font-semibold text-white">{selected.payment_reference ?? "—"}</p></div></div>
      <div className="mt-5 rounded-2xl border border-amber/20 bg-amber/[0.06] p-4"><div className="flex gap-3"><AlertTriangle className="shrink-0 text-amber" size={19} /><p className="text-sm leading-6 text-muted-foreground"><strong className="text-foreground">Safe refund control:</strong> this workspace can investigate, approve or reject a refund. It cannot claim money was returned. Submitted, processing and completed states are reserved for the dedicated wallet or Paystack refund processor.</p></div></div>
      <div className="mt-5 grid gap-3 md:grid-cols-3"><select className="onyx-field" value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>{workflowStatuses.map((item) => <option key={item} value={item}>{readableStatus(item)}</option>)}</select><select className="onyx-field" value={resolution} onChange={(e) => setResolution(e.target.value)}><option value="">No resolution yet</option>{resolutions.map((item) => <option key={item} value={item}>{readableStatus(item)}</option>)}</select><select className="onyx-field" value={refundStatus} onChange={(e) => setRefundStatus(e.target.value)}>{safeRefundStatuses.map((item) => <option key={item} value={item}>Refund: {readableStatus(item)}</option>)}</select></div>
      <textarea className="onyx-field mt-3 min-h-24 resize-y" value={updateMessage} onChange={(e) => setUpdateMessage(e.target.value)} placeholder="Required internal investigation update" />
      <Button className="mt-3" onClick={() => void updateCase()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : null}Save case update</Button>
    </CardContent></Card>}
  </div>;
}
