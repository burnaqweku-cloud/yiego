/**
 * Phase 2 — Bulk Dispatch Queue admin UI.
 * Replaces the legacy hand-rolled implementation with a Phase 1 RPC–driven one.
 *
 * Sections:
 *   1. Mode selector (auto / manual_bulk / paused)  → writes site_settings.dispatch_mode
 *      (JSON-encoded string) + audit row 'mode_changed'.
 *   2. Queue panel: lists orders with queue_state='queued' from BOTH orders and
 *      agent_orders. "Generate Batches" calls the SQL RPC.
 *   3. Batches list + detail: View / Copy / Mark Sent / Mark Delivered.
 *      No "Resolve Remaining" button (spec correction).
 *   4. Failed orders panel: dispatch_batch_items with status='failed'.
 *      Resolve actions: retry_dispatch / mark_failed / manual_resolve.
 *   5. Leftover orders: queue_state='sent' but order still 'Pending' > 30 min.
 *   6. Live-write audit-log preview at the bottom for the last 50 events.
 *
 * All RPCs come from Phase 1 + foundation patches:
 *   - generate_bulk_dispatch_batches(p_network)
 *   - mark_batch_sent(p_batch_id, p_sent_by)
 *   - mark_batch_delivered(p_batch_id, p_marked_by)
 *   - mark_order_in_batch_failed(p_item_id, p_reason)
 *   - resolve_failed_batch_order(p_item_id, p_action, p_actor, p_notes)
 *
 * Vocabulary corrections (per Phase 2 spec):
 *   - queue_state IN ('queued','batched','sent') — no 'in_batch' / 'batch_sent'.
 *   - dispatch_batches.status: new | sent | completed | cancelled | issue
 *     (no 'partially_delivered').
 */
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "./AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Copy, Check, Send, AlertTriangle, Package, RefreshCw, Search, Clock,
  Zap, Layers, Eye, XCircle, CheckCircle2, ScrollText, Settings2, PauseCircle, RotateCcw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ───────────────────────── Types ─────────────────────────
type DispatchMode = "auto" | "manual_bulk" | "paused";
type BatchStatus = "new" | "sent" | "completed" | "cancelled" | "issue";

interface QueuedOrder {
  source: "orders" | "agent_orders";
  id: string;
  order_id: string;
  recipient_number: string;
  network: string;
  bundle_size_gb: number;
  amount_ghs: number;
  created_at: string;
  status: string;
  queue_state: string | null;
  customer_name: string | null;
}

