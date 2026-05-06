import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatPrice } from '@/data/bundles';
import {
  ShoppingCart, Clock, CheckCircle, XCircle, DollarSign, Package,
  Users, Wallet, TrendingUp, ArrowRight, RefreshCw, Activity,
  AlertTriangle, Megaphone, Server, BarChart3, Zap, BadgeCheck,
  Receipt, Layers,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

// ─── Time period filter ──────────────────────────────────────────
type Period = 'today' | 'yesterday' | '7d' | '30d' | 'all';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: 'all', label: 'All' },
];

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

// ─── Supplier mapping (no real brand names in UI) ───────────────
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

  // Supplier balance state
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
  const aov = deliveredAll > 0 ? revenueAll / deliveredAll : 0;

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* ── Header ── */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-primary">Operations</span>
            </div>
            <h1 className="text-2xl md:text-[1.85rem] font-display font-extrabold tracking-[-0.025em] leading-[1.05]">
              Admin Dashboard
            </h1>
            <p className="text-[12.5px] text-muted-foreground mt-1">
              Live overview of YieGo orders, revenue and platform health.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Period filter pills */}
            <div className="flex items-center gap-0.5 bg-card/70 backdrop-blur-sm border border-border/70 rounded-full p-1 shadow-[inset_0_1px_0_0_hsl(var(--background)/0.5)]">
              {PERIODS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`text-[11.5px] font-semibold px-3 h-8 rounded-full whitespace-nowrap transition-all ${
                    period === p.id
                      ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.55)]'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => { fetchAll(true); fetchSupplierBalance(true); }}
              disabled={refreshing}
              className="w-10 h-10 rounded-full border border-border/70 bg-card/70 backdrop-blur-md text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card transition-all flex items-center justify-center shrink-0 group"
              aria-label="Refresh dashboard"
            >
              <RefreshCw className={`w-4 h-4 transition-transform duration-500 ${refreshing ? 'animate-spin' : 'group-hover:rotate-180'}`} />
            </button>
          </div>
        </header>

        {loading ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
            </div>
            <Skeleton className="h-12 rounded-xl" />
            <div className="grid lg:grid-cols-3 gap-4">
              <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
              <Skeleton className="h-64 rounded-2xl" />
            </div>
          </div>
        ) : (
          <>
            {/* ── HERO KPI BAND ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <HeroKpi
                icon={DollarSign}
                tone="emerald"
                eyebrow="Revenue"
                value={formatPrice(revenueAll)}
                sub={`${formatPrice(profitAll)} profit · AOV ${formatPrice(aov)}`}
              />
              <HeroKpi
                icon={ShoppingCart}
                tone="primary"
                eyebrow="Orders"
                value={orderTotalAll.toLocaleString('en-US')}
                sub={`${successRate}% success · ${failureRate}% failed`}
                to="/admin/orders"
              />
              <HeroKpi
                icon={Users}
                tone="sky"
                eyebrow="Users"
                value={totalUsers.toLocaleString('en-US')}
                sub={totals ? `+${totals.new_users} new in period` : '—'}
                to="/admin/users"
              />
              <HeroKpi
                icon={Activity}
                tone="amber"
                eyebrow="Active agents"
                value={agentLive.toLocaleString('en-US')}
                sub={`${agentPendingApps} pending applications`}
                to="/admin/agents/active?filter=operational"
              />
            </div>

            {/* ── SECONDARY STAT STRIP ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <SecondaryStat icon={CheckCircle} tone="emerald" label="Delivered" value={deliveredAll.toLocaleString('en-US')} />
              <SecondaryStat icon={Clock} tone="sky" label="Processing" value={processingAll.toLocaleString('en-US')} sub="in flight" />
              <SecondaryStat icon={XCircle} tone="rose" label="Failed" value={failedAll.toLocaleString('en-US')} sub={failureRate ? `${failureRate}% rate` : 'none'} />
              <SecondaryStat icon={Package} tone="violet" label="GB delivered" value={(totals?.normal_gb_delivered || 0).toFixed(1)} sub="normal orders" />
            </div>

            {/* ── OPERATIONAL ALERTS ── */}
            <OperationalAlerts
              failed={failedAll}
              pendingDeposits={totals?.deposits_pending_count || 0}
              pendingDepositsAmount={totals?.deposits_pending_amount || 0}
              pendingWithdrawals={totals?.agent_withdrawals_pending_count || 0}
              pendingWithdrawalsAmount={totals?.agent_withdrawals_pending_amount || 0}
              pendingApps={agentPendingApps}
              bulkQueue={bulkQueueCount}
              noticeActive={noticeActive}
            />

            {/* ── ORDER BREAKDOWN + SUPPLIER BALANCE ── */}
            <div className="grid lg:grid-cols-3 gap-4">
              {/* Order breakdown */}
              <section className="lg:col-span-2 relative overflow-hidden rounded-2xl glass-card p-5">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent pointer-events-none" />
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/25 text-primary flex items-center justify-center shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.3)]">
                      <BarChart3 className="w-4 h-4" strokeWidth={2} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="h-px w-4 bg-gradient-to-r from-transparent to-primary" />
                        <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-primary">Order breakdown</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Normal orders only — agent orders summarised separately</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
                  <MiniStat label="Total" value={totals?.normal_total || 0} />
                  <MiniStat label="Delivered" value={totals?.normal_delivered || 0} accent="text-emerald-600 dark:text-emerald-400" />
                  <MiniStat label="Processing" value={totals?.normal_processing || 0} accent="text-sky-600 dark:text-sky-400" />
                  <MiniStat label="Failed" value={totals?.normal_failed || 0} accent="text-rose-600 dark:text-rose-400" />
                </div>

                <ProgressBar
                  segments={[
                    { value: totals?.normal_delivered || 0, color: 'bg-emerald-500', label: 'Delivered' },
                    { value: totals?.normal_processing || 0, color: 'bg-sky-500', label: 'Processing' },
                    { value: totals?.normal_pending || 0, color: 'bg-amber-500', label: 'Pending' },
                    { value: totals?.normal_failed || 0, color: 'bg-rose-500', label: 'Failed' },
                  ]}
                />

                {/* Network breakdown with rails */}
                <div className="grid grid-cols-3 gap-2.5 mt-4 pt-4 border-t border-border/60">
                  <NetworkStat name="MTN" value={totals?.normal_mtn || 0} rail="bg-mtn" />
                  <NetworkStat name="Telecel" value={totals?.normal_telecel || 0} rail="bg-telecel" />
                  <NetworkStat name="AirtelTigo" value={totals?.normal_at || 0} rail="bg-airteltigo" />
                </div>
              </section>

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

            {/* ── FINANCE ROW ── */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Revenue & profit */}
              <section className="relative overflow-hidden rounded-2xl glass-card p-5">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent pointer-events-none" />
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 ring-1 ring-emerald-500/25 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-[0_4px_12px_-4px_rgb(16_185_129/0.3)]">
                    <DollarSign className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="h-px w-4 bg-gradient-to-r from-transparent to-emerald-500" />
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">Revenue & profit</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Across normal + agent flow</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <FinanceTile label="Normal revenue" value={formatPrice(totals?.normal_revenue || 0)} />
                  <FinanceTile label="Normal profit" value={formatPrice(totals?.normal_profit || 0)} hint="estimated" accent="text-emerald-600 dark:text-emerald-400" />
                  <FinanceTile label="Agent revenue" value={formatPrice(totals?.agent_revenue || 0)} />
                  <FinanceTile label="Agent profit" value={formatPrice(totals?.agent_profit || 0)} hint="estimated" accent="text-emerald-600 dark:text-emerald-400" />
                </div>
              </section>

              {/* Wallet & deposits */}
              <section className="relative overflow-hidden rounded-2xl glass-card p-5">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent pointer-events-none" />
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/25 text-primary flex items-center justify-center shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.3)]">
                      <Wallet className="w-4 h-4" strokeWidth={2} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="h-px w-4 bg-gradient-to-r from-transparent to-primary" />
                        <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-primary">Wallet & deposits</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">User funding & liability snapshot</p>
                    </div>
                  </div>
                  <Link
                    to="/admin/wallet"
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:gap-2.5 transition-all shrink-0"
                  >
                    Manage <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <FinanceTile
                    label="Confirmed deposits"
                    value={formatPrice(totals?.deposits_confirmed_amount || 0)}
                    hint={`${totals?.deposits_confirmed_count || 0} txns`}
                  />
                  <FinanceTile
                    label="Pending deposits"
                    value={formatPrice(totals?.deposits_pending_amount || 0)}
                    hint={`${totals?.deposits_pending_count || 0} txns`}
                    accent={totals?.deposits_pending_count ? 'text-amber-600 dark:text-amber-400' : undefined}
                  />
                  <FinanceTile label="Wallet liability" value={formatPrice(walletLiability)} hint="all balances" />
                  <FinanceTile
                    label="Rejected"
                    value={`${totals?.deposits_rejected_count || 0}`}
                    hint="this period"
                    accent={totals?.deposits_rejected_count ? 'text-rose-600 dark:text-rose-400' : undefined}
                  />
                </div>
              </section>
            </div>

            {/* ── RECENT ORDERS ── */}
            <section className="relative overflow-hidden rounded-2xl glass-card">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent pointer-events-none" />
              <div className="px-5 py-4 flex items-center justify-between border-b border-border/60">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Recent orders</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Last 8 normal orders across the platform</p>
                </div>
                <Link
                  to="/admin/orders"
                  className="inline-flex items-center gap-1.5 text-xs text-primary font-semibold hover:gap-2.5 transition-all"
                >
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              {recentOrders.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="relative w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 flex items-center justify-center shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.3)]">
                    <Receipt className="w-6 h-6 text-primary" strokeWidth={1.9} />
                  </div>
                  <p className="text-sm font-display font-bold">No orders yet in this period</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Try expanding the date range.</p>
                </div>
              ) : (
                <RecentOrdersTable orders={recentOrders} />
              )}
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

// ─── Sub-components ──────────────────────────────────────────────

const TONES: Record<string, { tile: string; rail: string; rim: string }> = {
  primary: { tile: 'from-primary/20 to-primary/5 text-primary ring-primary/25', rail: 'bg-primary', rim: 'border-primary/25' },
  emerald: { tile: 'from-emerald-500/20 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 ring-emerald-500/25', rail: 'bg-emerald-500', rim: 'border-emerald-500/25' },
  sky: { tile: 'from-sky-500/20 to-sky-500/5 text-sky-600 dark:text-sky-400 ring-sky-500/25', rail: 'bg-sky-500', rim: 'border-sky-500/25' },
  amber: { tile: 'from-amber-500/20 to-amber-500/5 text-amber-600 dark:text-amber-400 ring-amber-500/25', rail: 'bg-amber-500', rim: 'border-amber-500/25' },
  rose: { tile: 'from-rose-500/20 to-rose-500/5 text-rose-600 dark:text-rose-400 ring-rose-500/25', rail: 'bg-rose-500', rim: 'border-rose-500/25' },
  violet: { tile: 'from-violet-500/20 to-violet-500/5 text-violet-600 dark:text-violet-400 ring-violet-500/25', rail: 'bg-violet-500', rim: 'border-violet-500/25' },
};

const HeroKpi = ({
  icon: Icon, tone, eyebrow, value, sub, to,
}: {
  icon: typeof DollarSign;
  tone: keyof typeof TONES;
  eyebrow: string;
  value: string;
  sub?: string;
  to?: string;
}) => {
  const t = TONES[tone];
  const inner = (
    <div className="group relative h-full overflow-hidden rounded-2xl glass-card p-4 sm:p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_hsl(var(--primary)/0.3)]">
      <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${t.rail} opacity-80`} />
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ring-1 ${t.tile} flex items-center justify-center shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.2)]`}>
            <Icon className="w-4 h-4" strokeWidth={2} />
          </div>
          {to && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />}
        </div>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">{eyebrow}</p>
        <p className="text-[1.6rem] sm:text-[1.85rem] font-display font-extrabold tabular tracking-[-0.02em] leading-none mt-1.5 truncate">
          {value}
        </p>
        {sub && <p className="text-[10.5px] text-muted-foreground mt-1.5 truncate">{sub}</p>}
      </div>
    </div>
  );
  if (to) return <Link to={to} className="block h-full">{inner}</Link>;
  return <div className="h-full">{inner}</div>;
};

const SecondaryStat = ({
  icon: Icon, tone, label, value, sub,
}: {
  icon: typeof CheckCircle;
  tone: keyof typeof TONES;
  label: string;
  value: string;
  sub?: string;
}) => {
  const t = TONES[tone];
  return (
    <div className="relative rounded-xl glass-card p-3.5 overflow-hidden">
      <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full ${t.rail} opacity-70`} />
      <div className="relative flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ring-1 ${t.tile} flex items-center justify-center shrink-0`}>
          <Icon className="w-4 h-4" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">{label}</p>
          <p className="text-base font-display font-extrabold tabular leading-tight mt-0.5 truncate">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground/85 leading-tight">{sub}</p>}
        </div>
      </div>
    </div>
  );
};

