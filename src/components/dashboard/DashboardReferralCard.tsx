import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gift, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useReferralProgress, CANONICAL_TIERS } from '@/hooks/useReferralProgress';

const VIEWED_KEY = 'datasika_referral_viewed_at';

const DashboardReferralCard = memo(() => {
  const navigate = useNavigate();
  const { loading, summary } = useReferralProgress();

  // Notification dot logic
  const count = summary?.qualifiedCount ?? 0;
  const lastViewed = typeof window !== 'undefined' ? localStorage.getItem(VIEWED_KEY) : null;
  const hasClaimable = !!summary?.highestClaimableTier;
  const showDot = hasClaimable || (count > 0 && (!lastViewed || count > parseInt(lastViewed, 10)));

  const handleClick = () => {
    localStorage.setItem(VIEWED_KEY, String(count));
    navigate('/dashboard/referral');
  };

  if (loading || !summary) {
    return (
      <div className="rounded-xl h-[72px] overflow-hidden">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  const hasAnyActivity = summary.hasAnyActivity;
  const isClaimable = !!summary.highestClaimableTier;
  const isComplete = summary.isMaxTier && !summary.highestClaimableTier;
  const isProgress = hasAnyActivity && !isClaimable && !isComplete && !!summary.nextTier;

  const nextTierIdx = summary.nextTierIdx;
  const isBronzeNext = nextTierIdx === 0;
  const referralsToGo = isBronzeNext
    ? CANONICAL_TIERS[0].cumulative - summary.qualifiedCount
    : 0;

  let title = '';
  let subtitle = '';
  let microline = '';
  let ctaLabel = '';
  let isGoldTitle = false;
  let progressBar = false;
  let progressPercent = summary.progressPercent;

  if (!hasAnyActivity) {
    title = '🎁 Earn Up to 25GB Free';
    subtitle = 'Invite friends & earn free data rewards';
    microline = 'Share your link to get started.';
    ctaLabel = 'View Rewards';
  } else if (isClaimable) {
    title = '🎁 Reward Available';
    subtitle = `Your ${summary.highestClaimableTier!.tierName} reward is ready`;
    ctaLabel = 'Claim';
    isGoldTitle = true;
  } else if (isProgress) {
    title = `🚀 Keep Going — ${summary.nextTier} Awaits`;
    if (isBronzeNext) {
      subtitle = `${referralsToGo} referral${referralsToGo === 1 ? '' : 's'} to unlock 1GB`;
    } else {
      subtitle = `${summary.progressPercent}% to unlock ${summary.nextTierTotalGB}GB`;
    }
    microline = "You're getting closer. Don't stop now 🔥";
    ctaLabel = 'View Progress';
    progressBar = true;
  } else if (isComplete) {
    title = "👑 You're Maxed Out";
    subtitle = "You've unlocked all rewards";
    ctaLabel = 'View Rewards';
    isGoldTitle = true;
  }

  return (
    <button
      onClick={handleClick}
      className={`relative w-full rounded-xl overflow-hidden text-left group border bg-card shadow-[var(--card-shadow)] transition-colors ${
        isClaimable
          ? 'border-amber-500/45 shadow-[0_0_20px_hsl(44_96%_52%/0.12),var(--card-shadow)]'
          : 'border-border'
      }`}
    >
      {/* Subtle shimmer overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, hsl(44 96% 52% / 0.04) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
          animation: 'dash-referral-shimmer 8s ease-in-out infinite',
        }}
      />

      {/* Claimable golden pulse */}
      {isClaimable && (
        <div
          className="absolute inset-0 pointer-events-none rounded-xl"
          style={{
            boxShadow: 'inset 0 0 20px hsl(44 96% 52% / 0.06)',
            animation: 'dash-referral-pulse 3s ease-in-out infinite',
          }}
        />
      )}

      {/* Notification dot */}
      {showDot && (
        <div className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full z-10 bg-destructive shadow-[0_0_6px_hsl(var(--destructive)/0.6)]" />
      )}

      <div className="relative z-[1] flex items-center gap-3 px-4 py-3.5">
        {/* Icon */}
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-amber-500/10 border border-amber-500/20">
          <Gift className="w-[18px] h-[18px] text-amber-500" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-bold ${isGoldTitle ? 'text-amber-400' : 'text-card-foreground'}`}>
            {title}
          </p>
          <p className="text-[11px] mt-0.5 text-muted-foreground">
            {subtitle}
          </p>
          {microline && (
            <p className="text-[10px] mt-0.5 text-muted-foreground/70">
              {microline}
            </p>
          )}
          {/* Micro progress bar */}
          {progressBar && (
            <div className="mt-1.5 h-[3px] rounded-full overflow-hidden bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${progressPercent}%`,
                  background: 'linear-gradient(90deg, hsl(44 96% 42%), hsl(44 96% 58%))',
                  transition: 'width 600ms ease-out',
                }}
              />
            </div>
          )}
        </div>

        {/* CTA arrow */}
        <div className="shrink-0 flex items-center">
          <span className="text-[11px] font-bold mr-1 text-amber-500">
            {ctaLabel}
          </span>
          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 text-amber-500" />
        </div>
      </div>
    </button>
  );
});
DashboardReferralCard.displayName = 'DashboardReferralCard';

export default DashboardReferralCard;
