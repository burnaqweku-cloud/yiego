import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAdmin, type DbBundle } from '@/contexts/AdminContext';
import { useAuth } from '@/hooks/useAuth';
import { formatPrice, NETWORKS, type Network, type DeliveryType } from '@/data/bundles';
import { usePricing } from '@/hooks/usePricing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import NonExpiryBadge from '@/components/bundles/NonExpiryBadge';

const AdminProducts = () => {
  const { bundles, addBundle, updateBundle, deleteBundle } = useAdmin();
  const { user, isAdmin, loading } = useAuth();
  const { getSellingPrice } = usePricing();
  const navigate = useNavigate();
  const [editBundle, setEditBundle] = useState<DbBundle | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [networkFilter, setNetworkFilter] = useState<Network | 'All'>('All');

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate('/auth');
  }, [user, isAdmin, loading, navigate]);

  if (loading || !user || !isAdmin) return null;

  const filtered = networkFilter === 'All' ? bundles : bundles.filter(b => b.network === networkFilter);

  const handleToggleActive = (bundle: DbBundle) => {
    updateBundle(bundle.id, { active: !bundle.active });
    toast.success(`${bundle.network} ${bundle.bundle_size_gb}GB ${bundle.active ? 'disabled' : 'enabled'}`);
  };

  const handleDelete = (bundle: DbBundle) => {
    if (confirm(`Delete ${bundle.network} ${bundle.bundle_size_gb}GB bundle?`)) {
      deleteBundle(bundle.id);
      toast.success('Bundle deleted');
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold">Products</h2>
            <p className="text-muted-foreground text-sm">Manage data bundles</p>
          </div>
          <Button onClick={() => setShowAdd(true)} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Add Bundle
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setNetworkFilter('All')} className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${networkFilter === 'All' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>All</button>
          {NETWORKS.map(n => (
            <button key={n} onClick={() => setNetworkFilter(n)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${networkFilter === n ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>{n}</button>
          ))}
        </div>

        <div className="bg-card rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Network</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Size</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Description</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cost</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Markup</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Selling</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Active</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(bundle => {
                const sellingPrice = getSellingPrice(bundle);
                const hasCost = bundle.cost_price_ghs != null && Number(bundle.cost_price_ghs) > 0;
                return (
                  <tr key={bundle.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{bundle.network}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-bold">{bundle.bundle_size_gb}GB</span>
                        <NonExpiryBadge size="xs" network={bundle.network} />
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">{bundle.description || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {hasCost ? formatPrice(Number(bundle.cost_price_ghs)) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {bundle.markup_percent != null ? `${bundle.markup_percent}%` : 'Default'}
                    </td>
                    <td className="px-4 py-3 font-medium text-primary">{formatPrice(sellingPrice)}</td>
                    <td className="px-4 py-3">
                      <Switch checked={bundle.active} onCheckedChange={() => handleToggleActive(bundle)} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setEditBundle(bundle)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(bundle)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(showAdd || editBundle) && (
        <BundleFormDialog
          bundle={editBundle}
          onClose={() => { setEditBundle(null); setShowAdd(false); }}
          onSave={async (data) => {
            if (editBundle) {
              await updateBundle(editBundle.id, data);
              toast.success('Bundle updated');
            } else {
              await addBundle(data as Omit<DbBundle, 'id' | 'created_at'>);
              toast.success('Bundle added');
            }
            setEditBundle(null);
            setShowAdd(false);
          }}
        />
      )}
    </AdminLayout>
  );
};

interface BundleFormDialogProps {
  bundle: DbBundle | null;
  onClose: () => void;
  onSave: (data: Partial<DbBundle>) => void;
}

const BundleFormDialog = ({ bundle, onClose, onSave }: BundleFormDialogProps) => {
  const [network, setNetwork] = useState<Network>((bundle?.network as Network) || 'MTN');
  const [bundleSizeGB, setBundleSizeGB] = useState(bundle?.bundle_size_gb?.toString() || '');
  const [description, setDescription] = useState(bundle?.description || '');
  const [costPriceGHS, setCostPriceGHS] = useState(bundle?.cost_price_ghs?.toString() || '');
  const [markupPercent, setMarkupPercent] = useState(bundle?.markup_percent?.toString() || '');
  const [priceGHS, setPriceGHS] = useState(bundle?.price_ghs?.toString() || '');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>((bundle?.delivery_type as DeliveryType) || 'Instant');
  const [active, setActive] = useState(bundle?.active ?? true);
  const [popular, setPopular] = useState(bundle?.popular ?? false);

  const calculatedPrice = useMemo(() => {
    const cost = parseFloat(costPriceGHS);
    const markup = parseFloat(markupPercent);
    if (!isNaN(cost) && cost > 0 && !isNaN(markup)) {
      return Math.round(cost * (1 + markup / 100) * 100) / 100;
    }
    return null;
  }, [costPriceGHS, markupPercent]);

  const handleSubmit = () => {
    if (!bundleSizeGB) {
      toast.error('Please fill in size');
      return;
    }

    const costPrice = parseFloat(costPriceGHS);
    const markup = parseFloat(markupPercent);
    const manualPrice = parseFloat(priceGHS);

    let sellingPrice = manualPrice;
    if (!isNaN(costPrice) && costPrice > 0) {
      if (!isNaN(markup)) {
        sellingPrice = Math.round(costPrice * (1 + markup / 100) * 100) / 100;
      } else {
        sellingPrice = manualPrice || costPrice;
      }
    }

    if (!sellingPrice || sellingPrice <= 0) {
      toast.error('Please fill in cost price or selling price');
      return;
    }

    onSave({
      network,
      bundle_size_gb: parseFloat(bundleSizeGB),
      description,
      price_ghs: sellingPrice,
      cost_price_ghs: !isNaN(costPrice) ? costPrice : null,
      markup_percent: !isNaN(markup) ? markup : null,
      delivery_type: deliveryType,
      active,
      popular,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{bundle ? 'Edit Bundle' : 'Add Bundle'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Network</Label>
            <Select value={network} onValueChange={v => setNetwork(v as Network)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{NETWORKS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Size (GB)</Label>
            <Input type="number" value={bundleSizeGB} onChange={e => setBundleSizeGB(e.target.value)} placeholder="5" className="mt-1" min="0.5" step="0.5" />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. No Expiry" className="mt-1" />
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pricing</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cost Price (GHS)</Label>
                <Input type="number" value={costPriceGHS} onChange={e => setCostPriceGHS(e.target.value)} placeholder="Supplier cost" className="mt-1" min="0" step="0.50" />
              </div>
              <div>
                <Label>Markup (%)</Label>
                <Input type="number" value={markupPercent} onChange={e => setMarkupPercent(e.target.value)} placeholder="Default" className="mt-1" min="0" step="0.5" />
              </div>
            </div>
            {calculatedPrice !== null && (
              <p className="text-xs text-primary font-medium mt-2">
                → Calculated selling price: {formatPrice(calculatedPrice)}
              </p>
            )}
          </div>

          <div>
            <Label>Selling Price (GHS) {calculatedPrice !== null ? '(auto)' : ''}</Label>
            <Input
              type="number"
              value={calculatedPrice !== null ? calculatedPrice.toFixed(2) : priceGHS}
              onChange={e => setPriceGHS(e.target.value)}
              placeholder="22.00"
              className="mt-1"
              min="0"
              step="0.50"
              readOnly={calculatedPrice !== null}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {calculatedPrice !== null
                ? 'Auto-calculated from cost × markup. Clear cost price to set manually.'
                : 'Set manually, or enter cost price + markup above to auto-calculate.'}
            </p>
          </div>

          <div>
            <Label>Delivery Type</Label>
            <Select value={deliveryType} onValueChange={v => setDeliveryType(v as DeliveryType)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Instant">Instant</SelectItem>
                <SelectItem value="Manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={active} onCheckedChange={setActive} /></div>
          <div className="flex items-center justify-between"><Label>Popular (featured)</Label><Switch checked={popular} onCheckedChange={setPopular} /></div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleSubmit} className="flex-1">{bundle ? 'Save' : 'Add Bundle'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminProducts;
