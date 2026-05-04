import { useState, useEffect, useCallback, useMemo } from 'react';
import AdminLayout from './AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  RefreshCw, Save, TrendingUp, ShoppingCart, DollarSign, AlertTriangle,
  Calendar, Filter, Download
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DATACART_SUPPLIER_ID = '786f18b7-681d-4aa8-bb07-cb16dca2bdd1';
const NETWORKS = ['MTN', 'Telecel', 'AirtelTigo'];

interface PricingRow {
  id?: string;
  network: string;
  bundle_size_gb: number;
  plan_label: string;
  supplier_cost: number;
  normal_selling_price: number;
  agent_base_price: number;
  updated_at?: string;
  isNew?: boolean;
}

interface SupplierCOrder {
  id: string;
  order_id: string;
  created_at: string;
  network: string;
  bundle_size_gb: number;
  amount_ghs: number;
  status: string;
  order_source: string;
  recipient_number: string;
  supplier_id: string;
  _source_table?: 'orders' | 'agent_orders';
}

type DateRange = 'today' | 'week' | 'month' | 'all' | 'custom';

const AdminSupplierCEarnings = () => {
  // Pricing state
  const [pricingRows, setPricingRows] = useState<PricingRow[]>([]);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [savingPricing, setSavingPricing] = useState(false);
  const [lastPricingUpdate, setLastPricingUpdate] = useState<string | null>(null);

  // Orders state
  const [orders, setOrders] = useState<SupplierCOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Filters
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [filterNetwork, setFilterNetwork] = useState<string>('all');
  const [filterOrderType, setFilterOrderType] = useState<string>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // New row form
  const [newNetwork, setNewNetwork] = useState('MTN');
  const [newBundleSize, setNewBundleSize] = useState('');

  const getDateFilter = useCallback(() => {
    const now = new Date();
    switch (dateRange) {
      case 'today': {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        return start.toISOString();
      }
      case 'week': {
        const start = new Date(now);
        start.setDate(start.getDate() - 7);
        return start.toISOString();
      }
      case 'month': {
        const start = new Date(now);
        start.setDate(start.getDate() - 30);
        return start.toISOString();
      }
      case 'custom':
        return customFrom ? new Date(customFrom).toISOString() : null;
      default:
        return null;
    }
  }, [dateRange, customFrom]);

  const getDateEnd = useCallback(() => {
    if (dateRange === 'custom' && customTo) {
      const end = new Date(customTo);
      end.setHours(23, 59, 59, 999);
      return end.toISOString();
    }
    return null;
  }, [dateRange, customTo]);

  const fetchPricing = useCallback(async () => {
    setPricingLoading(true);
    const { data, error } = await (supabase as any)
      .from('supplier_c_pricing')
      .select('*')
      .order('network')
      .order('bundle_size_gb');
    if (!error && data) {
      setPricingRows(data);
      const latest = data.reduce((max: string | null, r: any) => {
        if (!max || r.updated_at > max) return r.updated_at;
        return max;
      }, null);
      setLastPricingUpdate(latest);
    }
    setPricingLoading(false);
  }, []);

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true);
    const dateStart = getDateFilter();
    const dateEnd = getDateEnd();

    // 1) Normal/direct orders from orders table with supplier_id = DataCart
    let q1 = supabase
      .from('orders')
      .select('id, order_id, created_at, network, bundle_size_gb, amount_ghs, status, order_source, recipient_number, supplier_id')
      .eq('supplier_id', DATACART_SUPPLIER_ID)
      .order('created_at', { ascending: false });
    if (dateStart) q1 = q1.gte('created_at', dateStart);
    if (dateEnd) q1 = q1.lte('created_at', dateEnd);

    // 2) Agent orders dispatched via DataCart (identified via order_dispatch_attempts)
    let q2 = supabase
      .from('order_dispatch_attempts')
      .select('order_id')
      .eq('supplier_key', 'DATACART')
      .eq('success', true);

    const [res1, res2] = await Promise.all([q1.limit(500), q2.limit(2000)]);

    const directOrders: SupplierCOrder[] = ((res1.data || []) as any[]).map(o => ({
      ...o,
      _source_table: 'orders' as const,
    }));
    const directOrderIds = new Set(directOrders.map(o => o.order_id));

    // Fetch matching agent_orders for DataCart-dispatched order IDs
    const datacartAgentOrderIds = (res2.data || [])
      .map((r: any) => r.order_id as string)
      .filter((oid: string) => oid.startsWith('AGT-') && !directOrderIds.has(oid));

    let agentOrders: SupplierCOrder[] = [];
    if (datacartAgentOrderIds.length > 0) {
      // Fetch in batches of 100
      const batchSize = 100;
      for (let i = 0; i < datacartAgentOrderIds.length; i += batchSize) {
        const batch = datacartAgentOrderIds.slice(i, i + batchSize);
        let q3 = supabase
          .from('agent_orders')
          .select('id, order_id, created_at, network, bundle_size_gb, agent_cost_price, status, order_source, customer_phone')
          .in('order_id', batch);
        if (dateStart) q3 = q3.gte('created_at', dateStart);
        if (dateEnd) q3 = q3.lte('created_at', dateEnd);
        const { data: aoData } = await q3;
        if (aoData) {
          agentOrders.push(
            ...aoData.map((ao: any) => ({
              id: ao.id,
              order_id: ao.order_id,
              created_at: ao.created_at,
              network: ao.network,
              bundle_size_gb: ao.bundle_size_gb,
              amount_ghs: ao.agent_cost_price,
              status: ao.status,
              order_source: 'agent_store',
              recipient_number: ao.customer_phone,
              supplier_id: DATACART_SUPPLIER_ID,
              _source_table: 'agent_orders' as const,
            }))
          );
        }
      }
    }

    // Merge and sort by date descending
    const allOrders = [...directOrders, ...agentOrders].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    setOrders(allOrders);
    setOrdersLoading(false);
  }, [getDateFilter, getDateEnd]);

  useEffect(() => { fetchPricing(); }, [fetchPricing]);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Save all pricing rows
  const savePricing = async () => {
    setSavingPricing(true);
    try {
      for (const row of pricingRows) {
        const payload = {
          network: row.network,
          bundle_size_gb: row.bundle_size_gb,
          plan_label: row.plan_label,
          supplier_cost: row.supplier_cost,
          normal_selling_price: row.normal_selling_price,
          agent_base_price: row.agent_base_price,
          updated_at: new Date().toISOString(),
        };
        if (row.id && !row.isNew) {
          await (supabase as any).from('supplier_c_pricing').update(payload).eq('id', row.id);
        } else {
          await (supabase as any).from('supplier_c_pricing').upsert(payload, { onConflict: 'network,bundle_size_gb' });
        }
      }
      toast.success('Pricing saved');
      fetchPricing();
    } catch {
      toast.error('Failed to save pricing');
    }
    setSavingPricing(false);
  };

  const addPricingRow = () => {
    const size = parseFloat(newBundleSize);
    if (!size || size <= 0) { toast.error('Enter a valid bundle size'); return; }
    if (pricingRows.some(r => r.network === newNetwork && r.bundle_size_gb === size)) {
      toast.error('This network + bundle size already exists');
      return;
    }
    setPricingRows(prev => [...prev, {
      network: newNetwork,
      bundle_size_gb: size,
      plan_label: `${newNetwork} ${size}GB`,
      supplier_cost: 0,
      normal_selling_price: 0,
      agent_base_price: 0,
      isNew: true,
    }]);
    setNewBundleSize('');
  };

  const updatePricingField = (index: number, field: keyof PricingRow, value: string | number) => {
    setPricingRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const deletePricingRow = async (index: number) => {
    const row = pricingRows[index];
    if (row.id) {
      await (supabase as any).from('supplier_c_pricing').delete().eq('id', row.id);
      toast.success('Row deleted');
    }
    setPricingRows(prev => prev.filter((_, i) => i !== index));
  };

  // Build pricing lookup: network+bundle_size_gb -> pricing row
  const pricingMap = useMemo(() => {
    const map: Record<string, PricingRow> = {};
    pricingRows.forEach(r => { map[`${r.network}_${r.bundle_size_gb}`] = r; });
    return map;
  }, [pricingRows]);

  // Determine order type
  const isAgentOrder = (order: SupplierCOrder) =>
    order._source_table === 'agent_orders' || order.order_source === 'agent_store' || order.order_source === 'agent';

  // Calculate profit for a single order
  const calcProfit = (order: SupplierCOrder) => {
    const key = `${order.network}_${order.bundle_size_gb}`;
    const pricing = pricingMap[key];
    if (!pricing) return { profit: null, mapped: false, sellingPrice: 0, cost: 0 };
    const isAgent = isAgentOrder(order);
    const sellingPrice = isAgent ? pricing.agent_base_price : pricing.normal_selling_price;
    const profit = sellingPrice - pricing.supplier_cost;
    return { profit, mapped: true, sellingPrice, cost: pricing.supplier_cost };
  };

  // Filtered orders
  const filteredOrders = useMemo(() => {
    let filtered = orders;
    if (filterNetwork !== 'all') filtered = filtered.filter(o => o.network === filterNetwork);
    if (filterOrderType === 'normal') filtered = filtered.filter(o => !isAgentOrder(o));
    if (filterOrderType === 'agent') filtered = filtered.filter(o => isAgentOrder(o));
    return filtered;
  }, [orders, filterNetwork, filterOrderType]);

  // Summary stats
  const stats = useMemo(() => {
    let totalOrders = 0;
    let totalProfit = 0;
    let totalCost = 0;
    let totalRevenueBasis = 0;
    let normalProfit = 0;
    let agentBaseProfit = 0;
    let unmapped = 0;
    let deliveredOrders = 0;

    filteredOrders.forEach(order => {
      totalOrders++;
      const { profit, mapped, sellingPrice, cost } = calcProfit(order);
      if (!mapped) { unmapped++; return; }
      const isDelivered = order.status === 'Delivered' || order.status === 'delivered';
      if (isDelivered) deliveredOrders++;
      // Count profit for all non-failed orders
      if (order.status !== 'Failed' && order.status !== 'failed') {
        totalProfit += profit!;
        totalCost += cost;
        totalRevenueBasis += sellingPrice;
        if (isAgentOrder(order)) agentBaseProfit += profit!;
        else normalProfit += profit!;
      }
    });
    return { totalOrders, totalProfit, totalCost, totalRevenueBasis, normalProfit, agentBaseProfit, unmapped, deliveredOrders };
  }, [filteredOrders, pricingMap]);

  const fmt = (n: number) => `GH₵ ${n.toFixed(2)}`;

  // Export CSV
  const exportCSV = () => {
    const headers = ['Order ID', 'Date', 'Network', 'Bundle (GB)', 'Type', 'Status', 'Supplier Cost', 'Selling/Base Price', 'My Profit'];
    const rows = filteredOrders.map(o => {
      const { profit, mapped, sellingPrice, cost } = calcProfit(o);
      return [
        o.order_id,
        new Date(o.created_at).toLocaleDateString(),
        o.network,
        o.bundle_size_gb,
        isAgentOrder(o) ? 'Agent' : 'Normal',
        o.status,
        mapped ? cost.toFixed(2) : 'N/A',
        mapped ? sellingPrice.toFixed(2) : 'N/A',
        mapped && profit !== null ? profit.toFixed(2) : 'Unmapped',
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supplier-c-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-display font-bold">Supplier C Profit Tracker</h2>
            <p className="text-muted-foreground text-sm">Track your true profit from DataCart orders only. Agent markup is excluded.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { fetchPricing(); fetchOrders(); }}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <ShoppingCart className="w-4 h-4" />
              <span className="text-xs font-medium">Total Orders</span>
            </div>
            <p className="text-2xl font-display font-bold">{stats.totalOrders}</p>
            <p className="text-[10px] text-muted-foreground">{stats.deliveredOrders} delivered</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-medium">My Total Profit</span>
            </div>
            <p className="text-2xl font-display font-bold text-emerald-600">{fmt(stats.totalProfit)}</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs font-medium">Normal User Profit</span>
            </div>
            <p className="text-xl font-display font-bold">{fmt(stats.normalProfit)}</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs font-medium">Agent Base Profit</span>
            </div>
            <p className="text-xl font-display font-bold">{fmt(stats.agentBaseProfit)}</p>
          </div>
        </div>

        {stats.unmapped > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              <strong>{stats.unmapped}</strong> order(s) have no matching pricing config. Set up pricing below to include them.
            </p>
          </div>
        )}

        {/* Extra stats row */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-card rounded-xl p-4 border border-border">
            <p className="text-xs text-muted-foreground font-medium">Revenue Basis</p>
            <p className="text-lg font-bold mt-1">{fmt(stats.totalRevenueBasis)}</p>
            <p className="text-[10px] text-muted-foreground">Based on my selling/base prices, not agent markup</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <p className="text-xs text-muted-foreground font-medium">Total Supplier Cost</p>
            <p className="text-lg font-bold mt-1">{fmt(stats.totalCost)}</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <p className="text-xs text-muted-foreground font-medium">Unmapped Orders</p>
            <p className="text-lg font-bold mt-1">{stats.unmapped}</p>
          </div>
        </div>

        {/* ─── PRICING CONFIG ─── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-display font-bold text-base">Manual Pricing Config</h3>
              <p className="text-xs text-muted-foreground">
                Set your Supplier C cost and selling prices. These are used for profit calculation only.
                {lastPricingUpdate && (
                  <span className="ml-2 text-[10px]">Last updated: {new Date(lastPricingUpdate).toLocaleString()}</span>
                )}
              </p>
            </div>
            <Button size="sm" onClick={savePricing} disabled={savingPricing}>
              <Save className="w-3.5 h-3.5 mr-1.5" /> {savingPricing ? 'Saving...' : 'Save All'}
            </Button>
          </div>

          {pricingLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Network</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Bundle (GB)</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Label</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Supplier Cost</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Normal Price</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Agent Base</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pricingRows.map((row, idx) => (
                    <tr key={row.id || `new-${idx}`} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs font-semibold">{row.network}</td>
                      <td className="px-3 py-2 text-xs font-bold">{row.bundle_size_gb}GB</td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-7 text-xs w-32"
                          value={row.plan_label}
                          onChange={e => updatePricingField(idx, 'plan_label', e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-7 text-xs w-24"
                          type="number"
                          step="0.01"
                          value={row.supplier_cost}
                          onChange={e => updatePricingField(idx, 'supplier_cost', parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-7 text-xs w-24"
                          type="number"
                          step="0.01"
                          value={row.normal_selling_price}
                          onChange={e => updatePricingField(idx, 'normal_selling_price', parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-7 text-xs w-24"
                          type="number"
                          step="0.01"
                          value={row.agent_base_price}
                          onChange={e => updatePricingField(idx, 'agent_base_price', parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => deletePricingRow(idx)}
                          className="text-[10px] text-destructive hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add row */}
          <div className="p-3 border-t border-border flex items-center gap-2 flex-wrap bg-muted/10">
            <Select value={newNetwork} onValueChange={setNewNetwork}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NETWORKS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              className="h-8 text-xs w-24"
              placeholder="Size (GB)"
              type="number"
              step="0.5"
              value={newBundleSize}
              onChange={e => setNewBundleSize(e.target.value)}
            />
            <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={addPricingRow}>
              + Add Row
            </Button>
          </div>
        </div>

        {/* ─── ORDERS SECTION ─── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-display font-bold text-base">Supplier C Orders</h3>
            <p className="text-xs text-muted-foreground">Only orders routed through DataCart are shown</p>
          </div>

          {/* Filters */}
          <div className="p-3 border-b border-border flex items-center gap-2 flex-wrap bg-muted/10">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <Select value={dateRange} onValueChange={v => setDateRange(v as DateRange)}>
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {dateRange === 'custom' && (
              <div className="flex gap-1.5">
                <Input type="date" className="h-8 text-xs w-32" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                <Input type="date" className="h-8 text-xs w-32" value={customTo} onChange={e => setCustomTo(e.target.value)} />
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <Select value={filterNetwork} onValueChange={setFilterNetwork}>
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Networks</SelectItem>
                  {NETWORKS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Select value={filterOrderType} onValueChange={setFilterOrderType}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Orders table */}
          {ordersLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 rounded" />)}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No Supplier C orders found for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Order ID</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Date</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Network</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Bundle</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Type</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Status</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">Supplier Cost</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">Selling/Base</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">My Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(order => {
                    const { profit, mapped, sellingPrice, cost } = calcProfit(order);
                    const agent = isAgentOrder(order);
                    return (
                      <tr key={order.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-2 text-xs font-mono">{order.order_id}</td>
                        <td className="px-3 py-2 text-xs">{new Date(order.created_at).toLocaleDateString()}</td>
                        <td className="px-3 py-2 text-xs font-semibold">{order.network}</td>
                        <td className="px-3 py-2 text-xs font-bold">{order.bundle_size_gb}GB</td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            agent ? 'bg-blue-500/10 text-blue-600' : 'bg-emerald-500/10 text-emerald-600'
                          }`}>
                            {agent ? 'Agent' : 'Normal'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            order.status === 'Delivered' || order.status === 'delivered'
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : order.status === 'Failed' || order.status === 'failed'
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-amber-500/10 text-amber-600'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-right">
                          {mapped ? fmt(cost) : <span className="text-amber-500">N/A</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-right">
                          {mapped ? fmt(sellingPrice) : <span className="text-amber-500">N/A</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-right font-bold">
                          {order.status === 'Failed' || order.status === 'failed' ? (
                            <span className="text-muted-foreground text-[10px]">Excluded</span>
                          ) : mapped && profit !== null ? (
                            <span className={profit >= 0 ? 'text-emerald-600' : 'text-destructive'}>{fmt(profit)}</span>
                          ) : (
                            <span className="text-amber-500 text-[10px]">Unmapped</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminSupplierCEarnings;
