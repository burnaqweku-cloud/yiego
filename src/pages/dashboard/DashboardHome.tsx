import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { getFirstName, getInitials } from '@/lib/user-display';
import { Smartphone, Plus, PackageSearch, LayoutGrid, ArrowRight } from 'lucide-react';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const QUICK_ACTIONS = [
  { to: '/dashboard/buy', icon: Smartphone, label: 'Buy data', desc: 'Pick a bundle', tone: 'primary' as const },
  { to: '/dashboard/wallet', icon: Plus, label: 'Fund wallet', desc: 'Top up balance', tone: 'emerald' as const },
  { to: '/track-order', icon: PackageSearch, label: 'Track order', desc: 'Live status', tone: 'sky' as const },
  { to: '/dashboard/services', icon: LayoutGrid, label: 'All services', desc: 'Browse the hub', tone: 'amber' as const },
];

const toneTile: Record<string, string> = {
  primary: 'bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/25',
  emerald: 'bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-500 ring-1 ring-emerald-500/25',
  sky: 'bg-gradient-to-br from-sky-500/20 to-sky-500/5 text-sky-500 ring-1 ring-sky-500/25',
  amber: 'bg-gradient-to-br from-amber-500/20 to-amber-500/5 text-amber-500 ring-1 ring-amber-500/25',
};

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

  const firstName = getFirstName(profile, user);
  const initials = getInitials(profile, user);
  const hasName = firstName && firstName !== 'there';

  return (
    <DashboardLayout>
      <SEOHead
        title="Dashboard | YieGo"
        description="Manage your wallet, services, and orders from one place."
        path="/dashboard"
        noIndex
      />

      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-24 md:pb-8 max-w-6xl mx-auto space-y-5">
        <SiteNoticeBanner />

        {/* ── Greeting card ── */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-[hsl(var(--brand-glow))] text-primary-foreground font-display font-extrabold text-[15px] tracking-tight flex items-center justify-center shadow-[0_8px_20px_-6px_hsl(var(--primary)/0.5)] ring-1 ring-white/20">
              {initials}
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-success border-2 border-background" />
            </div>
            <div className="min-w-0">
              <p className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground font-bold">
                {getGreeting()}{hasName ? ',' : ''}
              </p>
              <h1 className="text-lg sm:text-xl font-display font-extrabold tracking-[-0.02em] truncate">
                {hasName ? firstName : 'Welcome'}
              </h1>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/60 bg-card/60 backdrop-blur-sm">
              <span className="text-[10.5px] font-medium text-muted-foreground tabular">
                {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-card/60 backdrop-blur-sm">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-60" />
                <span className="relative w-1.5 h-1.5 rounded-full bg-success" />
              </span>
              <span className="text-[10.5px] font-medium text-muted-foreground">All systems online</span>
            </span>
          </div>
        </header>

        {/* ── Wallet hero (full width, dramatic) ── */}
        <WalletHeroPanel
          balance={wallet?.balance_ghs || 0}
          totalOrders={totalOrdersCount}
          totalSpent={totalSpentAll}
          loading={walletLoading}
          ordersLoading={ordersLoading || totalsLoading}
        />

        {/* ── Quick actions strip ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
              <h2 className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-primary">Quick actions</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
            {QUICK_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.label}
                  to={a.to}
                  className="group relative overflow-hidden rounded-2xl glass-card p-3.5 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_18px_40px_-18px_hsl(var(--primary)/0.35)] transition-all duration-300 active:scale-[0.98]"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toneTile[a.tone]} shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.25)] group-hover:scale-105 transition-transform duration-300`}>
                      <Icon className="w-[18px] h-[18px]" strokeWidth={1.9} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold leading-tight truncate tracking-tight">{a.label}</p>
                      <p className="text-[10.5px] text-muted-foreground leading-tight truncate mt-0.5">{a.desc}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── Services hub ── */}
        <ServiceHubGrid />

        {/* ── Orders + activity ── */}
        <div className="grid lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7">
            <DashboardRecentOrders orders={orders} loading={ordersLoading} />
          </div>
          <div className="lg:col-span-5">
            <RecentActivityCard />
          </div>
        </div>

        <div aria-hidden className="h-4 md:h-2" />
      </div>
    </DashboardLayout>
  );
};

export default DashboardHome;
