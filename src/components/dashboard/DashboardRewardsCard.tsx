import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight, TrendingUp } from 'lucide-react';
import { useLoyalty, tierVisual } from '@/hooks/useLoyalty';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatPrice } from '@/data/bundles';

const DashboardRewardsCard = () => {
  const { account, currentTierConfig, nextTierConfig, progressToNextTier, ghsRemainingToNext, pointsValueGhs, loading, settings } = useLoyalty();

  if (loading) {
    return <Skeleton className="h-44 w-full rounded-2xl" />;
  }

  // Program off — hide card
  if (settings && !settings.program_active) return null;

  const tier = account?.current_tier || 'bronze';
  const visual = tierVisual(tier);
  const balance = account?.points_balance ?? 0;

  return (
    <div className="surface-premium rounded-2xl overflow-hidden relative">
      {/* Decorative tier gradient swatch */}
      <div
        className={`absolute -top-12 -right-12 w-44 h-44 rounded-full opacity-20 blur-2xl pointer-events-none bg-gradient-to-br ${visual.gradient}`}
      />

      <div className="p-5 relative">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center`}>
              <Sparkles className="w-[18px] h-[18px] text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight leading-tight">Rewards</p>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{currentTierConfig?.display_name || 'Bronze'} member</p>
            </div>
          </div>
          <div
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-foreground bg-gradient-to-r ${visual.gradient} shadow-sm`}
          >
            {visual.label}
          </div>
        </div>

        {/* Points */}
        <div className="mt-2">
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Points balance</p>
          <div className="flex items-baseline gap-2">
            <p className="text-[2rem] leading-none font-display font-bold tracking-tight tabular">
              {balance.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">≈ {formatPrice(pointsValueGhs)}</p>
          </div>
        </div>

        {/* Progress to next tier */}
        {nextTierConfig ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="text-muted-foreground">Progress to <span className="text-foreground font-semibold">{nextTierConfig.display_name}</span></span>
              <span className="text-muted-foreground tabular">{formatPrice(ghsRemainingToNext)} to go</span>
            </div>
            <Progress value={progressToNextTier} className="h-1.5" />
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            You've reached the highest tier 🎉
          </div>
        )}

        <div className="mt-4">
          <Link to="/dashboard/rewards">
            <Button size="sm" variant="premium" className="w-full gap-1.5 text-xs h-10">
              Open Rewards Hub <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default DashboardRewardsCard;
