import { Link, useLocation } from 'react-router-dom';
import { Home, Wifi, LayoutGrid, Wallet, Megaphone } from 'lucide-react';

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
    { to: '/dashboard', icon: Home, label: 'Home', exact: true },
    { to: '/dashboard/buy', icon: Wifi, label: 'Bundles' },
    { to: '/dashboard/services', icon: LayoutGrid, label: 'Services' },
    { to: '/dashboard/wallet', icon: Wallet, label: 'Wallet' },
    { to: '/dashboard/channel', icon: Megaphone, label: 'Channel', match: ['/dashboard/channel'] },
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
        <div className="flex items-end justify-around h-[62px] px-2 pb-1.5 pt-1.5">
          {tabs.map((tab) => {
            const active = isActive(tab);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-label={tab.label}
                aria-current={active ? 'page' : undefined}
                className="relative flex flex-col items-center justify-center flex-1 h-full select-none active:scale-[0.94] transition-transform"
              >
                {/* Premium top indicator bar */}
                <span
                  aria-hidden
                  className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] rounded-b-full transition-all duration-300 ease-out"
                  style={{
                    width: active ? 26 : 0,
                    background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.6))',
                    boxShadow: active ? '0 0 12px hsl(var(--primary) / 0.55)' : 'none',
                  }}
                />
                <span
                  className="relative inline-flex items-center justify-center transition-all duration-300 ease-out"
                  style={{
                    width: 50,
                    height: 32,
                    borderRadius: 12,
                    background: active
                      ? 'linear-gradient(135deg, hsl(var(--primary) / 0.20), hsl(var(--primary) / 0.08))'
                      : 'transparent',
                    boxShadow: active
                      ? 'inset 0 0 0 1px hsl(var(--primary) / 0.30), 0 6px 14px -8px hsl(var(--primary) / 0.45)'
                      : 'none',
                    backdropFilter: active ? 'blur(8px)' : 'none',
                  }}
                >
                  <Icon
                    className="transition-all duration-200 ease-out"
                    style={{
                      width: 21,
                      height: 21,
                      color: active ? 'hsl(var(--primary))' : 'var(--ds-nav-ink)',
                      strokeWidth: active ? 2.2 : 1.8,
                      fill: 'none',
                      opacity: active ? 1 : 0.62,
                    }}
                  />
                  {renderBadge(tab.badge)}
                </span>
                <span
                  className="mt-0.5 text-[10px] font-semibold tracking-tight transition-colors duration-200"
                  style={{
                    color: active ? 'hsl(var(--primary))' : 'var(--ds-nav-ink)',
                    opacity: active ? 1 : 0.6,
                  }}
                >
                  {tab.label}
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
