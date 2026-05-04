import { useState, useEffect } from 'react';
import { useAgent } from '@/hooks/useAgent';
import { useStoreStatus } from '@/hooks/useStoreStatus';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AgentLayout from './AgentLayout';
import AgentGate from '@/components/agent/AgentGate';
import { format } from 'date-fns';
import { Receipt, TrendingUp, ArrowDownCircle, Minus } from 'lucide-react';

const AgentTransactions = () => {
  const { agent } = useAgent();
  const { storeStatus, loading: statusLoading } = useStoreStatus();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agent) return;
    fetchTransactions();
  }, [agent]);

  const fetchTransactions = async () => {
    if (!agent) return;
    setLoading(true);
    const { data } = await supabase
      .from('agent_wallet_transactions' as any)
      .select('*')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false });
    if (data) setTransactions(data);
    setLoading(false);
  };

  const getTypeInfo = (type: string) => {
    switch (type) {
      case 'commission': return { icon: TrendingUp, color: 'text-success', bgColor: 'bg-success/10', label: 'Profit' };
      case 'withdrawal': return { icon: ArrowDownCircle, color: 'text-destructive', bgColor: 'bg-destructive/10', label: 'Withdrawal' };
      default: return { icon: Minus, color: 'text-muted-foreground', bgColor: 'bg-muted', label: type };
    }
  };

  return (
    <AgentGate>
    <AgentLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-bold">Transactions</h1>
          <p className="text-xs text-muted-foreground">All money movements in your agent wallet</p>
        </div>

        <Card className="card-shadow border-border">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><div className="spinner" /></div>
            ) : transactions.length === 0 ? (
              <div className="py-16 text-center">
                <Receipt className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No transactions yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {transactions.map((t: any) => {
                  const info = getTypeInfo(t.type);
                  const isCredit = t.type !== 'withdrawal';
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${info.bgColor} shrink-0`}>
                        <info.icon className={`w-4 h-4 ${info.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{info.label}</p>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                            t.status === 'completed' ? 'badge-delivered' : 'badge-pending'
                          }`}>
                            {t.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {t.description || '—'} · {t.created_at ? format(new Date(t.created_at), 'dd MMM yyyy, HH:mm') : ''}
                        </p>
                      </div>
                      <span className={`text-sm font-bold shrink-0 ${isCredit ? 'text-success' : 'text-destructive'}`}>
                        {isCredit ? '+' : '-'}GHS {Number(t.amount_ghs).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AgentLayout>
    </AgentGate>
  );
};

export default AgentTransactions;
