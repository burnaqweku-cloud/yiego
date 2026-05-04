import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/contexts/AdminContext';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { formatPrice } from '@/data/bundles';
import { toast } from 'sonner';

const SupplierSync = () => {
  const { bundles, refreshBundles } = useAdmin();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ updated: number; unchanged: number; failed: number; error?: string } | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      // Call the supplier API to get current prices
      const baseUrl = 'https://instantdatagh.com/api.php';
      // We'll try to fetch products/pricing from supplier
      // Note: This is a simplified sync - in production you might call an edge function
      const { data, error } = await supabase.functions.invoke('sync-supplier-prices', {});
      
      if (error) {
        setSyncResult({ updated: 0, unchanged: 0, failed: bundles.length, error: error.message });
        toast.error('Sync failed: ' + error.message);
      } else if (data) {
        setSyncResult(data);
        if (data.updated > 0) {
          toast.success(`Synced! ${data.updated} prices updated`);
          await refreshBundles();
        } else {
          toast.info('All prices are up to date');
        }
      }
    } catch (err: any) {
      setSyncResult({ updated: 0, unchanged: 0, failed: bundles.length, error: err.message });
      toast.error('Sync failed');
    }
    setSyncing(false);
  };

  // Show supplier cost status for all bundles
  const bundlesByStatus = {
    hasCost: bundles.filter(b => b.cost_price_ghs != null && Number(b.cost_price_ghs) > 0),
    noCost: bundles.filter(b => !b.cost_price_ghs || Number(b.cost_price_ghs) <= 0),
    stale: bundles.filter(b => {
      if (!b.supplier_last_updated) return !!b.cost_price_ghs;
      return (Date.now() - new Date(b.supplier_last_updated).getTime()) > 7 * 24 * 60 * 60 * 1000;
    }),
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <h3 className="font-semibold text-sm">Supplier Cost Status</h3>
        
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3 text-center">
            <CheckCircle className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-emerald-600">{bundlesByStatus.hasCost.length}</p>
            <p className="text-[10px] text-muted-foreground">Has Cost</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 text-center">
            <AlertTriangle className="w-4 h-4 text-amber-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-amber-600">{bundlesByStatus.stale.length}</p>
            <p className="text-[10px] text-muted-foreground">Stale (7d+)</p>
          </div>
          <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3 text-center">
            <AlertTriangle className="w-4 h-4 text-destructive mx-auto mb-1" />
            <p className="text-lg font-bold text-destructive">{bundlesByStatus.noCost.length}</p>
            <p className="text-[10px] text-muted-foreground">Missing</p>
          </div>
        </div>

        <Button onClick={handleSync} disabled={syncing} className="w-full gap-2">
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync Supplier Prices'}
        </Button>

        {syncResult && (
          <div className={`rounded-lg p-3 text-sm ${syncResult.error ? 'bg-destructive/10 text-destructive' : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700'}`}>
            {syncResult.error ? (
              <p>Error: {syncResult.error}</p>
            ) : (
              <p>Updated: {syncResult.updated} | Unchanged: {syncResult.unchanged} | Failed: {syncResult.failed}</p>
            )}
          </div>
        )}
      </div>

      {/* Bundle cost details */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left">
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Bundle</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Supplier Cost</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Last Updated</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {bundles.map(b => {
              const hasCost = b.cost_price_ghs != null && Number(b.cost_price_ghs) > 0;
              const isStale = b.supplier_last_updated
                ? (Date.now() - new Date(b.supplier_last_updated).getTime()) > 7 * 24 * 60 * 60 * 1000
                : hasCost;

              return (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <span className="text-[10px] text-muted-foreground mr-1">{b.network}</span>
                    <span className="font-semibold">{b.bundle_size_gb}GB</span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {hasCost ? formatPrice(Number(b.cost_price_ghs)) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-muted-foreground">
                    {b.supplier_last_updated
                      ? new Date(b.supplier_last_updated).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {!hasCost ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">Missing</span>
                    ) : isStale ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium flex items-center gap-0.5 w-fit">
                        <Clock className="w-2.5 h-2.5" /> Stale
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SupplierSync;
