import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { formatPrice } from '@/data/bundles';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface Props {
  agentId: string;
  wallet: any;
  orders: any[];
}

const AgentProfitDebugPanel = ({ agentId, wallet, orders }: Props) => {
  const [walletTxns, setWalletTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from('agent_wallet_transactions') as any)
        .select('*')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(20);
      setWalletTxns(data || []);
      setLoading(false);
    })();
  }, [agentId]);

  const balance = Number(wallet?.available_balance || 0);
  const hasTxns = walletTxns.length > 0;
  const profitOrders = orders.filter(o => Number(o.profit_ghs || 0) > 0);
  const walletCredits = walletTxns.filter(t => t.type === 'profit_credit' || t.type === 'admin_credit');

  // Warning conditions
  const balanceZeroButTxns = balance === 0 && hasTxns;
  const profitsExistNoCredits = profitOrders.length > 0 && walletCredits.length === 0;

  return (
    <div className="space-y-4">
      {/* Warning Banners */}
      {balanceZeroButTxns && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">Balance is GHS 0 but wallet transactions exist</p>
              <p className="text-xs text-amber-700 dark:text-amber-500">This may indicate incorrect debits or missing credits. Review the transactions below.</p>
            </div>
          </CardContent>
        </Card>
      )}
      {profitsExistNoCredits && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-semibold text-destructive">Orders have recorded profits but no wallet credits found</p>
              <p className="text-xs text-muted-foreground">Profit crediting may not be functioning for this agent.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Raw Wallet Balance Source */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Wallet Balance (Raw)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Available</p><p className="font-bold">{formatPrice(balance)}</p></div>
            <div><p className="text-xs text-muted-foreground">Pending</p><p className="font-bold">{formatPrice(Number(wallet?.pending_balance || 0))}</p></div>
            <div><p className="text-xs text-muted-foreground">Total Earned</p><p className="font-bold">{formatPrice(Number(wallet?.total_earned || 0))}</p></div>
            <div><p className="text-xs text-muted-foreground">Total Withdrawn</p><p className="font-bold">{formatPrice(Number(wallet?.total_withdrawn || 0))}</p></div>
          </div>
        </CardContent>
      </Card>

      {/* Last 20 Wallet Transactions */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b">
            <h3 className="text-sm font-semibold">Last 20 Wallet Transactions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/30 text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                <th className="px-3 py-2 font-medium hidden sm:table-cell">Order</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Description</th>
                <th className="px-3 py-2 font-medium">Date</th>
              </tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Loading...</td></tr>
                ) : walletTxns.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No wallet transactions</td></tr>
                ) : walletTxns.map((t: any) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        t.type === 'profit_credit' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                        t.type === 'admin_credit' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                        t.type === 'withdrawal' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-muted text-muted-foreground'
                      }`}>{t.type}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-right font-medium">{formatPrice(Number(t.amount_ghs))}</td>
                    <td className="px-3 py-2 text-xs font-mono hidden sm:table-cell">{t.order_id || '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground hidden md:table-cell truncate max-w-[200px]">{t.description || '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{format(new Date(t.created_at), 'dd MMM, HH:mm')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Last 20 Orders with Profit Fields */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b">
            <h3 className="text-sm font-semibold">Last 20 Agent Orders — Profit Fields</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/30 text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium text-right">Sell</th>
                <th className="px-3 py-2 font-medium text-right">Cost</th>
                <th className="px-3 py-2 font-medium text-right">Profit</th>
                <th className="px-3 py-2 font-medium">Credited</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {orders.slice(0, 20).map((o: any) => {
                  const profitCredited = o.profit_credited === true;
                  return (
                    <tr key={o.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono text-xs">{o.order_id}</td>
                      <td className="px-3 py-2 text-xs text-right">{formatPrice(Number(o.agent_selling_price || 0))}</td>
                      <td className="px-3 py-2 text-xs text-right">{formatPrice(Number(o.agent_cost_price || 0))}</td>
                      <td className="px-3 py-2 text-xs text-right font-semibold">{formatPrice(Number(o.profit_ghs || 0))}</td>
                      <td className="px-3 py-2 text-xs">
                        {profitCredited ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          o.status?.toLowerCase() === 'delivered' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                          o.status?.toLowerCase() === 'failed' ? 'bg-destructive/10 text-destructive' :
                          'bg-primary/15 text-primary'
                        }`}>{o.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentProfitDebugPanel;
