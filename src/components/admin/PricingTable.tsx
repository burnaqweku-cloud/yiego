import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin, type DbBundle } from '@/contexts/AdminContext';
import { usePricing, type PricingOverride } from '@/hooks/usePricing';
import { NETWORKS, type Network, formatPrice } from '@/data/bundles';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowUp, ArrowDown, AlertTriangle, Check, X } from 'lucide-react';
import NonExpiryBadge from '@/components/bundles/NonExpiryBadge';

interface Props {
  customerType: 'normal' | 'agent';
}

const PricingTable = ({ customerType }: Props) => {
  const { bundles, refreshBundles } = useAdmin();
  const { config, getSellingPrice, getAgentPrice, getOverride, refreshPricing, applyRounding, computeAgentAutoPrice } = usePricing();
  const [networkFilter, setNetworkFilter] = useState<Network | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'manual' | 'no_cost'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editedOverrides, setEditedOverrides] = useState<Record<string, { mode: string; price: string; markup: string }>>({});
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [showSupplierCost, setShowSupplierCost] = useState(false);

  const filtered = useMemo(() => {
    let list = bundles.filter(b => b.active);
    if (networkFilter !== 'All') list = list.filter(b => b.network === networkFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(b => 
        b.bundle_size_gb.toString().includes(q) ||
        b.description?.toLowerCase().includes(q) ||
        b.network.toLowerCase().includes(q)
      );
    }
    if (filterMode === 'manual') {
      list = list.filter(b => {
        const ov = getOverride(b.id, customerType);
        return ov?.pricing_mode === 'manual';
      });
    }
    if (filterMode === 'no_cost') {
      list = list.filter(b => !b.cost_price_ghs || Number(b.cost_price_ghs) <= 0);
    }
    return list.sort((a, b) => {
      if (a.network !== b.network) {
        const netOrder: Record<string, number> = { MTN: 0, Telecel: 1, AirtelTigo: 2 };
        return (netOrder[a.network] ?? 99) - (netOrder[b.network] ?? 99);
      }
      if ((a.display_order || 0) !== (b.display_order || 0)) return (a.display_order || 0) - (b.display_order || 0);
      return a.bundle_size_gb - b.bundle_size_gb;
    });
  }, [bundles, networkFilter, searchQuery, filterMode, customerType, getOverride]);

  const getEditState = (bundleId: string) => {
    if (editedOverrides[bundleId]) return editedOverrides[bundleId];
    const ov = getOverride(bundleId, customerType);
    return {
      mode: ov?.pricing_mode || 'auto',
      price: ov?.manual_price?.toString() || '',
      markup: ov?.markup_percent_override?.toString() || '',
    };
  };

  const setEdit = (bundleId: string, field: string, value: string) => {
    setEditedOverrides(prev => ({
      ...prev,
      [bundleId]: { ...getEditState(bundleId), [field]: value },
    }));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(b => b.id)));
    }
  };

  const handleSave = async () => {
    if (Object.keys(editedOverrides).length === 0) {
      toast.info('No changes to save');
      return;
    }
    setSaving(true);
    try {
      for (const [productId, edit] of Object.entries(editedOverrides)) {
        const manualPrice = edit.mode === 'manual' && edit.price ? parseFloat(edit.price) : null;
        const markupOverride = edit.markup ? parseFloat(edit.markup) : null;

        if (manualPrice !== null && manualPrice < 0) {
          toast.error('Prices cannot be negative');
          setSaving(false);
          return;
        }

        const existing = getOverride(productId, customerType);
        if (existing) {
          await supabase
            .from('pricing_overrides')
            .update({
              pricing_mode: edit.mode,
              manual_price: manualPrice,
              markup_percent_override: markupOverride,
            })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('pricing_overrides')
            .insert({
              product_id: productId,
              customer_type: customerType,
              pricing_mode: edit.mode,
              manual_price: manualPrice,
              markup_percent_override: markupOverride,
            });
        }
      }
      toast.success('Pricing saved!');
      setEditedOverrides({});
      await refreshPricing();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    }
    setSaving(false);
  };

  const handleBulkSetMode = async (mode: 'auto' | 'manual') => {
    if (selectedIds.size === 0) { toast.error('Select bundles first'); return; }
    selectedIds.forEach(id => {
      setEditedOverrides(prev => ({
        ...prev,
        [id]: { ...getEditState(id), mode },
      }));
    });
    toast.info(`Set ${selectedIds.size} bundles to ${mode} mode`);
  };

  const handleBulkClearOverrides = async () => {
    if (selectedIds.size === 0) { toast.error('Select bundles first'); return; }
    setSaving(true);
    try {
      for (const id of selectedIds) {
        const existing = getOverride(id, customerType);
        if (existing) {
          await supabase.from('pricing_overrides').delete().eq('id', existing.id);
        }
      }
      setEditedOverrides(prev => {
        const next = { ...prev };
        selectedIds.forEach(id => delete next[id]);
        return next;
      });
      toast.success(`Cleared overrides for ${selectedIds.size} bundles`);
      await refreshPricing();
    } catch {
      toast.error('Failed to clear overrides');
    }
    setSaving(false);
  };

  const handleMove = async (bundle: DbBundle, direction: 'up' | 'down') => {
    const sameNetwork = filtered.filter(b => b.network === bundle.network);
    const idx = sameNetwork.findIndex(b => b.id === bundle.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sameNetwork.length) return;

    setReordering(true);
    const currentOrder = bundle.display_order || idx;
    const swapOrder = sameNetwork[swapIdx].display_order || swapIdx;

    await Promise.all([
      supabase.from('products').update({ display_order: swapOrder } as any).eq('id', bundle.id),
      supabase.from('products').update({ display_order: currentOrder } as any).eq('id', sameNetwork[swapIdx].id),
    ]);
    await refreshBundles();
    setReordering(false);
  };

  const [bulkMarkup, setBulkMarkup] = useState('');
  const hasChanges = Object.keys(editedOverrides).length > 0;

  const isAgent = customerType === 'agent';

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1">
          <button onClick={() => setNetworkFilter('All')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${networkFilter === 'All' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>All</button>
          {NETWORKS.map(n => (
            <button key={n} onClick={() => setNetworkFilter(n)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${networkFilter === n ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>{n}</button>
          ))}
        </div>
        <Input placeholder="Search bundles..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-40 h-8 text-xs" />
        <Select value={filterMode} onValueChange={v => setFilterMode(v as any)}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All bundles</SelectItem>
            <SelectItem value="manual">Manual only</SelectItem>
            <SelectItem value="no_cost">Missing cost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk tools */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap gap-2 items-center bg-primary/5 rounded-xl p-3 border border-primary/10">
          <span className="text-xs font-semibold">{selectedIds.size} selected</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBulkSetMode('auto')}>Set Auto</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBulkSetMode('manual')}>Set Manual</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={handleBulkClearOverrides}>Clear overrides</Button>
        </div>
      )}

      {/* Supplier cost toggle for agent tab */}
      {isAgent && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Checkbox checked={showSupplierCost} onCheckedChange={(v) => setShowSupplierCost(!!v)} />
          View supplier cost (internal)
        </label>
      )}

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left">
              <th className="px-3 py-2.5 w-8">
                <Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">Network</th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">Bundle</th>
              {!isAgent && (
                <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">Supplier Cost</th>
              )}
              {isAgent && showSupplierCost && (
                <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">Supplier Cost</th>
              )}
              {isAgent && (
                <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">Normal Retail</th>
              )}
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">Mode</th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                {isAgent ? 'Agent Base Price' : 'Selling Price'}
              </th>
              {isAgent ? (
                <>
                  <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">Disc vs Retail</th>
                  {showSupplierCost && (
                    <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">Admin Margin</th>
                  )}
                </>
              ) : (
                <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">Profit</th>
              )}
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground w-20">Order</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(bundle => {
              const costPrice = bundle.cost_price_ghs != null ? Number(bundle.cost_price_ghs) : null;
              const hasCost = costPrice !== null && costPrice > 0;
              const edit = getEditState(bundle.id);
              const isManual = edit.mode === 'manual';
              const normalPrice = getSellingPrice(bundle);
              const isEdited = !!editedOverrides[bundle.id];

              let displayPrice: number;
              let discountVsRetail: number | null = null;
              let supplierMargin: number | null = null;
              let profit: number | null = null;
              const warnings: string[] = [];

              if (isAgent) {
                displayPrice = isManual && edit.price ? parseFloat(edit.price) : getAgentPrice(bundle);
                discountVsRetail = normalPrice - displayPrice;
                supplierMargin = hasCost ? displayPrice - costPrice! : null;

                if (displayPrice > normalPrice) warnings.push('Not discounted');
                if (hasCost && displayPrice < costPrice!) warnings.push('Below supplier cost');
              } else {
                displayPrice = isManual && edit.price ? parseFloat(edit.price) : getSellingPrice(bundle);
                profit = hasCost ? displayPrice - costPrice! : null;
                if (profit !== null && profit < 0) warnings.push('Negative profit');
              }

              if (!hasCost) warnings.push('No supplier cost');

              const staleSupplier = bundle.supplier_last_updated
                ? (Date.now() - new Date(bundle.supplier_last_updated).getTime()) > 7 * 24 * 60 * 60 * 1000
                : !hasCost;

              return (
                <tr key={bundle.id} className={`border-b border-border last:border-0 hover:bg-muted/20 ${isEdited ? 'bg-primary/5' : ''}`}>
                  <td className="px-3 py-2.5">
                    <Checkbox checked={selectedIds.has(bundle.id)} onCheckedChange={() => toggleSelect(bundle.id)} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="secondary" className="text-[10px]">{bundle.network}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold">{bundle.bundle_size_gb}GB</span>
                      <NonExpiryBadge size="xs" network={bundle.network} />
                    </div>
                    {bundle.description && <span className="text-muted-foreground text-[10px]">({bundle.description})</span>}
                  </td>
                  {!isAgent && (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <span className={`text-xs ${hasCost ? '' : 'text-muted-foreground'}`}>
                          {hasCost ? formatPrice(costPrice!) : '—'}
                        </span>
                        {staleSupplier && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                      </div>
                    </td>
                  )}
                  {isAgent && showSupplierCost && (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <span className={`text-xs ${hasCost ? '' : 'text-muted-foreground'}`}>
                          {hasCost ? formatPrice(costPrice!) : '—'}
                        </span>
                        {staleSupplier && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                      </div>
                    </td>
                  )}
                  {isAgent && (
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-muted-foreground">{formatPrice(normalPrice)}</span>
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    <Select value={edit.mode} onValueChange={v => setEdit(bundle.id, 'mode', v)}>
                      <SelectTrigger className="w-24 h-7 text-[10px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2.5">
                    {isManual ? (
                      <Input
                        type="number"
                        value={edit.price}
                        onChange={e => setEdit(bundle.id, 'price', e.target.value)}
                        placeholder={displayPrice.toFixed(2)}
                        className="w-24 h-7 text-xs"
                        min="0"
                        step="0.01"
                      />
                    ) : (
                      <span className="font-medium text-primary text-xs">{formatPrice(displayPrice)}</span>
                    )}
                  </td>
                  {isAgent ? (
                    <>
                      <td className="px-3 py-2.5">
                        {discountVsRetail !== null ? (
                          <span className={`text-xs font-bold ${discountVsRetail >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                            {formatPrice(discountVsRetail)}
                          </span>
                        ) : <span className="text-[10px] text-muted-foreground">—</span>}
                        {warnings.length > 0 && (
                          <div className="mt-0.5">
                            {warnings.map((w, i) => (
                              <span key={i} className="text-[9px] text-amber-600 block">{w}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      {showSupplierCost && (
                        <td className="px-3 py-2.5">
                          {supplierMargin !== null ? (
                            <span className={`text-xs font-bold ${supplierMargin >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                              {formatPrice(supplierMargin)}
                            </span>
                          ) : <span className="text-[10px] text-muted-foreground">—</span>}
                        </td>
                      )}
                    </>
                  ) : (
                    <td className="px-3 py-2.5">
                      {profit !== null ? (
                        <span className={`text-xs font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                          {formatPrice(profit)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                      {warnings.length > 0 && (
                        <div className="mt-0.5">
                          {warnings.map((w, i) => (
                            <span key={i} className="text-[9px] text-amber-600 block">{w}</span>
                          ))}
                        </div>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    <div className="flex gap-0.5">
                      <button onClick={() => handleMove(bundle, 'up')} disabled={reordering} className="p-1 hover:bg-muted rounded transition-colors disabled:opacity-30">
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleMove(bundle, 'down')} disabled={reordering} className="p-1 hover:bg-muted rounded transition-colors disabled:opacity-30">
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No bundles match your filters</p>
        )}
      </div>

      {/* Save button */}
      {hasChanges && (
        <div className="flex items-center gap-3 sticky bottom-4 bg-card border border-border rounded-xl p-3 shadow-lg">
          <span className="text-xs text-muted-foreground">{Object.keys(editedOverrides).length} change(s)</span>
          <Button variant="ghost" size="sm" onClick={() => setEditedOverrides({})} className="ml-auto gap-1">
            <X className="w-3 h-3" /> Discard
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
            <Check className="w-3 h-3" /> {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default PricingTable;