import { useState, useEffect } from 'react';
import { useAgent } from '@/hooks/useAgent';
import { useStoreStatus } from '@/hooks/useStoreStatus';
import { usePricing } from '@/hooks/usePricing';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AgentLayout from './AgentLayout';
import AgentGate from '@/components/agent/AgentGate';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import type { DbBundle } from '@/contexts/AdminContext';

const NETWORK_ORDER = ['MTN', 'Telecel', 'AirtelTigo'];

const AgentPricing = () => {
  const { agent } = useAgent();
  const { storeStatus, loading: statusLoading } = useStoreStatus();
  const { getAgentPrice, getSellingPrice } = usePricing();
  const [products, setProducts] = useState<DbBundle[]>([]);
  const [pricingOverrides, setPricingOverrides] = useState<Record<string, string>>({});
  const [existingPricing, setExistingPricing] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState('MTN');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (storeStatus === 'active') {
      fetchProducts();
      if (agent) fetchPricing();
    }
  }, [agent, storeStatus]);

  const fetchProducts = async () => {
    setLoading(true);
    const { data } = await supabase.from('products').select('*').eq('active', true).order('bundle_size_gb');
    if (data) setProducts(data as unknown as DbBundle[]);
    setLoading(false);
  };

  const fetchPricing = async () => {
    if (!agent) return;
    const { data } = await supabase
      .from('agent_pricing' as any)
      .select('*')
      .eq('agent_id', agent.id);
    if (data) {
      setExistingPricing(data);
      const overrides: Record<string, string> = {};
      data.forEach((p: any) => {
        if (p.product_id && p.custom_price) overrides[p.product_id] = String(p.custom_price);
      });
      setPricingOverrides(overrides);
    }
  };

  const getBasePrice = (product: DbBundle): number => {
    return getAgentPrice(product);
  };

  const getProfit = (product: DbBundle): { value: number; hasInput: boolean; belowBase: boolean } => {
    const override = pricingOverrides[product.id];
    const basePrice = getBasePrice(product);
    if (!override || override.trim() === '') return { value: 0, hasInput: false, belowBase: false };
    const selling = parseFloat(override);
    if (isNaN(selling)) return { value: 0, hasInput: false, belowBase: false };
    const belowBase = selling < basePrice;
    return { value: belowBase ? 0 : selling - basePrice, hasInput: true, belowBase };
  };

  const handleSave = async () => {
    if (!agent) return;
    setSaving(true);
    try {
      for (const product of filteredProducts) {
        const customPrice = pricingOverrides[product.id];
        if (customPrice && parseFloat(customPrice) > 0) {
          const basePrice = getBasePrice(product);
          if (parseFloat(customPrice) < basePrice) {
            toast.error(`Price for ${product.network} ${product.bundle_size_gb}GB cannot be below your base price of GHS ${basePrice.toFixed(2)}`);
            setSaving(false);
            return;
          }
          const existing = existingPricing.find((p: any) => p.product_id === product.id);
          if (existing) {
            await supabase.from('agent_pricing' as any).update({ custom_price: parseFloat(customPrice) }).eq('id', existing.id);
          } else {
            await supabase.from('agent_pricing' as any).insert({
              agent_id: agent.id, product_id: product.id, custom_price: parseFloat(customPrice),
            });
          }
        }
      }
      toast.success('Pricing saved!');
      fetchPricing();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products
    .filter(p => p.network === selectedNetwork)
    .sort((a, b) => a.bundle_size_gb - b.bundle_size_gb);

  return (
    <AgentGate>
    <AgentLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-bold">Pricing & Markup</h1>
          <p className="text-xs text-muted-foreground">Set your selling prices and see your profit per bundle.</p>
        </div>

        {/* Info Banner */}
        <div className="flex items-start gap-2.5 bg-primary/5 rounded-xl p-3 border border-primary/10">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <strong>Base Price</strong> is the price DataSika sells to you. <strong>Your Profit</strong> is what you earn per order.
          </p>
        </div>

        {/* Network Tabs */}
        <div className="flex gap-2">
          {NETWORK_ORDER.map(net => (
            <button
              key={net}
              onClick={() => setSelectedNetwork(net)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors btn-press ${
                selectedNetwork === net
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {net}
            </button>
          ))}
        </div>

        {/* Bundle Cards */}
        {loading ? (
          <div className="flex justify-center py-12"><div className="spinner" /></div>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map(p => {
              const basePrice = getBasePrice(p);
              const { value: profit, hasInput, belowBase } = getProfit(p);
              return (
                <Card key={p.id} className="card-shadow border-border overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    {/* Bundle Title */}
                    <p className="text-base font-bold">{p.bundle_size_gb}GB</p>

                    {/* Base Price */}
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium mb-1">Base Price</p>
                      <span className="inline-block bg-muted rounded-lg px-3 py-1.5 text-sm font-bold">
                        GHS {basePrice.toFixed(2)}
                      </span>
                    </div>

                    {/* Selling Price Input */}
                    <div>
                      <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Your Selling Price</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">GHS</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={pricingOverrides[p.id] || ''}
                          onChange={e => setPricingOverrides(prev => ({ ...prev, [p.id]: e.target.value }))}
                          placeholder="Enter your selling price"
                          className="h-10 text-sm pl-11"
                        />
                      </div>
                      {belowBase && (
                        <p className="text-[10px] text-destructive mt-1 font-medium">
                          Selling price cannot be below your base price.
                        </p>
                      )}
                    </div>

                    {/* Profit */}
                    <div className="flex items-center justify-between pt-1 border-t border-border/50">
                      <p className="text-[11px] text-muted-foreground font-medium">Your Profit</p>
                      <p className={`text-sm font-bold ${belowBase ? 'text-destructive' : hasInput && profit > 0 ? 'text-success' : 'text-foreground'}`}>
                        {hasInput ? `GHS ${profit.toFixed(2)}` : '—'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto" size="lg">
          {saving ? 'Saving...' : 'Save Pricing'}
        </Button>
      </div>
    </AgentLayout>
    </AgentGate>
  );
};

export default AgentPricing;
