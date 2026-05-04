import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatPrice } from '@/data/bundles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DollarSign, TrendingUp, ArrowDownCircle, ArrowUpCircle,
  RefreshCw, Search, CreditCard, Wallet, Calendar,
  ChevronLeft, ChevronRight, BarChart3, PieChart as PieIcon
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

interface FinanceStats {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  paystackPayments: number;
  walletPayments: number;
  totalDeposits: number;
  depositsToday: number;
  depositsThisMonth: number;
  profitMargin: number;
  // New: breakdown
  normalProfit: number;
  agentStoreProfit: number;
  agentSubscriptionRevenue: number;
  paystackFeesPaid: number;
  netCommission: number;
}

interface PaystackRecord {
  id: string;
  reference: string;
  purpose: string;
  amount_ghs: number;
  status: string;
  channel: string | null;
  customer_email: string | null;
  linked_order_id: string | null;
  user_id: string | null;
  created_at: string;
  paid_at: string | null;
}

interface NetworkRevenue {
  network: string;
  revenue: number;
  orders: number;
  profit: number;
}

interface DailyProfit {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
}

const CHART_COLORS = [
  'hsl(45, 100%, 48%)',
  'hsl(210, 85%, 55%)',
  'hsl(142, 70%, 45%)',
  'hsl(0, 84%, 60%)',
  'hsl(270, 60%, 55%)',
];

const PAGE_SIZE = 25;

