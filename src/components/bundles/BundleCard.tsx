import { formatPrice, NETWORK_COLORS, type Network } from '@/data/bundles';
import type { DbBundle } from '@/contexts/AdminContext';
import NonExpiryBadge from '@/components/bundles/NonExpiryBadge';
import { useGlobalSystemStatus } from '@/contexts/SystemStatusContext';
import { useNetworkAvailability } from '@/hooks/useNetworkAvailability';
import { useLoyalty } from '@/hooks/useLoyalty';
import { Lock, AlertTriangle, Sparkles, ArrowRight } from 'lucide-react';

interface BundleCardProps {
  bundle: DbBundle;
  onBuy: (bundle: DbBundle) => void;
  sellingPrice?: number;
}

const NETWORK_TINT: Record<Network, string> = {
  MTN: 'from-mtn/20 via-mtn/5',
  Telecel: 'from-telecel/20 via-telecel/5',
  AirtelTigo: 'from-airteltigo/20 via-airteltigo/5',
};
const NETWORK_DOT: Record<Network, string> = {
  MTN: 'bg-mtn',
  Telecel: 'bg-telecel',
  AirtelTigo: 'bg-airteltigo',
};
const NETWORK_GLOW: Record<Network, string> = {
  MTN: 'bg-mtn/30',
  Telecel: 'bg-telecel/30',
  AirtelTigo: 'bg-airteltigo/30',
};

const BundleCard = ({ bundle, onBuy, sellingPrice }: BundleCardProps) => {
  const network = bundle.network as Network;
  const displayPrice = sellingPrice ?? Number(bundle.price_ghs);
  const { status: sysStatus } = useGlobalSystemStatus();
  const { isNetworkAvailable } = useNetworkAvailability();
  const networkAvailable = isNetworkAvailable(network);
  const isDisabled = !sysStatus.online || !networkAvailable;

  const { account, settings, currentTierConfig } = useLoyalty();
  const minOrder = settings?.min_order_ghs_for_points ?? 5;
  const tierMult = Number(currentTierConfig?.point_multiplier ?? 1);
  const ptsPerGhs = settings?.points_per_ghs ?? 1;
  const earnPoints = settings?.program_active && account && displayPrice >= minOrder
    ? Math.floor(displayPrice * ptsPerGhs * tierMult)
    : 0;

  return (
    <button
      type="button"
      onClick={() => !isDisabled && onBuy(bundle)}
      disabled={isDisabled}
      className="group relative w-full text-left rounded-3xl overflow-hidden border border-border/70 bg-card transition-all duration-500 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-[0_28px_56px_-22px_hsl(var(--primary)/0.4)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none active:scale-[0.99]"
    >
      {/* Top tint band */}
      <div className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${NETWORK_TINT[network]} to-transparent pointer-events-none`} />
      {/* Brand color rail */}
      <div className={`absolute inset-x-0 top-0 h-0.5 ${NETWORK_DOT[network]} opacity-90`} />
      {/* Brand-color glow blob — fades in on hover */}
      <div className={`absolute -bottom-20 -right-16 w-48 h-48 rounded-full ${NETWORK_GLOW[network]} blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none`} />
      {/* Top sheen on hover */}
      <div className="absolute inset-x-0 top-0.5 h-px bg-gradient-to-r from-transparent via-foreground/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative p-5">
        {/* Header row */}
        <div className="flex items-center justify-between mb-5">
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wide uppercase px-2 py-1 rounded-full ${NETWORK_COLORS[network]} shadow-sm`}>
            <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
            {bundle.network}
          </span>
          <NonExpiryBadge size="xs" network={bundle.network} />
        </div>

        {/* Big size */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-[3.2rem] md:text-[3.6rem] font-display font-extrabold tabular tracking-[-0.045em] leading-none transition-transform duration-500 group-hover:scale-[1.04] origin-left inline-block">
            {bundle.bundle_size_gb}
          </span>
          <span className="text-base font-bold text-muted-foreground tracking-tight">GB</span>
        </div>

        {earnPoints > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-primary/15 to-primary/5 border border-primary/25 shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.3)]">
            <Sparkles className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-bold text-primary tabular tracking-wide">
              Earn {earnPoints} pts
            </span>
          </div>
        )}

        {/* Footer divider + price + CTA */}
        <div className="mt-5 pt-4 border-t border-dashed border-border/70 flex items-center justify-between">
          <div>
            <p className="text-[9.5px] uppercase tracking-[0.2em] font-bold text-muted-foreground/70">Pay once</p>
            <p className="text-[1.25rem] font-display font-extrabold tabular leading-none mt-1 tracking-[-0.02em]">{formatPrice(displayPrice)}</p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-full transition-all duration-300 ${
              isDisabled
                ? 'text-muted-foreground bg-muted/50'
                : 'text-primary bg-primary/10 border border-primary/25 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary group-hover:shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.55)]'
            }`}
          >
            {!sysStatus.online ? (<><Lock className="w-3.5 h-3.5" /> Offline</>)
              : !networkAvailable ? (<><AlertTriangle className="w-3.5 h-3.5" /> Unavailable</>)
              : (<>Buy now <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" /></>)}
          </span>
        </div>
      </div>
    </button>
  );
};

export default BundleCard;
