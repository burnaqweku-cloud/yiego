import { ReactNode, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Users, Wallet, Package, Percent,
  Zap, Bell, Activity, Settings, ScrollText, LifeBuoy, Menu, X,
  ArrowLeft, Search, BarChart3, TestTube, CreditCard, MessageSquare, Download, CheckCircle2, Smartphone, WrenchIcon, Gift, ShieldAlert, Phone, Shield, DollarSign, PieChart, HeadphonesIcon, Layers, Bot, Sparkles
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import AdminSearchDialog from '@/components/admin/AdminSearchDialog';
import Logo from '@/components/layout/Logo';
import AnimatedBackground from '@/components/layout/AnimatedBackground';
import PageTransition from '@/components/layout/PageTransition';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  exact?: boolean;
  adminOnly?: boolean; // hidden from staff
  badge?: string;
}

const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true },
      { to: '/admin/ai-monitor', icon: Bot, label: 'AI Monitor', adminOnly: true },
      { to: '/admin/ai-cases', icon: HeadphonesIcon, label: 'AI Tickets', adminOnly: true },
      { to: '/admin/manager-review', icon: ShieldAlert, label: 'Manager Review' },
      { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
      { to: '/admin/pwa-users', icon: Smartphone, label: 'Home Screen Users', adminOnly: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/admin/orders', icon: ShoppingCart, label: 'Orders' },
      { to: '/admin/bulk-orders', icon: Layers, label: 'Bulk Orders', adminOnly: true },
      { to: '/admin/users', icon: Users, label: 'Users' },
      { to: '/admin/wallet', icon: Wallet, label: 'Wallet & Deposits' },
      { to: '/admin/deposits', icon: Download, label: 'Deposits' },
      { to: '/admin/transactions', icon: CreditCard, label: 'Transactions' },
      { to: '/admin/finance-overview', icon: PieChart, label: 'Finance Overview', adminOnly: true },
      { to: '/admin/finance-ledger', icon: DollarSign, label: 'Finance Ledger', adminOnly: true },
      { to: '/admin/finance', icon: CreditCard, label: 'Finance & Paystack' },
      { to: '/admin/reconciliation', icon: Shield, label: 'Reconciliation', adminOnly: true },
      { to: '/admin/payment-intents', icon: Shield, label: 'Payment Intents', adminOnly: true },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { to: '/admin/products', icon: Package, label: 'Products', adminOnly: true },
      { to: '/admin/pricing', icon: Percent, label: 'Pricing', adminOnly: true },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin/suppliers', icon: Zap, label: 'Suppliers', adminOnly: true },
      { to: '/admin/routing', icon: Zap, label: 'Supplier Routing', adminOnly: true },
      { to: '/admin/supplier', icon: Zap, label: 'Supplier Logs', adminOnly: true },
      { to: '/admin/supplier-c-earnings', icon: DollarSign, label: 'Supplier C Earnings', adminOnly: true },
      { to: '/admin/sms-settings', icon: MessageSquare, label: 'SMS Settings', adminOnly: true },
      { to: '/admin/delivery-tracker-control', icon: Activity, label: 'Delivery Tracker', adminOnly: true },
      { to: '/admin/bulk-dispatch', icon: Layers, label: 'Bulk Dispatch Queue', adminOnly: true },
      { to: '/admin/delivery-checkpoints', icon: CheckCircle2, label: 'Delivery Checkpoints', adminOnly: true },
      { to: '/admin/order-diagnostics', icon: CheckCircle2, label: 'Order Diagnostics', adminOnly: true },
      { to: '/admin/notices', icon: Bell, label: 'Service Notices' },
      { to: '/admin/banners', icon: Sparkles, label: 'Banner Campaigns', adminOnly: true },
      { to: '/admin/system-status', icon: Activity, label: 'System Status' },
      { to: '/admin/integration-test', icon: TestTube, label: 'Integration Test', adminOnly: true },
    ],
  },
  {
    label: 'Agents',
    items: [
      { to: '/admin/agents', icon: LayoutDashboard, label: 'Agent Overview', exact: true },
      { to: '/admin/agents/applications', icon: ScrollText, label: 'Applications' },
      // Agent Directory hidden — superseded by Agent Overview + Active Agents views.
      // Route still works at /admin/agents/list for direct access. Restore by uncommenting:
      // { to: '/admin/agents/list', icon: Users, label: 'Agent Directory' },
      { to: '/admin/agents/withdrawals', icon: Wallet, label: 'Withdrawals', adminOnly: true },
      { to: '/admin/agents/activity', icon: Activity, label: 'Activity & Fraud' },
      { to: '/admin/agents/profit-diagnostics', icon: Activity, label: 'Profit Diagnostics', adminOnly: true },
    ],
  },
  {
    label: 'Content & SEO',
    items: [
      { to: '/admin/blog', icon: ScrollText, label: 'Blog Posts', adminOnly: true },
      { to: '/admin/seo', icon: BarChart3, label: 'SEO Tools', adminOnly: true },
    ],
  },
  {
    label: 'Telegram Bot',
    items: [
      { to: '/admin/tg', icon: LayoutDashboard, label: 'Dashboard', exact: true, adminOnly: true },
      { to: '/admin/tg/users', icon: Users, label: 'Users', adminOnly: true },
      { to: '/admin/tg/orders', icon: ShoppingCart, label: 'Orders', adminOnly: true },
      { to: '/admin/tg/deposits', icon: Download, label: 'Deposits', adminOnly: true },
      { to: '/admin/tg/points', icon: Sparkles, label: 'Points', adminOnly: true },
      { to: '/admin/tg/referrals', icon: Bell, label: 'Referrals', adminOnly: true },
      { to: '/admin/tg/checkins', icon: CheckCircle2, label: 'Check-ins', adminOnly: true },
      { to: '/admin/tg/redemptions', icon: Gift, label: 'Redemptions', adminOnly: true },
      { to: '/admin/tg/support', icon: LifeBuoy, label: 'Support Tickets', adminOnly: true },
      { to: '/admin/tg/broadcasts', icon: MessageSquare, label: 'Broadcasts', adminOnly: true },
      { to: '/admin/tg/promotions', icon: Percent, label: 'Promotions', adminOnly: true },
      { to: '/admin/tg/health', icon: Activity, label: 'Bot Health', adminOnly: true },
      { to: '/admin/tg/configuration', icon: Settings, label: 'Configuration', adminOnly: true },
      { to: '/admin/tg/audit', icon: ScrollText, label: 'Audit Log', adminOnly: true },
      { to: '/admin/tg/reports', icon: BarChart3, label: 'Reports', adminOnly: true },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/admin/support-tickets', icon: LifeBuoy, label: 'Support Tickets' },
      { to: '/admin/support-center', icon: MessageSquare, label: 'Support Center' },
      { to: '/admin/referral', icon: Bell, label: 'Referral Campaign', adminOnly: true },
      { to: '/admin/reward-claims', icon: Gift, label: 'Reward Claims', adminOnly: true },
      { to: '/admin/leaderboard-rewards', icon: Gift, label: 'Leaderboard Rewards', adminOnly: true },
      { to: '/admin/loyalty', icon: Sparkles, label: 'Loyalty & Rewards', adminOnly: true },
      { to: '/admin/telegram-points', icon: Sparkles, label: 'Telegram Points', adminOnly: true },
      { to: '/admin/referral-review', icon: ShieldAlert, label: 'Referral Review', adminOnly: true },
      { to: '/admin/phone-cleanup', icon: Phone, label: 'Phone Cleanup', adminOnly: true },
      { to: '/admin/security', icon: Shield, label: 'Security Controls', adminOnly: true },
      { to: '/admin/network-availability', icon: Smartphone, label: 'Network Availability', adminOnly: true },
      { to: '/admin/maintenance', icon: WrenchIcon, label: 'Maintenance Mode', adminOnly: true },
      { to: '/admin/notifications', icon: Bell, label: 'Notifications & Push', adminOnly: true },
      { to: '/admin/settings', icon: Settings, label: 'Settings', adminOnly: true },
      { to: '/admin/roles', icon: Shield, label: 'Members & Roles', adminOnly: true },
      { to: '/admin/audit-logs', icon: ScrollText, label: 'Audit Logs', adminOnly: true },
    ],
  },
];