interface DispatchBatch {
  id: string;
  batch_number: string;
  network: string;
  bundle_size_gb: number | null;
  bundle_label: string | null;
  status: BatchStatus;
  order_count: number;
  notes: string | null;
  created_by: string | null;
  copied_at: string | null;
  sent_at: string | null;
  sent_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BatchItem {
  id: string;
  batch_id: string;
  order_id: string;
  order_uuid: string | null;
  order_table: "orders" | "agent_orders";
  recipient_number: string;
  bundle_size_gb: number;
  network: string;
  status: string;
  notes: string | null;
  resolved_action: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

interface AuditRow {
  id: string;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: any;
  created_at: string;
}

const NETWORKS = ["MTN", "Telecel", "AirtelTigo"] as const;

const normalizePhone = (phone: string): string => {
  let cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("233") && cleaned.length === 12) cleaned = "0" + cleaned.slice(3);
  return cleaned;
};
const formatBundleLabel = (gb: number) => (gb < 1 ? `${Math.round(gb * 1000)}MB` : `${gb}GB`);

// ───────────────────────── Page ─────────────────────────
export default function AdminBulkDispatchQueue() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Filters
  const [networkFilter, setNetworkFilter] = useState<string>("MTN");
  const [batchStatusFilter, setBatchStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Mode + flag
  const [mode, setMode] = useState<DispatchMode>("auto");
  const [flagEnabled, setFlagEnabled] = useState(false);
  const [modeLoading, setModeLoading] = useState(false);
  const [modeModalOpen, setModeModalOpen] = useState(false);

  // Dialogs
  const [confirmSendBatchId, setConfirmSendBatchId] = useState<string | null>(null);
  const [confirmDeliveredBatchId, setConfirmDeliveredBatchId] = useState<string | null>(null);
  const [viewBatchId, setViewBatchId] = useState<string | null>(null);
  const [copiedBatchId, setCopiedBatchId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Failed-order resolution dialog
  const [resolveItem, setResolveItem] = useState<BatchItem | null>(null);
  const [resolveAction, setResolveAction] = useState<"retry_dispatch" | "mark_failed" | "manual_resolve">("retry_dispatch");
  const [resolveNotes, setResolveNotes] = useState("");

  // ─── Load mode + feature flag ───
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("key,value")
        .in("key", ["dispatch_mode", "bulk_dispatch_queue_enabled"]);
      for (const row of data || []) {
        const raw = (row as any).value;
        let parsed: any = null;
        if (raw == null) parsed = null;
        else if (typeof raw === "object") parsed = raw;
        else if (typeof raw === "string") {
          try { parsed = JSON.parse(raw); } catch { parsed = null; }
        }
        if (row.key === "dispatch_mode") {
          let m = parsed?.mode;
          if (m === "manual") m = "manual_bulk"; // legacy alias
          if (m === "automatic") m = "auto";     // legacy alias
          if (m === "auto" || m === "manual_bulk" || m === "paused") setMode(m);
        }
        if (row.key === "bulk_dispatch_queue_enabled") {
          setFlagEnabled(parsed?.enabled === true);
        }
      }
    })();
  }, []);

  const handleModeChange = async (next: DispatchMode) => {
    setModeLoading(true);
    try {
      const previous = mode;
      // CRITICAL: site_settings.value is TEXT — must be a JSON-encoded string.
      const payload = JSON.stringify({ mode: next, updated_at: new Date().toISOString() });
      const { error } = await supabase
        .from("site_settings")
        .upsert({ key: "dispatch_mode", value: payload as any }, { onConflict: "key" });
      if (error) throw error;
      setMode(next);

      // Audit
      await supabase.from("bulk_dispatch_audit" as any).insert({
        actor_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        action: "mode_changed",
        entity_type: "site_settings",
        entity_id: "dispatch_mode",
        previous_value: { mode: previous },
        new_value: { mode: next },
      });

      toast.success(`Dispatch mode set to ${prettyMode(next)}`);
      setModeModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["bulk-dispatch-audit"] });
    } catch (e: any) {
      toast.error("Failed to update dispatch mode");
      console.error(e);
    } finally {
      setModeLoading(false);
    }
  };

  // ─── Queued orders (queue_state='queued', both tables) ───
  const { data: queuedOrders = [], isLoading: ordersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ["bd-queued", networkFilter],
    queryFn: async (): Promise<QueuedOrder[]> => {
      const [a, b] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_id, recipient_number, network, bundle_size_gb, amount_ghs, created_at, status, queue_state, customer_name")
          .eq("queue_state", "queued")
          .eq("network", networkFilter)
          .order("created_at", { ascending: true })
          .limit(500),
        supabase
          .from("agent_orders")
          .select("id, order_id, customer_phone, network, bundle_size_gb, agent_selling_price, created_at, status, queue_state, customer_name")
          .eq("queue_state", "queued")
          .eq("network", networkFilter)
          .order("created_at", { ascending: true })
          .limit(500),
      ]);
      const fromOrders: QueuedOrder[] = (a.data || []).map((o: any) => ({
        source: "orders", ...o,
      }));
      const fromAgent: QueuedOrder[] = (b.data || []).map((o: any) => ({
        source: "agent_orders",
        id: o.id,
        order_id: o.order_id,
        recipient_number: o.customer_phone,
        network: o.network,
        bundle_size_gb: o.bundle_size_gb,
        amount_ghs: Number(o.agent_selling_price ?? 0),
        created_at: o.created_at,
        status: o.status,
        queue_state: o.queue_state,
        customer_name: o.customer_name,
      }));
      return [...fromOrders, ...fromAgent].sort(
        (x, y) => +new Date(x.created_at) - +new Date(y.created_at),
      );
    },
    refetchInterval: 15000,
  });

  // ─── Batches ───
  const { data: batches = [], isLoading: batchesLoading, refetch: refetchBatches } = useQuery({
    queryKey: ["bd-batches", networkFilter, batchStatusFilter],
    queryFn: async (): Promise<DispatchBatch[]> => {
      let q = supabase
        .from("dispatch_batches")
        .select("*")
        .eq("network", networkFilter)
        .order("created_at", { ascending: false })
        .limit(100);
      if (batchStatusFilter !== "all") q = q.eq("status", batchStatusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as DispatchBatch[];
    },
    refetchInterval: 15000,
  });

  // ─── View batch items ───
  const { data: viewBatchItems = [] } = useQuery({
    queryKey: ["bd-batch-items", viewBatchId],
    queryFn: async (): Promise<BatchItem[]> => {
      if (!viewBatchId) return [];
      const { data, error } = await supabase
        .from("dispatch_batch_items")
        .select("*")
        .eq("batch_id", viewBatchId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as BatchItem[];
    },
    enabled: !!viewBatchId,
  });

  // ─── Failed batch items (across all batches) ───
  const { data: failedItems = [], refetch: refetchFailed } = useQuery({
    queryKey: ["bd-failed-items", networkFilter],
    queryFn: async (): Promise<BatchItem[]> => {
      const { data, error } = await supabase
        .from("dispatch_batch_items")
        .select("*")
        .eq("status", "failed")
        .eq("network", networkFilter)
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as BatchItem[];
    },
    refetchInterval: 20000,
  });

  // ─── Leftover orders: queue_state='sent' but order still Pending > 30 min ───
  const LEFTOVER_THRESHOLD_MIN = 30;
  const { data: leftoverOrders = [], refetch: refetchLeftover } = useQuery({
    queryKey: ["bd-leftover", networkFilter],
    queryFn: async (): Promise<QueuedOrder[]> => {
      const cutoff = new Date(Date.now() - LEFTOVER_THRESHOLD_MIN * 60_000).toISOString();
      const [a, b] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_id, recipient_number, network, bundle_size_gb, amount_ghs, created_at, status, queue_state, customer_name")
          .eq("queue_state", "sent")
          .eq("status", "Pending")
          .eq("network", networkFilter)
          .lt("created_at", cutoff)
          .order("created_at", { ascending: true })
          .limit(200),
        supabase
          .from("agent_orders")
          .select("id, order_id, customer_phone, network, bundle_size_gb, agent_selling_price, created_at, status, queue_state, customer_name")
          .eq("queue_state", "sent")
          .eq("status", "Pending")
          .eq("network", networkFilter)
          .lt("created_at", cutoff)
          .order("created_at", { ascending: true })
          .limit(200),
      ]);
      const fromOrders: QueuedOrder[] = (a.data || []).map((o: any) => ({ source: "orders", ...o }));
      const fromAgent: QueuedOrder[] = (b.data || []).map((o: any) => ({
        source: "agent_orders",
        id: o.id,
        order_id: o.order_id,
        recipient_number: o.customer_phone,
        network: o.network,
        bundle_size_gb: o.bundle_size_gb,
        amount_ghs: Number(o.agent_selling_price ?? 0),
        created_at: o.created_at,
        status: o.status,
        queue_state: o.queue_state,
        customer_name: o.customer_name,
      }));
      return [...fromOrders, ...fromAgent];
    },
    refetchInterval: 30000,
  });

  // ─── Audit log (last 50 events) ───
  const { data: auditRows = [], refetch: refetchAudit } = useQuery({
    queryKey: ["bulk-dispatch-audit"],
    queryFn: async (): Promise<AuditRow[]> => {
      const { data, error } = await supabase
        .from("bulk_dispatch_audit" as any)
        .select("id, actor_email, action, entity_type, entity_id, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return [];
      return (data || []) as unknown as AuditRow[];
    },
    refetchInterval: 30000,
  });

  // ─── Filters ───
  const filteredQueued = useMemo(() => {
    const s = searchQuery.toLowerCase().trim();
    if (!s) return queuedOrders;
    return queuedOrders.filter(o =>
      o.order_id.toLowerCase().includes(s) ||
      o.recipient_number.includes(s) ||
      (o.customer_name || "").toLowerCase().includes(s),
    );
  }, [queuedOrders, searchQuery]);

  const groupedByBundle = useMemo(() => {
    const groups: Record<string, QueuedOrder[]> = {};
    for (const o of filteredQueued) {
      const key = String(o.bundle_size_gb);
      if (!groups[key]) groups[key] = [];
      groups[key].push(o);
    }
    return groups;
  }, [filteredQueued]);

  // ─── Actions ───
  const handleGenerateBatches = async () => {
    if (filteredQueued.length === 0) {
      toast.info("No queued orders to batch");
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.rpc("generate_bulk_dispatch_batches" as any, {
        p_network: networkFilter,
      });
      if (error) throw error;
      const result = (data || {}) as any;
      const created = result?.batches_created ?? result?.batch_count ?? 0;
      toast.success(`Generated ${created} batch${created === 1 ? "" : "es"} for ${networkFilter}`);
      refetchBatches();
      refetchOrders();
      refetchAudit();
    } catch (e: any) {
      toast.error(`Failed to generate batches: ${e.message ?? e}`);
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const fetchBatchText = async (batchId: string): Promise<string> => {
    const { data: items } = await supabase
      .from("dispatch_batch_items")
      .select("recipient_number, bundle_size_gb, created_at")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: true });
    if (!items || items.length === 0) return "";
    return items.map(i => `${normalizePhone(i.recipient_number)} ${i.bundle_size_gb}`).join("\n");
  };

  const legacyCopy = (value: string): boolean => {
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.contentEditable = "true";
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.width = "1px";
      ta.style.height = "1px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      // iOS Safari needs an explicit Range selection
      const range = document.createRange();
      range.selectNodeContents(ta);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      ta.setSelectionRange(0, value.length);
      const ok = document.execCommand("copy");
      sel?.removeAllRanges();
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const handleCopyBatch = async (batch: DispatchBatch) => {
    // CRITICAL: We must keep the user gesture alive on iOS Safari.
    // Calling `await supabase…` BEFORE clipboard write breaks the gesture chain.
    // Strategy: kick off the fetch, then immediately invoke navigator.clipboard.write
    // with a ClipboardItem whose Blob is created from a Promise. Safari supports this
    // and preserves the user activation. Fallback to legacy execCommand on resolved text.

    let copied = false;
    const textPromise = fetchBatchText(batch.id);

    // Path A: Safari/Chrome async ClipboardItem with Promise (keeps gesture)
    try {
      const ClipboardItemRef: any = (window as any).ClipboardItem;
      if (
        navigator.clipboard &&
        typeof (navigator.clipboard as any).write === "function" &&
        ClipboardItemRef &&
        window.isSecureContext
      ) {
        const blobPromise = textPromise.then(
          (t) => new Blob([t || " "], { type: "text/plain" }),
        );
        const item = new ClipboardItemRef({ "text/plain": blobPromise });
        await navigator.clipboard.write([item]);
        copied = true;
      }
    } catch {
      copied = false;
    }

    // Resolve text for downstream logic + fallbacks
    const text = await textPromise;
    if (!text) {
      toast.error("No items in batch");
      return;
    }

    // Path B: writeText (works on desktop / Android in secure context)
    if (!copied) {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          copied = true;
        }
      } catch {
        copied = false;
      }
    }

    // Path C: legacy execCommand (older Safari / non-secure contexts)
    if (!copied) copied = legacyCopy(text);

    // Path D: manual prompt
    if (!copied) {
      try { window.prompt("Copy the orders below:", text); } catch { /* ignore */ }
      toast.error("Auto-copy blocked — text shown for manual copy");
      return;
    }

    setCopiedBatchId(batch.id);
    setTimeout(() => setCopiedBatchId(null), 3000);
    await supabase
      .from("dispatch_batches")
      .update({ copied_at: new Date().toISOString() })
      .eq("id", batch.id);
    refetchBatches();
    toast.success(`${text.split("\n").length} orders copied`);
  };

  const handleConfirmSent = async () => {
    if (!confirmSendBatchId) return;
    try {
      const { error } = await supabase.rpc("mark_batch_sent" as any, {
        p_batch_id: confirmSendBatchId,
        p_sent_by: user?.email ?? "admin",
      });
      if (error) throw error;
      toast.success("Batch marked as sent — orders moved to Processing");
      setConfirmSendBatchId(null);
      refetchBatches();
      refetchOrders();
      refetchLeftover();
      refetchAudit();
    } catch (e: any) {
      toast.error(`Failed: ${e.message ?? e}`);
    }
  };

  const handleConfirmDelivered = async () => {
    if (!confirmDeliveredBatchId) return;
    try {
      const { error } = await supabase.rpc("mark_batch_delivered" as any, {
        p_batch_id: confirmDeliveredBatchId,
        p_marked_by: user?.email ?? "admin",
      });
      if (error) throw error;
      toast.success("Batch marked delivered");
      setConfirmDeliveredBatchId(null);
      refetchBatches();
      refetchOrders();
      refetchLeftover();
      refetchAudit();
    } catch (e: any) {
      toast.error(`Failed: ${e.message ?? e}`);
    }
  };

  const handleResolveFailed = async () => {
    if (!resolveItem) return;
    if (resolveAction === "manual_resolve" && !resolveNotes.trim()) {
      toast.error("Notes required for manual resolution");
      return;
    }
    try {
      const { error } = await supabase.rpc("resolve_failed_batch_order" as any, {
        p_item_id: resolveItem.id,
        p_action: resolveAction,
        p_actor: user?.email ?? "admin",
        p_notes: resolveNotes || null,
      });
      if (error) throw error;
      toast.success("Failed order resolved");
      setResolveItem(null);
      setResolveNotes("");
      setResolveAction("retry_dispatch");
      refetchFailed();
      refetchBatches();
      refetchOrders();
      refetchAudit();
    } catch (e: any) {
      toast.error(`Failed: ${e.message ?? e}`);
    }
  };

  // ─── Stats ───
  const stats = useMemo(() => {
    return {
      queuedCount: filteredQueued.length,
      pendingBatches: batches.filter(b => b.status === "new").length,
      sentToday: batches.filter(b => b.status === "sent" && b.sent_at &&
        new Date(b.sent_at).toDateString() === new Date().toDateString()).length,
      failedCount: failedItems.length,
      leftoverCount: leftoverOrders.length,
    };
  }, [filteredQueued, batches, failedItems, leftoverOrders]);

  return (
    <AdminLayout>
      <div className="space-y-4 max-w-6xl mx-auto">

        {/* Mode + Flag banner */}
        <ModeBanner
          mode={mode}
          flagEnabled={flagEnabled}
          onChangeMode={() => setModeModalOpen(true)}
        />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Queued" value={stats.queuedCount} />
          <StatCard label="Open Batches" value={stats.pendingBatches} />
          <StatCard label="Sent Today" value={stats.sentToday} />
          <StatCard label="Failed" value={stats.failedCount} accent={stats.failedCount > 0 ? "destructive" : undefined} />
          <StatCard label="Leftover" value={stats.leftoverCount} accent={stats.leftoverCount > 0 ? "warning" : undefined} />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
            <Select value={networkFilter} onValueChange={setNetworkFilter}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {NETWORKS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={batchStatusFilter} onValueChange={setBatchStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Batches</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="issue">Issue</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search phone / order ID…"
                className="pl-9"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => { refetchOrders(); refetchBatches(); refetchFailed(); refetchLeftover(); refetchAudit(); }}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </CardContent>
        </Card>

        {/* Queue panel */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Package className="w-4 h-4" /> Queue — {networkFilter}
                <Badge variant="outline" className="text-[10px]">{filteredQueued.length}</Badge>
              </CardTitle>
              <Button size="sm" onClick={handleGenerateBatches} disabled={generating || filteredQueued.length === 0}>
                <Layers className="w-3.5 h-3.5 mr-1" />
                {generating ? "Generating…" : "Generate Batches"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {ordersLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : filteredQueued.length === 0 ? (
              <p className="text-xs text-muted-foreground">No queued orders for {networkFilter}.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-2">
                  {Object.entries(groupedByBundle).map(([sz, list]) => (
                    <Badge key={sz} variant="outline" className="text-xs">
                      {formatBundleLabel(parseFloat(sz))} × {list.length}
                    </Badge>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Oldest queued: {formatDistanceToNow(new Date(filteredQueued[0].created_at), { addSuffix: true })}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Batches list */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Layers className="w-4 h-4" /> Batches
          </h3>
          {batchesLoading ? (
            <Card><CardContent className="py-6 text-center text-xs text-muted-foreground">Loading…</CardContent></Card>
          ) : batches.length === 0 ? (
            <Card><CardContent className="py-6 text-center text-xs text-muted-foreground">No batches found</CardContent></Card>
          ) : (
            batches.map(batch => (
              <BatchRow
                key={batch.id}
                batch={batch}
                copiedBatchId={copiedBatchId}
                onView={() => setViewBatchId(batch.id)}
                onCopy={() => handleCopyBatch(batch)}
                onMarkSent={() => setConfirmSendBatchId(batch.id)}
                onMarkDelivered={() => setConfirmDeliveredBatchId(batch.id)}
              />
            ))
          )}
        </div>

        {/* Failed orders panel */}
        {failedItems.length > 0 && (
          <Card className="border-destructive/40">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4" /> Failed Orders ({failedItems.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              {failedItems.map(item => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-2 rounded border border-destructive/20 bg-destructive/5">
                  <div className="text-xs">
                    <span className="font-mono font-semibold">{item.order_id}</span>
                    <span className="text-muted-foreground"> · {normalizePhone(item.recipient_number)} · {formatBundleLabel(item.bundle_size_gb)} · {item.network}</span>
                    {item.notes && <p className="text-[10px] text-muted-foreground mt-0.5">{item.notes}</p>}
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setResolveItem(item); setResolveAction("retry_dispatch"); setResolveNotes(""); }}>
                    Resolve
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Leftover orders panel */}
        {leftoverOrders.length > 0 && (
          <Card className="border-amber-500/40">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-600">
                <Clock className="w-4 h-4" /> Leftover Orders — Pending past {LEFTOVER_THRESHOLD_MIN}m after batch sent ({leftoverOrders.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-1.5">
              {leftoverOrders.slice(0, 50).map(o => (
                <div key={`${o.source}:${o.id}`} className="text-xs flex items-center justify-between p-2 rounded border border-amber-500/20 bg-amber-500/5">
                  <span>
                    <span className="font-mono font-semibold">{o.order_id}</span>
                    <span className="text-muted-foreground"> · {normalizePhone(o.recipient_number)} · {formatBundleLabel(o.bundle_size_gb)} · {o.source === "agent_orders" ? "agent" : "direct"}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(o.created_at), { addSuffix: true })}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Audit log preview */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ScrollText className="w-4 h-4" /> Recent Audit (last 50)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 max-h-[320px] overflow-y-auto">
            {auditRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No audit events yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">When</TableHead>
                    <TableHead className="text-xs">Actor</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                    <TableHead className="text-xs">Entity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditRows.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="text-[10px] whitespace-nowrap">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</TableCell>
                      <TableCell className="text-[10px]">{a.actor_email || "system"}</TableCell>
                      <TableCell className="text-[10px] font-mono">{a.action}</TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">{a.entity_type}{a.entity_id ? ` · ${a.entity_id.slice(0, 12)}` : ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mode dialog */}
      <Dialog open={modeModalOpen} onOpenChange={setModeModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dispatch Mode</DialogTitle>
            <DialogDescription>
              Controls how new orders are dispatched. Effective only when the bulk-dispatch
              feature flag is ENABLED.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={mode} onValueChange={(v) => handleModeChange(v as DispatchMode)} className="space-y-3">
            <ModeOption value="auto" current={mode} title="Automatic"
              desc="Orders dispatch to suppliers immediately after payment." />
            <ModeOption value="manual_bulk" current={mode} title="Manual Bulk"
              desc="Orders enter the queue and stay Pending until you batch + dispatch them manually." />
            <ModeOption value="paused" current={mode} title="Paused"
              desc="Reserved — does not auto-queue. Use only with explicit operational reason." />
          </RadioGroup>
          <p className="text-[11px] text-muted-foreground pt-2">
            Feature flag: <strong>{flagEnabled ? "ENABLED" : "DISABLED"}</strong>. Flip via
            site_settings.bulk_dispatch_queue_enabled.
          </p>
          {modeLoading && <p className="text-xs text-muted-foreground">Saving…</p>}
        </DialogContent>
      </Dialog>

      {/* Confirm Sent */}
      <Dialog open={!!confirmSendBatchId} onOpenChange={() => setConfirmSendBatchId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Send className="w-5 h-5 text-emerald-500" /> Mark Batch Sent</DialogTitle>
            <DialogDescription>
              Confirm you've sent this batch to the supplier. All orders in the batch move
              from Pending to Processing.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmSendBatchId(null)}>Cancel</Button>
            <Button onClick={handleConfirmSent}>Yes, I've Sent It</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delivered */}
      <Dialog open={!!confirmDeliveredBatchId} onOpenChange={() => setConfirmDeliveredBatchId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-500" /> Mark Batch Delivered</DialogTitle>
            <DialogDescription>
              Mark every order in this batch as Delivered. Use only after the supplier
              confirms delivery for the entire batch.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDeliveredBatchId(null)}>Cancel</Button>
            <Button onClick={handleConfirmDelivered}>Yes, Mark Delivered</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View batch items */}
      <Dialog open={!!viewBatchId} onOpenChange={() => setViewBatchId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Batch Orders</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Phone</TableHead>
                <TableHead className="text-xs">Bundle</TableHead>
                <TableHead className="text-xs">Order ID</TableHead>
                <TableHead className="text-xs">Source</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {viewBatchItems.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{normalizePhone(item.recipient_number)}</TableCell>
                  <TableCell className="text-xs">{formatBundleLabel(item.bundle_size_gb)}</TableCell>
                  <TableCell className="font-mono text-xs">{item.order_id}</TableCell>
                  <TableCell className="text-[10px] text-muted-foreground">{item.order_table}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{item.status}</Badge></TableCell>
                </TableRow>
              ))}
              {viewBatchItems.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground">No items</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      {/* Resolve failed item */}
      <Dialog open={!!resolveItem} onOpenChange={(o) => { if (!o) setResolveItem(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve Failed Order</DialogTitle>
            <DialogDescription>
              {resolveItem && (
                <span className="font-mono text-xs">{resolveItem.order_id} · {normalizePhone(resolveItem.recipient_number)} · {formatBundleLabel(resolveItem.bundle_size_gb)}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={resolveAction} onValueChange={(v) => setResolveAction(v as any)} className="space-y-2">
            <ModeOption value="retry_dispatch" current={resolveAction} title="Retry Dispatch"
              desc="Re-queue this order. queue_state goes back to 'queued', batch item resolved." />
            <ModeOption value="mark_failed" current={resolveAction} title="Mark Failed"
              desc="Mark the underlying order as Failed. Customer-visible." />
            <ModeOption value="manual_resolve" current={resolveAction} title="Manual Resolve"
              desc="You delivered manually outside the system. Marks order Delivered. Notes required." />
          </RadioGroup>
          <Textarea
            placeholder={resolveAction === "manual_resolve" ? "Required: how/when did you deliver this?" : "Optional notes"}
            value={resolveNotes}
            onChange={(e) => setResolveNotes(e.target.value)}
            className="text-sm"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResolveItem(null)}>Cancel</Button>
            <Button onClick={handleResolveFailed}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

// ───────────────────────── Sub-components ─────────────────────────
function prettyMode(m: DispatchMode): string {
  return m === "auto" ? "Automatic" : m === "manual_bulk" ? "Manual Bulk" : "Paused";
}

function ModeBanner({
  mode, flagEnabled, onChangeMode,
}: { mode: DispatchMode; flagEnabled: boolean; onChangeMode: () => void }) {
  const isManual = mode === "manual_bulk";
  const isPaused = mode === "paused";
  const tone = !flagEnabled
    ? { border: "border-muted", bg: "bg-muted/40", icon: <PauseCircle className="w-5 h-5 text-muted-foreground shrink-0" />, label: "Feature Flag DISABLED — live behavior unchanged", sub: `Mode is set to ${prettyMode(mode)} but the bulk-dispatch flag is off. Orders dispatch normally.` }
    : isPaused
      ? { border: "border-muted", bg: "bg-muted/40", icon: <PauseCircle className="w-5 h-5 text-muted-foreground shrink-0" />, label: "Paused", sub: "No queueing in effect." }
      : isManual
        ? { border: "border-amber-500/50", bg: "bg-amber-500/5", icon: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />, label: "Manual Bulk Dispatch ACTIVE", sub: "New orders are queued instead of auto-dispatching." }
        : { border: "border-emerald-500/50", bg: "bg-emerald-500/5", icon: <Zap className="w-5 h-5 text-emerald-500 shrink-0" />, label: "Automatic Dispatch", sub: "Orders dispatch to suppliers automatically." };
  return (
    <Card className={`border-2 ${tone.border} ${tone.bg}`}>
      <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {tone.icon}
          <div>
            <p className="font-semibold text-sm">{tone.label}</p>
            <p className="text-xs text-muted-foreground">{tone.sub}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onChangeMode}>
          <Settings2 className="w-3.5 h-3.5 mr-1" /> Mode
        </Button>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "destructive" | "warning" }) {
  const cls = accent === "destructive" ? "text-destructive"
    : accent === "warning" ? "text-amber-600" : "";
  return (
    <Card>
      <CardContent className="py-3 px-4 text-center">
        <p className={`text-2xl font-bold ${cls}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function ModeOption({ value, current, title, desc }: { value: string; current: string; title: string; desc: string }) {
  const active = current === value;
  return (
    <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
      <RadioGroupItem value={value} className="mt-0.5" />
      <div>
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </label>
  );
}

function batchStatusColor(s: BatchStatus): string {
  switch (s) {
    case "new": return "bg-amber-500/20 text-amber-600 border-amber-500/30";
    case "sent": return "bg-blue-500/20 text-blue-600 border-blue-500/30";
    case "completed": return "bg-emerald-500/20 text-emerald-600 border-emerald-500/30";
    case "cancelled": return "bg-muted text-muted-foreground border-border line-through";
    case "issue": return "bg-destructive/20 text-destructive border-destructive/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function BatchRow({
  batch, copiedBatchId, onView, onCopy, onMarkSent, onMarkDelivered,
}: {
  batch: DispatchBatch;
  copiedBatchId: string | null;
  onView: () => void;
  onCopy: () => void;
  onMarkSent: () => void;
  onMarkDelivered: () => void;
}) {
  const isOldNew = batch.status === "new" && (Date.now() - +new Date(batch.created_at) > 2 * 60 * 60 * 1000);
  return (
    <Card className={isOldNew ? "border-amber-500/50" : ""}>
      <CardContent className="py-3 px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <Badge className={`${batchStatusColor(batch.status)} text-[10px] px-1.5`}>{batch.status.toUpperCase()}</Badge>
            <span className="font-mono text-xs font-semibold">{batch.batch_number}</span>
            <Badge variant="outline" className="text-[10px]">{batch.network}</Badge>
            <Badge variant="outline" className="text-[10px]">{batch.bundle_size_gb == null ? (batch.bundle_label || "Mixed") : (batch.bundle_label || `${batch.bundle_size_gb}GB`)}</Badge>
            <span className="text-xs text-muted-foreground">× {batch.order_count}</span>
            {isOldNew && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onView}>
              <Eye className="w-3 h-3 mr-1" /> View
            </Button>
            <Button variant={copiedBatchId === batch.id ? "secondary" : "outline"} size="sm" className="h-7 text-xs" onClick={onCopy}>
              {copiedBatchId === batch.id ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              {copiedBatchId === batch.id ? "Copied!" : "Copy"}
            </Button>
            {batch.status === "new" && (
              <Button size="sm" className="h-7 text-xs" onClick={onMarkSent}>
                <Send className="w-3 h-3 mr-1" /> Mark Sent
              </Button>
            )}
            {batch.status === "sent" && (
              <Button size="sm" className="h-7 text-xs" onClick={onMarkDelivered}>
                <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Delivered
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-1.5 text-[10px] text-muted-foreground">
          <span>Created {formatDistanceToNow(new Date(batch.created_at), { addSuffix: true })}</span>
          {batch.copied_at && <span>Copied {formatDistanceToNow(new Date(batch.copied_at), { addSuffix: true })}</span>}
          {batch.sent_at && <span>Sent {formatDistanceToNow(new Date(batch.sent_at), { addSuffix: true })}</span>}
          {batch.completed_at && <span>Delivered {formatDistanceToNow(new Date(batch.completed_at), { addSuffix: true })}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
