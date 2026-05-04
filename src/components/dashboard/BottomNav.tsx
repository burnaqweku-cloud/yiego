import { Link, useLocation } from 'react-router-dom';
import { Home, Smartphone, Grid3x3, Wallet, MoreHorizontal } from 'lucide-react';

type Tab = {
  to: string;
  icon: typeof Home;
  label: string;
  exact?: boolean;
  badge?: number;
  match?: string[];
};

const BottomNav = () => {
  const location = useLocation();

  const isActive = (tab: Tab) => {
    if (tab.exact) return location.pathname === tab.to;
    if (tab.match) return tab.match.some((p) => location.pathname.startsWith(p));
    return location.pathname.startsWith(tab.to);
  };

  const tabs: Tab[] = [
    { to: '/dashboard', icon: Home, label: 'Dashboard', exact: true },
    { to: '/dashboard/buy', icon: Smartphone, label: 'Data Bundles' },
    { to: '/dashboard/services', icon: Grid3x3, label: 'Services' },
    { to: '/dashboard/wallet', icon: Wallet, label: 'Wallet' },
    { to: '/dashboard/more', icon: MoreHorizontal, label: 'More', match: ['/dashboard/more', '/dashboard/orders', '/dashboard/transactions', '/dashboard/profile', '/dashboard/settings', '/dashboard/notifications', '/dashboard/referral', '/dashboard/rewards'] },
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
            const active = isActive(tab);
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
