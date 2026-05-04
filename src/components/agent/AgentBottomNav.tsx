import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Wallet, ArrowDownCircle } from 'lucide-react';

const AgentBottomNav = () => {
  const location = useLocation();

  const tabs = [
    { to: '/agent/dashboard', icon: LayoutDashboard, label: 'Dashboard', exact: true },
    { to: '/agent/orders', icon: ShoppingCart, label: 'Orders' },
    { to: '/agent/earnings', icon: Wallet, label: 'Earnings' },
    { to: '/agent/withdrawals', icon: ArrowDownCircle, label: 'Withdraw' },
  ];

  const isActive = (path: string, exact?: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <div className="ds-bottom-nav-root lg:hidden">
      <nav aria-label="Agent" className="ds-bottom-nav-bar">
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
                className="relative flex flex-col items-center justify-center flex-1 h-full select-none active:opacity-60 transition-opacity"
              >
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
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default AgentBottomNav;
