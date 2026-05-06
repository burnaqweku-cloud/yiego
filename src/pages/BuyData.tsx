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
import { Shield, Zap, Tag, Smartphone, ArrowUpDown, PackageSearch, Layers, Activity, LayoutGrid } from 'lucide-react';
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
          <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-card/60" />
          <div className="absolute -top-24 -right-16 w-[560px] h-[560px] rounded-full bg-primary/25 blur-3xl glow-drift" />
          <div className="absolute -bottom-32 -left-16 w-[420px] h-[420px] rounded-full bg-accent/12 blur-3xl glow-drift-slow" />
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{ backgroundImage: 'radial-gradient(hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
          />
          <div className="noise-overlay" />
        </div>

        <div className="container py-12 md:py-16">
          <div className="grid lg:grid-cols-12 gap-10 items-end">
            <div className="lg:col-span-7">
              <div className="relative inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary/18 via-primary/8 to-primary/18 backdrop-blur-md px-3.5 py-2 mb-5 border border-primary/35 shadow-[0_10px_28px_-10px_hsl(var(--primary)/0.5),inset_0_1px_0_0_hsl(var(--primary)/0.35)]">
                {/* live pulse dot */}
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-60" />
                  <span className="relative w-1.5 h-1.5 rounded-full bg-primary" />
                </span>
                <LayoutGrid className="w-3 h-3 text-primary" strokeWidth={2.4} />
                <span className="text-[10.5px] font-extrabold uppercase tracking-[0.22em] bg-gradient-to-r from-primary to-[hsl(var(--brand-glow))] bg-clip-text text-transparent">
                  Browse bundles
                </span>
              </div>
              <h1 className="text-3xl md:text-[3rem] font-display font-extrabold tracking-[-0.035em] leading-[1.02]">
                Cheaper data, <br className="hidden sm:inline" />
                <span className="text-gradient">delivered fast.</span>
              </h1>
              <p className="text-muted-foreground text-[14px] md:text-[15px] mt-5 max-w-xl leading-relaxed">
                Pick your network. Pick your size. Pay with Mobile Money or your YieGo wallet — most orders complete within a few minutes.
              </p>

              {/* Live stat row */}
              <div className="flex flex-wrap items-center gap-2 mt-5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/70 bg-card/60 backdrop-blur-sm text-[11px] font-medium text-muted-foreground">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  <span className="tabular font-bold text-foreground">{networkCounts.all || 0}</span> bundles live
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/70 bg-card/60 backdrop-blur-sm text-[11px] font-medium text-muted-foreground">
                  <Smartphone className="w-3.5 h-3.5 text-primary" />
                  <span className="tabular font-bold text-foreground">3</span> networks
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/70 bg-card/60 backdrop-blur-sm text-[11px] font-medium text-muted-foreground">
                  <Activity className="w-3.5 h-3.5 text-success" />
                  Updated continuously
                </span>
              </div>

              {isActiveAgent && (
                <div className="inline-flex items-center gap-1.5 mt-5 text-[11px] font-bold text-primary px-3 py-1.5 rounded-full bg-primary/10 ring-1 ring-primary/25 shadow-[0_4px_16px_-8px_hsl(var(--primary)/0.3)]">
                  <Tag className="w-3 h-3" /> Agent prices applied
                </div>
              )}
            </div>

            {/* Status panel */}
            <div className="lg:col-span-5">
              <div className="relative rounded-3xl border border-border/70 bg-card/80 backdrop-blur-xl p-5 shadow-[0_28px_60px_-22px_hsl(var(--primary)/0.3)] overflow-hidden">
                {/* gradient top edge */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${sysStatus.online ? 'bg-success' : 'bg-destructive'}`} />
                      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${sysStatus.online ? 'bg-success' : 'bg-destructive'}`} />
                    </span>
                    <span className={`text-[11px] font-bold tracking-wide uppercase ${sysStatus.online ? 'text-success' : 'text-destructive'}`}>
                      {sysStatus.online ? (sysStatus.statusText || 'All systems online') : 'System offline'}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success ring-1 ring-success/25">
                    <Shield className="w-2.5 h-2.5" /> Secure
                  </span>
                </div>
                {sysStatus.online && (
                  <div className="mb-4">
                    <LiveDeliveryChip />
                  </div>
                )}
                <div className="grid grid-cols-3 gap-1 pt-4 border-t border-border/60">
                  {NETWORKS.map((n) => (
                    <div key={n} className="relative flex flex-col items-center gap-1.5 px-2 py-2 rounded-xl hover:bg-muted/50 transition-colors">
                      <span className={`w-2 h-2 rounded-full ${networkAccent[n]} shadow-[0_0_10px_currentColor] opacity-90`} />
                      <span className="text-[10px] font-bold uppercase tracking-wide text-foreground/80">{n}</span>
                      <span className="text-[11px] tabular font-semibold text-muted-foreground">{networkCounts[n] ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FILTERS BAR (sticky) ── */}
      <div className="sticky top-14 z-30 bg-background/80 backdrop-blur-xl backdrop-saturate-150 shadow-[0_8px_24px_-16px_hsl(var(--primary)/0.18)]">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
        <div className="container py-3 relative">
          <div className="flex items-center gap-2 overflow-x-auto snap-row">
            <button
              onClick={() => handleNetworkFilter(null)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[12px] font-semibold transition-all duration-200 ${
                !networkFilter
                  ? 'bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.55)]'
                  : 'bg-card/70 backdrop-blur-sm border border-border/70 text-foreground/75 hover:text-foreground hover:border-primary/40'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" /> All
              <span className={`tabular text-[10.5px] px-1.5 rounded-full ${!networkFilter ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground'}`}>{networkCounts.all || 0}</span>
            </button>
            {NETWORKS.map((n) => {
              const active = networkFilter === n;
              return (
                <button
                  key={n}
                  onClick={() => handleNetworkFilter(n)}
                  className={`shrink-0 inline-flex items-center gap-2 px-3.5 h-9 rounded-full text-[12px] font-semibold transition-all duration-200 ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.55)]'
                      : 'bg-card/70 backdrop-blur-sm border border-border/70 text-foreground/75 hover:text-foreground hover:border-primary/40'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${networkAccent[n]} ${active ? 'shadow-[0_0_8px_currentColor]' : ''}`} />
                  {n}
                  <span className={`tabular text-[10.5px] px-1.5 rounded-full ${active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground'}`}>{networkCounts[n] ?? 0}</span>
                </button>
              );
            })}

            <div className="ml-auto shrink-0 hidden sm:flex items-center gap-2 pl-3">
              <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="bg-card/70 backdrop-blur-sm border border-border/70 rounded-full px-3 h-9 text-[12px] font-semibold text-foreground outline-none cursor-pointer hover:border-primary/40 transition-colors"
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
              className="flex-1 bg-card/70 backdrop-blur-sm border border-border/70 rounded-full px-3 h-9 text-[12px] font-semibold text-foreground outline-none"
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

        {/* Results context strip */}
        {!isLoading && filteredBundles.length > 0 && (
          <div className="flex items-center justify-between mb-5 animate-fade-in">
            <p className="text-[12.5px] text-muted-foreground">
              Showing{' '}
              <span className="font-bold text-foreground tabular">{filteredBundles.length}</span>
              {networkFilter ? (
                <>
                  {' '}<span className="font-semibold">{networkFilter}</span> bundle{filteredBundles.length === 1 ? '' : 's'}
                </>
              ) : (
                <> bundle{filteredBundles.length === 1 ? '' : 's'} across all networks</>
              )}
            </p>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
              <span className="w-1 h-1 rounded-full bg-success" /> Tap any bundle to buy
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="relative rounded-3xl overflow-hidden border border-border/70 bg-card p-5 h-[260px]">
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/40 via-primary/15 to-primary/40 skeleton-shimmer" />
                <div className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/10 to-transparent`} />
                <div className="relative flex flex-col h-full">
                  <div className="flex items-center justify-between mb-5">
                    <div className="h-6 w-20 rounded-full skeleton-shimmer" />
                    <div className="h-5 w-14 rounded-md skeleton-shimmer" />
                  </div>
                  <div className="h-12 w-24 rounded-lg skeleton-shimmer mb-2" />
                  <div className="h-3 w-28 rounded-full skeleton-shimmer" />
                  <div className="mt-auto pt-4 border-t border-dashed border-border/60 flex items-center justify-between">
                    <div className="space-y-1.5">
                      <div className="h-2.5 w-12 rounded-full skeleton-shimmer" />
                      <div className="h-5 w-20 rounded-md skeleton-shimmer" />
                    </div>
                    <div className="h-8 w-20 rounded-full skeleton-shimmer" />
                  </div>
                </div>
              </div>
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
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 mx-auto mb-5 flex items-center justify-center shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.4)]">
              <PackageSearch className="w-7 h-7 text-primary" strokeWidth={1.8} />
            </div>
            <h3 className="font-display font-bold text-xl tracking-tight">
              {networkFilter ? `No ${networkFilter} bundles right now` : 'No bundles to show'}
            </h3>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              {networkFilter
                ? 'This network is temporarily out of stock. Try another network or check back soon.'
                : 'Bundles are being refreshed — try again in a moment.'}
            </p>
            {networkFilter && (
              <button
                onClick={() => handleNetworkFilter(null)}
                className="mt-6 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-[0_10px_28px_-10px_hsl(var(--primary)/0.6)] hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-10px_hsl(var(--primary)/0.7)] transition-all"
              >
                <Smartphone className="w-3.5 h-3.5" /> Show all networks
              </button>
            )}
          </div>
        )}

        {!isLoading && filteredBundles.length > 0 && (
          <div className="mt-12 max-w-2xl mx-auto animate-fade-in">
            <ImportantNotice />
          </div>
        )}

        {/* Inline trust strip */}
        {!isLoading && filteredBundles.length > 0 && (
          <div className="mt-10 grid sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {[
              { icon: Zap, title: 'Fast delivery', desc: 'Most orders complete in minutes' },
              { icon: Shield, title: 'Secure checkout', desc: 'Paystack-grade payments' },
              { icon: Tag, title: 'Genuinely cheaper', desc: 'Better than direct prices' },
            ].map((it) => (
              <div key={it.title} className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-12px_hsl(var(--primary)/0.3)]">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/25 flex items-center justify-center mb-3 shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.35)]">
                    <it.icon className="w-4 h-4 text-primary" strokeWidth={1.9} />
                  </div>
                  <p className="text-[13px] font-semibold">{it.title}</p>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">{it.desc}</p>
                </div>
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
