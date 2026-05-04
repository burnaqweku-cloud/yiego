import { useState, useEffect, useMemo } from 'react';
import { useAgent } from '@/hooks/useAgent';
import { supabase } from '@/integrations/supabase/client';
import AgentLayout from './AgentLayout';
import AgentGate from '@/components/agent/AgentGate';
import KPICard from '@/components/agent/KPICard';
import AgentCharts from '@/components/agent/AgentCharts';
import StoreHealthCard from '@/components/agent/StoreHealthCard';
import QuickActions from '@/components/agent/QuickActions';
import RecentOrdersList from '@/components/agent/RecentOrdersList';
import AgentWhatsAppChannelBanner from '@/components/agent/AgentWhatsAppChannelBanner';
import AgentDeliveryPanel from '@/components/agent/AgentDeliveryPanel';
import { useAgentSubscriptionState } from '@/hooks/useAgentSubscriptionState';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Timer, CheckCircle, AlertTriangle, CreditCard } from 'lucide-react';
import AgentSupportCard from '@/components/agent/AgentSupportCard';
import { DashboardSkeleton } from '@/components/agent/AgentSkeletons';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ShoppingCart, Clock, TrendingUp, Wallet, ArrowDownCircle, Store, Package, History
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PAID_STATUSES = ['Delivered', 'Processing', 'Paid'];

