import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { formatPrice } from '@/data/bundles';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users, FileText, Clock, Wallet, TrendingUp, ShoppingCart,
  ArrowRight, CheckCircle, AlertTriangle, Power
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getExactCount, sumColumn } from '@/lib/db-counts';

interface OverviewStats {
  totalAgents: number;
  activeAgents: number;
  pendingApps: number;
  awaitingActivation: number;
  suspendedAgents: number;
  totalAgentSales30d: number;
  totalAgentRevenue30d: number;
  totalAgentProfit30d: number;
  pendingPayouts: number;
  pendingPayoutAmount: number;
}

const NETWORK_COLORS: Record<string, string> = {
  MTN: '#FFC107',
  Telecel: '#E91E63',
  AirtelTigo: '#2196F3',
};

type TopPeriod = 'today' | '7d' | '30d' | 'all';

const AdminAgentOverview = () => {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [salesByDay, setSalesByDay] = useState<any[]>([]);
  const [ordersByNetwork, setOrdersByNetwork] = useState<any[]>([]);
  const [topAgents, setTopAgents] = useState<any[]>([]);
  const [topPeriod, setTopPeriod] = useState<TopPeriod>('30d');
  const [topLoading, setTopLoading] = useState(false);
  const [agentsCache, setAgentsCache] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const iso30 = thirtyDaysAgo.toISOString();

    // ── True totals via exact count / aggregate queries (never capped) ──
    const sales30Filter = (q: any) => q.gte('created_at', iso30);
    const delivered30Filter = (q: any) =>
      q.gte('created_at', iso30).in('status', ['delivered', 'Delivered']);

    const [
      agentsRes,
      appsRes,
      ordersRes,
      withdrawalsRes,
      sales30Count,
      revenue30Sum,
      profit30Sum,
      pendingPayoutsCount,
      pendingPayoutsSum,
      approvedPendingPayoutsCount,
      approvedPendingPayoutsSum,
    ] = await Promise.all([
      // Agents list still needed for status breakdown + top-agents naming
      supabase.from('agents').select('id, status, store_name, activation_paid'),
      supabase.from('agent_applications').select('id, status'),
      // 30-day orders for daily / per-network CHART data only — not totals
      supabase.from('agent_orders').select('id, agent_id, agent_selling_price, profit_ghs, network, created_at, status').gte('created_at', iso30),
      supabase.from('agent_withdrawals').select('id, status'),
      getExactCount('agent_orders', sales30Filter),
      sumColumn('agent_orders', 'agent_selling_price', delivered30Filter),
      sumColumn('agent_orders', 'profit_ghs', delivered30Filter),
      getExactCount('agent_withdrawals', (q) => q.eq('status', 'pending')),
      sumColumn('agent_withdrawals', 'amount_ghs', (q) => q.eq('status', 'pending')),
      getExactCount('agent_withdrawals', (q) => q.eq('status', 'approved')),
      sumColumn('agent_withdrawals', 'amount_ghs', (q) => q.eq('status', 'approved')),
    ]);

    const agents = (agentsRes.data || []) as any[];
    setAgentsCache(agents);
    const apps = (appsRes.data || []) as any[];
    const orders = (ordersRes.data || []) as any[];

    // Count operational agents using canonical RPC
    let operationalCount = 0;
    const activeStatusAgents = agents.filter(a => a.status === 'active');
    const statePromises = activeStatusAgents.map(async (ag: any) => {
      try {
        const { data } = await supabase.rpc('get_agent_effective_state', { p_agent_id: ag.id });
        const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
        if (row && ['active', 'expiring_soon', 'grace_period'].includes(row.effective_state)) {
          operationalCount++;
        }
      } catch {}
    });
    await Promise.all(statePromises);
    const pendingApps = apps.filter(a => a.status === 'pending_review' || a.status === 'pending');
    const awaitingActivation = agents.filter(a => a.status === 'approved' && !a.activation_paid);
    const suspendedAgents = agents.filter(a => a.status === 'suspended');

    setStats({
      totalAgents: agents.length,
      activeAgents: operationalCount,
      pendingApps: pendingApps.length,
      awaitingActivation: awaitingActivation.length,
      suspendedAgents: suspendedAgents.length,
      // True 30-day totals from count/aggregate queries (not row arrays)
      totalAgentSales30d: sales30Count,
      totalAgentRevenue30d: revenue30Sum,
      totalAgentProfit30d: profit30Sum,
      pendingPayouts: pendingPayoutsCount + approvedPendingPayoutsCount,
      pendingPayoutAmount: pendingPayoutsSum + approvedPendingPayoutsSum,
    });

    // Sales by day (last 30 days) — chart data, scoped to 30d window
    const dayMap: Record<string, number> = {};
    orders.forEach(o => {
      const day = new Date(o.created_at).toISOString().slice(0, 10);
      dayMap[day] = (dayMap[day] || 0) + 1;
    });
    const dayData = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: date.slice(5), orders: count }));
    setSalesByDay(dayData);

    // Orders by network — chart data, scoped to 30d window
    const netMap: Record<string, number> = {};
    orders.forEach(o => {
      netMap[o.network] = (netMap[o.network] || 0) + 1;
    });
    setOrdersByNetwork(Object.entries(netMap).map(([name, value]) => ({ name, value })));

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Top Agents by Revenue (period-aware, separate fetch) ──
  const fetchTopAgents = useCallback(async (period: TopPeriod, agents: any[]) => {
    setTopLoading(true);
    let sinceIso: string | null = null;
    const now = new Date();
    if (period === 'today') {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      sinceIso = start.toISOString();
    } else if (period === '7d') {
      sinceIso = new Date(now.getTime() - 7 * 86400_000).toISOString();
    } else if (period === '30d') {
      sinceIso = new Date(now.getTime() - 30 * 86400_000).toISOString();
    }

    let q = supabase.from('agent_orders')
      .select('agent_id, agent_selling_price, profit_ghs, status, created_at')
      .in('status', ['delivered', 'Delivered']);
    if (sinceIso) q = q.gte('created_at', sinceIso);
    const { data } = await q;

    const map: Record<string, { name: string; revenue: number; profit: number; orders: number }> = {};
    (data || []).forEach((o: any) => {
      if (!map[o.agent_id]) {
        const ag = agents.find(a => a.id === o.agent_id);
        map[o.agent_id] = { name: ag?.store_name || 'Unknown', revenue: 0, profit: 0, orders: 0 };
      }
      map[o.agent_id].revenue += Number(o.agent_selling_price || 0);
      map[o.agent_id].profit += Number(o.profit_ghs || 0);
      map[o.agent_id].orders += 1;
    });
    setTopAgents(
      Object.entries(map)
        .sort(([, a], [, b]) => b.revenue - a.revenue)
        .slice(0, 10)
        .map(([id, d]) => ({ id, ...d }))
    );
    setTopLoading(false);
  }, []);

  useEffect(() => {
    if (agentsCache.length > 0 || !loading) {
      fetchTopAgents(topPeriod, agentsCache);
    }
  }, [topPeriod, agentsCache, fetchTopAgents, loading]);

  const kpiCards = stats ? [
    { label: 'Total Agents', value: stats.totalAgents, icon: Users, color: 'text-primary', to: '/admin/agents/active?filter=all' },
    { label: 'Active Agents', value: stats.activeAgents, icon: CheckCircle, color: 'text-success', to: '/admin/agents/active?filter=operational' },
    { label: 'Pending Apps', value: stats.pendingApps, icon: FileText, color: 'text-primary', badge: stats.pendingApps > 0, to: '/admin/agents/applications' },
    { label: 'Awaiting Activation', value: stats.awaitingActivation, icon: Power, color: 'text-info', to: '/admin/agents/active?filter=awaiting_activation' },
    { label: 'Suspended', value: stats.suspendedAgents, icon: AlertTriangle, color: 'text-destructive', to: '/admin/agents/list' },
    { label: 'Agent Sales (30d)', value: stats.totalAgentSales30d, icon: ShoppingCart, color: 'text-foreground', to: '/admin/agents/active?filter=all' },
  ] : [];

  const financeCards = stats ? [
    { label: 'Agent Revenue (30d)', value: formatPrice(stats.totalAgentRevenue30d), icon: TrendingUp },
    { label: 'Agent Profit (30d)', value: formatPrice(stats.totalAgentProfit30d), icon: TrendingUp },
    { label: 'Pending Payouts', value: `${stats.pendingPayouts} (${formatPrice(stats.pendingPayoutAmount)})`, icon: Wallet },
  ] : [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-display font-bold">Agent Management</h2>
          <p className="text-muted-foreground text-sm">Overview of the agent/reseller ecosystem</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {kpiCards.map(stat => (
                <Link key={stat.label} to={stat.to} className="bg-card rounded-xl p-4 border border-border card-shadow hover:card-shadow-hover transition-shadow relative">
                  <div className="flex items-center gap-2 mb-2">
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</span>
                  </div>
                  <p className="text-xl font-display font-bold">{stat.value}</p>
                  {stat.badge && (
                    <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full animate-pulse" />
                  )}
                </Link>
              ))}
            </div>

            {/* Finance Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {financeCards.map(stat => (
                <div key={stat.label} className="bg-card rounded-xl p-4 border border-border card-shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <stat.icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</span>
                  </div>
                  <p className="text-lg font-display font-bold">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Review Applications', to: '/admin/agents/applications', color: 'text-primary', count: stats?.pendingApps },
                { label: 'Pending Payouts', to: '/admin/agents/withdrawals', color: 'text-primary', count: stats?.pendingPayouts },
                { label: 'Agent Directory', to: '/admin/agents/list', color: 'text-foreground' },
                { label: 'Activity Logs', to: '/admin/agents/activity', color: 'text-muted-foreground' },
              ].map(action => (
                <Link key={action.label} to={action.to} className="bg-card rounded-xl p-3 border border-border flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div>
                    <p className={`text-xs font-semibold ${action.color}`}>{action.label}</p>
                    {action.count != null && action.count > 0 && <p className="text-lg font-display font-bold">{action.count}</p>}
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </Link>
              ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Sales Trend */}
              <Card className="card-shadow">
                <CardContent className="p-4">
                  <h3 className="font-display font-semibold mb-4 text-sm">Agent Orders (Last 30 Days)</h3>
                  {salesByDay.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-8">No orders yet</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={salesByDay}>
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Orders by Network */}
              <Card className="card-shadow">
                <CardContent className="p-4">
                  <h3 className="font-display font-semibold mb-4 text-sm">Orders by Network</h3>
                  {ordersByNetwork.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-8">No data</p>
                  ) : (
                    <div className="flex items-center gap-6">
                      <ResponsiveContainer width="50%" height={180}>
                        <PieChart>
                          <Pie data={ordersByNetwork} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                            {ordersByNetwork.map((entry, i) => (
                              <Cell key={i} fill={NETWORK_COLORS[entry.name] || '#999'} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2">
                        {ordersByNetwork.map(n => (
                          <div key={n.name} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ background: NETWORK_COLORS[n.name] || '#999' }} />
                            <span className="text-xs font-medium">{n.name}: {n.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top Agents */}
            <Card className="card-shadow">
              <CardContent className="p-0">
                <div className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="font-display font-semibold text-sm">
                    Top Agents by Revenue
                  </h3>
                  <div className="flex gap-1 rounded-lg bg-muted p-0.5">
                    {(['today', '7d', '30d', 'all'] as TopPeriod[]).map(p => (
                      <button
                        key={p}
                        onClick={() => setTopPeriod(p)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                          topPeriod === p
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {p === 'today' ? 'Today' : p === '7d' ? '7 days' : p === '30d' ? '30 days' : 'All time'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  {topLoading ? (
                    <div className="p-4 space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 rounded" />)}
                    </div>
                  ) : topAgents.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <p className="text-sm text-muted-foreground">No agent revenue in this period yet.</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Try a wider time range.</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                          <th className="px-4 py-3 font-medium">#</th>
                          <th className="px-4 py-3 font-medium">Store</th>
                          <th className="px-4 py-3 font-medium text-right">Orders</th>
                          <th className="px-4 py-3 font-medium text-right">Revenue</th>
                          <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topAgents.map((ag, i) => {
                          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                          return (
                            <tr key={ag.id} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="px-4 py-3 font-mono text-xs text-muted-foreground w-12">
                                {medal ? <span className="text-base">{medal}</span> : i + 1}
                              </td>
                              <td className="px-4 py-3 font-semibold">
                                <Link to={`/admin/agents/${ag.id}`} className="text-primary hover:underline">{ag.name}</Link>
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">{ag.orders}</td>
                              <td className="px-4 py-3 text-right font-medium tabular-nums">{formatPrice(ag.revenue)}</td>
                              <td className="px-4 py-3 text-right font-medium text-success tabular-nums hidden sm:table-cell">{formatPrice(ag.profit)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminAgentOverview;
