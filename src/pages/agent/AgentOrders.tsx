import { useState, useEffect } from 'react';
import { useAgent } from '@/hooks/useAgent';
import { useStoreStatus } from '@/hooks/useStoreStatus';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import AgentLayout from './AgentLayout';
import AgentGate from '@/components/agent/AgentGate';
import { OrdersSkeleton } from '@/components/agent/AgentSkeletons';
import { format } from 'date-fns';
import { ShoppingCart, Filter, Search } from 'lucide-react';

const NETWORK_ORDER = ['All', 'MTN', 'Telecel', 'AirtelTigo'];


const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    Delivered: 'badge-delivered', Processing: 'badge-processing', Paid: 'badge-processing',
    Failed: 'badge-failed', pending: 'badge-pending', awaiting_payment: 'badge-pending',
  };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${map[status] || 'badge-pending'}`}>{status}</span>;
};

const NETWORK_DOT: Record<string, string> = {
  MTN: 'bg-mtn', Telecel: 'bg-telecel', AirtelTigo: 'bg-airteltigo',
};

const AgentOrders = () => {
  const { agent } = useAgent();
  const { storeStatus, loading: statusLoading } = useStoreStatus();
  const [orders, setOrders] = useState<any[]>([]);
  // True total — never capped by the row default. Used for the "{N} total orders" header.
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!agent) return;
    fetchOrders();
  }, [agent]);

  const fetchOrders = async () => {
    if (!agent) return;
    setLoading(true);
    // Fetch most-recent 500 rows for the list (already paginated UI-side via filter/search),
    // and a separate exact count for the displayed total.
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from('agent_orders' as any)
        .select('*')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('agent_orders' as any)
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agent.id),
    ]);
    if (data) setOrders(data as any[]);
    setTotalCount(count || 0);
    setLoading(false);
  };

  const filtered = orders.filter(o => {
    const matchNetwork = filter === 'All' || o.network === filter;
    const matchSearch = !search ||
      o.order_id?.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_phone?.includes(search) ||
      o.customer_name?.toLowerCase().includes(search.toLowerCase());
    return matchNetwork && matchSearch;
  });

  return (
    <AgentGate>
    <AgentLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Orders</h1>
            <p className="text-xs text-muted-foreground">{totalCount.toLocaleString('en-US')} total orders</p>
          </div>
          <div className="flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            {NETWORK_ORDER.map(net => (
              <button
                key={net}
                onClick={() => setFilter(net)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                  filter === net
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {net}
              </button>
            ))}
          </div>
        </div>

        {/* Search by Order ID */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by Order ID, phone, or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        <Card className="card-shadow border-border">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4"><OrdersSkeleton /></div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <ShoppingCart className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {search ? 'No orders match your search' : 'No orders found'}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground bg-muted/30">
                        <th className="px-4 py-3 font-medium text-xs">Order</th>
                        <th className="px-4 py-3 font-medium text-xs">Customer</th>
                        <th className="px-4 py-3 font-medium text-xs">Bundle</th>
                        <th className="px-4 py-3 font-medium text-xs">Selling</th>
                        <th className="px-4 py-3 font-medium text-xs">Profit</th>
                        <th className="px-4 py-3 font-medium text-xs">Status</th>
                        <th className="px-4 py-3 font-medium text-xs">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((o: any) => (
                        <tr key={o.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-mono text-[11px]">{o.order_id}</td>
                          <td className="px-4 py-3 text-xs">{o.customer_phone}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <div className={`w-2 h-2 rounded-full ${NETWORK_DOT[o.network] || 'bg-muted'}`} />
                              <span className="text-xs font-medium">{o.network} {o.bundle_size_gb}GB</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs">GHS {Number(o.agent_selling_price).toFixed(2)}</td>
                          <td className="px-4 py-3 text-xs text-success font-semibold">+GHS {Number(o.profit_ghs).toFixed(2)}</td>
                          <td className="px-4 py-3">{statusBadge(o.status)}</td>
                          <td className="px-4 py-3 text-[11px] text-muted-foreground">
                            {o.created_at ? format(new Date(o.created_at), 'dd MMM, HH:mm') : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile List */}
                <div className="md:hidden divide-y divide-border/50">
                  {filtered.map((o: any) => (
                    <div key={o.id} className="flex items-center gap-3 px-4 py-3">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${NETWORK_DOT[o.network] || 'bg-muted'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{o.network} {o.bundle_size_gb}GB</p>
                          {statusBadge(o.status)}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {o.order_id} · {o.customer_phone} · {o.created_at ? format(new Date(o.created_at), 'dd MMM, HH:mm') : ''}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-success shrink-0">+GHS {Number(o.profit_ghs).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AgentLayout>
    </AgentGate>
  );
};

export default AgentOrders;