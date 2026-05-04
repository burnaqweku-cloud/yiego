import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import BundleCard from '@/components/bundles/BundleCard';
import PurchaseModal from '@/components/bundles/PurchaseModal';
import ImportantNotice from '@/components/bundles/ImportantNotice';
import { useAdmin, type DbBundle } from '@/contexts/AdminContext';
import { NETWORKS, type Network } from '@/data/bundles';
import { usePricing } from '@/hooks/usePricing';
import { useGlobalSystemStatus } from '@/contexts/SystemStatusContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, Zap, Tag } from 'lucide-react';
import SEOHead from '@/components/seo/SEOHead';
import AgentPromoBanner from '@/components/bundles/AgentPromoBanner';
import { useAgent } from '@/hooks/useAgent';
import { useAgentSubscriptionState } from '@/hooks/useAgentSubscriptionState';
import { useNetworkAvailability } from '@/hooks/useNetworkAvailability';
import NetworkUnavailableBanner from '@/components/bundles/NetworkUnavailableBanner';
import LiveDeliveryChip from '@/components/delivery/LiveDeliveryChip';

type SortOption = 'default' | 'price-asc' | 'price-desc' | 'size-asc' | 'size-desc';

const BuyData = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const networkFilter = (searchParams.get('network') as Network | null) || null;
  const [sort, setSort] = useState<SortOption>('default');
  const [selectedBundle, setSelectedBundle] = useState<DbBundle | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const { bundles, loadingBundles, refreshBundles } = useAdmin();
  const { getSellingPrice, getAgentPrice, loadingPricing } = usePricing();
  const { status: sysStatus } = useGlobalSystemStatus();
  const { isActiveAgent } = useAgent();
  const { isAgentPricingActive } = useAgentSubscriptionState();
  const { isNetworkAvailable, getNetworkMessage } = useNetworkAvailability();

  // Agent pricing only applies when subscription is operationally active
  const useAgentPrices = isActiveAgent && isAgentPricingActive;

  const getPriceForBundle = (bundle: DbBundle) =>
    useAgentPrices ? getAgentPrice(bundle) : getSellingPrice(bundle);

  const filteredBundles = useMemo(() => {
    let filtered = bundles.filter((b) => b.active);
    if (networkFilter) {
      filtered = filtered.filter((b) => b.network === networkFilter);
    }
    switch (sort) {
      case 'price-asc': return [...filtered].sort((a, b) => getPriceForBundle(a) - getPriceForBundle(b));
      case 'price-desc': return [...filtered].sort((a, b) => getPriceForBundle(b) - getPriceForBundle(a));
      case 'size-asc': return [...filtered].sort((a, b) => a.bundle_size_gb - b.bundle_size_gb);
      case 'size-desc': return [...filtered].sort((a, b) => b.bundle_size_gb - a.bundle_size_gb);
      default: return filtered;
    }
  }, [networkFilter, sort, bundles, getPriceForBundle]);

  useEffect(() => {
    if (!loadingBundles && bundles.length === 0) {
      void refreshBundles();
    }
  }, [bundles.length, loadingBundles, refreshBundles]);

  useEffect(() => {
    if (networkFilter && !loadingBundles) {
      const hasMatchingNetwork = bundles.some((bundle) => bundle.active && bundle.network === networkFilter);
      if (!hasMatchingNetwork) {
        setSearchParams({}, { replace: true });
      }
    }
  }, [bundles, loadingBundles, networkFilter, setSearchParams]);

  const handleBuy = (bundle: DbBundle) => {
    setSelectedBundle(bundle);
    setModalOpen(true);
  };

  const handleNetworkFilter = (network: Network | null) => {
    if (network) {
      setSearchParams({ network });
    } else {
      setSearchParams({});
    }
  };

  const hasAnyActiveBundles = useMemo(() => bundles.some((bundle) => bundle.active), [bundles]);
  const isLoading = loadingBundles || loadingPricing;
  const showEmptyState = !isLoading && hasAnyActiveBundles ? filteredBundles.length === 0 : !isLoading && !hasAnyActiveBundles;

  return (
    <Layout>
      {!sysStatus.online && (
        <div className="container pt-4">
          <div className="surface-premium border-destructive/30 rounded-2xl p-4 flex items-start gap-3 ring-1 ring-destructive/20">
            <span className="text-destructive text-sm font-bold">⚠️</span>
            <p className="text-sm text-muted-foreground">{sysStatus.message}</p>
          </div>
        </div>
      )}
      <SEOHead
        title="Buy Data Bundles — MTN, Telecel & AirtelTigo | YieGo"
        description="Choose from affordable MTN, Telecel & AirtelTigo data bundles. Fast delivery across Ghana. No account required."
        path="/buy-data"
      />
      <div className="container py-8 md:py-12">
        {/* Header + System Status */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
          <div>
            <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-primary mb-2">Data Marketplace</span>
            <h1 className="text-3xl md:text-4xl font-display font-bold mb-2 tracking-tight">Buy Data Bundles</h1>
            <p className="text-muted-foreground text-sm md:text-base">Affordable MTN, Telecel & AirtelTigo packages — delivered fast.</p>
            {isActiveAgent && (
              <div className="inline-flex items-center gap-1.5 mt-3 text-[11px] font-bold text-primary px-2.5 py-1 rounded-full bg-primary/10 ring-1 ring-primary/20">
                <Tag className="w-3 h-3" />
                Agent prices applied
              </div>
            )}
          </div>

          {/* System status pill */}
          <div className={`flex items-center gap-3 surface-premium rounded-2xl px-4 py-2.5 shrink-0 animate-fade-in ${sysStatus.online ? '' : 'ring-1 ring-destructive/30'}`}>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 pulse-dot ${sysStatus.online ? 'bg-success' : 'bg-destructive'}`} />
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${sysStatus.online ? 'bg-success' : 'bg-destructive'}`} />
              </span>
              <span className={`text-[11px] font-bold tracking-wide uppercase ${sysStatus.online ? 'text-success' : 'text-destructive'}`}>
                {sysStatus.online ? (sysStatus.statusText || 'System Online') : 'System Offline'}
              </span>
            </div>
            {sysStatus.online && (
              <>
                <div className="w-px h-4 bg-border/60" />
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-primary" />
                  <span className="text-[11px] font-semibold text-muted-foreground">Fast Delivery</span>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success ring-1 ring-success/20">
                  <Shield className="w-2.5 h-2.5" /> Secure
                </span>
              </>
            )}
          </div>
        </div>

        {/* Live delivery chip */}
        {sysStatus.online && (
          <div className="mb-5">
            <LiveDeliveryChip />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="surface-premium rounded-2xl p-1.5 inline-flex gap-1 flex-wrap">
            <button
              onClick={() => handleNetworkFilter(null)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 btn-press ${
                !networkFilter
                  ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.5)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              All Networks
            </button>
            {NETWORKS.map((n) => (
              <button
                key={n}
                onClick={() => handleNetworkFilter(n)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 btn-press ${
                  networkFilter === n
                    ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.5)]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="surface-premium px-4 py-2.5 rounded-2xl text-xs font-bold text-foreground outline-none cursor-pointer sm:ml-auto transition-colors hover:bg-muted/30"
          >
            <option value="default">Sort: Default</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="size-asc">Size: Small to Large</option>
            <option value="size-desc">Size: Large to Small</option>
          </select>
        </div>

        {/* Network unavailable banner when filtering a disabled network */}
        {networkFilter && sysStatus.online && !isNetworkAvailable(networkFilter) && (
          <div className="mb-6">
            <NetworkUnavailableBanner network={networkFilter} message={getNetworkMessage(networkFilter)} />
          </div>
        )}

        {/* Bundle grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[180px] w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredBundles.map((bundle, i) => (
              <div key={bundle.id} style={{ animationDelay: `${i * 0.03}s` }}>
                <BundleCard bundle={bundle} onBuy={handleBuy} sellingPrice={getPriceForBundle(bundle)} />
              </div>
            ))}
          </div>
        )}

        {showEmptyState && (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-lg">No bundles available for this filter.</p>
          </div>
        )}

        {/* Important Notice */}
        {!isLoading && filteredBundles.length > 0 && (
          <div className="mt-8 max-w-2xl mx-auto animate-fade-in">
            <ImportantNotice />
          </div>
        )}
      </div>

      <PurchaseModal
        bundle={selectedBundle}
        open={modalOpen}
        onOpenChange={setModalOpen}
        getSellingPrice={getPriceForBundle}
      />
      <AgentPromoBanner />
    </Layout>
  );
};

export default BuyData;
