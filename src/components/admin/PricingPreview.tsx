import { useState, useMemo } from 'react';
import { useAdmin, type DbBundle } from '@/contexts/AdminContext';
import { usePricing } from '@/hooks/usePricing';
import { NETWORKS, type Network, formatPrice } from '@/data/bundles';
import { Eye } from 'lucide-react';

type ViewMode = 'guest' | 'user' | 'agent';

const PricingPreview = () => {
  const { bundles } = useAdmin();
  const { getSellingPrice, getAgentPrice } = usePricing();
  const [viewMode, setViewMode] = useState<ViewMode>('guest');
  const [networkFilter, setNetworkFilter] = useState<Network | 'All'>('All');

  const activeBundles = useMemo(() => {
    let list = bundles.filter(b => b.active);
    if (networkFilter !== 'All') list = list.filter(b => b.network === networkFilter);
    return list.sort((a, b) => {
      const netOrder: Record<string, number> = { MTN: 0, Telecel: 1, AirtelTigo: 2 };
      if (a.network !== b.network) return (netOrder[a.network] ?? 99) - (netOrder[b.network] ?? 99);
      if ((a.display_order || 0) !== (b.display_order || 0)) return (a.display_order || 0) - (b.display_order || 0);
      return a.bundle_size_gb - b.bundle_size_gb;
    });
  }, [bundles, networkFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Eye className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Preview as:</span>
        <div className="flex gap-1">
          {(['guest', 'user', 'agent'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === mode ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
              }`}
            >
              {mode === 'guest' ? 'Guest' : mode === 'user' ? 'Logged-in User' : 'Agent Store'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 flex-wrap">
        <button onClick={() => setNetworkFilter('All')} className={`px-3 py-1 rounded text-xs font-medium ${networkFilter === 'All' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>All</button>
        {NETWORKS.map(n => (
          <button key={n} onClick={() => setNetworkFilter(n)} className={`px-3 py-1 rounded text-xs font-medium ${networkFilter === n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{n}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {activeBundles.map(bundle => {
          const retailPrice = getSellingPrice(bundle);
          const agentBase = getAgentPrice(bundle);
          const costPrice = bundle.cost_price_ghs != null ? Number(bundle.cost_price_ghs) : null;
          const hasCost = costPrice !== null && costPrice > 0;

          const displayPrice = viewMode === 'agent' ? agentBase : retailPrice;
          const discountVsRetail = retailPrice - agentBase;
          const supplierMargin = hasCost ? agentBase - costPrice! : null;

          return (
            <div key={bundle.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted">{bundle.network}</span>
                {bundle.popular && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-primary/10 text-primary">Popular</span>}
              </div>
              <p className="text-lg font-bold">{bundle.bundle_size_gb}GB</p>
              {bundle.description && <p className="text-[10px] text-muted-foreground">{bundle.description}</p>}
              
              <p className="text-primary font-bold">{formatPrice(displayPrice)}</p>

              {/* Full breakdown for admin insight */}
              <div className="space-y-0.5 border-t border-border pt-2">
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Supplier Cost</span>
                  <span>{hasCost ? formatPrice(costPrice!) : '—'}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Normal Retail</span>
                  <span>{formatPrice(retailPrice)}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Agent Base</span>
                  <span className="text-emerald-600 font-semibold">{formatPrice(agentBase)}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Disc vs Retail</span>
                  <span className={discountVsRetail >= 0 ? 'text-emerald-600' : 'text-destructive'}>
                    {formatPrice(discountVsRetail)}
                  </span>
                </div>
                {supplierMargin !== null && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Supplier Margin</span>
                    <span className={supplierMargin >= 0 ? 'text-emerald-600' : 'text-destructive'}>
                      {formatPrice(supplierMargin)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {activeBundles.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">No active bundles</p>
      )}
    </div>
  );
};

export default PricingPreview;