import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, ArrowRight, Clock, CheckCircle2, XCircle, AlertCircle, FileEdit, Timer, AlertTriangle, TrendingUp, Wallet, Sparkles } from 'lucide-react';
import { useAgent } from '@/hooks/useAgent';
import { useAgentSubscriptionState } from '@/hooks/useAgentSubscriptionState';
import { Skeleton } from '@/components/ui/skeleton';

type StatusKey = 'none' | 'draft' | 'pending' | 'approved' | 'needsActivation' | 'active' | 'expiring_soon' | 'grace_period' | 'expired_promo' | 'expired_standard' | 'suspended' | 'rejected';

const statusConfig: Record<StatusKey, {
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'warn' | 'danger';
  cta: string;
  route: string;
  icon: any;
  pulse: boolean;
  description?: string;
}> = {
  none:             { label: 'Not an Agent',        tone: 'neutral', cta: 'Become an Agent',          route: '/agent',          icon: Store,         pulse: false },
  draft:            { label: 'Draft Saved',         tone: 'info',    cta: 'Continue Application',     route: '/become-an-agent',icon: FileEdit,      pulse: true },
  pending:          { label: 'Under Review',        tone: 'warn',    cta: 'View Application Status',  route: '/agent/dashboard',icon: Clock,         pulse: true },
  approved:         { label: 'Approved',            tone: 'success', cta: 'Open Agent Dashboard',     route: '/agent/dashboard',icon: CheckCircle2,  pulse: false },
  needsActivation:  { label: 'Awaiting Activation', tone: 'warn',    cta: 'Activate Now',             route: '/agent/dashboard',icon: AlertCircle,   pulse: true },
  active:           { label: 'Active',              tone: 'success', cta: 'Open Agent Tools',         route: '/agent/dashboard',icon: CheckCircle2,  pulse: false },
  expiring_soon:    { label: 'Expiring Soon',       tone: 'warn',    cta: 'Renew Now',                route: '/agent/subscription',icon: Timer,      pulse: true,  description: 'Your subscription is expiring soon. Renew to keep your store active.' },
  grace_period:     { label: 'Grace Period',        tone: 'warn',    cta: 'Renew Now',                route: '/agent/subscription',icon: AlertTriangle,pulse: true, description: 'Store still active temporarily. Renew immediately to avoid disruption.' },
  expired_promo:    { label: 'Expired — Promo Active', tone: 'danger', cta: 'Renew Now',              route: '/agent/subscription',icon: AlertTriangle,pulse: true, description: 'Subscription inactive. Agent pricing and store checkout are paused.' },
  expired_standard: { label: 'Expired',             tone: 'danger',  cta: 'Renew Now',                route: '/agent/subscription',icon: XCircle,    pulse: false, description: 'Subscription inactive. Agent pricing and store checkout are paused.' },
  suspended:        { label: 'Store Inactive',      tone: 'warn',    cta: 'View Details',             route: '/agent',          icon: AlertCircle,   pulse: false },
  rejected:         { label: 'Rejected',            tone: 'danger',  cta: 'Re-apply',                 route: '/agent',          icon: XCircle,       pulse: false },
};