const MiniStat = ({ label, value, accent }: { label: string; value: number | string; accent?: string }) => (
  <div className="rounded-xl bg-muted/30 border border-border/50 p-3">
    <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">{label}</p>
    <p className={`text-lg font-display font-extrabold tabular leading-tight mt-0.5 ${accent || ''}`}>{value}</p>
  </div>
);

const FinanceTile = ({
  label, value, hint, accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) => (
  <div className="rounded-xl bg-muted/30 border border-border/50 p-3">
    <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">{label}</p>
    <p className={`text-[15px] font-display font-extrabold tabular leading-tight mt-1 truncate ${accent || ''}`}>{value}</p>
    {hint && <p className="text-[10px] text-muted-foreground/80 mt-0.5">{hint}</p>}
  </div>
);

const NetworkStat = ({ name, value, rail }: { name: string; value: number; rail: string }) => (
  <div className="relative rounded-xl bg-muted/30 border border-border/50 p-3 overflow-hidden">
    <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full ${rail} opacity-90`} />
    <div className="relative pl-1.5">
      <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">{name}</p>
      <p className="text-base font-display font-extrabold tabular leading-tight mt-0.5">{value}</p>
    </div>
  </div>
);

const ProgressBar = ({ segments }: { segments: { value: number; color: string; label: string }[] }) => {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return <div className="text-[11.5px] text-muted-foreground italic px-1">No orders in this period.</div>;
  }
  return (
    <div>
      <div className="flex w-full h-2.5 rounded-full overflow-hidden bg-muted/60 ring-1 ring-border/50">
        {segments.map(s => s.value > 0 && (
          <div key={s.label} className={s.color} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5 text-[10.5px] text-muted-foreground">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-sm ${s.color}`} />
            <span>{s.label}: <span className="font-bold text-foreground tabular">{s.value}</span></span>
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
    failed > 0 && { label: `${failed} failed orders`, to: '/admin/orders', tone: 'rose' as const, icon: XCircle },
    pendingDeposits > 0 && { label: `${pendingDeposits} pending deposits · ${formatPrice(pendingDepositsAmount)}`, to: '/admin/wallet', tone: 'amber' as const, icon: Clock },
    pendingWithdrawals > 0 && { label: `${pendingWithdrawals} withdrawals · ${formatPrice(pendingWithdrawalsAmount)}`, to: '/admin/agents/withdrawals', tone: 'amber' as const, icon: Clock },
    pendingApps > 0 && { label: `${pendingApps} agent applications`, to: '/admin/agents/applications', tone: 'sky' as const, icon: Users },
    bulkQueue > 0 && { label: `${bulkQueue} active dispatch batches`, to: '/admin/bulk-dispatch', tone: 'sky' as const, icon: Layers },
    noticeActive && { label: 'Service notice live', to: '/admin/notices', tone: 'sky' as const, icon: Megaphone },
  ].filter(Boolean) as { label: string; to: string; tone: 'rose' | 'amber' | 'sky'; icon: typeof XCircle }[];

  if (items.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-3.5 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 ring-1 ring-emerald-500/25 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-[0_4px_12px_-4px_rgb(16_185_129/0.3)]">
          <BadgeCheck className="w-4 h-4" strokeWidth={2} />
        </div>
        <div>
          <p className="text-[12.5px] font-bold text-emerald-600 dark:text-emerald-400 leading-tight">All clear</p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">No pending operational alerts in this period.</p>
        </div>
      </div>
    );
  }

  const toneClass = (t: 'rose' | 'amber' | 'sky') => {
    if (t === 'rose') return 'border-rose-500/25 bg-rose-500/[0.06] text-rose-600 dark:text-rose-400 hover:border-rose-500/40';
    if (t === 'amber') return 'border-amber-500/30 bg-amber-500/[0.06] text-amber-600 dark:text-amber-400 hover:border-amber-500/45';
    return 'border-sky-500/25 bg-sky-500/[0.05] text-sky-600 dark:text-sky-400 hover:border-sky-500/40';
  };

  return (
    <div className="flex flex-wrap gap-2">
      {items.map(i => (
        <Link
          key={i.label}
          to={i.to}
          className={`group inline-flex items-center gap-2 px-3 h-9 rounded-full border text-[11.5px] font-semibold transition-all hover:-translate-y-0.5 ${toneClass(i.tone)}`}
        >
          <i.icon className="w-3 h-3" />
          {i.label}
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
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
    <section className="relative overflow-hidden rounded-2xl glass-card p-5">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent pointer-events-none" />
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/25 text-primary flex items-center justify-center shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.3)]">
            <Server className="w-4 h-4" strokeWidth={2} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="h-px w-4 bg-gradient-to-r from-transparent to-primary" />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-primary">Supplier</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Live upstream balance</p>
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="w-8 h-8 rounded-full hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
          aria-label="Refresh supplier balance"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Selector */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-muted/40 backdrop-blur-sm border border-border/60 rounded-full mb-4">
        {(['A', 'B', 'C'] as SupplierLetter[]).map(s => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`text-[11.5px] font-semibold py-1.5 rounded-full transition-all ${
              supplier === s
                ? 'bg-primary text-primary-foreground shadow-[0_4px_10px_-4px_hsl(var(--primary)/0.5)]'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Supplier {s}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-muted/30 border border-border/50 p-4">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70 mb-1.5">
          Supplier {supplier} balance
        </p>
        {loading ? (
          <Skeleton className="h-9 w-32" />
        ) : balance != null ? (
          <p className="text-[1.7rem] font-display font-extrabold tabular tracking-[-0.025em] leading-none">
            {formatPrice(balance)}
          </p>
        ) : (
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 text-[12px]">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="truncate">{error || 'Unavailable'}</span>
          </div>
        )}
        {checkedLabel && balance != null && (
          <p className="text-[10px] text-muted-foreground/70 mt-1.5 inline-flex items-center gap-1">
            <Zap className="w-2.5 h-2.5" /> Checked {checkedLabel}
          </p>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground/70 mt-3">
        Preference saved on this device.
      </p>
    </section>
  );
};

const STATUS_BADGE: Record<string, { className: string }> = {
  Pending: { className: 'text-amber-600 bg-amber-500/10 border-amber-500/25' },
  'Pending Payment': { className: 'text-amber-600 bg-amber-500/10 border-amber-500/25' },
  Paid: { className: 'text-sky-600 bg-sky-500/10 border-sky-500/25' },
  Processing: { className: 'text-sky-600 bg-sky-500/10 border-sky-500/25' },
  Reprocessed: { className: 'text-violet-600 bg-violet-500/10 border-violet-500/25' },
  Delivered: { className: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/25' },
  Failed: { className: 'text-rose-600 bg-rose-500/10 border-rose-500/25' },
  Voided: { className: 'text-muted-foreground bg-muted/60 border-border/60' },
};

const StatusBadge = ({ status }: { status: string }) => {
  const tone = STATUS_BADGE[status] || { className: 'text-muted-foreground bg-muted border-border' };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full border ${tone.className}`}>
      {status}
    </span>
  );
};

const NETWORK_RAIL: Record<string, string> = {
  MTN: 'bg-mtn',
  Telecel: 'bg-telecel',
  AirtelTigo: 'bg-airteltigo',
};

const RecentOrdersTable = ({ orders }: { orders: any[] }) => (
  <>
    {/* Mobile cards */}
    <ul className="md:hidden divide-y divide-border/50">
      {orders.map((o: any) => {
        const rail = NETWORK_RAIL[o.network] || 'bg-primary';
        return (
          <li key={o.order_id} className="relative flex items-center gap-3 pl-5 pr-4 py-3.5">
            <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full ${rail} opacity-90`} />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs font-bold text-primary truncate">{o.order_id}</p>
              <p className="text-[10.5px] text-muted-foreground truncate tabular mt-0.5">
                {o.recipient_number} · {o.network} {o.bundle_size_gb}GB
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[12.5px] font-bold tabular leading-tight">{formatPrice(Number(o.amount_ghs))}</p>
              <span className="mt-1 inline-block"><StatusBadge status={o.status} /></span>
            </div>
          </li>
        );
      })}
    </ul>
    {/* Desktop table */}
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/30">
            <th className="text-left px-5 py-3 font-bold text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">Order ID</th>
            <th className="text-left px-4 py-3 font-bold text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">Recipient</th>
            <th className="text-left px-4 py-3 font-bold text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">Bundle</th>
            <th className="text-right px-4 py-3 font-bold text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">Amount</th>
            <th className="text-left px-4 py-3 font-bold text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o: any) => {
            const rail = NETWORK_RAIL[o.network] || 'bg-primary';
            return (
              <tr key={o.order_id} className="border-b border-border/40 last:border-0 hover:bg-primary/[0.03] transition-colors group relative">
                <td className="relative px-5 py-3.5 font-mono font-bold text-primary text-xs">
                  <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full ${rail} opacity-80 group-hover:opacity-100 transition-opacity`} />
                  {o.order_id}
                </td>
                <td className="px-4 py-3.5 text-xs tabular">{o.recipient_number}</td>
                <td className="px-4 py-3.5 text-xs">
                  <span className="font-semibold">{o.network}</span>
                  <span className="text-muted-foreground"> · {o.bundle_size_gb}GB</span>
                </td>
                <td className="px-4 py-3.5 text-right font-bold text-xs tabular">{formatPrice(Number(o.amount_ghs))}</td>
                <td className="px-4 py-3.5"><StatusBadge status={o.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </>
);

export { StatusBadge };
export default AdminDashboard;
