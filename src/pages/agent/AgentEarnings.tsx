import { useState, useEffect, useMemo } from 'react';
import { useAgent } from '@/hooks/useAgent';
import { useStoreStatus } from '@/hooks/useStoreStatus';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AgentLayout from './AgentLayout';
import AgentGate from '@/components/agent/AgentGate';
import KPICard from '@/components/agent/KPICard';
import { EarningsSkeleton } from '@/components/agent/AgentSkeletons';
import { Wallet, TrendingUp, Clock, ArrowDownCircle, ShoppingCart, Receipt } from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth, subMonths } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const AgentEarnings = () => {
  const { agent, wallet } = useAgent();
  const { storeStatus, loading: statusLoading } = useStoreStatus();
  const [orders, setOrders] = useState<any[]>([]);
  // True total order count — never capped by the row default
  const [totalOrdersCount, setTotalOrdersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agent) return;
    fetchData();
  }, [agent]);

  const fetchData = async () => {
    if (!agent) return;
    setLoading(true);
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from('agent_orders' as any)
        .select('profit_ghs, agent_selling_price, created_at, status, order_id, bundle_size_gb, customer_phone, network')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('agent_orders' as any)
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agent.id),
    ]);
    if (data) setOrders(data as any[]);
    setTotalOrdersCount(count || 0);
    setLoading(false);
  };

  const breakdown = useMemo(() => {
    const now = new Date();
    const delivered = orders.filter((o: any) => ['Delivered', 'Processing', 'Paid'].includes(o.status));
    const calcProfit = (list: any[]) => list.reduce((s, o) => s + Number(o.profit_ghs || 0), 0);

    const today = delivered.filter(o => new Date(o.created_at) >= startOfDay(now));
    const thisWeek = delivered.filter(o => new Date(o.created_at) >= startOfWeek(now, { weekStartsOn: 1 }));
    const thisMonth = delivered.filter(o => new Date(o.created_at) >= startOfMonth(now));
    const lastMonth = delivered.filter(o => {
      const d = new Date(o.created_at);
      return d >= startOfMonth(subMonths(now, 1)) && d < startOfMonth(now);
    });

    return [
      { label: 'Today', value: calcProfit(today) },
      { label: 'This Week', value: calcProfit(thisWeek) },
      { label: 'This Month', value: calcProfit(thisMonth) },
      { label: 'Last Month', value: calcProfit(lastMonth) },
    ];
  }, [orders]);

  const chartData = useMemo(() => {
    const delivered = orders.filter((o: any) => ['Delivered', 'Processing', 'Paid'].includes(o.status));
    const grouped: Record<string, number> = {};
    delivered.forEach((o: any) => {
      const date = format(new Date(o.created_at), 'dd MMM');
      grouped[date] = (grouped[date] || 0) + Number(o.profit_ghs || 0);
    });
    return Object.entries(grouped).reverse().slice(-14).map(([date, profit]) => ({
      date, profit: Number(profit.toFixed(2)),
    }));
  }, [orders]);

  const totalRevenue = useMemo(() => {
    return orders
      .filter((o: any) => ['Delivered', 'Processing', 'Paid'].includes(o.status))
      .reduce((s, o) => s + Number(o.agent_selling_price || 0), 0);
  }, [orders]);

  if (loading) return <AgentGate><AgentLayout><EarningsSkeleton /></AgentLayout></AgentGate>;

  const maskPhone = (p: string) => p?.length >= 6 ? p.substring(0, 3) + '***' + p.substring(p.length - 3) : p;

  return (
    <AgentGate>
    <AgentLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-bold">Earnings</h1>
          <p className="text-xs text-muted-foreground">Track your profit and revenue</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3">
          <KPICard label="Total Profit" value={`GHS ${(wallet?.total_earned || 0).toFixed(2)}`} icon={TrendingUp} delay={0} />
          <KPICard label="Available Balance" value={`GHS ${(wallet?.available_balance || 0).toFixed(2)}`} icon={Wallet} delay={50} />
          <KPICard label="Total Revenue" value={`GHS ${totalRevenue.toFixed(2)}`} icon={Receipt} delay={100} />
          <KPICard label="Total Orders" value={totalOrdersCount.toLocaleString('en-US')} icon={ShoppingCart} delay={150} />
        </div>

        {/* Profit Chart */}
        <Card className="card-shadow border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">Profit History</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                    formatter={(v: number) => [`GHS ${v.toFixed(2)}`, 'Profit']}
                  />
                  <Line type="monotone" dataKey="profit" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ fill: 'hsl(var(--primary))', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Earnings Breakdown */}
        <Card className="card-shadow border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">Earnings Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {breakdown.map((b) => (
                <div key={b.label} className="bg-muted/30 rounded-xl p-3">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{b.label}</p>
                  <p className="text-lg font-bold mt-0.5">GHS {b.value.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Profit Transactions */}
        <Card className="card-shadow border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">Profit Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {orders.filter(o => ['Delivered', 'Processing', 'Paid'].includes(o.status)).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No profit transactions yet</p>
            ) : (
              <div className="space-y-0.5 max-h-80 overflow-y-auto">
                {orders
                  .filter(o => ['Delivered', 'Processing', 'Paid'].includes(o.status))
                  .slice(0, 20)
                  .map((o: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{o.network} {o.bundle_size_gb}GB</p>
                        <p className="text-[10px] text-muted-foreground">
                          {maskPhone(o.customer_phone)} · {o.created_at ? format(new Date(o.created_at), 'dd MMM, HH:mm') : ''}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-success">+GHS {Number(o.profit_ghs).toFixed(2)}</span>
                    </div>
                  ))
                }
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AgentLayout>
    </AgentGate>
  );
};

export default AgentEarnings;
