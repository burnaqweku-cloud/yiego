import { formatPrice, NETWORK_COLORS, type Network } from '@/data/bundles';
import { Button } from '@/components/ui/button';
import type { DbBundle } from '@/contexts/AdminContext';
import NonExpiryBadge from '@/components/bundles/NonExpiryBadge';
import { useGlobalSystemStatus } from '@/contexts/SystemStatusContext';
import { useNetworkAvailability } from '@/hooks/useNetworkAvailability';
import { useLoyalty } from '@/hooks/useLoyalty';
import { Lock, AlertTriangle, Sparkles } from 'lucide-react';

interface BundleCardProps {
  bundle: DbBundle;
  onBuy: (bundle: DbBundle) => void;
  sellingPrice?: number;
}

const NETWORK_GLOW: Record<Network, string> = {
  MTN: 'hsl(48 100% 50%)',
  Telecel: 'hsl(0 85% 50%)',
  AirtelTigo: 'hsl(210 85% 45%)',
};

const BundleCard = ({ bundle, onBuy, sellingPrice }: BundleCardProps) => {
  const network = bundle.network as Network;
  const displayPrice = sellingPrice ?? Number(bundle.price_ghs);
  const glowColor = NETWORK_GLOW[network];
  const { status: sysStatus } = useGlobalSystemStatus();
  const { isNetworkAvailable } = useNetworkAvailability();
  const networkAvailable = isNetworkAvailable(network);
  const isDisabled = !sysStatus.online || !networkAvailable;

  // Loyalty points preview (tier-aware) — silently hidden if program is off or user is logged out
  const { account, settings, currentTierConfig } = useLoyalty();
  const minOrder = settings?.min_order_ghs_for_points ?? 5;
  const tierMult = Number(currentTierConfig?.point_multiplier ?? 1);
  const ptsPerGhs = settings?.points_per_ghs ?? 1;
  const earnPoints = settings?.program_active && account && displayPrice >= minOrder
    ? Math.floor(displayPrice * ptsPerGhs * tierMult)
    : 0;

  return (
    <div
      className="surface-premium rounded-2xl p-5 interactive-card animate-fade-in group relative overflow-hidden"
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = `var(--card-shadow-hover), 0 0 0 1px ${glowColor}33`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--card-shadow)';
      }}
    >
      {/* Network accent strip on top */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
        style={{ background: `linear-gradient(90deg, ${glowColor}, ${glowColor}88)` }}
      />

      <div className="flex items-center justify-between mb-4 mt-1">
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${NETWORK_COLORS[network]}`}>
          {bundle.network}
        </span>
        <NonExpiryBadge size="xs" network={bundle.network} />
      </div>

      <div className="mb-5">
        <h3 className="text-3xl md:text-[2rem] font-display font-bold text-foreground tabular tracking-tight leading-none">
          {bundle.bundle_size_gb}<span className="text-lg ml-0.5 font-semibold text-muted-foreground">GB</span>
        </h3>
        <p className="text-sm text-muted-foreground mt-1.5">{bundle.description || 'Data Bundle'}</p>
        {earnPoints > 0 && (
          <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
            <Sparkles className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-bold text-primary tabular tracking-wide">
              Earn {earnPoints} pts
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xl font-bold text-foreground tabular">{formatPrice(displayPrice)}</span>
        <Button
          size="sm"
          variant={isDisabled ? 'outline' : 'premium'}
          onClick={() => onBuy(bundle)}
          disabled={isDisabled}
          className="font-semibold"
        >
          {!sysStatus.online ? (
            <><Lock className="w-3 h-3 mr-1" />Offline</>
          ) : !networkAvailable ? (
            <><AlertTriangle className="w-3 h-3 mr-1" />Unavailable</>
          ) : (
            'Buy Now'
          )}
        </Button>
      </div>
    </div>
  );
};

export default BundleCard;