interface AdminLayoutProps {
  children: ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const { isAdmin, profile, userRole } = useAuth();

  const filteredGroups = useMemo(() => {
    if (isAdmin) return navGroups;
    // Staff: filter out adminOnly items and groups that become empty
    return navGroups
      .map(group => ({
        ...group,
        items: group.items.filter(item => !item.adminOnly),
      }))
      .filter(group => group.items.length > 0);
  }, [isAdmin]);

  const isActive = (path: string, exact?: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen bg-background flex relative">
      <AnimatedBackground />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/50 z-40 lg:hidden" onClick={closeSidebar} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col transition-transform duration-300 ease-out lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0">
          <Link to="/admin" className="flex items-center" onClick={closeSidebar}>
            <Logo height="h-8" />
          </Link>
          <button onClick={closeSidebar} className="lg:hidden p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role badge */}
        <div className="px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">
                {(profile?.full_name || 'A')[0].toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{profile?.full_name || 'Admin'}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{userRole || 'admin'}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2">
          {filteredGroups.map((group) => (
            <div key={group.label} className="mb-1">
              <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </p>
              <div className="px-2 space-y-0.5">
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={closeSidebar}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150 ${
                      isActive(item.to, item.exact)
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`}
                  >
                    <item.icon className={`w-4 h-4 shrink-0 ${isActive(item.to, item.exact) ? '' : 'opacity-70'}`} />
                    <span className="truncate">{item.label}</span>
                    {item.badge && (
                      <span className="ml-auto text-[10px] font-bold bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-border shrink-0">
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Site
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-card/90 backdrop-blur-md flex items-center px-4 gap-3 shrink-0 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          <h1 className="font-display font-bold text-sm truncate lg:hidden">YieGo Admin</h1>

          {/* Global search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground text-sm transition-colors flex-1 max-w-sm"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="text-xs">Search orders, users...</span>
            <kbd className="ml-auto text-[10px] font-mono bg-background px-1.5 py-0.5 rounded border border-border">
              ⌘K
            </kbd>
          </button>

          {/* Mobile search icon */}
          <button
            onClick={() => setSearchOpen(true)}
            className="sm:hidden p-1.5 rounded-lg hover:bg-muted transition-colors ml-auto"
          >
            <Search className="w-5 h-5 text-muted-foreground" />
          </button>

          {/* Theme toggle — always visible */}
          <ThemeToggle size="sm" className="shrink-0 hidden sm:flex" />
          <ThemeToggle size="sm" className="shrink-0 sm:hidden" />
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <PageTransition>
            {children}
          </PageTransition>
        </main>
      </div>

      {/* Global search dialog */}
      <AdminSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
};

export default AdminLayout;
