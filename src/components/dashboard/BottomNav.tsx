import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Wifi, Wallet, ShoppingCart, Store } from 'lucide-react';
import { useAgent } from '@/hooks/useAgent';
import { useIsActiveAgent } from '@/hooks/useIsActiveAgent';
import { useOrdersBadge } from '@/hooks/useOrdersBadge';

type Tab = {
  to: string;
  icon: typeof Home;
  label: string;
  exact?: boolean;
  badge?: number;
  dot?: boolean;
  dotColor?: string;
  onClick?: () => void;
};

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAgent, isActiveAgent, isPending, isAwaitingPayment, isSuspended, isRejected, needsActivation } = useAgent();
  const { isLiveActiveAgent } = useIsActiveAgent();
  const { count: ordersBadgeCount } = useOrdersBadge();
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    try {
      const draft = localStorage.getItem('yiego_agent_draft');
      if (draft) {
        const d = JSON.parse(draft);
        if (d.storeName?.trim()) setHasDraft(true);
      }
    } catch {}
  }, []);

  const isActive = (path: string, exact?: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  const getAgentRoute = (): string => {
    if (!isAgent && !isPending) return hasDraft ? '/become-an-agent' : '/agent';
    if (isPending) return '/agent/dashboard';
    if (isRejected) return '/agent';
    if (needsActivation) return '/agent/dashboard';
    if (isAwaitingPayment) return '/agent/dashboard';
    if (isSuspended) return '/agent';
    if (isActiveAgent) return '/agent/dashboard';
    return '/agent';
  };

  const agentActive = location.pathname.startsWith('/agent');
  // Dot policy:
  //   • green     → store is truly live-active (active record + non-expired subscription)
  //   • amber     → application pending review
  //   • orange    → approved but first-time activation not paid yet
  //   • blue      → user has an in-progress signup draft
  //   • no dot    → expired/inactive/suspended/rejected (calm, not alarming)
  const showAgentDot = isLiveActiveAgent || isPending || needsActivation || (!isAgent && hasDraft);
  const agentDotColor = isLiveActiveAgent
    ? 'hsl(142 71% 45%)'
    : isPending
    ? 'hsl(38 92% 50%)'
    : needsActivation
    ? 'hsl(24 95% 53%)'
    : 'hsl(217 91% 60%)';

  const tabs: Tab[] = [
    { to: '/dashboard', icon: Home, label: 'Home', exact: true },
    { to: '/dashboard/buy', icon: Wifi, label: 'Buy' },
    {
      to: getAgentRoute(),
      icon: Store,
      label: 'Agent',
      dot: showAgentDot,
      dotColor: agentDotColor,
      onClick: () => navigate(getAgentRoute()),
    },
    { to: '/dashboard/wallet', icon: Wallet, label: 'Wallet' },
    { to: '/dashboard/orders', icon: ShoppingCart, label: 'Orders', badge: ordersBadgeCount },
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
          letterSpacing: '-0.02em',
        }}
      >
        {display}
      </span>
    );
  };

  const renderDot = (color?: string) => {
    if (!color) return null;
    return (
      <span
        aria-hidden
        className="absolute -top-0.5 -right-0.5 w-[9px] h-[9px] rounded-full"
        style={{
          background: color,
          boxShadow: '0 0 0 2px var(--ds-nav-surface)',
        }}
      />
    );
  };

  const renderTab = (tab: Tab) => {
    const active = tab.to.startsWith('/agent') ? agentActive : isActive(tab.to, tab.exact);
    const Icon = tab.icon;
    const commonClass =
      'relative flex items-center justify-center flex-1 h-full select-none active:opacity-60 transition-opacity';

    const inner = (
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
        {tab.dot && renderDot(tab.dotColor)}
      </span>
    );

    if (tab.onClick) {
      return (
        <button
          key={tab.label}
          onClick={tab.onClick}
          aria-label={tab.label}
          aria-current={active ? 'page' : undefined}
          className={commonClass}
        >
          {inner}
        </button>
      );
    }

    return (
      <Link
        key={tab.to}
        to={tab.to}
        aria-label={tab.label}
        aria-current={active ? 'page' : undefined}
        className={commonClass}
      >
        {inner}
      </Link>
    );
  };

  return (
    <div className="ds-bottom-nav-root md:hidden">
      <nav aria-label="Primary" className="ds-bottom-nav-bar">
        <div className="flex items-center h-[56px] px-1">
          {tabs.map(renderTab)}
        </div>
      </nav>
    </div>
  );
};

export default BottomNav;
