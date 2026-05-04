import { Link, useLocation } from 'react-router-dom';
import {
  Home, ShoppingCart, Wallet, ClipboardList, User, Settings,
  HelpCircle, Search, ArrowLeft, ArrowDownCircle, Receipt, Store, Gift, Package, Sparkles
} from 'lucide-react';
import { useAgent } from '@/hooks/useAgent';

const DashboardSidebar = () => {
  const location = useLocation();
  const { isActiveAgent } = useAgent();

  const navItems = [
    { to: '/dashboard', icon: Home, label: 'Dashboard', exact: true },
    { to: '/dashboard/buy', icon: ShoppingCart, label: 'Buy Data' },
    { to: '/dashboard/orders', icon: ClipboardList, label: 'Orders' },
    { to: '/dashboard/wallet', icon: Wallet, label: 'Wallet' },
    { to: '/dashboard/transactions', icon: Receipt, label: 'Transactions' },
    ...(isActiveAgent ? [
      { to: '/dashboard/bulk-purchase', icon: Package, label: 'Bulk Orders' },
      { to: '/dashboard/bulk-orders', icon: Package, label: 'Bulk Orders History' },
    ] : []),
    { to: '/dashboard/rewards', icon: Sparkles, label: 'Rewards' },
    { to: '/dashboard/referral', icon: Gift, label: 'Refer & Earn' },
    { to: '/agent', icon: Store, label: 'Agent Store' },
    { to: '/dashboard/profile', icon: User, label: 'Profile' },
    { to: '/track-order', icon: Search, label: 'Track Order' },
    { to: '/support', icon: HelpCircle, label: 'Support' },
    { to: '/dashboard/settings', icon: Settings, label: 'Settings' },
  ];

  const isActive = (path: string, exact?: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <aside className="hidden md:flex flex-col w-60 bg-card border-r border-border/80 shrink-0 h-full">
      <nav className="flex-1 p-3 space-y-0.5 pt-4 overflow-y-auto">
        {navItems.map((item, i) => {
          const divider = item.label === 'Profile' ? (
            <div key={`divider-${i}`} className="border-t border-border my-2.5" />
          ) : null;
          return (
            <div key={`${item.to}-${item.label}`}>
              {divider}
              <Link
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive(item.to, item.exact)
                    ? 'bg-primary/10 text-primary font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                <item.icon className={`w-[18px] h-[18px] ${isActive(item.to, item.exact) ? '' : 'opacity-70'}`} />
                {item.label}
              </Link>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border pb-[calc(0.75rem+4.5rem+env(safe-area-inset-bottom))] md:pb-3">
        <Link
          to="/"
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors duration-150"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </div>
    </aside>
  );
};

export default DashboardSidebar;
