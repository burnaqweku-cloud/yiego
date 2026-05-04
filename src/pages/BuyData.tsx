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
import { Shield, Zap, Tag, Smartphone, ArrowUpDown, PackageSearch, Sparkles } from 'lucide-react';
import SEOHead from '@/components/seo/SEOHead';

import { useAgent } from '@/hooks/useAgent';
import { useAgentSubscriptionState } from '@/hooks/useAgentSubscriptionState';
import { useNetworkAvailability } from '@/hooks/useNetworkAvailability';
import NetworkUnavailableBanner from '@/components/bundles/NetworkUnavailableBanner';
import LiveDeliveryChip from '@/components/delivery/LiveDeliveryChip';

type SortOption = 'default' | 'price-asc' | 'price-desc' | 'size-asc' | 'size-desc';

const networkAccent: Record<Network, string> = {
  MTN: 'bg-mtn',
  Telecel: 'bg-telecel',
  AirtelTigo: 'bg-airteltigo',
};

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

  const useAgentPrices = isActiveAgent && isAgentPricingActive;
  const getPriceForBundle = (bundle: DbBundle) =>
    useAgentPrices ? getAgentPrice(bundle) : getSellingPrice(bundle);

  const filteredBundles = useMemo(() => {
    let filtered = bundles.filter((b) => b.active);
    if (networkFilter) filtered = filtered.filter((b) => b.network === networkFilter);
    switch (sort) {
      case 'price-asc': return [...filtered].sort((a, b) => getPriceForBundle(a) - getPriceForBundle(b));
      case 'price-desc': return [...filtered].sort((a, b) => getPriceForBundle(b) - getPriceForBundle(a));
      case 'size-asc': return [...filtered].sort((a, b) => a.bundle_size_gb - b.bundle_size_gb);
      case 'size-desc': return [...filtered].sort((a, b) => b.bundle_size_gb - a.bundle_size_gb);
      default: return filtered;
    }
  }, [networkFilter, sort, bundles, getPriceForBundle]);

  useEffect(() => {
    if (!loadingBundles && bundles.length === 0) void refreshBundles();
  }, [bundles.length, loadingBundles, refreshBundles]);

  useEffect(() => {
    if (networkFilter && !loadingBundles) {
      const hasMatch = bundles.some((b) => b.active && b.network === networkFilter);
      if (!hasMatch) setSearchParams({}, { replace: true });
    }
  }, [bundles, loadingBundles, networkFilter, setSearchParams]);

  const handleBuy = (bundle: DbBundle) => { setSelectedBundle(bundle); setModalOpen(true); };
  const handleNetworkFilter = (network: Network | null) =>
    network ? setSearchParams({ network }) : setSearchParams({});

  const hasAnyActive = useMemo(() => bundles.some((b) => b.active), [bundles]);
  const isLoading = loadingBundles || loadingPricing;
  const showEmpty = !isLoading && hasAnyActive ? filteredBundles.length === 0 : !isLoading && !hasAnyActive;

  // Per-network counts for filter chip badges
  const networkCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    NETWORKS.forEach((n) => { counts[n] = 0; });
    bundles.forEach((b) => {
      if (!b.active) return;
      counts.all++;
      counts[b.network] = (counts[b.network] || 0) + 1;
    });
    return counts;
  }, [bundles]);

  return (
    <Layout>
      <SEOHead
        title="Buy Data Bundles — MTN, Telecel & AirtelTigo | YieGo"
        description="Affordable MTN, Telecel & AirtelTigo data bundles. Fast delivery across Ghana. No account required."
        path="/buy-data"
      />

      {!sysStatus.online && (
        <div className="container pt-4">
          <div className="surface-premium border-destructive/30 rounded-2xl p-4 flex items-start gap-3 ring-1 ring-destructive/20">
            <span className="text-destructive text-sm font-bold">⚠️</span>
            <p className="text-sm text-muted-foreground">{sysStatus.message}</p>
          </div>
        </div>
      )}

      {/* ── HERO STRIP ── */}
      <section className="relative border-b border-border/40 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-24 -right-24 w-[480px] h-[480px] rounded-full bg-primary/15 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: 'radial-gradient(hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
          />
        </div>

        <div className="container py-10 md:py-14">
          <div className="grid lg:grid-cols-12 gap-8 items-end">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 mb-4">
                <Sparkles className="w-3 h-3 text-primary" />
                <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-primary">Data marketplace</span>
              </div>
              <h1 className="text-3xl md:text-[2.7rem] font-display font-extrabold tracking-[-0.025em] leading-[1.05]">
                Cheaper data, <br className="hidden sm:inline" />
                <span className="text-gradient">delivered in seconds.</span>
              </h1>
              <p className="text-muted-foreground text-[14px] md:text-[15px] mt-4 max-w-xl leading-relaxed">
                Pick your network. Pick your size. Pay with Mobile Money or your YieGo wallet — no account required.
              </p>

              {isActiveAgent && (
                <div className="inline-flex items-center gap-1.5 mt-4 text-[11px] font-bold text-primary px-2.5 py-1 rounded-full bg-primary/10 ring-1 ring-primary/20">
                  <Tag className="w-3 h-3" /> Agent prices applied
                </div>
              )}
            </div>

            {/* Status panel */}
            <div className="lg:col-span-5">
              <div className="rounded-3xl border border-border/70 bg-card/80 backdrop-blur-xl p-4 md:p-5 shadow-[0_20px_50px_-20px_hsl(var(--primary)/0.2)]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${sysStatus.online ? 'bg-success' : 'bg-destructive'}`} />
                      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${sysStatus.online ? 'bg-success' : 'bg-destructive'}`} />
                    </span>
                    <span className={`text-[11px] font-bold tracking-wide uppercase ${sysStatus.online ? 'text-success' : 'text-destructive'}`}>
                      {sysStatus.online ? (sysStatus.statusText || 'All systems online') : 'System offline'}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success ring-1 ring-success/20">
                    <Shield className="w-2.5 h-2.5" /> Secure
                  </span>
                </div>
                {sysStatus.online && (
                  <div className="mb-3">
                    <LiveDeliveryChip />
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/60">
                  {NETWORKS.map((n) => (
                    <div key={n} className="flex flex-col items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${networkAccent[n]}`} />
                      <span className="text-[10px] font-bold uppercase tracking-wide text-foreground/70">{n}</span>
                      <span className="text-[10.5px] tabular text-muted-foreground">{networkCounts[n] ?? 0} bundles</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FILTERS BAR (sticky) ── */}
      <div className="sticky top-14 z-30 bg-background/85 backdrop-blur-xl border-b border-border/60">
        <div className="container py-3">
          <div className="flex items-center gap-2 overflow-x-auto snap-row">
            <button
              onClick={() => handleNetworkFilter(null)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[12px] font-semibold transition-all ${
                !networkFilter
                  ? 'bg-foreground text-background'
                  : 'bg-card border border-border/70 text-foreground/75 hover:text-foreground hover:border-primary/40'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" /> All
              <span className={`tabular text-[10.5px] px-1.5 rounded-full ${!networkFilter ? 'bg-background/20' : 'bg-muted text-muted-foreground'}`}>{networkCounts.all || 0}</span>
            </button>
            {NETWORKS.map((n) => {
              const active = networkFilter === n;
              return (
                <button
                  key={n}
                  onClick={() => handleNetworkFilter(n)}
                  className={`shrink-0 inline-flex items-center gap-2 px-3.5 h-9 rounded-full text-[12px] font-semibold transition-all ${
                    active
                      ? 'bg-foreground text-background'
                      : 'bg-card border border-border/70 text-foreground/75 hover:text-foreground hover:border-primary/40'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${networkAccent[n]}`} />
                  {n}
                  <span className={`tabular text-[10.5px] px-1.5 rounded-full ${active ? 'bg-background/20' : 'bg-muted text-muted-foreground'}`}>{networkCounts[n] ?? 0}</span>
                </button>
              );
            })}

            <div className="ml-auto shrink-0 hidden sm:flex items-center gap-2 pl-3">
              <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="bg-card border border-border/70 rounded-full px-3 h-9 text-[12px] font-semibold text-foreground outline-none cursor-pointer hover:border-primary/40 transition-colors"
              >
                <option value="default">Sort: Default</option>
                <option value="price-asc">Price: Low → High</option>
                <option value="price-desc">Price: High → Low</option>
                <option value="size-asc">Size: Small → Large</option>
                <option value="size-desc">Size: Large → Small</option>
              </select>
            </div>
          </div>

          {/* Mobile sort */}
          <div className="sm:hidden flex items-center gap-2 mt-2">
            <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="flex-1 bg-card border border-border/70 rounded-full px-3 h-9 text-[12px] font-semibold text-foreground outline-none"
            >
              <option value="default">Sort: Default</option>
              <option value="price-asc">Price: Low → High</option>
              <option value="price-desc">Price: High → Low</option>
              <option value="size-asc">Size: Small → Large</option>
              <option value="size-desc">Size: Large → Small</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── BUNDLE GRID ── */}
      <div className="container py-8">
        {networkFilter && sysStatus.online && !isNetworkAvailable(networkFilter) && (
          <div className="mb-6">
            <NetworkUnavailableBanner network={networkFilter} message={getNetworkMessage(networkFilter)} />
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[180px] w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredBundles.map((bundle, i) => (
              <div key={bundle.id} style={{ animationDelay: `${i * 0.03}s` }}>
                <BundleCard bundle={bundle} onBuy={handleBuy} sellingPrice={getPriceForBundle(bundle)} />
              </div>
            ))}
          </div>
        )}

        {showEmpty && (
          <div className="text-center py-20 max-w-md mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-muted/60 mx-auto mb-4 flex items-center justify-center">
              <PackageSearch className="w-6 h-6 text-muted-foreground/60" />
            </div>
            <h3 className="font-display font-bold text-lg">No bundles to show</h3>
            <p className="text-sm text-muted-foreground mt-1.5">
              Try a different network or come back in a moment.
            </p>
          </div>
        )}

        {!isLoading && filteredBundles.length > 0 && (
          <div className="mt-10 max-w-2xl mx-auto animate-fade-in">
            <ImportantNotice />
          </div>
        )}

        {/* Inline trust strip */}
        {!isLoading && filteredBundles.length > 0 && (
          <div className="mt-8 grid sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {[
              { icon: Zap, title: 'Fast delivery', desc: 'Most orders complete in seconds' },
              { icon: Shield, title: 'Secure checkout', desc: 'Paystack-grade payments' },
              { icon: Tag, title: 'Genuinely cheaper', desc: 'Better than direct prices' },
            ].map((it) => (
              <div key={it.title} className="rounded-2xl border border-border/60 bg-card p-4">
                <div className="w-8 h-8 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center mb-2.5">
                  <it.icon className="w-3.5 h-3.5 text-primary" />
                </div>
                <p className="text-[13px] font-semibold">{it.title}</p>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">{it.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <PurchaseModal
        bundle={selectedBundle}
        open={modalOpen}
        onOpenChange={setModalOpen}
        getSellingPrice={getPriceForBundle}
      />
    </Layout>
  );
};

export default BuyData;