const AgentDashboard = () => {
  const { agent, wallet } = useAgent();
  const navigate = useNavigate();
  const { displayState, daysRemaining } = useAgentSubscriptionState();
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agent) return;
    fetchAllData();
  }, [agent]);

  const fetchAllData = async () => {
    if (!agent) return;
    setLoading(true);
    const { data: orders } = await supabase
      .from('agent_orders' as any)
      .select('id, order_id, agent_selling_price, profit_ghs, status, payment_status, customer_phone, network, bundle_size_gb, created_at')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false });
    if (orders) setAllOrders(orders);
    setLoading(false);
  };

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const paidOrders = allOrders.filter((o: any) =>
      PAID_STATUSES.includes(o.status) || o.payment_status === 'paid'
    );
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const lastWeekOrders = paidOrders.filter((o: any) => new Date(o.created_at) >= weekAgo);
    const twoWeeksAgo = new Date(); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const prevWeekOrders = paidOrders.filter((o: any) => {
      const d = new Date(o.created_at);
      return d >= twoWeeksAgo && d < weekAgo;
    });
    const weeklyGrowth = prevWeekOrders.length > 0
      ? Math.round(((lastWeekOrders.length - prevWeekOrders.length) / prevWeekOrders.length) * 100)
      : lastWeekOrders.length > 0 ? 100 : 0;

    return {
      totalOrders: paidOrders.length,
      todayOrders: paidOrders.filter((o: any) => o.created_at?.startsWith(today)).length,
      totalRevenue: paidOrders.reduce((s: number, o: any) => s + Number(o.agent_selling_price || 0), 0),
      totalProfit: paidOrders.reduce((s: number, o: any) => s + Number(o.profit_ghs || 0), 0),
      weeklyGrowth,
    };
  }, [allOrders]);

  const uniqueCustomers = useMemo(() => {
    const paidOrders = allOrders.filter((o: any) =>
      PAID_STATUSES.includes(o.status) || o.payment_status === 'paid'
    );
    return new Set(paidOrders.map((o: any) => o.customer_phone)).size;
  }, [allOrders]);

  const recentPaidOrders = useMemo(() =>
    allOrders
      .filter((o: any) => PAID_STATUSES.includes(o.status) || o.payment_status === 'paid')
      .slice(0, 5),
    [allOrders]
  );

  const paidOrdersForCharts = useMemo(() =>
    allOrders.filter((o: any) => PAID_STATUSES.includes(o.status) || o.payment_status === 'paid'),
    [allOrders]
  );

  return (
    <AgentGate>
      <AgentLayout>
        {loading ? <DashboardSkeleton /> : (
          <div className="space-y-6">
            {/* Hero header — store identity + status */}
            <div className="relative overflow-hidden rounded-[1.75rem] border border-border bg-gradient-to-br from-card via-card to-primary/8 p-5 md:p-6">
              <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
              <div className="relative flex flex-col md:flex-row md:items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center shrink-0 overflow-hidden">
                  {agent?.store_logo_url ? (
                    <img src={agent.store_logo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Store className="w-7 h-7 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80">Reseller control center</p>
                  <h1 className="text-xl md:text-2xl font-display font-extrabold tracking-tight truncate">{agent?.store_name}</h1>
                  <p className="text-xs text-muted-foreground mt-1">Manage orders, profits, customers & store health.</p>
                </div>
                {displayState === 'active' && (
                  <Badge variant="outline" className="text-[10px] text-success border-success/30 gap-1 self-start md:self-center">
                    <CheckCircle className="w-2.5 h-2.5" /> {daysRemaining}d left
                  </Badge>
                )}
              </div>
            </div>

            {/* Subscription alert (if not active) */}
            {(displayState === 'expiring_soon' || displayState === 'grace_period' || displayState === 'expired_promo_window' || displayState === 'expired_standard') && (
              <Card className={`overflow-hidden border ${
                displayState === 'expired_promo_window' || displayState === 'expired_standard'
                  ? 'border-destructive/30 bg-destructive/5'
                  : 'border-amber-500/30 bg-amber-500/5'
              }`}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    displayState === 'expired_promo_window' || displayState === 'expired_standard' ? 'bg-destructive/15' : 'bg-amber-500/15'
                  }`}>
                    {displayState === 'expired_promo_window' || displayState === 'expired_standard'
                      ? <AlertTriangle className="w-4 h-4 text-destructive" />
                      : <Timer className="w-4 h-4 text-amber-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">
                      {displayState === 'expiring_soon' && `Subscription expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`}
                      {displayState === 'grace_period' && 'Grace period — renew now to stay active'}
                      {(displayState === 'expired_promo_window' || displayState === 'expired_standard') && 'Subscription expired — store is inactive'}
                    </p>
                  </div>
                  <Link to="/agent/subscription">
                    <Button size="sm" className="rounded-full text-xs gap-1 h-9">
                      <CreditCard className="w-3.5 h-3.5" /> Renew
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* KPI bento — 4 prominent + 2 secondary */}
            <div className="grid grid-cols-2 lg:grid-cols-12 gap-3">
              <div className="lg:col-span-3"><KPICard label="Total Profit" value={`GHS ${stats.totalProfit.toFixed(2)}`} icon={TrendingUp} delay={0} /></div>
              <div className="lg:col-span-3"><KPICard label="Available Balance" value={`GHS ${(wallet?.available_balance || 0).toFixed(2)}`} icon={Wallet} delay={50} /></div>
              <div className="lg:col-span-3"><KPICard label="Total Orders" value={stats.totalOrders} icon={ShoppingCart} delay={100} trend={stats.weeklyGrowth !== 0 ? `${stats.weeklyGrowth > 0 ? '+' : ''}${stats.weeklyGrowth}%` : undefined} trendUp={stats.weeklyGrowth > 0} /></div>
              <div className="lg:col-span-3"><KPICard label="Orders Today" value={stats.todayOrders} icon={Clock} delay={150} /></div>
              <div className="col-span-2 lg:col-span-6"><KPICard label="Total Revenue" value={`GHS ${stats.totalRevenue.toFixed(2)}`} icon={TrendingUp} delay={200} /></div>
              <div className="col-span-2 lg:col-span-6"><KPICard label="Total Withdrawn" value={`GHS ${(wallet?.total_withdrawn || 0).toFixed(2)}`} icon={ArrowDownCircle} delay={250} /></div>
            </div>

            {/* Bulk Orders feature row */}
            <Card className="relative overflow-hidden border border-primary/25 bg-gradient-to-br from-primary/12 via-card to-card">
              <div className="absolute -top-16 -right-16 w-44 h-44 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
              <CardContent className="p-5 relative grid md:grid-cols-[1fr_auto] gap-4 items-center">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-display font-bold tracking-tight">Bulk Orders</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Buy at agent price · No commission · Your markup is your profit.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="rounded-full text-xs h-9 px-4" onClick={() => navigate('/agent/bulk-purchase')}>Open Bulk Orders</Button>
                  <Button variant="outline" size="sm" className="rounded-full gap-1 text-xs h-9 px-4" onClick={() => navigate('/agent/bulk-orders')}>
                    <History className="w-3 h-3" /> History
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Live delivery + WhatsApp banner side by side on large */}
            <div className="grid lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7"><AgentDeliveryPanel /></div>
              <div className="lg:col-span-5"><AgentWhatsAppChannelBanner /></div>
            </div>

            {/* Quick actions */}
            <QuickActions />

            {/* Charts */}
            <AgentCharts orders={paidOrdersForCharts} />

            {/* Store health + recent orders */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <StoreHealthCard totalOrders={stats.totalOrders} totalCustomers={uniqueCustomers} />
              <RecentOrdersList orders={recentPaidOrders} />
            </div>

            <AgentSupportCard />

            <p className="text-[10px] text-muted-foreground/40 text-center pt-2 pb-1 select-all">Build: 2026-02-14T12:00</p>
          </div>
        )}
      </AgentLayout>
    </AgentGate>
  );
};

export default AgentDashboard;
