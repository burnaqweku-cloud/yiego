import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useIsActiveAgent } from '@/hooks/useIsActiveAgent';
import DashboardGreetingCard from '@/components/dashboard/DashboardGreetingCard';
import DashboardSystemStatus from '@/components/dashboard/DashboardSystemStatus';
// Referral card temporarily hidden — keep import commented for easy restore
// import DashboardReferralCard from '@/components/dashboard/DashboardReferralCard';
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
import { supabase } from '@/integrations/supabase/client';
import { getExactCount, sumColumn } from '@/lib/db-counts';

const DashboardHome = () => {
  const { user, profile } = useAuth();
  const { isLiveActiveAgent } = useIsActiveAgent();
  const { status, loading: statusLoading } = useGlobalSystemStatus();
  const { orders, loading: ordersLoading } = useUserOrders();
  const { wallet, loading: walletLoading } = useWallet();

  // True totals for this user — independent of the recent orders list size.
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
    // Refresh totals when the live order list changes (insert/update)
  }, [user, orders.length]);

  const totalSpent = totalSpentAll;

  return (
    <DashboardLayout>
      <ReferralLaunchModal />
      <SiteNoticeBanner />
      <SEOHead
        title="Dashboard | DataSika"
        description="Manage your data orders, wallet, and account from your DataSika dashboard."
        path="/dashboard"
        noIndex
      />
      <div className="p-4 md:p-6 space-y-4 max-w-4xl">
        {/* Greeting */}
        <div className="dash-section dash-stagger-1">
          <DashboardGreetingCard name={profile?.full_name || ''} isAgent={isLiveActiveAgent} />
        </div>

        {/* System Status */}
        <div className="dash-section dash-stagger-2">
          <DashboardSystemStatus status={status} loading={statusLoading} />
        </div>

        {/* Referral Card — temporarily hidden. Restore by uncommenting below. */}
        {/* <div className="dash-section dash-stagger-3">
          <DashboardReferralCard />
        </div> */}

        {/* Quick Actions */}
        <div className="dash-section dash-stagger-3">
          <DashboardQuickActions />
        </div>

        {/* Wallet */}
        <div className="dash-section dash-stagger-4">
          <DashboardWalletCard
            balance={wallet?.balance_ghs || 0}
            totalOrders={totalOrdersCount}
            totalSpent={totalSpent}
            loading={walletLoading}
            ordersLoading={ordersLoading || totalsLoading}
          />
        </div>

        {/* Rewards — paired tightly with Wallet */}
        <div className="dash-section dash-stagger-5">
          <DashboardRewardsCard />
        </div>

        {/* Performance Stats */}
        <div className="dash-section dash-stagger-5">
          <DashboardStats orders={orders} loading={ordersLoading} />
        </div>

        {/* Place New Order */}
        <div className="dash-section dash-stagger-6">
          <DashboardNetworkCards />
        </div>

        {/* Agent Store — directly below Place New Order */}
        <div className="dash-section dash-stagger-7">
          <DashboardAgentCard />
        </div>

        {/* Recent Orders — after Agent Store */}
        <div className="dash-section dash-stagger-8">
          <DashboardRecentOrders orders={orders} loading={ordersLoading} />
        </div>

        {/* WhatsApp Support */}
        <div className="dash-section dash-stagger-9">
          <DashboardSupportCard />
        </div>

        {/* Bottom breathing space so the last card clears the floating support icons */}
        <div aria-hidden className="h-24 md:h-6" />
      </div>
    </DashboardLayout>
  );
};

export default DashboardHome;
