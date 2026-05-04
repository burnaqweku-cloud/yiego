import { Button } from '@/components/ui/button';
import { Zap, ShoppingCart, AlertTriangle } from 'lucide-react';
import NonExpiryBadge from '@/components/bundles/NonExpiryBadge';
import { useNetworkAvailability } from '@/hooks/useNetworkAvailability';
import { useGlobalSystemStatus } from '@/contexts/SystemStatusContext';
import NetworkUnavailableBanner from '@/components/bundles/NetworkUnavailableBanner';
import LiveDeliveryChip from '@/components/delivery/LiveDeliveryChip';
import type { Network } from '@/data/bundles';

const NETWORK_ORDER = ['MTN', 'Telecel', 'AirtelTigo'];
const NETWORK_COLORS: Record<string, string> = {
  MTN: 'bg-mtn text-mtn-foreground',
  Telecel: 'bg-telecel text-telecel-foreground',
  AirtelTigo: 'bg-airteltigo text-airteltigo-foreground',
};
const NETWORK_RING: Record<string, string> = {
  MTN: 'ring-mtn/40',
  Telecel: 'ring-telecel/40',
  AirtelTigo: 'ring-airteltigo/40',
};
const NETWORK_BAR: Record<string, string> = {
  MTN: 'bg-mtn',
  Telecel: 'bg-telecel',
  AirtelTigo: 'bg-airteltigo',
};

interface Product {
  id: string;
  network: string;
  bundle_size_gb: number;
  price_ghs: number;
  description: string;
}

interface StoreBundleGridProps {
  products: Product[];
  selectedNetwork: string;
  onNetworkChange: (net: string) => void;
  getSellingPrice: (product: Product) => number;
  onBuyNow: (product: Product) => void;
}

const StoreBundleGrid = ({
  products,
  selectedNetwork,
  onNetworkChange,
  getSellingPrice,
  onBuyNow,
}: StoreBundleGridProps) => {
  const { isNetworkAvailable, getNetworkMessage } = useNetworkAvailability();
  const { status: sysStatus } = useGlobalSystemStatus();
  const networkUnavailable = !isNetworkAvailable(selectedNetwork as Network);
  const availableNetworks = NETWORK_ORDER.filter(n =>
    products.some(p => p.network === n)
  );

  const filteredProducts = products
    .filter(p => p.network === selectedNetwork)
    .sort((a, b) => a.bundle_size_gb - b.bundle_size_gb);

  return (
    <div className="animate-hero-in hero-stagger-4">
      {/* Live delivery chip */}
      {sysStatus.online && (
        <div className="mb-3">
          <LiveDeliveryChip />
        </div>
      )}
      {/* Network Tabs */}
      <div className="flex gap-2 mb-4 p-1 bg-muted/40 ring-1 ring-border/60 rounded-2xl">
        {availableNetworks.map(net => (
          <button
            key={net}
            onClick={() => onNetworkChange(net)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.97] ${
              selectedNetwork === net
                ? `${NETWORK_COLORS[net]} shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.3)] ring-2 ${NETWORK_RING[net]}`
                : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
            }`}
          >
            {net}
          </button>
        ))}
      </div>

      {/* Network unavailable banner */}
      {networkUnavailable && sysStatus.online && (
        <div className="mb-4">
          <NetworkUnavailableBanner network={selectedNetwork} message={getNetworkMessage(selectedNetwork as Network)} />
        </div>
      )}

      {/* Bundle cards */}
      {filteredProducts.length === 0 ? (
        <div className="py-16 text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-muted/40 ring-1 ring-border/60 flex items-center justify-center">
            <ShoppingCart className="w-6 h-6 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground font-medium">No bundles available for {selectedNetwork}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filteredProducts.map((product, i) => {
            const price = getSellingPrice(product);
            return (
              <div
                key={product.id}
                className="surface-premium rounded-2xl p-4 flex flex-col relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-12px_hsl(var(--primary)/0.3)]"
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <span className={`absolute top-0 left-0 right-0 h-0.5 ${NETWORK_BAR[product.network] || 'bg-primary'} opacity-80`} />
                <div className="flex-1">
                  <p className="text-2xl font-bold leading-none tabular tracking-tight">
                    {product.bundle_size_gb}<span className="text-base font-semibold text-muted-foreground ml-0.5">GB</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-1">
                    {product.description || selectedNetwork + ' Data'}
                  </p>
                  <NonExpiryBadge size="xs" className="mt-2" network={selectedNetwork} />
                </div>
                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-lg font-bold mb-2.5 tabular tracking-tight">
                    GHS {price.toFixed(2)}
                  </p>
                  <Button
                    onClick={() => onBuyNow(product)}
                    size="sm"
                    className="w-full rounded-xl text-xs font-semibold h-9"
                    disabled={networkUnavailable || !sysStatus.online}
                  >
                    {!sysStatus.online ? 'Offline' : networkUnavailable ? `${selectedNetwork} Unavailable` : 'Buy Now'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StoreBundleGrid;
