import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import WalletHeroPanel from '@/components/dashboard/WalletHeroPanel';
import ServiceHubGrid from '@/components/dashboard/ServiceHubGrid';
import DashboardRecentOrders from '@/components/dashboard/DashboardRecentOrders';
import RecentActivityCard from '@/components/dashboard/RecentActivityCard';
import { useUserOrders } from '@/hooks/useUserOrders';
import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/hooks/useAuth';
import SEOHead from '@/components/seo/SEOHead';
import SiteNoticeBanner from '@/components/layout/SiteNoticeBanner';
import { getExactCount, sumColumn } from '@/lib/db-counts';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const DashboardHome = () => {
  const { user, profile } = useAuth();
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

  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  return (
    <DashboardLayout>
      <SEOHead
        title="Dashboard | YieGo"
        description="Manage your wallet, services, and orders from one place."
        path="/dashboard"
        noIndex
      />

      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-6 max-w-6xl mx-auto space-y-4 sm:space-y-5">
        <SiteNoticeBanner />

        {/* Header */}
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-bold">
              {getGreeting()}
            </p>
            <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight truncate">
              {firstName} 👋
            </h1>
            <p className="text-[12px] sm:text-[13px] text-muted-foreground mt-0.5 leading-snug">
              Manage your wallet, services, and orders from one place.
            </p>
          </div>
        </header>

        {/* Hero grid: wallet + services */}
        <div className="grid lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5">
            <WalletHeroPanel
              balance={wallet?.balance_ghs || 0}
              totalOrders={totalOrdersCount}
              totalSpent={totalSpentAll}
              loading={walletLoading}
              ordersLoading={ordersLoading || totalsLoading}
            />
          </div>
          <div className="lg:col-span-7">
            <ServiceHubGrid />
          </div>
        </div>

        {/* Orders + activity */}
        <div className="grid lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7">
            <DashboardRecentOrders orders={orders} loading={ordersLoading} />
          </div>
          <div className="lg:col-span-5">
            <RecentActivityCard />
          </div>
        </div>

        <div aria-hidden className="h-20 md:h-2" />
      </div>
    </DashboardLayout>
  );
};

export default DashboardHome;
