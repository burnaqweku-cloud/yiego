import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { formatPrice, type OrderStatus } from '@/data/bundles';
import { StatusBadge } from './AdminDashboard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, RotateCcw, CheckCircle, RefreshCw, Download, Filter, ChevronLeft, ChevronRight, DollarSign, PackagePlus, Loader2, Send } from 'lucide-react';
// NOTE: RotateCcw is still used by RetryDispatchSection (Insufficient Funds recovery) below.
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const STATUSES: OrderStatus[] = ['Paid', 'Processing', 'Reprocessed', 'Delivered', 'Failed', 'Pending', 'Pending Payment', 'Voided'];
const RESTORE_STATUSES: OrderStatus[] = ['Pending', 'Processing', 'Reprocessed', 'Delivered', 'Failed'];
const PAGE_SIZE = 25;

interface EnrichedOrder {
  id: string;
  order_id: string;
  user_id: string | null;
  recipient_number: string;
  customer_name: string | null;
  network: string;
  bundle_size_gb: number;
  amount_ghs: number;
  cost_price_ghs: number | null;
  markup_percent: number | null;
  profit_ghs: number | null;
  status: string;
  payment_method: string;
  supplier_reference: string | null;
  supplier_order_id: string | null;
  supplier_status: string | null;
  supplier_message: string | null;
  supplier_amount: number | null;
  supplier_remaining_balance: number | null;
  supplier_timestamp: string | null;
  supplier_raw_response: string | null;
  delivery_note: string | null;
  failure_reason: string | null;
  admin_notes: string | null;
  /** Phase 2 — bulk dispatch queue state. Used to hide retry button. */
  queue_state: string | null;
  created_at: string;
  updated_at: string;
  user_name?: string;
  order_source?: string;
  _is_agent_order?: boolean;
  agent_store_price_at_purchase?: number | null;
  agent_base_price_at_purchase?: number | null;
  agent_profit_at_purchase?: number | null;
  yiego_profit_at_purchase?: number | null;
  supplier_cost_at_purchase?: number | null;
  profit_credited?: boolean;
  _agent_store_name?: string;
  _agent_id?: string;
}

// Phase 2: orders sitting in the manual bulk-dispatch pipeline must not be
// retried via the normal supplier path — the admin should resolve them in the
// bulk dispatch queue instead. Keep the predicate trivial and explicit.
const isInBulkDispatch = (o: { queue_state?: string | null }) =>
  o.queue_state === 'queued' || o.queue_state === 'batched' || o.queue_state === 'sent';

// Fetch paginated orders from the combined view
async function fetchOrdersPage(params: {
  search: string;
  status: string;
  network: string;
  payment: string;
  source: string;
  type: string;
  page: number;
}) {
  let query = supabase
    .from('admin_orders_view' as any)
    .select('*', { count: 'exact' });

  // Server-side filters
  if (params.status !== 'All') query = query.eq('status', params.status);
  if (params.network !== 'All') query = query.eq('network', params.network);
  if (params.payment !== 'All') query = query.eq('payment_method', params.payment);
  if (params.source === 'Agent') query = query.eq('is_agent_order', true);
  else if (params.source === 'Guest') query = query.is('user_id', null).eq('is_agent_order', false);
  else if (params.source === 'Logged-in') query = query.not('user_id', 'is', null).eq('is_agent_order', false);
  if (params.type === 'Reward') query = query.eq('order_type', 'reward');
  else if (params.type === 'Normal') query = query.neq('order_type', 'reward');

  if (params.search) {
    const s = params.search.trim();
    query = query.or(`order_id.ilike.%${s}%,recipient_number.ilike.%${s}%,customer_name.ilike.%${s}%,agent_store_name.ilike.%${s}%`);
  }

  const from = params.page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  const rows = (data || []) as any[];

  // Enrich with user names (only for current page — max 25 rows)
  const userIds = [...new Set(rows.filter(r => r.user_id && !r.is_agent_order).map(r => r.user_id))];
  let profileMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
    (profiles || []).forEach((p: any) => { profileMap[p.id] = p.full_name; });
  }

  const enriched: EnrichedOrder[] = rows.map(r => ({
    ...r,
    user_name: r.is_agent_order
      ? `Agent: ${r.agent_store_name || 'Store'}`
      : (r.user_id ? (profileMap[r.user_id] || 'Unknown') : 'Guest'),
    order_source: r.is_agent_order
      ? `Agent: ${r.agent_store_name || 'Store'}`
      : (r.user_id ? 'Logged-in' : 'Guest'),
    _is_agent_order: r.is_agent_order,
    _agent_store_name: r.agent_store_name,
    _agent_id: r.agent_id,
    agent_store_price_at_purchase: r.agent_store_price,
    agent_base_price_at_purchase: r.agent_base_price,
    agent_profit_at_purchase: r.agent_profit,
    yiego_profit_at_purchase: r.yiego_profit,
    supplier_cost_at_purchase: r.supplier_cost_snapshot,
  }));

  return { orders: enriched, totalCount: count || 0 };
}

