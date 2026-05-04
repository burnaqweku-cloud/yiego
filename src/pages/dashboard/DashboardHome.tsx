import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useIsActiveAgent } from '@/hooks/useIsActiveAgent';
import DashboardGreetingCard from '@/components/dashboard/DashboardGreetingCard';
import DashboardSystemStatus from '@/components/dashboard/DashboardSystemStatus';
import DashboardQuickActions from '@/components/dashboard/DashboardQuickActions';
import DashboardAgentCard from '@/components/dashboard/DashboardAgentCard';
import DashboardWalletCard from '@/components/dashboard/DashboardWalletCard';
import DashboardRewardsCard from '@/components/dashboard/DashboardRewardsCard';
import DashboardStats from '@/components/dashboard/DashboardStats';
import DashboardNetworkCards from '@/components/dashboard/DashboardNetworkCards';
import DashboardRecentOrders from '@/components/dashboard/DashboardRecentOrders';
import DashboardSupportCard from '@/components/dashboard/DashboardSupportCard';
import { useGlobalSystemStatus } from '@/contexts/SystemStatusContext';
import { useUserOrders } from '@/hooks/useUserOrders';
import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/hooks/useAuth';
import SEOHead from '@/components/seo/SEOHead';
import SiteNoticeBanner from '@/components/layout/SiteNoticeBanner';
import ReferralLaunchModal from '@/components/dashboard/ReferralLaunchModal';
import { getExactCount, sumColumn } from '@/lib/db-counts';
import { Smartphone, Receipt, Gift, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const SERVICE_TILES = [
  { to: '/buy-data', icon: Smartphone, label: 'Data', live: true },
  { to: '/dashboard', icon: Sparkles, label: 'Airtime' },
  { to: '/dashboard', icon: Receipt, label: 'Bills' },
  { to: '/dashboard', icon: Gift, label: 'Gift Cards' },
];

const DashboardHome = () => {
  const { user, profile } = useAuth();
  const { isLiveActiveAgent } = useIsActiveAgent();
  const { status, loading: statusLoading } = useGlobalSystemStatus();
  const { orders, loading: ordersLoading } = useUserOrders();
  const { wallet, loading: walletLoading } = useWallet();

  const [totalsLoading, setTotalsLoading] = useState(true);
  const [totalOrdersCount, setTotalOrdersCount] = useState(0);
  const [totalSpentAll, setTotalSpentAll] = useState(0);

  useEffect(() => {
    if (!user) { setTotalsLoading(false); return; }
    let cancelled = false;
    (async () => {
      setTotalsLoading(true);
      const [count, spent] = await Promise.all([
        getExactCount('orders', (q) => q.eq('user_id', user.id).neq('order_source', 'admin_bulk')),
        sumColumn('orders', 'amount_ghs', (q) => q.eq('user_id', user.id).eq('status', 'Delivered').neq('order_source', 'admin_bulk')),
      ]);
      if (!cancelled) {
        setTotalOrdersCount(count);
        setTotalSpentAll(spent);
        setTotalsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, orders.length]);

  return (
    <DashboardLayout>
      <ReferralLaunchModal />
      <SEOHead title="Dashboard | YieGo" description="Manage your wallet, services, and orders." path="/dashboard" noIndex />

      <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
        <SiteNoticeBanner />

        {/* Top row — greeting + status badge */}
        <div className="grid lg:grid-cols-[1fr_auto] gap-4 items-start dash-section dash-stagger-1">
          <DashboardGreetingCard name={profile?.full_name || ''} isAgent={isLiveActiveAgent} />
          <div className="lg:min-w-[280px]">
            <DashboardSystemStatus status={status} loading={statusLoading} />
          </div>
        </div>

        {/* Bento: wallet (large) + service hub */}
        <div className="grid lg:grid-cols-12 gap-4 dash-section dash-stagger-2">
          <div className="lg:col-span-7">
            <DashboardWalletCard
              balance={wallet?.balance_ghs || 0}
              totalOrders={totalOrdersCount}
              totalSpent={totalSpentAll}
              loading={walletLoading}
              ordersLoading={ordersLoading || totalsLoading}
            />
          </div>
          <div className="lg:col-span-5">
            <div className="rounded-3xl border border-border bg-card p-5 h-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold text-base">Service Hub</h3>
                <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/70">Multi-service</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {SERVICE_TILES.map((s) => (
                  <Link
                    key={s.label}
                    to={s.to}
                    className="relative p-4 rounded-2xl border border-border/60 bg-background/60 hover:border-primary/40 transition-all group active:scale-[0.97]"
                  >
                    {s.live && <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-success animate-pulse" />}
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                      <s.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-sm font-semibold">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{s.live ? 'Available' : 'Soon'}</div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Quick actions strip */}
        <div className="dash-section dash-stagger-3">
          <DashboardQuickActions />
        </div>

        {/* Stats + Rewards */}
        <div className="grid lg:grid-cols-12 gap-4 dash-section dash-stagger-4">
          <div className="lg:col-span-8">
            <DashboardStats orders={orders} loading={ordersLoading} />
          </div>
          <div className="lg:col-span-4">
            <DashboardRewardsCard />
          </div>
        </div>

        {/* Place an order — networks */}
        <div className="dash-section dash-stagger-5">
          <DashboardNetworkCards />
        </div>

        {/* Agent + Recent orders side by side on large */}
        <div className="grid lg:grid-cols-12 gap-4 dash-section dash-stagger-6">
          <div className="lg:col-span-5">
            <DashboardAgentCard />
          </div>
          <div className="lg:col-span-7">
            <DashboardRecentOrders orders={orders} loading={ordersLoading} />
          </div>
        </div>

        {/* Support */}
        <div className="dash-section dash-stagger-7">
          <DashboardSupportCard />
        </div>

        <div aria-hidden className="h-24 md:h-6" />
      </div>
    </DashboardLayout>
  );
};

export default DashboardHome;
