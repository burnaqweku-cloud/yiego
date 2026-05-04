import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatPrice } from '@/data/bundles';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Zap, CheckCircle, XCircle, RefreshCw, TrendingDown, AlertTriangle, TestTube, Clock, Download } from 'lucide-react';
import { toast } from 'sonner';

interface SupplierLog {
  order_id: string;
  created_at: string;
  supplier_status: string | null;
  supplier_message: string | null;
  supplier_order_id: string | null;
  supplier_remaining_balance: number | null;
  supplier_raw_response: string | null;
  status: string;
  network: string;
  bundle_size_gb: number;
  amount_ghs: number;
}

const AdminSupplier = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<SupplierLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFailed, setShowFailed] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate('/auth');
  }, [user, isAdmin, authLoading, navigate]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('orders')
      .select('order_id, created_at, supplier_status, supplier_message, supplier_order_id, supplier_remaining_balance, supplier_raw_response, status, network, bundle_size_gb, amount_ghs')
      .not('supplier_status', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);

    if (showFailed) query = query.eq('status', 'Failed');

    const { data } = await query;
    setLogs((data as SupplierLog[]) || []);
    setLoading(false);
  }, [showFailed]);

  useEffect(() => {
    if (isAdmin) fetchLogs();
  }, [isAdmin, fetchLogs]);

  if (authLoading || !user || !isAdmin) return null;

  const latestBalance = logs.find(l => l.supplier_remaining_balance != null)?.supplier_remaining_balance;
  const failedCount = logs.filter(l => l.status === 'Failed').length;
  const successCount = logs.filter(l => l.supplier_status === 'success' || l.status === 'Delivered').length;
  const totalLogs = logs.length;
  const errorRate = totalLogs > 0 ? ((failedCount / totalLogs) * 100).toFixed(1) : '0';
  const last24h = logs.filter(l => new Date(l.created_at) > new Date(Date.now() - 86400000));
  const last24hFailed = last24h.filter(l => l.status === 'Failed').length;
  const last24hRate = last24h.length > 0 ? ((last24hFailed / last24h.length) * 100).toFixed(1) : '0';

  // Balance trend from last 10 entries with balance
  const balanceEntries = logs.filter(l => l.supplier_remaining_balance != null).slice(0, 10);

  const handleTestApi = async () => {
    setTesting(true);
    toast.info('Testing supplier API connectivity...');

    try {
      const { data, error } = await supabase.functions.invoke('submit-supplier-order', {
        body: { order_id: 'TEST-CONNECTIVITY-CHECK' },
      });

      if (error) {
        toast.error('API test failed: ' + error.message);
      } else {
        toast.success('API endpoint reachable. Response: ' + JSON.stringify(data).substring(0, 100));
      }
    } catch (err) {
      toast.error('Network error during test');
    }
    setTesting(false);
  };

  const handleRetryOrder = async (orderId: string) => {
    toast.info('Retrying delivery for ' + orderId);
    await supabase.from('orders').update({ status: 'Pending', failure_reason: null } as any).eq('order_id', orderId);
    const { data, error } = await supabase.functions.invoke('submit-supplier-order', { body: { order_id: orderId } });
    if (error) toast.error('Retry failed');
    else if (data?.success) toast.success('Retry successful!');
    else toast.error(data?.reason || 'Unknown error');
    fetchLogs();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold">Supplier & API</h2>
            <p className="text-muted-foreground text-sm">Monitor API status, delivery logs, and balance</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={async () => {
              setSyncing(true);
              toast.info('Syncing DataCart plan mappings...');
              try {
                const { data, error } = await supabase.functions.invoke('supplier-admin', {
                  body: { action: 'sync_datacart_mappings' },
                });
                if (error) {
                  toast.error('Sync failed: ' + error.message);
                } else if (data?.ok) {
                  toast.success(`Synced ${data.upserted} plans from DataCart (${data.plans_found} total, ${data.skipped} skipped)${data.errors?.length ? '. Warnings: ' + data.errors.join('; ') : ''}`);
                } else {
                  toast.error('Sync failed: ' + (data?.error || 'Unknown error'));
                }
              } catch (err) {
                toast.error('Network error during sync');
              }
              setSyncing(false);
            }} disabled={syncing} className="gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" /> {syncing ? 'Syncing...' : 'Sync DataCart Plans'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleTestApi} disabled={testing} className="gap-1.5 text-xs">
              <TestTube className="w-3.5 h-3.5" /> {testing ? 'Testing...' : 'Test API'}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchLogs}><RefreshCw className="w-3.5 h-3.5" /></Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'API Status', value: 'Configured', icon: CheckCircle, color: 'text-success' },
            { label: 'Supplier Balance', value: latestBalance != null ? formatPrice(latestBalance) : '—', icon: TrendingDown, color: latestBalance != null && latestBalance < 50 ? 'text-destructive' : 'text-muted-foreground' },
            { label: 'Error Rate (All)', value: `${errorRate}%`, icon: AlertTriangle, color: Number(errorRate) > 10 ? 'text-destructive' : 'text-muted-foreground' },
            { label: 'Error Rate (24h)', value: `${last24hRate}%`, icon: Clock, color: Number(last24hRate) > 10 ? 'text-destructive' : 'text-success' },
            { label: 'Total API Calls', value: totalLogs, icon: Zap, color: 'text-primary' },
          ].map(stat => (
            <div key={stat.label} className="bg-card rounded-xl p-4 border border-border card-shadow">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
              </div>
              <p className="text-lg font-display font-bold">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Balance trend */}
        {balanceEntries.length > 1 && (
          <div className="bg-card rounded-xl border border-border p-4 card-shadow">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Balance History</p>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {balanceEntries.reverse().map((entry, i) => (
                <div key={i} className="bg-muted/30 rounded-lg p-2 min-w-[100px] text-center shrink-0">
                  <p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleDateString()}</p>
                  <p className="text-sm font-bold">{formatPrice(Number(entry.supplier_remaining_balance))}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 items-center">
          <button onClick={() => setShowFailed(false)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!showFailed ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
            All Logs ({totalLogs})
          </button>
          <button onClick={() => setShowFailed(true)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showFailed ? 'bg-destructive text-destructive-foreground' : 'bg-secondary text-secondary-foreground'}`}>
            Failed Only ({failedCount})
          </button>
        </div>

        {/* Delivery logs */}
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            {logs.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm">No supplier logs found</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Order</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Network</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Message</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Balance</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Time</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={`${log.order_id}-${log.created_at}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-primary">{log.order_id}</td>
                      <td className="px-4 py-3 hidden sm:table-cell text-xs">{log.network} {log.bundle_size_gb}GB</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          log.supplier_status === 'success' || log.status === 'Delivered' ? 'bg-success/10 text-success' :
                          log.status === 'Failed' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                        }`}>{log.supplier_status || log.status}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">{log.supplier_message || '—'}</td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell text-xs font-medium">
                        {log.supplier_remaining_balance != null ? formatPrice(Number(log.supplier_remaining_balance)) : '—'}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        {log.status === 'Failed' && (
                          <Button size="sm" variant="outline" onClick={() => handleRetryOrder(log.order_id)} className="gap-1 text-[10px] h-7 px-2">
                            <RefreshCw className="w-3 h-3" /> Retry
                          </Button>
                        )}
                        {log.supplier_raw_response && (
                          <details className="inline-block ml-1">
                            <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">Raw</summary>
                            <pre className="absolute right-4 mt-1 text-[10px] p-2 bg-popover border border-border rounded-lg shadow-lg max-w-xs overflow-auto whitespace-pre-wrap break-all z-50">{log.supplier_raw_response}</pre>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminSupplier;