const AdminOrders = () => {
  const { user, isAdmin, isAdminOrStaff, loading: authLoading } = useAuth();
  const { log } = useAuditLog();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Read search param from URL (e.g. from AI ticket quick link)
  const [urlSearchParams] = useSearchParams();
  const initialSearch = urlSearchParams.get('search') || '';

  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'All'>('All');
  const [networkFilter, setNetworkFilter] = useState<string>('All');
  const [paymentFilter, setPaymentFilter] = useState<string>('All');
  const [sourceFilter, setSourceFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [page, setPage] = useState(0);
  const [editOrder, setEditOrder] = useState<EnrichedOrder | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isAdminOrStaff)) navigate('/auth');
  }, [user, isAdminOrStaff, authLoading, navigate]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Main orders query with server-side pagination
  const { data: ordersData, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'orders', { search: debouncedSearch, status: statusFilter, network: networkFilter, payment: paymentFilter, source: sourceFilter, type: typeFilter, page }],
    queryFn: () => fetchOrdersPage({
      search: debouncedSearch,
      status: statusFilter,
      network: networkFilter,
      payment: paymentFilter,
      source: sourceFilter,
      type: typeFilter,
      page,
    }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    gcTime: 10 * 60 * 1000,
    enabled: !!isAdminOrStaff,
  });

  // Summary stats (cached longer, single efficient RPC call)
  const { data: summaryData } = useQuery({
    queryKey: ['admin', 'orders', 'summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_orders_summary' as any);
      if (error) throw error;
      return (data as any)?.[0] || null;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!isAdminOrStaff,
  });

  const orders = ordersData?.orders || [];
  const totalCount = ordersData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (authLoading || !user || !isAdminOrStaff) return null;

  const invalidateOrders = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
  };

  const updateOrder = async (orderId: string, updates: any, isAgentOrder?: boolean) => {
    const table = isAgentOrder ? 'agent_orders' : 'orders';
    const { error } = await supabase.from(table).update(updates).eq('order_id', orderId);
    if (!error) {
      // Optimistic update in cache
      queryClient.setQueryData(
        ['admin', 'orders', { search: debouncedSearch, status: statusFilter, network: networkFilter, payment: paymentFilter, source: sourceFilter, type: typeFilter, page }],
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            orders: old.orders.map((o: any) => o.order_id === orderId ? { ...o, ...updates, updated_at: new Date().toISOString() } : o),
          };
        }
      );
    }
    return error;
  };

  const handleMarkPaid = async (order: EnrichedOrder) => {
    await updateOrder(order.order_id, { status: 'Paid' }, order._is_agent_order);
    await log({ action: 'order_marked_paid', entity_type: 'order', entity_id: order.order_id });
    toast.success(`Order ${order.order_id} marked as Paid`);

    supabase.functions.invoke('submit-supplier-order', {
      body: { order_id: order.order_id },
    }).then(({ data, error }) => {
      if (error) toast.error('Supplier delivery failed');
      else if (data?.success) { toast.success('Supplier delivery initiated'); invalidateOrders(); }
      else { toast.error(data?.reason || 'Unknown error'); invalidateOrders(); }
    });
  };


  const handleExportCSV = async () => {
    // Fetch all matching orders for export
    toast.info('Preparing export...');
    let allOrders: any[] = [];
    let offset = 0;
    const batchSize = 500;
    while (true) {
      let query = supabase.from('admin_orders_view' as any).select('order_id, recipient_number, network, bundle_size_gb, amount_ghs, cost_price_ghs, profit_ghs, payment_method, status, created_at');
      if (statusFilter !== 'All') query = query.eq('status', statusFilter);
      if (networkFilter !== 'All') query = query.eq('network', networkFilter);
      if (debouncedSearch) query = query.or(`order_id.ilike.%${debouncedSearch}%,recipient_number.ilike.%${debouncedSearch}%`);
      query = query.order('created_at', { ascending: false }).range(offset, offset + batchSize - 1);
      const { data } = await query;
      if (!data || data.length === 0) break;
      allOrders.push(...data);
      if (data.length < batchSize) break;
      offset += batchSize;
    }

    const headers = ['Order ID', 'Recipient', 'Network', 'Bundle (GB)', 'Amount (GHS)', 'Cost (GHS)', 'Profit (GHS)', 'Payment', 'Status', 'Date'];
    const rows = allOrders.map((o: any) => [
      o.order_id, o.recipient_number, o.network, o.bundle_size_gb,
      o.amount_ghs, o.cost_price_ghs ?? '', o.profit_ghs ?? '',
      o.payment_method, o.status, new Date(o.created_at).toLocaleString()
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(`${allOrders.length} orders exported`);
  };

  // Bulk actions
  const toggleSelect = (orderId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === orders.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(orders.map(o => o.order_id)));
  };

  const handleBulkStatus = async (newStatus: string) => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!window.confirm(`Mark ${count} order(s) as "${newStatus}"?`)) return;
    setBulkProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      // Group by table to batch updates
      const normalIds: string[] = [];
      const agentIds: string[] = [];
      for (const orderId of ids) {
        const order = orders.find(o => o.order_id === orderId);
        if (order?._is_agent_order) agentIds.push(orderId);
        else normalIds.push(orderId);
      }

      if (normalIds.length > 0) {
        const { error } = await supabase.from('orders').update({ status: newStatus }).in('order_id', normalIds);
        if (error) throw error;
      }
      if (agentIds.length > 0) {
        const { error } = await supabase.from('agent_orders').update({ status: newStatus }).in('order_id', agentIds);
        if (error) throw error;
      }

      for (const orderId of ids) {
        await log({ action: `order_bulk_${newStatus.toLowerCase().replace(' ', '_')}`, entity_type: 'order', entity_id: orderId, changes: { status: { after: newStatus } } });
      }
      toast.success(`${count} order(s) marked as ${newStatus}`);
      setSelectedIds(new Set());
      invalidateOrders();
    } catch (err: any) {
      toast.error('Bulk update failed: ' + (err.message || 'Unknown error'));
    } finally {
      setBulkProcessing(false);
    }
  };

  // Create a manual dispatch batch from the currently selected normal orders.
  // Re-uses the existing Bulk Dispatch / dispatch_batches workflow.
  // Skips: agent orders, admin_bulk-sourced orders, orders already in active batch.
  // Does not touch payment, wallet, refund, supplier, or order status.
  const handleCreateDispatchBatch = async () => {
    if (selectedIds.size === 0) return;

    // Filter to normal orders only — agent orders aren't supported by this flow.
    const normalOrderIds: string[] = [];
    const agentSkipped: string[] = [];
    for (const orderId of Array.from(selectedIds)) {
      const o = orders.find((x) => x.order_id === orderId);
      if (o?._is_agent_order) agentSkipped.push(orderId);
      else normalOrderIds.push(orderId);
    }

    if (normalOrderIds.length === 0) {
      toast.error('No normal orders selected. Agent orders cannot be batched here.');
      return;
    }

    // Pre-flight network check (server also enforces this)
    const networks = new Set(
      normalOrderIds
        .map((id) => orders.find((o) => o.order_id === id)?.network)
        .filter(Boolean) as string[],
    );
    if (networks.size > 1) {
      toast.error('Selected orders contain multiple networks. Please create separate batches per network.');
      return;
    }

    const ok = window.confirm(
      `Create a manual dispatch batch from ${normalOrderIds.length} order(s)?\n\n` +
        `• No customer is charged\n` +
        `• Wallets and refunds are NOT touched\n` +
        `• Order statuses stay unchanged\n` +
        `• Batch will appear on the Bulk Dispatch page for copy / mark sent / mark delivered`,
    );
    if (!ok) return;

    setBulkProcessing(true);
    try {
      const { data, error } = await supabase.rpc(
        'create_dispatch_batch_from_orders' as any,
        { p_order_ids: normalOrderIds } as any,
      );
      if (error) throw error;
      const result = data as any;

      const skippedCount = Array.isArray(result?.skipped) ? result.skipped.length : 0;
      const createdCount = result?.order_count ?? 0;

      await log({
        action: 'admin_orders_create_dispatch_batch',
        entity_type: 'dispatch_batch',
        entity_id: result?.batch_id || null,
        changes: {
          batch: {
            after: {
              batch_number: result?.batch_number,
              network: result?.network,
              order_count: createdCount,
              skipped_count: skippedCount,
              requested_ids: normalOrderIds,
            },
          },
        },
      });

      toast.success(
        `Batch ${result?.batch_number || ''} created — ${createdCount} order(s)` +
          (skippedCount ? `, ${skippedCount} skipped` : '') +
          (agentSkipped.length ? `, ${agentSkipped.length} agent order(s) ignored` : ''),
        {
          action: {
            label: 'View Batches',
            onClick: () => navigate('/admin/bulk-dispatch'),
          },
        },
      );

      setSelectedIds(new Set());
      invalidateOrders();
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('mixed_networks')) {
        toast.error('Selected orders span multiple networks. Create one batch per network.');
      } else if (msg.includes('no_eligible_orders')) {
        toast.error('No eligible orders. They may already be in an active batch or missing required fields.');
      } else if (msg.includes('permission_denied')) {
        toast.error('Admin permission required.');
      } else {
        toast.error('Could not create batch: ' + (err?.message || 'Unknown error'));
      }
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkVoid = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const reason = window.prompt(
      `Mark ${count} orders as Voided?\n\nThis will void ${count} selected orders. Customers will NOT be notified. No refunds will be issued. Recipient numbers will be unblocked for reordering. Orders already in Voided status will be skipped.\n\nOptional reason (applied to all):`,
      ''
    );
    if (reason === null) return; // cancelled
    setBulkProcessing(true);
    try {
      const items = Array.from(selectedIds).map(orderId => {
        const o = orders.find(x => x.order_id === orderId);
        return { order_id: orderId, is_agent_order: !!o?._is_agent_order };
      });
      const { data, error } = await supabase.rpc('admin_bulk_void_orders' as any, {
        p_items: items as any,
        p_reason: reason || null,
      });
      if (error) throw error;
      const result = data as any;
      toast.success(`Voided ${result?.voided_count ?? 0} orders. Skipped ${result?.skipped_count ?? 0} already-voided.`);
      setSelectedIds(new Set());
      invalidateOrders();
    } catch (err: any) {
      toast.error('Bulk void failed: ' + (err.message || 'Unknown error'));
    } finally {
      setBulkProcessing(false);
    }
  };

  const revenue = summaryData ? Number(summaryData.total_revenue) : 0;
  const profit = summaryData ? Number(summaryData.total_profit) : 0;
  const processingCount = summaryData ? Number(summaryData.processing_count) : 0;
  const deliveredCount = summaryData ? Number(summaryData.delivered_count) : 0;
  const failedCount = summaryData ? Number(summaryData.failed_count) : 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold">Orders</h2>
            <p className="text-muted-foreground text-sm">
              {totalCount} orders{statusFilter !== 'All' ? ` (${statusFilter})` : ''}
              {isFetching && !isLoading && (
                <span className="ml-2 inline-flex items-center gap-1 text-primary">
                  <Loader2 className="w-3 h-3 animate-spin" /> Updating…
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button size="sm" asChild className="gap-1.5 text-xs">
                <Link to="/admin/orders/create"><PackagePlus className="w-3.5 h-3.5" /> Create Order</Link>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5 text-xs hidden sm:flex">
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={invalidateOrders} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Revenue summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-card rounded-xl p-3 border border-border card-shadow">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Revenue (Paid)</p>
            <p className="text-lg font-display font-bold mt-1">{formatPrice(revenue)}</p>
          </div>
          <div className="bg-card rounded-xl p-3 border border-border card-shadow">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Profit (Tracked)</p>
            <p className="text-lg font-display font-bold mt-1">{formatPrice(profit)}</p>
          </div>
          <div className="bg-card rounded-xl p-3 border border-border card-shadow">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Processing</p>
            <p className="text-lg font-display font-bold mt-1 text-primary">{processingCount}</p>
          </div>
          <div className="bg-card rounded-xl p-3 border border-border card-shadow">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Delivered</p>
            <p className="text-lg font-display font-bold mt-1 text-success">{deliveredCount}</p>
          </div>
          <div className="bg-card rounded-xl p-3 border border-border card-shadow">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Failed</p>
            <p className="text-lg font-display font-bold mt-1 text-destructive">{failedCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by Order ID, phone, name..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={networkFilter} onValueChange={v => { setNetworkFilter(v); setPage(0); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Networks</SelectItem>
                <SelectItem value="MTN">MTN</SelectItem>
                <SelectItem value="Telecel">Telecel</SelectItem>
                <SelectItem value="AirtelTigo">AirtelTigo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentFilter} onValueChange={v => { setPaymentFilter(v); setPage(0); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Payments</SelectItem>
                <SelectItem value="wallet">Wallet</SelectItem>
                <SelectItem value="paystack">Paystack</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={v => { setSourceFilter(v); setPage(0); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Sources</SelectItem>
                <SelectItem value="Guest">Guest</SelectItem>
                <SelectItem value="Logged-in">Logged-in</SelectItem>
                <SelectItem value="Agent">Agent Store</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Types</SelectItem>
                <SelectItem value="Normal">Normal</SelectItem>
                <SelectItem value="Reward">🎁 Reward</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 flex-wrap">
            {['All', ...STATUSES].map(s => (
              <button key={s} onClick={() => { setStatusFilter(s as any); setPage(0); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && isAdmin && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 animate-hero-in">
            <span className="text-sm font-semibold text-primary">{selectedIds.size} selected</span>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" disabled={bulkProcessing} onClick={() => handleBulkStatus('Pending')} className="gap-1 text-xs h-8">Pending</Button>
              <Button size="sm" variant="outline" disabled={bulkProcessing} onClick={() => handleBulkStatus('Processing')} className="gap-1 text-xs h-8">Processing</Button>
              <Button size="sm" variant="default" disabled={bulkProcessing} onClick={() => handleBulkStatus('Delivered')} className="gap-1 text-xs h-8">
                <CheckCircle className="w-3 h-3" /> Delivered
              </Button>
              <Button size="sm" variant="outline" disabled={bulkProcessing} onClick={() => handleBulkStatus('Reprocessed')} className="gap-1 text-xs h-8 border-violet-400/60 text-violet-700 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-900/30">Reprocessed</Button>
              <Button size="sm" variant="destructive" disabled={bulkProcessing} onClick={() => handleBulkStatus('Failed')} className="gap-1 text-xs h-8">Failed</Button>
              <Button size="sm" variant="outline" disabled={bulkProcessing} onClick={handleBulkVoid} className="gap-1 text-xs h-8 border-slate-400 text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Mark as Voided</Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkProcessing}
                onClick={handleCreateDispatchBatch}
                className="gap-1 text-xs h-8 border-primary/40 text-primary hover:bg-primary/10"
                title="Create a manual dispatch batch from selected orders. Does not charge or refund anyone."
              >
                {bulkProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Create Dispatch Batch
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="text-xs h-8">Clear</Button>
            </div>
          </div>
        )}

        {/* Orders table */}
        {isLoading ? (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="border-b border-border bg-muted/30 px-4 py-3">
              <div className="flex gap-4">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-4 w-20" />)}
              </div>
            </div>
            <div className="divide-y divide-border">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="px-4 py-3 flex gap-4 items-center">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20 hidden lg:block" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-12 hidden sm:block" />
                  <Skeleton className="h-4 w-10" />
                  <Skeleton className="h-4 w-16 hidden md:block" />
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-7 w-16 ml-auto" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            {orders.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No orders match your filter.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {isAdmin && (
                      <th className="px-3 py-3 w-10">
                        <input type="checkbox" checked={selectedIds.size === orders.length && orders.length > 0} onChange={toggleSelectAll} className="rounded border-border" />
                      </th>
                    )}
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Order ID</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">User / Source</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Recipient</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Network</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Bundle</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Amount</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Profit</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Source</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => (
                    <tr key={order.order_id} className={`border-b border-border last:border-0 hover:bg-muted/30 ${selectedIds.has(order.order_id) ? 'bg-primary/[0.03]' : ''} ${order.status === 'Voided' ? 'opacity-60' : ''}`}>
                      {isAdmin && (
                        <td className="px-3 py-3">
                          <input type="checkbox" checked={selectedIds.has(order.order_id)} onChange={() => toggleSelect(order.order_id)} className="rounded border-border" />
                        </td>
                      )}
                      <td className="px-4 py-3 font-mono font-semibold text-primary text-xs">{order.order_id}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs">{order.user_name}</td>
                      <td className="px-4 py-3 text-xs">{order.recipient_number}</td>
                      <td className="px-4 py-3 hidden sm:table-cell text-xs">{order.network}</td>
                      <td className="px-4 py-3 text-xs">{order.bundle_size_gb}GB</td>
                      <td className="px-4 py-3 text-right hidden md:table-cell font-medium text-xs">{formatPrice(Number(order.amount_ghs))}</td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell text-xs">
                        {order.profit_ghs != null ? <span className="text-success font-medium">{formatPrice(Number(order.profit_ghs))}</span> : '—'}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          order.order_source?.startsWith('Agent') ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                          : order.order_source === 'Guest' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                          : 'bg-primary/10 text-primary'
                        }`}>
                          {order.order_source || 'Direct'}
                        </span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          {order.status === 'Pending Payment' && isAdmin && (
                            <Button size="sm" variant="default" onClick={() => handleMarkPaid(order)} className="gap-1 text-[10px] h-7 px-2">
                              <CheckCircle className="w-3 h-3" /> Paid
                            </Button>
                          )}
                          {isInBulkDispatch(order) && (
                            <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
                              Bulk Queue
                            </span>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setEditOrder(order)} className="text-[10px] h-7 px-2">Details</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {editOrder && (
        <OrderDetailDialog
          order={editOrder}
          isAdmin={isAdmin}
          isAdminOrStaff={isAdminOrStaff}
          onClose={() => { setEditOrder(null); invalidateOrders(); }}
          onUpdate={updateOrder}
          onMarkPaid={handleMarkPaid}
        />
      )}
    </AdminLayout>
  );
};

// ==========================================
// Retry Dispatch Section (Admin-only, Insufficient Funds only)
// ==========================================
const RetryDispatchSection = ({ order, onClose }: { order: EnrichedOrder; onClose: () => void }) => {
  const [retrying, setRetrying] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [retryResult, setRetryResult] = useState<{ success: boolean; message: string } | null>(null);
  const [retrySucceeded, setRetrySucceeded] = useState(false);
  const queryClient = useQueryClient();

  // Check if a successful dispatch already exists (persisted check)
  const { data: successfulAttempts } = useQuery({
    queryKey: ['dispatch-attempts', order.order_id, 'success'],
    queryFn: async () => {
      const { count } = await supabase
        .from('order_dispatch_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('order_id', order.order_id)
        .eq('success', true);
      return count || 0;
    },
    staleTime: 10_000,
  });

  const hasSuccessfulDispatch = (successfulAttempts ?? 0) > 0 || retrySucceeded;

  // Only show for Processing or Paid — NOT Failed, Delivered, Completed, Cancelled
  const showableStatuses = ['Processing', 'Paid'];
  if (!showableStatuses.includes(order.status)) return null;

  // Determine eligibility
  const supplierMessage = order.supplier_message?.toLowerCase() || '';
  const failureReason = order.failure_reason?.toLowerCase() || '';
  const isInsufficientFunds =
    supplierMessage.includes('insufficient wallet balance') ||
    supplierMessage.includes('insufficient balance') ||
    supplierMessage.includes('insufficient funds') ||
    failureReason.includes('insufficient wallet balance') ||
    failureReason.includes('insufficient balance') ||
    failureReason.includes('insufficient funds');

  const eligible = isInsufficientFunds && !hasSuccessfulDispatch;

  let disabledReason = '';
  if (hasSuccessfulDispatch) disabledReason = 'Dispatch already succeeded — retry is no longer needed';
  else if (!isInsufficientFunds) disabledReason = 'Last error is not "Insufficient wallet balance"';

  const handleRetry = async () => {
    setRetrying(true);
    setRetryResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('retry-dispatch', {
        body: { order_id: order.order_id },
      });
      if (error) {
        setRetryResult({ success: false, message: error.message || 'Unknown error' });
        toast.error('Retry failed: ' + error.message);
      } else if (data?.success) {
        setRetrySucceeded(true);
        setRetryResult({ success: true, message: 'Dispatch retry succeeded! Order has been re-sent to supplier.' });
        toast.success('Retry dispatch succeeded!');
        queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
        queryClient.invalidateQueries({ queryKey: ['dispatch-attempts', order.order_id, 'success'] });
      } else {
        setRetryResult({ success: false, message: data?.error || data?.message || 'Retry failed' });
        toast.error(data?.error || 'Retry failed');
      }
    } catch (err: any) {
      setRetryResult({ success: false, message: err.message || 'Unexpected error' });
      toast.error('Retry error: ' + err.message);
    } finally {
      setRetrying(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="border border-border rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">🔄 Retry Dispatch (Admin)</p>

      {retryResult && (
        <div className={`rounded-lg p-3 text-sm ${retryResult.success ? 'bg-success/10 border border-success/30 text-success' : 'bg-destructive/10 border border-destructive/30 text-destructive'}`}>
          {retryResult.message}
        </div>
      )}

      {!eligible ? (
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-xs text-muted-foreground">
            {hasSuccessfulDispatch
              ? '✅ Dispatch already succeeded — retry is no longer needed.'
              : `Retry not available: ${disabledReason}`}
          </p>
        </div>
      ) : (
        <>
          {!showConfirm ? (
            <Button size="sm" variant="outline" onClick={() => setShowConfirm(true)} disabled={retrying} className="gap-1.5 text-xs border-warning text-warning hover:bg-warning/10">
              <RotateCcw className="w-3.5 h-3.5" /> Retry Dispatch
            </Button>
          ) : (
            <div className="bg-warning/5 border border-warning/20 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-warning">⚠ Confirm Retry Dispatch</p>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Recipient</span><span className="font-mono">{order.recipient_number?.replace(/(\d{3})(\d+)(\d{3})/, '$1****$3')}</span></div>
                <div className="flex justify-between"><span>Network</span><span>{order.network}</span></div>
                <div className="flex justify-between"><span>Bundle</span><span>{order.bundle_size_gb}GB</span></div>
                <div className="flex justify-between"><span>Amount</span><span className="font-semibold">{formatPrice(Number(order.amount_ghs))}</span></div>
                <div className="flex justify-between"><span>Last Error</span><span className="text-destructive">{order.supplier_message || order.failure_reason || '—'}</span></div>
              </div>
              <p className="text-[10px] text-warning">This will re-send the SAME order to the supplier. No new order or payment is created.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowConfirm(false)} disabled={retrying} className="flex-1 text-xs">Cancel</Button>
                <Button size="sm" onClick={handleRetry} disabled={retrying} className="flex-1 text-xs gap-1.5 bg-warning text-warning-foreground hover:bg-warning/90">
                  {retrying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  {retrying ? 'Retrying…' : 'Confirm Retry'}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ==========================================
// Void / Restore Section (Admin-only)
// ==========================================
const VoidRestoreSection = ({
  order,
  onUpdate,
  onClose,
}: {
  order: EnrichedOrder;
  onUpdate: (orderId: string, updates: any, isAgentOrder?: boolean) => Promise<any>;
  onClose: () => void;
}) => {
  const { log } = useAuditLog();
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [reason, setReason] = useState('');
  const [restoreTo, setRestoreTo] = useState<OrderStatus>('Pending');
  const [working, setWorking] = useState(false);
  const isVoided = order.status === 'Voided';

  const doVoid = async () => {
    setWorking(true);
    try {
      const err = await onUpdate(order.order_id, { status: 'Voided' }, order._is_agent_order);
      if (err) throw err;
      await log({
        action: 'order_voided',
        entity_type: order._is_agent_order ? 'agent_order' : 'order',
        entity_id: order.order_id,
        changes: { status: { before: order.status, after: 'Voided' } },
        metadata: {
          from_status: order.status, to_status: 'Voided', reason: reason || null,
          recipient_number: order.recipient_number, amount: order.amount_ghs,
          trigger: 'admin',
        },
      });
      toast.success(`Order ${order.order_id} marked as Voided`);
      onClose();
    } catch (e: any) {
      toast.error('Void failed: ' + (e.message || 'Unknown error'));
    } finally {
      setWorking(false);
    }
  };

  const doRestore = async () => {
    setWorking(true);
    try {
      const err = await onUpdate(order.order_id, { status: restoreTo }, order._is_agent_order);
      if (err) throw err;
      await log({
        action: 'order_restored',
        entity_type: order._is_agent_order ? 'agent_order' : 'order',
        entity_id: order.order_id,
        changes: { status: { before: 'Voided', after: restoreTo } },
        metadata: {
          from_status: 'Voided', to_status: restoreTo,
          recipient_number: order.recipient_number, amount: order.amount_ghs,
          trigger: 'admin',
        },
      });
      toast.success(`Order ${order.order_id} restored to ${restoreTo}`);
      onClose();
    } catch (e: any) {
      toast.error('Restore failed: ' + (e.message || 'Unknown error'));
    } finally {
      setWorking(false);
    }
  };

  if (isVoided) {
    return (
      <div className="border border-border rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">↩ Restore Voided Order</p>
        {!showRestore ? (
          <Button size="sm" variant="outline" onClick={() => setShowRestore(true)} className="text-xs">
            Restore to another status
          </Button>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Restore to</Label>
              <Select value={restoreTo} onValueChange={v => setRestoreTo(v as OrderStatus)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESTORE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowRestore(false)} disabled={working} className="flex-1 text-xs">Cancel</Button>
              <Button size="sm" onClick={doRestore} disabled={working} className="flex-1 text-xs">
                {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm Restore'}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">⊘ Void Order (Admin)</p>
      {!showVoidConfirm ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowVoidConfirm(true)}
          className="text-xs border-slate-400 text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Mark as Voided
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Mark this order as Voided? This will remove it from the active pipeline and allow the customer to reorder on the same number.
            The customer will <strong>NOT</strong> be notified and no refund will be issued automatically.
          </p>
          <div>
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="mt-1" placeholder="Why is this being voided?" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowVoidConfirm(false)} disabled={working} className="flex-1 text-xs">Cancel</Button>
            <Button size="sm" onClick={doVoid} disabled={working} className="flex-1 text-xs">
              {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm Void'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// Order Detail Dialog
// ==========================================

interface OrderDetailDialogProps {
  order: EnrichedOrder;
  isAdmin: boolean;
  isAdminOrStaff: boolean;
  onClose: () => void;
  onUpdate: (orderId: string, updates: any, isAgentOrder?: boolean) => Promise<any>;
  onMarkPaid: (order: EnrichedOrder) => Promise<void>;
}

const OrderDetailDialog = ({ order, isAdmin, isAdminOrStaff, onClose, onUpdate, onMarkPaid }: OrderDetailDialogProps) => {
  const [status, setStatus] = useState<OrderStatus>(order.status as OrderStatus);
  const [deliveryNote, setDeliveryNote] = useState(order.delivery_note || '');
  const [supplierRef, setSupplierRef] = useState(order.supplier_reference || '');
  const [failureReason, setFailureReason] = useState(order.failure_reason || '');
  const [adminNotes, setAdminNotes] = useState(order.admin_notes || '');
  const { log } = useAuditLog();

  const handleSave = async () => {
    const isAgent = order._is_agent_order;
    const updates: any = { status };

    // agent_orders table does not have admin_notes, delivery_note, failure_reason, supplier_reference
    if (!isAgent) {
      updates.admin_notes = adminNotes;
      if (status === 'Delivered') {
        updates.delivery_note = deliveryNote;
        updates.supplier_reference = supplierRef;
      }
      if (status === 'Failed') updates.failure_reason = failureReason;
    }

    await onUpdate(order.order_id, updates, order._is_agent_order);
    await log({
      action: 'order_updated',
      entity_type: 'order',
      entity_id: order.order_id,
      changes: { status: { before: order.status, after: status } },
    });
    toast.success(`Order ${order.order_id} updated`);
    onClose();
  };

  const profit = order.profit_ghs != null ? Number(order.profit_ghs) :
    (order.cost_price_ghs != null ? Number(order.amount_ghs) - Number(order.cost_price_ghs) : null);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Order {order.order_id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Order info */}
          <div className="bg-secondary rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Recipient</span><span className="font-medium">{order.recipient_number}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Bundle</span><span className="font-medium">{order.network} {order.bundle_size_gb}GB</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Order Amount</span><span className="font-semibold text-primary">{formatPrice(Number(order.amount_ghs))}</span></div>
            {!order._is_agent_order && order.cost_price_ghs != null && (
              <div className="flex justify-between"><span className="text-muted-foreground">Cost Price</span><span className="font-medium">{formatPrice(Number(order.cost_price_ghs))}</span></div>
            )}
            {!order._is_agent_order && order.markup_percent != null && (
              <div className="flex justify-between"><span className="text-muted-foreground">Markup</span><span className="font-medium">{order.markup_percent}%</span></div>
            )}
            {!order._is_agent_order && profit != null && (
              <div className="flex justify-between"><span className="text-muted-foreground">Profit</span><span className="font-semibold text-success">{formatPrice(profit)}</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Payment</span><span className="font-medium capitalize">{order.payment_method}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Source</span><span className="font-medium">{order.user_name || 'Guest'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span className="text-xs">{new Date(order.created_at).toLocaleString()}</span></div>
          </div>

          {/* Agent Order Breakdown */}
          {order._is_agent_order && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" /> Agent Order Profit Breakdown
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Store</span><span className="font-medium">{order._agent_store_name || 'Agent Store'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Customer Paid (Agent Price)</span><span className="font-semibold">{formatPrice(order.agent_store_price_at_purchase ?? order.amount_ghs)}</span></div>
                <div className="border-t border-border my-1" />
                <div className="flex justify-between"><span className="text-muted-foreground">YieGo Agent Base Price</span><span className="font-medium">{order.agent_base_price_at_purchase != null ? formatPrice(order.agent_base_price_at_purchase) : '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Supplier Cost</span><span className="font-mono text-xs">{order.supplier_cost_at_purchase != null ? formatPrice(order.supplier_cost_at_purchase) : <span className="text-muted-foreground italic">Not available</span>}</span></div>
                <div className="border-t border-border my-1" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-medium text-success dark:text-success">Agent Profit</span>
                  <span className="font-bold text-success">
                    {order.agent_profit_at_purchase != null
                      ? `+${formatPrice(order.agent_profit_at_purchase)}`
                      : order.agent_store_price_at_purchase != null && order.agent_base_price_at_purchase != null
                        ? `+${formatPrice(Math.max(0, (order.agent_store_price_at_purchase ?? 0) - (order.agent_base_price_at_purchase ?? 0)))}`
                        : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-medium text-primary">YieGo Profit</span>
                  <span className="font-bold text-primary">
                    {order.yiego_profit_at_purchase != null
                      ? `+${formatPrice(order.yiego_profit_at_purchase)}`
                      : order.supplier_cost_at_purchase == null && order.agent_base_price_at_purchase != null
                        ? <span className="text-muted-foreground text-xs italic">Supplier cost not captured</span>
                        : '—'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Profit Credited</span>
                  <span className={order.profit_credited ? 'text-success font-semibold' : 'text-muted-foreground'}>
                    {order.profit_credited ? '✓ Credited' : '⏳ Pending'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Internal Debug (admin/staff) */}
          {isAdminOrStaff && (() => {
            const hasSupplierData = !!(order.supplier_raw_response || order.supplier_order_id || order.supplier_status);
            const isPreDispatchStatus = order.status === 'Pending Payment' || order.status === 'Paid' || order.status === 'Pending';
            // Tri-state: 'yes' | 'no' | 'unknown'
            const dispatchState: 'yes' | 'no' | 'unknown' = hasSupplierData
              ? 'yes'
              : isPreDispatchStatus
                ? 'no'
                : 'unknown';
            let supplierChosen = '—';
            let parsedResponse: Record<string, unknown> | null = null;
            let requestBody: Record<string, unknown> | null = null;
            let mappingInfo: Record<string, unknown> | null = null;
            let httpStatus: string | number = '—';
            let responseText = '';
            let errorCode: string | null = null;
            let providerMessage: string | null = null;
            if (order.supplier_raw_response) {
              try {
                const parsed = JSON.parse(order.supplier_raw_response);
                parsedResponse = parsed;
                const debug = parsed.debug;
                if (debug) {
                  requestBody = debug.request_body || null;
                  mappingInfo = debug.mapping || null;
                  httpStatus = debug.http_status ?? '—';
                  responseText = debug.response_text || '';
                  if (debug.supplier_code === 'DATAMART') supplierChosen = 'Supplier B';
                  else if (debug.supplier_code === 'DATACART') supplierChosen = 'Supplier C';
                  else if (debug.supplier_code === 'SUPPLIER_A') supplierChosen = 'Supplier A';
                  else if (String(debug.request_url || '').includes('/functions/v1/api-gateway')) supplierChosen = 'Supplier C';
                }
                errorCode = String(parsed.code || parsed.error_code || debug?.error_code || '').trim() || null;
                providerMessage = String(parsed.provider_message || parsed.message || debug?.provider_message || debug?.error_message || '').trim() || null;
                if (supplierChosen === '—') {
                  if (parsed.transactionReference || debug?.request_url?.includes('datamart')) supplierChosen = 'Supplier B';
                  else if (debug?.request_url?.includes('/functions/v1/api-gateway') || parsed.client_reference) supplierChosen = 'Supplier C';
                  else if (order.supplier_raw_response?.includes('"YELLO"') || order.supplier_raw_response?.includes('datamartgh')) supplierChosen = 'Supplier B';
                  else if (order.supplier_order_id || order.supplier_status) supplierChosen = 'Supplier A';
                }
              } catch { /* ignore */ }
            }
            const dispatchColor = dispatchState === 'yes' ? 'text-success' : dispatchState === 'no' ? 'text-destructive' : 'text-warning';
            const dispatchLabel = dispatchState === 'yes' ? 'Yes' : dispatchState === 'no' ? 'No' : 'Unknown';
            return (
              <details className="bg-muted/20 border border-border rounded-xl overflow-hidden">
                <summary className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/40 transition-colors">
                  🔒 Internal Debug (Admin/Staff)
                </summary>
                <div className="px-4 pb-4 space-y-4">
                  <div className="bg-warning/5 border border-warning/20 rounded-xl p-4 space-y-2 text-sm">
                    <p className="text-xs font-semibold text-warning uppercase tracking-wider mb-2">⚡ Dispatch Trace</p>
                    <div className="flex justify-between"><span className="text-muted-foreground">Dispatch Attempted</span><span className={`${dispatchColor} font-semibold`}>{dispatchLabel}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Supplier</span><span className="font-mono text-xs">{supplierChosen}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Order Source</span><span className="font-mono text-xs">{order.order_source || '—'}</span></div>
                    {httpStatus !== '—' && <div className="flex justify-between"><span className="text-muted-foreground">HTTP Status</span><span className="font-mono text-xs">{httpStatus}</span></div>}
                    {requestBody && (
                      <details>
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Request Body</summary>
                        <pre className="text-[10px] mt-1 p-2 bg-background rounded-lg overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(requestBody, null, 2)}</pre>
                      </details>
                    )}
                    {responseText && (
                      <details>
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Response Text</summary>
                        <pre className="text-[10px] mt-1 p-2 bg-background rounded-lg overflow-x-auto whitespace-pre-wrap break-all">{responseText}</pre>
                      </details>
                    )}
                    {dispatchState === 'unknown' && (
                      <div className="bg-warning/10 border border-warning/30 rounded-lg p-2 mt-2">
                        <p className="text-xs text-warning">
                          {(order.status === 'Delivered' || order.status === 'Processing')
                            ? '⚠ Order is ' + order.status + ' but dispatch log is missing. This is a logging gap, not necessarily a delivery failure. The order may have been dispatched via a legacy path.'
                            : '⚠ Dispatch log missing for this order. It may have been dispatched via a legacy path.'}
                        </p>
                      </div>
                    )}
                  </div>

                  {(order.supplier_order_id || order.supplier_status || order.supplier_raw_response) && (() => {
                    let debugInfo: Record<string, unknown> | null = null;
                    if (order.supplier_raw_response) {
                      try { const parsed = JSON.parse(order.supplier_raw_response); debugInfo = parsed.debug || null; } catch { /* ignore */ }
                    }
                    return (
                      <div className="bg-muted/30 rounded-xl p-4 space-y-2 text-sm">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Supplier Response</p>
                        {order.supplier_order_id && <div className="flex justify-between"><span className="text-muted-foreground">Order ID</span><span className="font-mono text-xs">{order.supplier_order_id}</span></div>}
                        {order.supplier_status && <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-medium">{order.supplier_status}</span></div>}
                        {errorCode && <div className="flex justify-between"><span className="text-muted-foreground">Error Code</span><span className="font-mono text-xs text-destructive">{errorCode}</span></div>}
                        {providerMessage && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Provider Message</span><span className="text-xs break-all text-right">{providerMessage}</span></div>}
                        {order.supplier_message && <div className="flex justify-between"><span className="text-muted-foreground">Message</span><span className="text-xs break-all">{typeof order.supplier_message === 'object' ? JSON.stringify(order.supplier_message, null, 2) : String(order.supplier_message)}</span></div>}
                        {order.supplier_amount != null && <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span>{order.supplier_amount}</span></div>}
                        {order.supplier_remaining_balance != null && <div className="flex justify-between"><span className="text-muted-foreground">Balance</span><span>{formatPrice(Number(order.supplier_remaining_balance))}</span></div>}
                        {mappingInfo && (
                          <div className="mt-3 border-t border-border pt-3 space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Resolved Mapping</p>
                            {mappingInfo.source && <div className="flex justify-between"><span className="text-muted-foreground text-xs">Source</span><span className="font-mono text-xs">{String(mappingInfo.source)}</span></div>}
                            {mappingInfo.internal_network && <div className="flex justify-between"><span className="text-muted-foreground text-xs">Network</span><span className="font-mono text-xs">{String(mappingInfo.internal_network)}</span></div>}
                            {mappingInfo.requested_size_gb != null && <div className="flex justify-between"><span className="text-muted-foreground text-xs">Bundle</span><span className="font-mono text-xs">{String(mappingInfo.requested_size_gb)}GB</span></div>}
                            {mappingInfo.provider_network_id && <div className="flex justify-between"><span className="text-muted-foreground text-xs">Provider Network ID</span><span className="font-mono text-[10px] break-all text-right">{String(mappingInfo.provider_network_id)}</span></div>}
                            {mappingInfo.provider_plan_id && <div className="flex justify-between"><span className="text-muted-foreground text-xs">Provider Plan ID</span><span className="font-mono text-[10px] break-all text-right">{String(mappingInfo.provider_plan_id)}</span></div>}
                            {mappingInfo.provider_plan_name && <div className="flex justify-between"><span className="text-muted-foreground text-xs">Provider Plan</span><span className="text-xs text-right">{String(mappingInfo.provider_plan_name)}</span></div>}
                          </div>
                        )}
                        {debugInfo && (
                          <div className="mt-3 border-t border-border pt-3 space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Debug</p>
                            {debugInfo.http_status != null && <div className="flex justify-between"><span className="text-muted-foreground text-xs">HTTP Status</span><span className="font-mono text-xs">{String(debugInfo.http_status)}</span></div>}
                            {debugInfo.request_url && <div className="flex justify-between"><span className="text-muted-foreground text-xs">URL</span><span className="font-mono text-xs break-all">{String(debugInfo.request_url)}</span></div>}
                            {debugInfo.request_body && (
                              <details><summary className="text-xs text-muted-foreground cursor-pointer">Request Body</summary><pre className="text-[10px] mt-1 p-2 bg-background rounded-lg overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(debugInfo.request_body, null, 2)}</pre></details>
                            )}
                            {debugInfo.response_text && (
                              <details><summary className="text-xs text-muted-foreground cursor-pointer">Response Text</summary><pre className="text-[10px] mt-1 p-2 bg-background rounded-lg overflow-x-auto whitespace-pre-wrap break-all">{String(debugInfo.response_text)}</pre></details>
                            )}
                            {debugInfo.error_message && <div className="flex justify-between"><span className="text-muted-foreground text-xs">Error</span><span className="text-xs text-destructive">{String(debugInfo.error_message)}</span></div>}
                          </div>
                        )}
                        {order.supplier_raw_response && (
                          <details className="mt-2"><summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Raw Response</summary><pre className="text-[10px] mt-1 p-2 bg-background rounded-lg overflow-x-auto whitespace-pre-wrap break-all">{order.supplier_raw_response}</pre></details>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </details>
            );
          })()}

          {/* Quick actions */}
          <div className="flex gap-2">
            {order.status === 'Pending Payment' && isAdmin && (
              <Button size="sm" onClick={() => { onMarkPaid(order); onClose(); }} className="gap-1 flex-1">
                <CheckCircle className="w-3.5 h-3.5" /> Mark Paid & Deliver
              </Button>
            )}
          </div>

          {/* Admin-only: Retry Dispatch for Insufficient Funds — hidden when in bulk dispatch pipeline */}
          {isAdmin && !isInBulkDispatch(order) && <RetryDispatchSection order={order} onClose={onClose} />}

          {/* Admin-only: Void / Restore action */}
          {isAdmin && (
            <VoidRestoreSection order={order} onUpdate={onUpdate} onClose={onClose} />
          )}


          {/* Manual update */}
          {isAdmin && (
            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Manual Update</p>
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={v => setStatus(v as OrderStatus)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {status === 'Delivered' && (
                <>
                  <div><Label>Delivery Note</Label><Textarea value={deliveryNote} onChange={e => setDeliveryNote(e.target.value)} placeholder="e.g. Data delivered successfully" className="mt-1" rows={2} /></div>
                  <div><Label>Supplier Reference</Label><Input value={supplierRef} onChange={e => setSupplierRef(e.target.value)} placeholder="e.g. SUP-12345" className="mt-1" /></div>
                </>
              )}
              {status === 'Failed' && (
                <div><Label>Failure Reason</Label><Textarea value={failureReason} onChange={e => setFailureReason(e.target.value)} className="mt-1" rows={2} /></div>
              )}
              <div><Label>Admin Notes</Label><Textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Internal notes..." className="mt-1" rows={2} /></div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            {isAdmin && <Button onClick={handleSave} className="flex-1">Save Changes</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminOrders;