const AdminFinanceReport = () => {
  const { user, isAdminOrStaff, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<FinanceStats>({
    totalRevenue: 0, totalCost: 0, totalProfit: 0,
    paystackPayments: 0, walletPayments: 0, totalDeposits: 0,
    depositsToday: 0, depositsThisMonth: 0, profitMargin: 0,
    normalProfit: 0, agentStoreProfit: 0, agentSubscriptionRevenue: 0,
    paystackFeesPaid: 0, netCommission: 0,
  });
  const [networkRevenue, setNetworkRevenue] = useState<NetworkRevenue[]>([]);
  const [dailyProfit, setDailyProfit] = useState<DailyProfit[]>([]);
  const [paystackRecords, setPaystackRecords] = useState<PaystackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [purposeFilter, setPurposeFilter] = useState<string>('all');
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!authLoading && (!user || !isAdminOrStaff)) navigate('/auth');
  }, [user, isAdminOrStaff, authLoading, navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [ordersRes, paystackRes, depositsRes, depositsTodayRes, depositsMonthRes, recentOrdersRes, agentOrdersRes, agentSubsRes] = await Promise.all([
      supabase.from('orders').select('amount_ghs, cost_price_ghs, profit_ghs, payment_method, status, network, processing_fee')
        .in('status', ['Paid', 'Processing', 'Delivered']),
      supabase.from('paystack_payments').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('wallet_transactions').select('amount_ghs, status')
        .eq('type', 'deposit').eq('status', 'confirmed'),
      supabase.from('wallet_transactions').select('amount_ghs')
        .eq('type', 'deposit').eq('status', 'confirmed')
        .gte('created_at', today.toISOString()),
      supabase.from('wallet_transactions').select('amount_ghs')
        .eq('type', 'deposit').eq('status', 'confirmed')
        .gte('created_at', monthStart.toISOString()),
      supabase.from('orders').select('amount_ghs, cost_price_ghs, profit_ghs, created_at')
        .in('status', ['Paid', 'Processing', 'Delivered'])
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: true }),
      supabase.from('agent_orders').select('profit_ghs, status, payment_status, processing_fee')
        .or('status.in.(Paid,Processing,Delivered),payment_status.eq.paid'),
      supabase.from('agent_subscriptions').select('plan_price_current, status').eq('status', 'active'),
    ]);

    let totalRevenue = 0, totalCost = 0, totalProfit = 0, paystackPayments = 0, walletPayments = 0;
    const networkMap: Record<string, NetworkRevenue> = {};

    ordersRes.data?.forEach((o: any) => {
      const revenue = Number(o.amount_ghs);
      const cost = Number(o.cost_price_ghs || 0);
      const profit = Number(o.profit_ghs || 0);
      totalRevenue += revenue;
      totalCost += cost;
      totalProfit += profit;
      if (o.payment_method === 'paystack') paystackPayments++;
      if (o.payment_method === 'wallet') walletPayments++;

      // Network breakdown
      const net = o.network || 'Unknown';
      if (!networkMap[net]) networkMap[net] = { network: net, revenue: 0, orders: 0, profit: 0 };
      networkMap[net].revenue += revenue;
      networkMap[net].orders += 1;
      networkMap[net].profit += profit;
    });

    // Daily profit trend (last 30 days)
    const dailyMap: Record<string, DailyProfit> = {};
    recentOrdersRes.data?.forEach((o: any) => {
      const date = new Date(o.created_at).toISOString().slice(0, 10);
      if (!dailyMap[date]) dailyMap[date] = { date, revenue: 0, cost: 0, profit: 0 };
      dailyMap[date].revenue += Number(o.amount_ghs);
      dailyMap[date].cost += Number(o.cost_price_ghs || 0);
      dailyMap[date].profit += Number(o.profit_ghs || 0);
    });

    const totalDeposits = depositsRes.data?.reduce((s, d: any) => s + Number(d.amount_ghs), 0) || 0;
    const depositsToday = depositsTodayRes.data?.reduce((s, d: any) => s + Number(d.amount_ghs), 0) || 0;
    const depositsThisMonth = depositsMonthRes.data?.reduce((s, d: any) => s + Number(d.amount_ghs), 0) || 0;
    const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;

    // Agent store profit
    const agentStoreProfit = (agentOrdersRes.data || []).reduce((s: number, o: any) => s + Number(o.profit_ghs || 0), 0);
    const normalProfit = totalProfit; // All normal DataSika orders profit
    
    // Agent subscription revenue
    const agentSubscriptionRevenue = (agentSubsRes.data || []).reduce((s: number, sub: any) => s + Number(sub.plan_price_current || 0), 0);

    // Processing fees collected (customer-paid 4%)
    const totalProcessingFees = ordersRes.data?.reduce((s, o: any) => s + Number(o.processing_fee || 0), 0) || 0;
    const agentProcessingFees = (agentOrdersRes.data || []).reduce((s: number, o: any) => s + Number(o.processing_fee || 0), 0);
    const allProcessingFees = totalProcessingFees + agentProcessingFees;
    
    // Paystack cost estimate (1.95%)
    const paystackFeesPaid = Math.round(allProcessingFees * (1.95 / 4) * 100) / 100;
    const netCommission = allProcessingFees - paystackFeesPaid;

    setStats({
      totalRevenue, totalCost, totalProfit: totalProfit || (totalRevenue - totalCost),
      paystackPayments, walletPayments, totalDeposits, depositsToday, depositsThisMonth,
      profitMargin,
      normalProfit, agentStoreProfit, agentSubscriptionRevenue,
      paystackFeesPaid, netCommission,
    });
    setNetworkRevenue(Object.values(networkMap).sort((a, b) => b.revenue - a.revenue));
    setDailyProfit(Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)));
    setPaystackRecords((paystackRes.data || []) as PaystackRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdminOrStaff) fetchData();
  }, [isAdminOrStaff, fetchData]);

  if (authLoading || !user || !isAdminOrStaff) return null;

  const filtered = paystackRecords.filter((r) => {
    if (purposeFilter !== 'all' && r.purpose !== purposeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return r.reference.toLowerCase().includes(q) || r.customer_email?.toLowerCase().includes(q) || r.linked_order_id?.toLowerCase().includes(q);
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold">Finance & Paystack</h2>
            <p className="text-muted-foreground text-sm">Revenue, profit, and payment analytics</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>

        {/* Finance Stats */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Revenue', value: formatPrice(stats.totalRevenue), icon: DollarSign, color: 'text-primary' },
                { label: 'Total Cost', value: formatPrice(stats.totalCost), icon: ArrowUpCircle, color: 'text-destructive' },
                { label: 'Total Profit', value: formatPrice(stats.totalProfit), icon: TrendingUp, color: 'text-success' },
                { label: 'Profit Margin', value: `${stats.profitMargin.toFixed(1)}%`, icon: BarChart3, color: 'text-success' },
                { label: 'Paystack Orders', value: String(stats.paystackPayments), icon: CreditCard, color: 'text-primary' },
                { label: 'Wallet Orders', value: String(stats.walletPayments), icon: Wallet, color: 'text-primary' },
                { label: 'Deposits Today', value: formatPrice(stats.depositsToday), icon: Calendar, color: 'text-primary' },
                { label: 'Deposits This Month', value: formatPrice(stats.depositsThisMonth), icon: ArrowDownCircle, color: 'text-success' },
              ].map(stat => (
                <div key={stat.label} className="bg-card rounded-xl p-4 border border-border card-shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</span>
                  </div>
                  <p className="text-lg font-display font-bold">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Profit Breakdown */}
            <div className="bg-card rounded-xl border border-border card-shadow p-5">
              <h3 className="font-display font-semibold text-sm mb-4">Profit Breakdown</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Normal Orders Profit</p>
                  <p className="text-lg font-bold text-success">{formatPrice(stats.normalProfit)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Agent Store Profit</p>
                  <p className="text-lg font-bold text-primary">{formatPrice(stats.agentStoreProfit)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Agent Subscriptions</p>
                  <p className="text-lg font-bold">{formatPrice(stats.agentSubscriptionRevenue)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Customer Fee (4%)</p>
                  <p className="text-sm font-semibold">{formatPrice(stats.netCommission + stats.paystackFeesPaid)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Paystack Fees Paid (~1.95%)</p>
                  <p className="text-sm font-semibold text-destructive">-{formatPrice(stats.paystackFeesPaid)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Net Commission Earned</p>
                  <p className="text-sm font-semibold text-success">{formatPrice(stats.netCommission)}</p>
                </div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Daily Profit Chart */}
              <div className="bg-card rounded-xl border border-border card-shadow p-4">
                <h3 className="font-display font-semibold mb-4 flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-success" /> Daily Profit (30 days)
                </h3>
                {dailyProfit.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No data yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={dailyProfit}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 50% / 0.1)" />
                      <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 10 }} stroke="hsl(0 0% 50% / 0.5)" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(0 0% 50% / 0.5)" tickFormatter={(v) => `₵${v}`} />
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '0.5rem', fontSize: '12px' }}
                        formatter={(value: number, name: string) => [formatPrice(value), name]}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="revenue" name="Revenue" fill="hsl(210, 85%, 55%)" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="profit" name="Profit" fill="hsl(142, 70%, 45%)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Network Revenue Pie */}
              <div className="bg-card rounded-xl border border-border card-shadow p-4">
                <h3 className="font-display font-semibold mb-4 flex items-center gap-2 text-sm">
                  <PieIcon className="w-4 h-4 text-primary" /> Revenue by Network
                </h3>
                {networkRevenue.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No data yet</div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={networkRevenue}
                          dataKey="revenue"
                          nameKey="network"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          innerRadius={45}
                          strokeWidth={2}
                          stroke="hsl(var(--card))"
                        >
                          {networkRevenue.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '0.5rem', fontSize: '12px' }}
                          formatter={(value: number) => [formatPrice(value), 'Revenue']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="w-full space-y-2">
                      {networkRevenue.map((nr, i) => (
                        <div key={nr.network} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                            <span className="font-medium">{nr.network}</span>
                          </div>
                          <div className="flex items-center gap-3 text-muted-foreground">
                            <span>{nr.orders} orders</span>
                            <span className="font-semibold text-foreground">{formatPrice(nr.revenue)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Paystack Transactions */}
        <div>
          <h3 className="font-display font-semibold text-lg mb-4">Paystack Transactions</h3>

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by reference, email, order..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
            </div>
            <div className="flex gap-2">
              {['all', 'deposit', 'order', 'agent_activation', 'agent_order'].map(t => (
                <button key={t} onClick={() => { setPurposeFilter(t); setPage(0); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${purposeFilter === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}>
                  {t === 'all' ? 'All' : t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-x-auto">
              {paged.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground text-sm">No Paystack transactions found</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reference</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Purpose</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Channel</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Date</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map(r => (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs">{r.reference}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            r.purpose === 'deposit' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'
                          }`}>{r.purpose}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{formatPrice(Number(r.amount_ghs))}</td>
                        <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground capitalize">{r.channel || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            r.status === 'success' ? 'bg-success/10 text-success' :
                            r.status === 'failed' ? 'bg-destructive/10 text-destructive' :
                            'bg-primary/10 text-primary'
                          }`}>{r.status}</span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                        <td className="px-4 py-3 hidden lg:table-cell text-xs font-mono text-muted-foreground">{r.linked_order_id || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminFinanceReport;
