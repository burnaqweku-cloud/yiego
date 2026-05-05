import { useState, useEffect, useCallback } from 'react';
import AdminLayout from './AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { RefreshCw, Route, CheckCircle, AlertCircle, FlaskConical } from 'lucide-react';

interface Product {
  id: string;
  network: string;
  bundle_size_gb: number;
  description: string;
  active: boolean;
  price_ghs: number;
}

interface Supplier {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface RoutingRule {
  id: string;
  product_id: string;
  supplier_id: string;
  status: string;
}

const NETWORK_ORDER = ['MTN', 'Telecel', 'AirtelTigo'];

const AdminRouting = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [filterNetwork, setFilterNetwork] = useState<string>('all');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [productsRes, suppliersRes, rulesRes] = await Promise.all([
      supabase.from('products').select('id, network, bundle_size_gb, description, active, price_ghs').eq('active', true).order('network').order('bundle_size_gb'),
      supabase.from('suppliers').select('id, code, name, is_active'),
      supabase.from('routing_rules').select('*').eq('status', 'ACTIVE'),
    ]);
    setProducts((productsRes.data as Product[]) || []);
    setSuppliers((suppliersRes.data as Supplier[]) || []);
    setRules((rulesRes.data as RoutingRule[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const ruleMap: Record<string, RoutingRule> = {};
  rules.forEach(r => { ruleMap[r.product_id] = r; });

  const supplierMap: Record<string, Supplier> = {};
  suppliers.forEach(s => { supplierMap[s.id] = s; });

  const handleRouteChange = async (productId: string, supplierId: string) => {
    setSaving(productId);
    try {
      const existingRule = ruleMap[productId];

      if (supplierId === 'none') {
        // Remove routing - product uses default (Supplier A)
        if (existingRule) {
          await supabase.from('routing_rules').update({ status: 'INACTIVE' }).eq('id', existingRule.id);
        }
      } else if (existingRule) {
        // Update existing rule
        await supabase.from('routing_rules').update({
          supplier_id: supplierId,
          status: 'ACTIVE',
          updated_at: new Date().toISOString(),
        }).eq('id', existingRule.id);
      } else {
        // Create new rule
        await supabase.from('routing_rules').insert({
          product_id: productId,
          supplier_id: supplierId,
          status: 'ACTIVE',
        });
      }

      toast.success('Route updated');
      fetchAll();
    } catch (err) {
      toast.error('Failed to update route');
    }
    setSaving(null);
  };

  const handleDryRun = async (productId: string) => {
    setTesting(productId);
    try {
      const { data, error } = await supabase.functions.invoke('supplier-admin', {
        body: { action: 'dry_run_route', product_id: productId },
      });
      if (error || !data?.ok) {
        toast.error('Dry run failed: ' + (error?.message || data?.error || 'unknown'));
      } else if (data.would_dispatch) {
        toast.success(`✓ Would dispatch via ${data.supplier_name} (${data.routed_by})`);
      } else {
        toast.warning(`⚠ ${data.supplier_name}: ${data.blockers.join(' • ')}`, { duration: 8000 });
      }
    } catch (err: any) {
      toast.error('Network error: ' + err?.message);
    }
    setTesting(null);
  };

  const filteredProducts = filterNetwork === 'all'
    ? products
    : products.filter(p => p.network === filterNetwork);

  // Sort by network order then bundle size
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    const ni = NETWORK_ORDER.indexOf(a.network) - NETWORK_ORDER.indexOf(b.network);
    return ni !== 0 ? ni : a.bundle_size_gb - b.bundle_size_gb;
  });

  // Stats
  const routedCount = rules.length;
  const totalProducts = products.length;
  const datamartSupplier = suppliers.find(s => s.code === 'DATAMART');
  const datamartRouted = datamartSupplier ? rules.filter(r => r.supplier_id === datamartSupplier.id).length : 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold">Supplier Routing</h2>
            <p className="text-muted-foreground text-sm">Assign which supplier delivers each product</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAll}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card rounded-xl p-4 border border-border card-shadow">
            <p className="text-xs text-muted-foreground font-medium">Total Products</p>
            <p className="text-2xl font-display font-bold mt-1">{totalProducts}</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border card-shadow">
            <p className="text-xs text-muted-foreground font-medium">Custom Routed</p>
            <p className="text-2xl font-display font-bold mt-1">{routedCount}</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border card-shadow">
            <p className="text-xs text-muted-foreground font-medium">DataMart Routed</p>
            <p className="text-2xl font-display font-bold mt-1">{datamartRouted}</p>
          </div>
        </div>

        {/* Info bar */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
          <Route className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">How routing works</p>
            <p className="text-xs text-muted-foreground mt-1">
              Products without a custom route default to <strong>Supplier A</strong>. 
              Assign a supplier to override the default for specific products. Only one active supplier per product.
            </p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 items-center">
          {['all', ...NETWORK_ORDER].map(net => (
            <button
              key={net}
              onClick={() => setFilterNetwork(net)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterNetwork === net
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {net === 'all' ? 'All Networks' : net}
            </button>
          ))}
        </div>

        {/* Products table */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Network</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Supplier</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map(product => {
                  const rule = ruleMap[product.id];
                  const currentSupplier = rule ? supplierMap[rule.supplier_id] : null;
                  const isDefault = !rule;

                  return (
                    <tr key={product.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <span className="font-display font-bold">{product.bundle_size_gb}GB</span>
                        <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">{product.description}</span>
                        <span className="text-xs text-muted-foreground ml-2 sm:hidden">{product.network}</span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs font-semibold">{product.network}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={rule ? rule.supplier_id : 'none'}
                          onValueChange={(val) => handleRouteChange(product.id, val)}
                          disabled={saving === product.id}
                        >
                          <SelectTrigger className="h-8 w-40 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Default (Supplier A)</SelectItem>
                            {suppliers.filter(s => s.is_active).map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {isDefault ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              Default
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                              <CheckCircle className="w-3 h-3" />
                              {currentSupplier?.name || 'Assigned'}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDryRun(product.id)}
                            disabled={testing === product.id}
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-border hover:bg-muted/50 disabled:opacity-50"
                            title="Dry-run route resolution (no real order)"
                          >
                            <FlaskConical className="w-3 h-3" />
                            {testing === product.id ? '...' : 'Test'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminRouting;