const toneStyles: Record<string, { badge: string; ring: string; iconBg: string; iconText: string; bar: string }> = {
  neutral: { badge: 'bg-muted text-muted-foreground border-border',                ring: 'ring-border/60',           iconBg: 'bg-primary/10',     iconText: 'text-primary',     bar: 'bg-primary/40' },
  info:    { badge: 'bg-info/10 text-info border-info/20',                         ring: 'ring-info/20',             iconBg: 'bg-info/10',        iconText: 'text-info',        bar: 'bg-info' },
  success: { badge: 'bg-success/10 text-success border-success/20',                ring: 'ring-success/25',          iconBg: 'bg-success/10',     iconText: 'text-success',     bar: 'bg-success' },
  warn:    { badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', ring: 'ring-amber-500/25', iconBg: 'bg-amber-500/10', iconText: 'text-amber-500',  bar: 'bg-amber-500' },
  danger:  { badge: 'bg-destructive/10 text-destructive border-destructive/20',    ring: 'ring-destructive/25',      iconBg: 'bg-destructive/10', iconText: 'text-destructive', bar: 'bg-destructive' },
};

const DashboardAgentCard = () => {
  const navigate = useNavigate();
  const { loading, isAgent, isActiveAgent, isPending, isAwaitingPayment, isSuspended, isRejected, needsActivation, wallet } = useAgent();
  const { displayState, loading: subLoading, daysRemaining } = useAgentSubscriptionState();
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

  const getStatus = (): StatusKey => {
    if (!isAgent && !isPending) return hasDraft ? 'draft' : 'none';
    if (isPending) return 'pending';
    if (isRejected) return 'rejected';
    if (needsActivation) return 'needsActivation';
    if (isAwaitingPayment) return 'approved';
    if (isSuspended) return 'suspended';
    if (isActiveAgent && !subLoading) {
      switch (displayState) {
        case 'active': return 'active';
        case 'expiring_soon': return 'expiring_soon';
        case 'grace_period': return 'grace_period';
        case 'expired_promo_window': return 'expired_promo';
        case 'expired_standard': return 'expired_standard';
        case 'never_subscribed': return 'needsActivation';
        case 'pending': return 'approved';
        default: return 'expired_standard';
      }
    }
    if (isActiveAgent) return 'active';
    return 'none';
  };

  if (loading || subLoading) {
    return (
      <div className="surface-premium rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="w-12 h-12 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </div>
    );
  }

  const status = getStatus();
  const config = statusConfig[status];
  const tone = toneStyles[config.tone];
  const StatusIcon = config.icon;

  const isActiveLike = status === 'active' || status === 'expiring_soon' || status === 'grace_period';
  const showFinanceStrip = isActiveLike && wallet;
  const showPromoCallout = status === 'none' || status === 'draft';

  return (
    <div
      className={`group relative surface-premium rounded-2xl overflow-hidden ring-1 ${tone.ring} transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-12px_hsl(var(--primary)/0.35)]`}
    >
      {/* Top accent bar */}
      <div className={`h-[3px] w-full ${tone.bar}`} />

      <button
        onClick={() => navigate(config.route)}
        className="w-full text-left p-4 active:scale-[0.995] transition-transform"
      >
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div
            className={`shrink-0 w-12 h-12 rounded-2xl ${tone.iconBg} ring-1 ${tone.ring} flex items-center justify-center`}
          >
            <Store className={`w-5 h-5 ${tone.iconText}`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold tracking-tight">Agent Store</h3>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${tone.badge} ${config.pulse ? 'animate-pulse' : ''}`}
              >
                <StatusIcon className="w-3 h-3" />
                {config.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">
              {config.description ||
                (isActiveLike
                  ? 'Your storefront is live. Manage products, orders and earnings.'
                  : 'Sell data at your markup and earn profit on every order.')}
            </p>

            {/* Active subscription chip */}
            {isActiveLike && daysRemaining > 0 && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                <Timer className="w-3 h-3" />
                <span>
                  {daysRemaining} day{daysRemaining === 1 ? '' : 's'} left on subscription
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Finance strip — only for active store with wallet */}
        {showFinanceStrip && (
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-secondary/40 ring-1 ring-border/50 p-2.5">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Available</p>
              <p className="text-xs font-bold tabular mt-0.5">GHS {Number(wallet.available_balance || 0).toFixed(2)}</p>
            </div>
            <div className="border-l border-border/60 pl-2">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Earned</p>
              <p className="text-xs font-bold tabular mt-0.5 text-success">GHS {Number(wallet.total_earned || 0).toFixed(2)}</p>
            </div>
            <div className="border-l border-border/60 pl-2">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Withdrawn</p>
              <p className="text-xs font-bold tabular mt-0.5">GHS {Number(wallet.total_withdrawn || 0).toFixed(2)}</p>
            </div>
          </div>
        )}

        {/* Promo callout for non-agents */}
        {showPromoCallout && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[
              { icon: Sparkles, label: 'Discounted prices' },
              { icon: TrendingUp, label: 'Earn per order' },
              { icon: Wallet, label: 'Withdraw anytime' },
            ].map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary/60 text-muted-foreground ring-1 ring-border/50"
              >
                <Icon className="w-3 h-3" />
                {label}
              </span>
            ))}
          </div>
        )}

        {/* CTA row */}
        <div className="mt-3 flex items-center justify-between">
          <span className={`inline-flex items-center gap-1 text-xs font-bold ${tone.iconText}`}>
            {config.cta}
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
          <span className="text-[10px] text-muted-foreground font-medium">
            {isActiveLike ? 'Tap to manage' : 'Tap to learn more'}
          </span>
        </div>
      </button>
    </div>
  );
};

export default DashboardAgentCard;
