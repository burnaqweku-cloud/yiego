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
  MTN: 'from-mtn/15 via-mtn/5',
  Telecel: 'from-telecel/15 via-telecel/5',
  AirtelTigo: 'from-airteltigo/15 via-airteltigo/5',
};
const NETWORK_DOT: Record<Network, string> = {
  MTN: 'bg-mtn',
  Telecel: 'bg-telecel',
  AirtelTigo: 'bg-airteltigo',
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

  const validity = network === 'MTN' ? '90-day validity' : network === 'AirtelTigo' ? '60-day validity' : 'No expiry';

  return (
    <button
      type="button"
      onClick={() => !isDisabled && onBuy(bundle)}
      disabled={isDisabled}
      className="group relative w-full text-left rounded-3xl overflow-hidden border border-border/70 bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_24px_50px_-22px_hsl(var(--primary)/0.35)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 active:scale-[0.99]"
    >
      {/* Top tint band */}
      <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${NETWORK_TINT[network]} to-transparent pointer-events-none`} />

      <div className="relative p-5">
        {/* Header row */}
        <div className="flex items-center justify-between mb-5">
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wide uppercase px-2 py-1 rounded-full ${NETWORK_COLORS[network]}`}>
            <span className={`w-1.5 h-1.5 rounded-full bg-white/80`} />
            {bundle.network}
          </span>
          <NonExpiryBadge size="xs" network={bundle.network} />
        </div>

        {/* Big size */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-[3rem] md:text-[3.4rem] font-display font-extrabold tabular tracking-[-0.04em] leading-none">
            {bundle.bundle_size_gb}
          </span>
          <span className="text-base font-bold text-muted-foreground">GB</span>
        </div>
        <p className="text-[11.5px] text-muted-foreground mt-1.5 inline-flex items-center gap-1.5">
          <span className={`w-1 h-1 rounded-full ${NETWORK_DOT[network]}`} /> {validity}
        </p>

        {earnPoints > 0 && (
          <div className="mt-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
            <Sparkles className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-bold text-primary tabular tracking-wide">
              Earn {earnPoints} pts
            </span>
          </div>
        )}

        {/* Footer divider + price + CTA */}
        <div className="mt-5 pt-4 border-t border-dashed border-border/70 flex items-center justify-between">
          <div>
            <p className="text-[9.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground/70">Pay once</p>
            <p className="text-[1.1rem] font-display font-extrabold tabular leading-none mt-0.5">{formatPrice(displayPrice)}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-[12px] font-bold transition-all ${isDisabled ? 'text-muted-foreground' : 'text-primary group-hover:gap-2.5'}`}>
            {!sysStatus.online ? (<><Lock className="w-3.5 h-3.5" /> Offline</>)
              : !networkAvailable ? (<><AlertTriangle className="w-3.5 h-3.5" /> Unavailable</>)
              : (<>Buy now <ArrowRight className="w-3.5 h-3.5" /></>)}
          </span>
        </div>
      </div>
    </button>
  );
};

export default BundleCard;
