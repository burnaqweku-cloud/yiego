import { useState, useEffect, useCallback } from 'react';
import AdminLayout from './AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  RefreshCw, CheckCircle, XCircle, Zap, TestTube, Wallet,
  Clock, Globe, Shield
} from 'lucide-react';

interface Supplier {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  api_base_url: string | null;
  supports_webhooks: boolean;
  last_balance: number | null;
  last_balance_updated_at: string | null;
}

const AdminSuppliers = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('suppliers').select('*').order('created_at');
    setSuppliers((data as Supplier[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const toggleActive = async (supplier: Supplier) => {
    const { error } = await supabase
      .from('suppliers')
      .update({ is_active: !supplier.is_active })
      .eq('id', supplier.id);
    if (error) toast.error('Failed to update');
    else {
      toast.success(`${supplier.name} ${!supplier.is_active ? 'activated' : 'deactivated'}`);
      fetchSuppliers();
    }
  };

  const testConnection = async (code: string) => {
    setTesting(code);
    try {
      const { data, error } = await supabase.functions.invoke('supplier-admin', {
        body: { action: 'test_connection', supplier_code: code },
      });
      if (error) toast.error('Test failed: ' + error.message);
      else if (data?.connected) toast.success(`${code} connected! Balance: GHS ${data.balance?.toFixed(2) || '?'}`);
      else toast.error(`${code} connection failed: ${data?.error || 'Unknown'}`);
    } catch { toast.error('Network error'); }
    setTesting(null);
  };

  const refreshBalance = async (code: string) => {
    setRefreshing(code);
    try {
      const { data, error } = await supabase.functions.invoke('supplier-admin', {
        body: { action: 'check_balance', supplier_code: code },
      });
      if (error) toast.error('Failed: ' + error.message);
      else if (data?.ok) {
        toast.success(`${code} balance: GHS ${data.balance?.toFixed(2)}`);
        fetchSuppliers();
      } else toast.error(data?.error || 'Failed to fetch balance');
    } catch { toast.error('Network error'); }
    setRefreshing(null);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold">Supplier Management</h2>
            <p className="text-muted-foreground text-sm">Configure and monitor delivery suppliers</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchSuppliers}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {suppliers.map(supplier => (
              <div key={supplier.id} className="bg-card rounded-xl border border-border p-5 card-shadow space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      supplier.is_active ? 'bg-emerald-500/10' : 'bg-muted'
                    }`}>
                      <Zap className={`w-5 h-5 ${supplier.is_active ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-base">{supplier.name}</h3>
                      <p className="text-xs text-muted-foreground font-mono">{supplier.code}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleActive(supplier)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      supplier.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                      supplier.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground font-medium uppercase">Balance</span>
                    </div>
                    <p className="text-lg font-display font-bold">
                      {supplier.last_balance != null ? `GHS ${supplier.last_balance.toFixed(2)}` : '—'}
                    </p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground font-medium uppercase">Updated</span>
                    </div>
                    <p className="text-xs font-medium">
                      {supplier.last_balance_updated_at
                        ? new Date(supplier.last_balance_updated_at).toLocaleString()
                        : 'Never'}
                    </p>
                  </div>
                </div>

                {/* Features */}
                <div className="flex gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    supplier.is_active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
                  }`}>
                    {supplier.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {supplier.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {supplier.supports_webhooks && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      <Globe className="w-3 h-3" /> Webhooks
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    <Shield className="w-3 h-3" /> API Key Secured
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button
                    variant="outline" size="sm"
                    onClick={() => testConnection(supplier.code)}
                    disabled={testing === supplier.code}
                    className="gap-1.5 text-xs flex-1"
                  >
                    <TestTube className="w-3.5 h-3.5" />
                    {testing === supplier.code ? 'Testing...' : 'Test Connection'}
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => refreshBalance(supplier.code)}
                    disabled={refreshing === supplier.code}
                    className="gap-1.5 text-xs flex-1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing === supplier.code ? 'animate-spin' : ''}`} />
                    {refreshing === supplier.code ? 'Fetching...' : 'Refresh Balance'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminSuppliers;
