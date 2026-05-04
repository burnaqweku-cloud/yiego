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
          <div className="space-y-5">
            {/* Welcome Header */}
            <div className="surface-premium rounded-2xl p-4 flex items-center gap-3 animate-hero-in">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)]">
                {agent?.store_logo_url ? (
                  <img src={agent.store_logo_url} alt="" className="w-12 h-12 rounded-2xl object-cover" />
                ) : (
                  <Store className="w-5 h-5 text-primary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-base font-bold tracking-tight truncate">Welcome back, {agent?.store_name}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Here's your store performance overview</p>
              </div>
            </div>

            {/* WhatsApp Channel Banner */}
            <AgentWhatsAppChannelBanner />

            {/* Live Delivery Activity Panel */}
            <AgentDeliveryPanel />

            {/* Compact Subscription Widget */}
            {(displayState === 'expiring_soon' || displayState === 'grace_period' || displayState === 'expired_promo_window' || displayState === 'expired_standard') ? (
              <Card className={`card-shadow overflow-hidden ${
                displayState === 'expired_promo_window' || displayState === 'expired_standard'
                  ? 'border-destructive/20'
                  : 'border-amber-500/20'
              }`}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    displayState === 'expired_promo_window' || displayState === 'expired_standard'
                      ? 'bg-destructive/10'
                      : 'bg-amber-500/10'
                  }`}>
                    {displayState === 'expired_promo_window' || displayState === 'expired_standard'
                      ? <AlertTriangle className="w-4 h-4 text-destructive" />
                      : <Timer className="w-4 h-4 text-amber-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold">
                      {displayState === 'expiring_soon' && `Subscription expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`}
                      {displayState === 'grace_period' && 'Grace period — renew now to stay active'}
                      {(displayState === 'expired_promo_window' || displayState === 'expired_standard') && 'Subscription expired — store is inactive'}
                    </p>
                  </div>
                  <Link to="/agent/subscription" className="shrink-0">
                    <Button size="sm" variant="outline" className="text-xs gap-1 h-7">
                      <CreditCard className="w-3 h-3" /> Manage
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : displayState === 'active' ? (
              <div className="flex items-center gap-2 px-1">
                <Badge variant="outline" className="text-[10px] text-success border-success/30 gap-1">
                  <CheckCircle className="w-2.5 h-2.5" /> {daysRemaining} days remaining
                </Badge>
                <Link to="/agent/subscription" className="text-[10px] text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline">
                  Manage subscription
                </Link>
              </div>
            ) : null}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <KPICard label="Total Orders (paid)" value={stats.totalOrders} icon={ShoppingCart} delay={0} trend={stats.weeklyGrowth !== 0 ? `${stats.weeklyGrowth > 0 ? '+' : ''}${stats.weeklyGrowth}%` : undefined} trendUp={stats.weeklyGrowth > 0} />
              <KPICard label="Orders Today" value={stats.todayOrders} icon={Clock} delay={50} />
              <KPICard label="Total Revenue" value={`GHS ${stats.totalRevenue.toFixed(2)}`} icon={TrendingUp} delay={100} />
              <KPICard label="Total Profit" value={`GHS ${stats.totalProfit.toFixed(2)}`} icon={TrendingUp} delay={150} />
              <KPICard label="Available Balance" value={`GHS ${(wallet?.available_balance || 0).toFixed(2)}`} icon={Wallet} delay={200} />
              <KPICard label="Total Withdrawn" value={`GHS ${(wallet?.total_withdrawn || 0).toFixed(2)}`} icon={ArrowDownCircle} delay={250} />
            </div>

            {/* Bulk Orders Card */}
            <Card className="surface-gold-glass border-0 overflow-hidden relative">
              <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
              <CardContent className="p-4 space-y-3 relative">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center shadow-[inset_0_1px_0_hsl(0_0%_100%/0.08)]">
                    <Package className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold tracking-tight">Bulk Orders</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Buy at agent price · No commission · Your markup is your profit</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 text-xs h-9" onClick={() => navigate('/agent/bulk-purchase')}>
                    Open Bulk Orders
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 text-xs h-9" onClick={() => navigate('/agent/bulk-orders')}>
                    <History className="w-3 h-3" /> History
                  </Button>
                </div>
              </CardContent>
            </Card>

            <QuickActions />
            <AgentCharts orders={paidOrdersForCharts} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <StoreHealthCard totalOrders={stats.totalOrders} totalCustomers={uniqueCustomers} />
              <RecentOrdersList orders={recentPaidOrders} />
            </div>

            {/* Support Card */}
            <AgentSupportCard />

            {/* Build verification marker */}
            <p className="text-[10px] text-muted-foreground/40 text-center pt-2 pb-1 select-all">
              Build: 2026-02-14T12:00
            </p>
          </div>
        )}
      </AgentLayout>
    </AgentGate>
  );
};

export default AgentDashboard;
