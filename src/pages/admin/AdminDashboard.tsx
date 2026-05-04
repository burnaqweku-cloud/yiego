import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatPrice } from '@/data/bundles';
import {
  ShoppingCart, Clock, CheckCircle, XCircle, DollarSign, Package,
  Users, Wallet, TrendingUp, ArrowRight, RefreshCw, Activity,
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Megaphone, Layers,
  Server, BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

// ─── Time period filter ──────────────────────────────────────────
type Period = 'today' | 'yesterday' | '7d' | '30d' | 'all';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All time' },
];

// Africa/Accra ≡ UTC+0 year-round, so plain UTC day boundaries align with Accra dates.
function periodRange(p: Period): { start: Date | null; end: Date | null } {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  if (p === 'today') {
    const end = new Date(startOfToday); end.setUTCDate(end.getUTCDate() + 1);
    return { start: startOfToday, end };
  }
  if (p === 'yesterday') {
    const start = new Date(startOfToday); start.setUTCDate(start.getUTCDate() - 1);
    return { start, end: startOfToday };
  }
  if (p === '7d') {
    const start = new Date(startOfToday); start.setUTCDate(start.getUTCDate() - 6);
    const end = new Date(startOfToday); end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
  if (p === '30d') {
    const start = new Date(startOfToday); start.setUTCDate(start.getUTCDate() - 29);
    const end = new Date(startOfToday); end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
  return { start: null, end: null };
}

// ─── Supplier mapping (do NOT show real brand names in UI) ───────
type SupplierLetter = 'A' | 'B' | 'C';
const SUPPLIER_CODE: Record<SupplierLetter, string> = {
  A: 'SUPPLIER_A',
  B: 'DATAMART',
  C: 'DATACART',
};
const SUPPLIER_PREF_KEY = 'admin_dashboard_supplier_balance_default';

interface PeriodTotals {
  normal_total: number; normal_delivered: number; normal_processing: number;
  normal_pending: number; normal_pending_payment: number; normal_failed: number;
  normal_revenue: number; normal_profit: number; normal_gb_delivered: number;
  normal_mtn: number; normal_telecel: number; normal_at: number;
  agent_total: number; agent_delivered: number; agent_processing: number;
  agent_failed: number; agent_revenue: number; agent_profit: number;
  new_users: number;
  deposits_confirmed_count: number; deposits_confirmed_amount: number;
  deposits_pending_count: number; deposits_pending_amount: number;
  deposits_rejected_count: number;
  agent_withdrawals_pending_count: number; agent_withdrawals_pending_amount: number;
}

const AdminDashboard = () => {
  const { user, isAdminOrStaff, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<Period>('today');
  const [totals, setTotals] = useState<PeriodTotals | null>(null);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [walletLiability, setWalletLiability] = useState<number>(0);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [agentLive, setAgentLive] = useState<number>(0);
  const [agentPendingApps, setAgentPendingApps] = useState<number>(0);
  const [bulkQueueCount, setBulkQueueCount] = useState<number>(0);
  const [noticeActive, setNoticeActive] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Supplier balance card state
  const [supplier, setSupplier] = useState<SupplierLetter>(() => {
    if (typeof window === 'undefined') return 'B';
    const saved = window.localStorage.getItem(SUPPLIER_PREF_KEY) as SupplierLetter | null;
    return (saved === 'A' || saved === 'B' || saved === 'C') ? saved : 'B';
  });
  const [supplierBalance, setSupplierBalance] = useState<number | null>(null);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierCheckedAt, setSupplierCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !isAdminOrStaff)) navigate('/auth');
  }, [user, isAdminOrStaff, authLoading, navigate]);

  // Persist supplier preference per browser/admin
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SUPPLIER_PREF_KEY, supplier);
    }
  }, [supplier]);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);

    const { start, end } = periodRange(period);

    const [
      totalsRes, usersRes, walletsRes, recentRes,
      agentsRes, appsRes, batchesRes, noticeRes,
    ] = await Promise.all([
      supabase.rpc('admin_dashboard_period_totals' as any, {
        p_start: start ? start.toISOString() : null,
        p_end: end ? end.toISOString() : null,
      }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('wallets').select('balance_ghs'),
      supabase.from('orders')
        .select('order_id, recipient_number, network, bundle_size_gb, amount_ghs, status, created_at')
        .eq('is_checkpoint', false).neq('order_source', 'admin_bulk')
        .order('created_at', { ascending: false }).limit(8),
      supabase.from('agents').select('id, status').in('status', ['active']),
      supabase.from('agent_applications').select('id', { count: 'exact', head: true })
        .in('status', ['pending_review', 'pending']),
      supabase.from('dispatch_batches').select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'in_progress', 'sent']),
      supabase.from('site_notices').select('enabled, start_time, end_time').limit(1).maybeSingle(),
    ]);

    const t = Array.isArray(totalsRes.data) && totalsRes.data.length > 0 ? totalsRes.data[0] as any : null;
    if (t) {
      setTotals({
        normal_total: Number(t.normal_total) || 0,
        normal_delivered: Number(t.normal_delivered) || 0,
        normal_processing: Number(t.normal_processing) || 0,
        normal_pending: Number(t.normal_pending) || 0,
        normal_pending_payment: Number(t.normal_pending_payment) || 0,
        normal_failed: Number(t.normal_failed) || 0,
        normal_revenue: Number(t.normal_revenue) || 0,
        normal_profit: Number(t.normal_profit) || 0,
        normal_gb_delivered: Number(t.normal_gb_delivered) || 0,
        normal_mtn: Number(t.normal_mtn) || 0,
        normal_telecel: Number(t.normal_telecel) || 0,
        normal_at: Number(t.normal_at) || 0,
        agent_total: Number(t.agent_total) || 0,
        agent_delivered: Number(t.agent_delivered) || 0,
        agent_processing: Number(t.agent_processing) || 0,
        agent_failed: Number(t.agent_failed) || 0,
        agent_revenue: Number(t.agent_revenue) || 0,
        agent_profit: Number(t.agent_profit) || 0,
        new_users: Number(t.new_users) || 0,
        deposits_confirmed_count: Number(t.deposits_confirmed_count) || 0,
        deposits_confirmed_amount: Number(t.deposits_confirmed_amount) || 0,
        deposits_pending_count: Number(t.deposits_pending_count) || 0,
        deposits_pending_amount: Number(t.deposits_pending_amount) || 0,
        deposits_rejected_count: Number(t.deposits_rejected_count) || 0,
        agent_withdrawals_pending_count: Number(t.agent_withdrawals_pending_count) || 0,
        agent_withdrawals_pending_amount: Number(t.agent_withdrawals_pending_amount) || 0,
      });
    }
    setTotalUsers(usersRes.count || 0);
    setWalletLiability((walletsRes.data || []).reduce((s: number, w: any) => s + Number(w.balance_ghs || 0), 0));
    setRecentOrders(recentRes.data || []);
    setAgentPendingApps(appsRes.count || 0);
    setBulkQueueCount(batchesRes.count || 0);

    // Active agents (operational): active status + non-expired subscription with grace
    const activeStatusAgents = (agentsRes.data || []) as any[];
    if (activeStatusAgents.length > 0) {
      const graceThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: subRows } = await supabase
        .from('agent_subscriptions')
        .select('agent_id')
        .in('agent_id', activeStatusAgents.map((a: any) => a.id))
        .gte('expiry_date', graceThreshold);
      setAgentLive(new Set((subRows || []).map((r: any) => r.agent_id)).size);
    } else {
      setAgentLive(0);
    }

    // Service notice "live now" indicator
    const n = noticeRes.data as any;
    if (n && n.enabled) {
      const now = Date.now();
      const startOk = !n.start_time || new Date(n.start_time).getTime() <= now;
      const endOk = !n.end_time || new Date(n.end_time).getTime() >= now;
      setNoticeActive(startOk && endOk);
    } else {
      setNoticeActive(false);
    }

    setLoading(false);
    setRefreshing(false);
  }, [period]);

  useEffect(() => {
    if (isAdminOrStaff) fetchAll();
  }, [isAdminOrStaff, fetchAll]);

  // ─── Supplier balance fetch ────────────────────────────────────
  const fetchSupplierBalance = useCallback(async (silent = false) => {
    setSupplierLoading(true);
    setSupplierError(null);
    try {
      const { data, error } = await supabase.functions.invoke('supplier-admin', {
        body: { action: 'check_balance', supplier_code: SUPPLIER_CODE[supplier] },
      });
      if (error) throw error;
      if (data?.ok && data?.balance != null) {
        setSupplierBalance(Number(data.balance));
        setSupplierCheckedAt(new Date());
      } else {
        setSupplierBalance(null);
        setSupplierError(data?.error || 'Balance unavailable');
      }
    } catch (e: any) {
      setSupplierBalance(null);
      setSupplierError(e?.message || 'Failed to fetch balance');
      if (!silent) toast.error('Could not fetch supplier balance');
    } finally {
      setSupplierLoading(false);
    }
  }, [supplier]);

  useEffect(() => {
    if (isAdminOrStaff) fetchSupplierBalance(true);
  }, [isAdminOrStaff, fetchSupplierBalance]);

  if (authLoading || !user || !isAdminOrStaff) return null;

  // ─── Derived values ────────────────────────────────────────────
  const orderTotalAll = (totals?.normal_total || 0) + (totals?.agent_total || 0);
  const deliveredAll = (totals?.normal_delivered || 0) + (totals?.agent_delivered || 0);
  const processingAll = (totals?.normal_processing || 0) + (totals?.agent_processing || 0);
  const failedAll = (totals?.normal_failed || 0) + (totals?.agent_failed || 0);
  const revenueAll = (totals?.normal_revenue || 0) + (totals?.agent_revenue || 0);
  const profitAll = (totals?.normal_profit || 0) + (totals?.agent_profit || 0);
  const successRate = orderTotalAll > 0 ? Math.round((deliveredAll / orderTotalAll) * 100) : 0;
  const failureRate = orderTotalAll > 0 ? Math.round((failedAll / orderTotalAll) * 100) : 0;

  const topMetrics = [
    { label: 'Total Users', value: totalUsers, sub: totals ? `+${totals.new_users} new` : undefined, icon: Users, accent: 'text-primary bg-primary/10', to: '/admin/users' },
    { label: 'Orders', value: orderTotalAll, sub: 'normal + agent', icon: ShoppingCart, accent: 'text-foreground bg-muted/40', to: '/admin/orders' },
    { label: 'Successful', value: deliveredAll, sub: `${successRate}% success`, icon: CheckCircle, accent: 'text-success bg-success/10', to: '/admin/orders' },
    { label: 'Processing', value: processingAll, sub: 'in flight', icon: Clock, accent: 'text-info bg-info/10', to: '/admin/orders' },
    { label: 'Failed', value: failedAll, sub: failureRate ? `${failureRate}% failed` : 'none', icon: XCircle, accent: 'text-destructive bg-destructive/10', to: '/admin/orders' },
    { label: 'Revenue', value: formatPrice(revenueAll), sub: 'paid orders', icon: DollarSign, accent: 'text-success bg-success/10' },
    { label: 'Profit', value: formatPrice(profitAll), sub: 'tracked', icon: TrendingUp, accent: 'text-primary bg-primary/10' },
    { label: 'Active Agents', value: agentLive, sub: 'with active sub', icon: Activity, accent: 'text-success bg-success/10', to: '/admin/agents/active?filter=operational' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-display font-bold tracking-tight">Operations Dashboard</h2>
            <p className="text-muted-foreground text-sm">Live overview of YieGo orders, revenue and platform health.</p>
          </div>
          <Button
            variant="outline" size="sm"
            onClick={() => { fetchAll(true); fetchSupplierBalance(true); }}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Period filter */}
        <div className="flex items-center gap-1 overflow-x-auto bg-secondary/60 border border-border/60 rounded-xl p-1 w-fit max-w-full">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                period === p.id
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : (
          <>
            {/* TOP METRICS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {topMetrics.map((m) => {
                const inner = (
                  <div className="bg-card rounded-xl p-4 border border-border card-shadow hover:card-shadow-hover transition-all h-full">
                    <div className="flex items-center justify-between mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${m.accent}`}>
                        <m.icon className="w-4 h-4" />
                      </div>
                      {m.to && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{m.label}</p>
                    <p className="text-xl font-display font-bold tabular tracking-tight mt-0.5">{m.value}</p>
                    {m.sub && <p className="text-[10px] text-muted-foreground mt-1">{m.sub}</p>}
                  </div>
                );
                return m.to
                  ? <Link key={m.label} to={m.to}>{inner}</Link>
                  : <div key={m.label}>{inner}</div>;
              })}
            </div>

            {/* OPERATIONAL ALERTS */}
            <OperationalAlerts
              failed={totals?.normal_failed || 0}
              pendingDeposits={totals?.deposits_pending_count || 0}
              pendingDepositsAmount={totals?.deposits_pending_amount || 0}
              pendingWithdrawals={totals?.agent_withdrawals_pending_count || 0}
              pendingWithdrawalsAmount={totals?.agent_withdrawals_pending_amount || 0}
              pendingApps={agentPendingApps}
              bulkQueue={bulkQueueCount}
              noticeActive={noticeActive}
            />

            {/* TWO-COLUMN: Order breakdown + Supplier balance */}
            <div className="grid lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-card rounded-xl border border-border card-shadow p-4 md:p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    <h3 className="font-display font-semibold">Order Breakdown</h3>
                  </div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Normal orders only
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <MiniStat label="Total" value={totals?.normal_total || 0} />
                  <MiniStat label="Delivered" value={totals?.normal_delivered || 0} accent="text-success" />
                  <MiniStat label="Processing" value={totals?.normal_processing || 0} accent="text-info" />
                  <MiniStat label="Failed" value={totals?.normal_failed || 0} accent="text-destructive" />
                </div>

                <ProgressBar
                  segments={[
                    { value: totals?.normal_delivered || 0, color: 'bg-success', label: 'Delivered' },
                    { value: totals?.normal_processing || 0, color: 'bg-info', label: 'Processing' },
                    { value: totals?.normal_pending || 0, color: 'bg-primary', label: 'Pending' },
                    { value: totals?.normal_failed || 0, color: 'bg-destructive', label: 'Failed' },
                  ]}
                />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border">
                  <MiniStat label="GB Delivered" value={`${(totals?.normal_gb_delivered || 0).toFixed(1)}`} />
                  <MiniStat label="MTN" value={totals?.normal_mtn || 0} accent="text-yellow-600 dark:text-yellow-400" />
                  <MiniStat label="Telecel" value={totals?.normal_telecel || 0} accent="text-red-600 dark:text-red-400" />
                  <MiniStat label="AirtelTigo" value={totals?.normal_at || 0} accent="text-blue-600 dark:text-blue-400" />
                </div>
              </div>

              <SupplierBalanceCard
                supplier={supplier}
                onChange={setSupplier}
                balance={supplierBalance}
                error={supplierError}
                loading={supplierLoading}
                checkedAt={supplierCheckedAt}
                onRefresh={() => fetchSupplierBalance()}
              />
            </div>

            {/* FINANCE + WALLET ROW */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-card rounded-xl border border-border card-shadow p-4 md:p-5">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-4 h-4 text-success" />
                  <h3 className="font-display font-semibold">Revenue & Profit</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FinanceTile label="Normal revenue" value={formatPrice(totals?.normal_revenue || 0)} />
                  <FinanceTile label="Normal profit" value={formatPrice(totals?.normal_profit || 0)} hint="estimated" />
                  <FinanceTile label="Agent revenue" value={formatPrice(totals?.agent_revenue || 0)} />
                  <FinanceTile label="Agent profit" value={formatPrice(totals?.agent_profit || 0)} hint="estimated" />
                </div>
              </div>

              <div className="bg-card rounded-xl border border-border card-shadow p-4 md:p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-primary" />
                    <h3 className="font-display font-semibold">Wallet & Deposits</h3>
                  </div>
                  <Link to="/admin/wallet" className="text-xs text-primary font-semibold hover:underline">
                    Manage →
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FinanceTile label="Confirmed deposits" value={formatPrice(totals?.deposits_confirmed_amount || 0)} hint={`${totals?.deposits_confirmed_count || 0} txns`} />
                  <FinanceTile label="Pending deposits" value={formatPrice(totals?.deposits_pending_amount || 0)} hint={`${totals?.deposits_pending_count || 0} txns`} accent={totals?.deposits_pending_count ? 'text-orange-500' : undefined} />
                  <FinanceTile label="Wallet liability" value={formatPrice(walletLiability)} hint="all balances" />
                  <FinanceTile label="Rejected deposits" value={`${totals?.deposits_rejected_count || 0}`} hint="this period" />
                </div>
              </div>
            </div>

            {/* QUICK LINKS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Orders', to: '/admin/orders', icon: ShoppingCart },
                { label: 'Bulk Dispatch', to: '/admin/bulk-dispatch', icon: Layers },
                { label: 'Bulk Orders', to: '/admin/bulk-orders', icon: Package },
                { label: 'Deposits', to: '/admin/wallet', icon: ArrowDownToLine },
                { label: 'Withdrawals', to: '/admin/agents/withdrawals', icon: ArrowUpFromLine },
                { label: 'Service Notices', to: '/admin/notices', icon: Megaphone },
                { label: 'Users', to: '/admin/users', icon: Users },
                { label: 'Analytics', to: '/admin/analytics', icon: BarChart3 },
              ].map(l => (
                <Link key={l.label} to={l.to} className="bg-card border border-border rounded-xl p-3 flex items-center gap-2 hover:bg-muted/40 transition-colors">
                  <l.icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-semibold flex-1">{l.label}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                </Link>
              ))}
            </div>

            {/* RECENT ORDERS */}
            <div className="bg-card rounded-xl border border-border card-shadow">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-display font-semibold">Recent Orders</h3>
                <Link to="/admin/orders" className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              {recentOrders.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No orders yet.</div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-border">
                    {recentOrders.map((o: any) => (
                      <div key={o.order_id} className="p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-semibold text-primary truncate">{o.order_id}</p>
                          <p className="text-xs text-muted-foreground truncate">{o.recipient_number} · {o.network} {o.bundle_size_gb}GB</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-semibold tabular">{formatPrice(Number(o.amount_ghs))}</p>
                          <StatusBadge status={o.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Order ID</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Recipient</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Bundle</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentOrders.map((order: any) => (
                          <tr key={order.order_id} className="border-b border-border last:border-0 hover:bg-muted/30">
                            <td className="px-4 py-3 font-mono font-semibold text-primary text-xs">{order.order_id}</td>
                            <td className="px-4 py-3 text-xs">{order.recipient_number}</td>
                            <td className="px-4 py-3 text-xs">{order.network} {order.bundle_size_gb}GB</td>
                            <td className="px-4 py-3 text-right font-medium text-xs tabular">{formatPrice(Number(order.amount_ghs))}</td>
                            <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

// ─── Sub-components ──────────────────────────────────────────────

const MiniStat = ({ label, value, accent }: { label: string; value: number | string; accent?: string }) => (
  <div className="bg-muted/30 rounded-lg p-3">
    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
    <p className={`text-lg font-display font-bold tabular mt-0.5 ${accent || ''}`}>{value}</p>
  </div>
);

const FinanceTile = ({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) => (
  <div className="bg-muted/30 rounded-lg p-3">
    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
    <p className={`text-base font-display font-bold tabular mt-0.5 ${accent || ''}`}>{value}</p>
    {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
  </div>
);

const ProgressBar = ({ segments }: { segments: { value: number; color: string; label: string }[] }) => {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return <div className="text-xs text-muted-foreground italic">No orders in this period.</div>;
  }
  return (
    <div>
      <div className="flex w-full h-2 rounded-full overflow-hidden bg-muted">
        {segments.map(s => s.value > 0 && (
          <div key={s.label} className={s.color} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-muted-foreground">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-sm ${s.color}`} />
            <span>{s.label}: <span className="font-semibold text-foreground tabular">{s.value}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
};

const OperationalAlerts = ({
  failed, pendingDeposits, pendingDepositsAmount, pendingWithdrawals,
  pendingWithdrawalsAmount, pendingApps, bulkQueue, noticeActive,
}: {
  failed: number; pendingDeposits: number; pendingDepositsAmount: number;
  pendingWithdrawals: number; pendingWithdrawalsAmount: number;
  pendingApps: number; bulkQueue: number; noticeActive: boolean;
}) => {
  const items = [
    failed > 0 && { label: `${failed} failed orders`, to: '/admin/orders', tone: 'destructive' as const },
    pendingDeposits > 0 && { label: `${pendingDeposits} pending deposits · ${formatPrice(pendingDepositsAmount)}`, to: '/admin/wallet', tone: 'warn' as const },
    pendingWithdrawals > 0 && { label: `${pendingWithdrawals} withdrawals · ${formatPrice(pendingWithdrawalsAmount)}`, to: '/admin/agents/withdrawals', tone: 'warn' as const },
    pendingApps > 0 && { label: `${pendingApps} agent applications`, to: '/admin/agents/applications', tone: 'info' as const },
    bulkQueue > 0 && { label: `${bulkQueue} active dispatch batches`, to: '/admin/bulk-dispatch', tone: 'info' as const },
    noticeActive && { label: 'Service notice live', to: '/admin/notices', tone: 'info' as const },
  ].filter(Boolean) as { label: string; to: string; tone: 'destructive' | 'warn' | 'info' }[];

  if (items.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle className="w-4 h-4 text-success" />
        All clear — no pending operational alerts.
      </div>
    );
  }

  const toneClass = {
    destructive: 'border-destructive/30 bg-destructive/5 text-destructive',
    warn: 'border-orange-300/40 bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-300',
    info: 'border-info/30 bg-info/5 text-info',
  };

  return (
    <div className="flex flex-wrap gap-2">
      {items.map(i => (
        <Link key={i.label} to={i.to} className={`text-xs font-semibold px-3 py-2 rounded-lg border flex items-center gap-2 hover:opacity-80 transition-opacity ${toneClass[i.tone]}`}>
          <AlertTriangle className="w-3.5 h-3.5" />
          {i.label}
          <ArrowRight className="w-3 h-3" />
        </Link>
      ))}
    </div>
  );
};

const SupplierBalanceCard = ({
  supplier, onChange, balance, error, loading, checkedAt, onRefresh,
}: {
  supplier: SupplierLetter;
  onChange: (s: SupplierLetter) => void;
  balance: number | null;
  error: string | null;
  loading: boolean;
  checkedAt: Date | null;
  onRefresh: () => void;
}) => {
  const checkedLabel = useMemo(() => {
    if (!checkedAt) return null;
    const diff = Math.floor((Date.now() - checkedAt.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return checkedAt.toLocaleTimeString();
  }, [checkedAt, balance, loading]);

  return (
    <div className="bg-card rounded-xl border border-border card-shadow p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-primary" />
          <h3 className="font-display font-semibold">Supplier Balance</h3>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Refresh supplier balance"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Supplier selector — letters only, no brand names */}
      <div className="flex items-center bg-secondary/60 border border-border/60 rounded-lg p-0.5 mb-4">
        {(['A', 'B', 'C'] as SupplierLetter[]).map(s => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`flex-1 text-xs font-semibold px-2 py-1.5 rounded-md transition-all ${
              supplier === s ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Supplier {s}
          </button>
        ))}
      </div>

      <div className="bg-muted/30 rounded-lg p-4">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          Supplier {supplier} balance
        </p>
        {loading ? (
          <Skeleton className="h-8 w-32" />
        ) : balance != null ? (
          <p className="text-2xl font-display font-bold tabular">{formatPrice(balance)}</p>
        ) : (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span className="truncate">{error || 'Unavailable'}</span>
          </div>
        )}
        {checkedLabel && balance != null && (
          <p className="text-[10px] text-muted-foreground mt-1">Checked {checkedLabel}</p>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground mt-3">
        Your supplier preference is saved on this device.
      </p>
    </div>
  );
};

const statusStyles: Record<string, string> = {
  Pending: 'bg-primary/15 text-primary',
  'Pending Payment': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  Paid: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  Processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  Reprocessed: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  Delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  Failed: 'bg-destructive/10 text-destructive',
  Voided: 'bg-slate-200 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300',
};

const StatusBadge = ({ status }: { status: string }) => (
  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyles[status] || 'bg-muted text-muted-foreground'}`}>
    {status}
  </span>
);

export { StatusBadge };
export default AdminDashboard;
