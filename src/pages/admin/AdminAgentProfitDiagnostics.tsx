import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from './AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { format, subDays } from 'date-fns';
import { formatPrice } from '@/data/bundles';
import { AlertTriangle, CheckCircle, RefreshCw, Wrench } from 'lucide-react';
import { toast } from 'sonner';

interface DiagRow {
  id: string;
  order_id: string;
  created_at: string;
  network: string;
  bundle_size_gb: number;
  customer_phone: string;
  status: string;
  agent_id: string;
  agent_selling_price: number;
  agent_cost_price: number;
  profit_ghs: number;
  profit_credited: boolean;
  wallet_credit_found: boolean;
  wallet_credit_amount: number | null;
  mismatch_reason: string;
}

const maskPhone = (phone: string) => {
  if (!phone || phone.length < 4) return '****';
  return '****' + phone.slice(-4);
};

const mismatchColor: Record<string, string> = {
  OK: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  PROFIT_MISSING: 'bg-destructive/10 text-destructive',
  WALLET_NOT_CREDITED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  AMOUNT_MISMATCH: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  DATA_MISSING_FIELDS: 'bg-muted text-muted-foreground',
};

const AdminAgentProfitDiagnostics = () => {
  const [rows, setRows] = useState<DiagRow[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [networkFilter, setNetworkFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [mismatchFilter, setMismatchFilter] = useState('all');

  useEffect(() => {
    supabase.from('agents').select('id, store_name').neq('status', 'deleted').then(({ data }) => {
      if (data) setAgents(data);
    });
  }, []);

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch agent orders
      let query = (supabase.from('agent_orders') as any)
        .select('id, order_id, created_at, network, bundle_size_gb, customer_phone, status, agent_id, agent_selling_price, agent_cost_price, profit_ghs, profit_credited')
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`)
        .order('created_at', { ascending: false })
        .limit(500);

      if (networkFilter !== 'all') query = query.eq('network', networkFilter);
      if (agentFilter !== 'all') query = query.eq('agent_id', agentFilter);
      if (statusFilter !== 'all') query = query.ilike('status', statusFilter);

      const { data: orders, error } = await query;
      if (error) { console.error(error); setLoading(false); return; }
      if (!orders || orders.length === 0) { setRows([]); setLoading(false); return; }

      // Fetch wallet transactions for these order_ids
      const orderIds = orders.map((o: any) => o.order_id);
      const { data: walletTxns } = await (supabase.from('agent_wallet_transactions') as any)
        .select('order_id, amount_ghs')
        .in('order_id', orderIds);

      const walletMap = new Map<string, number>();
      (walletTxns || []).forEach((t: any) => {
        walletMap.set(t.order_id, Number(t.amount_ghs || 0));
      });

      const diagRows: DiagRow[] = orders.map((o: any) => {
        const sellPrice = Number(o.agent_selling_price || 0);
        const costPrice = Number(o.agent_cost_price || 0);
        const profitRecorded = Number(o.profit_ghs || 0);
        const profitExpected = sellPrice > 0 && costPrice > 0 ? sellPrice - costPrice : 0;
        const walletCreditFound = walletMap.has(o.order_id);
        const walletCreditAmount = walletMap.get(o.order_id) ?? null;
        const isDelivered = o.status?.toLowerCase() === 'delivered';

        let mismatch = 'OK';
        if (sellPrice === 0 || costPrice === 0) {
          mismatch = 'DATA_MISSING_FIELDS';
        } else if (profitRecorded === 0 && profitExpected > 0) {
          mismatch = 'PROFIT_MISSING';
        } else if (isDelivered && !walletCreditFound && profitRecorded > 0) {
          mismatch = 'WALLET_NOT_CREDITED';
        } else if (walletCreditFound && walletCreditAmount !== null && Math.abs(walletCreditAmount - profitRecorded) > 0.01) {
          mismatch = 'AMOUNT_MISMATCH';
        }

        return {
          id: o.id,
          order_id: o.order_id,
          created_at: o.created_at,
          network: o.network,
          bundle_size_gb: o.bundle_size_gb,
          customer_phone: o.customer_phone,
          status: o.status,
          agent_id: o.agent_id,
          agent_selling_price: sellPrice,
          agent_cost_price: costPrice,
          profit_ghs: profitRecorded,
          profit_credited: o.profit_credited,
          wallet_credit_found: walletCreditFound,
          wallet_credit_amount: walletCreditAmount,
          mismatch_reason: mismatch,
        };
      });

      const filtered = mismatchFilter === 'all' ? diagRows : diagRows.filter(r => r.mismatch_reason === mismatchFilter);
      setRows(filtered);
    } catch (err) {
      console.error('Diagnostics error:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, networkFilter, agentFilter, statusFilter, mismatchFilter]);

  useEffect(() => { fetchDiagnostics(); }, [fetchDiagnostics]);

  const agentName = (agentId: string) => agents.find(a => a.id === agentId)?.store_name || agentId.slice(0, 8);

  const issueCount = rows.filter(r => r.mismatch_reason !== 'OK').length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold">Agent Profit Diagnostics</h1>
            <p className="text-sm text-muted-foreground">Read-only analysis of agent store order profits and wallet credits</p>
          </div>
          <Button size="sm" variant="outline" onClick={fetchDiagnostics} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">From</label>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">To</label>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Network</label>
                <Select value={networkFilter} onValueChange={setNetworkFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="MTN">MTN</SelectItem>
                    <SelectItem value="Telecel">Telecel</SelectItem>
                    <SelectItem value="AirtelTigo">AirtelTigo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Agent</label>
                <Select value={agentFilter} onValueChange={setAgentFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Agents</SelectItem>
                    {agents.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.store_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Order Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Mismatch</label>
                <Select value={mismatchFilter} onValueChange={setMismatchFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="OK">OK Only</SelectItem>
                    <SelectItem value="PROFIT_MISSING">Profit Missing</SelectItem>
                    <SelectItem value="WALLET_NOT_CREDITED">Wallet Not Credited</SelectItem>
                    <SelectItem value="AMOUNT_MISMATCH">Amount Mismatch</SelectItem>
                    <SelectItem value="DATA_MISSING_FIELDS">Data Missing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Orders</p>
              <p className="text-2xl font-bold">{rows.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Issues Found</p>
              <p className={`text-2xl font-bold ${issueCount > 0 ? 'text-destructive' : 'text-green-600'}`}>{issueCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Wallet Not Credited</p>
              <p className="text-2xl font-bold text-amber-600">{rows.filter(r => r.mismatch_reason === 'WALLET_NOT_CREDITED').length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Profit Missing</p>
              <p className="text-2xl font-bold text-destructive">{rows.filter(r => r.mismatch_reason === 'PROFIT_MISSING').length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="px-3 py-3 font-medium">Order ID</th>
                    <th className="px-3 py-3 font-medium hidden sm:table-cell">Agent</th>
                    <th className="px-3 py-3 font-medium hidden md:table-cell">Network</th>
                    <th className="px-3 py-3 font-medium hidden lg:table-cell">Recipient</th>
                    <th className="px-3 py-3 font-medium text-right">Sell Price</th>
                    <th className="px-3 py-3 font-medium text-right hidden sm:table-cell">Cost Price</th>
                    <th className="px-3 py-3 font-medium text-right hidden md:table-cell">Profit (Rec)</th>
                    <th className="px-3 py-3 font-medium text-right hidden md:table-cell">Wallet Credit</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Diagnosis</th>
                    <th className="px-3 py-3 font-medium hidden lg:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                      {loading ? 'Loading...' : 'No orders found for the selected filters'}
                    </td></tr>
                  ) : rows.map(r => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono text-xs">{r.order_id}</td>
                      <td className="px-3 py-2 text-xs hidden sm:table-cell">{agentName(r.agent_id)}</td>
                      <td className="px-3 py-2 text-xs hidden md:table-cell">{r.network} {r.bundle_size_gb}GB</td>
                      <td className="px-3 py-2 text-xs hidden lg:table-cell font-mono">{maskPhone(r.customer_phone)}</td>
                      <td className="px-3 py-2 text-xs text-right">{formatPrice(r.agent_selling_price)}</td>
                      <td className="px-3 py-2 text-xs text-right hidden sm:table-cell">{formatPrice(r.agent_cost_price)}</td>
                      <td className="px-3 py-2 text-xs text-right hidden md:table-cell font-semibold">{formatPrice(r.profit_ghs)}</td>
                      <td className="px-3 py-2 text-xs text-right hidden md:table-cell">
                        {r.wallet_credit_found ? (
                          <span className="text-green-600">{formatPrice(r.wallet_credit_amount || 0)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          r.status?.toLowerCase() === 'delivered' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                          r.status?.toLowerCase() === 'failed' ? 'bg-destructive/10 text-destructive' :
                          'bg-primary/15 text-primary'
                        }`}>{r.status}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${mismatchColor[r.mismatch_reason] || 'bg-muted text-muted-foreground'}`}>
                          {r.mismatch_reason === 'OK' && <CheckCircle className="w-3 h-3 inline mr-0.5" />}
                          {r.mismatch_reason !== 'OK' && <AlertTriangle className="w-3 h-3 inline mr-0.5" />}
                          {r.mismatch_reason}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground hidden lg:table-cell">
                        {format(new Date(r.created_at), 'dd MMM, HH:mm')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Backfill Tool */}
        <BackfillTool
          dateFrom={dateFrom}
          dateTo={dateTo}
          agentFilter={agentFilter}
          networkFilter={networkFilter}
          onComplete={fetchDiagnostics}
        />
      </div>
    </AdminLayout>
  );
};

/* ─── Backfill Tool Component ─── */
interface BackfillProps {
  dateFrom: string;
  dateTo: string;
  agentFilter: string;
  networkFilter: string;
  onComplete: () => void;
}

const BackfillTool = ({ dateFrom, dateTo, agentFilter, networkFilter, onComplete }: BackfillProps) => {
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runPreview = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-agent-profits', {
        body: {
          mode: 'preview',
          date_from: dateFrom,
          date_to: dateTo,
          agent_id: agentFilter,
          network: networkFilter,
        },
      });
      if (error) throw error;
      setPreview(data);
    } catch (err: any) {
      toast.error('Preview failed: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const runExecute = async () => {
    setExecuting(true);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-agent-profits', {
        body: {
          mode: 'execute',
          date_from: dateFrom,
          date_to: dateTo,
          agent_id: agentFilter,
          network: networkFilter,
        },
      });
      if (error) throw error;
      setResult(data);
      setPreview(null);
      setConfirmOpen(false);
      toast.success(`Backfill complete: ${data.credited} orders credited, GHS ${data.total_credited_amount}`);
      onComplete();
    } catch (err: any) {
      toast.error('Backfill failed: ' + (err.message || 'Unknown error'));
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Wrench className="w-4 h-4" /> Backfill Missing Agent Profits
            </h3>
            <p className="text-xs text-muted-foreground">Scan for paid orders without profit credits and fix them. Uses current filters. Safe to run multiple times.</p>
          </div>
          <Button size="sm" onClick={runPreview} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Preview
          </Button>
        </div>

        {preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Orders to Credit</p>
                <p className="text-xl font-bold">{preview.count}</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Total Amount</p>
                <p className="text-xl font-bold">{formatPrice(preview.total_amount)}</p>
              </div>
            </div>

            {preview.count > 0 && (
              <div className="overflow-x-auto max-h-40">
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-muted-foreground">
                    <th className="px-2 py-1 text-left">Order</th>
                    <th className="px-2 py-1 text-left">Network</th>
                    <th className="px-2 py-1 text-right">Profit</th>
                    <th className="px-2 py-1 text-left">Date</th>
                  </tr></thead>
                  <tbody>
                    {preview.orders.slice(0, 20).map((o: any) => (
                      <tr key={o.order_id} className="border-b last:border-0">
                        <td className="px-2 py-1 font-mono">{o.order_id}</td>
                        <td className="px-2 py-1">{o.network} {o.bundle_size_gb}GB</td>
                        <td className="px-2 py-1 text-right font-semibold">{formatPrice(o.profit)}</td>
                        <td className="px-2 py-1 text-muted-foreground">{format(new Date(o.created_at), 'dd MMM, HH:mm')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.orders.length > 20 && (
                  <p className="text-xs text-muted-foreground text-center py-1">...and {preview.orders.length - 20} more</p>
                )}
              </div>
            )}

            {preview.count > 0 && (
              <Button onClick={() => setConfirmOpen(true)} className="w-full">
                Run Backfill ({preview.count} orders, {formatPrice(preview.total_amount)})
              </Button>
            )}
          </div>
        )}

        {result && (
          <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 space-y-1">
            <p className="text-sm font-semibold text-green-800 dark:text-green-400">Backfill Complete</p>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div><p className="text-muted-foreground">Credited</p><p className="font-bold">{result.credited}</p></div>
              <div><p className="text-muted-foreground">Skipped</p><p className="font-bold">{result.skipped}</p></div>
              <div><p className="text-muted-foreground">Errors</p><p className="font-bold">{result.errors}</p></div>
              <div><p className="text-muted-foreground">Amount</p><p className="font-bold">{formatPrice(result.total_credited_amount)}</p></div>
            </div>
          </div>
        )}

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Confirm Profit Backfill</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <p className="text-sm">This will credit profits for <strong>{preview?.count || 0}</strong> orders totaling <strong>{formatPrice(preview?.total_amount || 0)}</strong>.</p>
              <p className="text-xs text-muted-foreground">This operation is safe to run multiple times — duplicate credits are prevented by the database constraint.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button onClick={runExecute} disabled={executing}>
                {executing ? 'Processing...' : 'Confirm Backfill'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default AdminAgentProfitDiagnostics;
