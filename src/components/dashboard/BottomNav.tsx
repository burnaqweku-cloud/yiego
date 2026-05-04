import { Link, useLocation } from 'react-router-dom';
import { Home, Grid3x3, Wallet, ShoppingCart, HelpCircle } from 'lucide-react';
import { useOrdersBadge } from '@/hooks/useOrdersBadge';

type Tab = {
  to: string;
  icon: typeof Home;
  label: string;
  exact?: boolean;
  badge?: number;
};

const BottomNav = () => {
  const location = useLocation();
  const { count: ordersBadgeCount } = useOrdersBadge();

  const isActive = (path: string, exact?: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  const tabs: Tab[] = [
    { to: '/dashboard', icon: Home, label: 'Home', exact: true },
    { to: '/dashboard/buy', icon: Grid3x3, label: 'Services' },
    { to: '/dashboard/wallet', icon: Wallet, label: 'Wallet' },
    { to: '/dashboard/orders', icon: ShoppingCart, label: 'Orders', badge: ordersBadgeCount },
    { to: '/support', icon: HelpCircle, label: 'Support' },
  ];

  const renderBadge = (count?: number) => {
    if (!count || count <= 0) return null;
    const display = count > 99 ? '99+' : String(count);
    return (
      <span
        aria-hidden
        className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white tabular-nums"
        style={{
          background: 'hsl(217 91% 55%)',
          boxShadow: '0 0 0 2px var(--ds-nav-surface)',
        }}
      >
        {display}
      </span>
    );
  };

  return (
    <div className="ds-bottom-nav-root md:hidden">
      <nav aria-label="Primary" className="ds-bottom-nav-bar">
        <div className="flex items-center h-[56px] px-1">
          {tabs.map((tab) => {
            const active = isActive(tab.to, tab.exact);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-label={tab.label}
                aria-current={active ? 'page' : undefined}
                className="relative flex items-center justify-center flex-1 h-full select-none active:opacity-60 transition-opacity"
              >
                <span className="relative inline-flex flex-col items-center justify-center">
                  <Icon
                    className="transition-all duration-200 ease-out"
                    style={{
                      width: 22,
                      height: 22,
                      color: 'var(--ds-nav-ink)',
                      strokeWidth: 1.9,
                      fill: 'none',
                      opacity: active ? 1 : 0.55,
                      transform: active ? 'scale(1.06)' : 'scale(1)',
                    }}
                  />
                  <span
                    aria-hidden
                    className="transition-all duration-200 ease-out"
                    style={{
                      marginTop: 4,
                      width: active ? 4 : 0,
                      height: 4,
                      borderRadius: 9999,
                      background: 'var(--ds-nav-ink)',
                      opacity: active ? 1 : 0,
                    }}
                  />
                  {renderBadge(tab.badge)}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default BottomNav;
