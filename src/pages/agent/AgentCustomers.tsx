import { useState, useEffect, useMemo } from 'react';
import { useAgent } from '@/hooks/useAgent';
import { useStoreStatus } from '@/hooks/useStoreStatus';
import { supabase } from '@/integrations/supabase/client';
import AgentLayout from './AgentLayout';
import AgentGate from '@/components/agent/AgentGate';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Search, Download, ShoppingCart } from 'lucide-react';
import { format } from 'date-fns';

const PAID_STATUSES = ['Delivered', 'Processing', 'Paid'];

const maskPhone = (phone: string) => {
  if (!phone || phone.length < 6) return phone;
  return phone.substring(0, 3) + '***' + phone.substring(phone.length - 3);
};

interface Customer {
  phone: string;
  email: string | null;
  name: string | null;
  orderCount: number;
  totalSpend: number;
  lastOrder: string;
}

const AgentCustomers = () => {
  const { agent } = useAgent();
  const { storeStatus, loading: statusLoading } = useStoreStatus();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!agent) return;
    fetchOrders();
  }, [agent]);

  const fetchOrders = async () => {
    if (!agent) return;
    setLoading(true);
    const { data } = await supabase
      .from('agent_orders' as any)
      .select('*')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
    setLoading(false);
  };

  const customers: Customer[] = useMemo(() => {
    const paidOrders = orders.filter((o: any) =>
      PAID_STATUSES.includes(o.status) || o.payment_status === 'paid'
    );
    const map = new Map<string, Customer>();
    paidOrders.forEach((o: any) => {
      const key = o.customer_phone;
      const existing = map.get(key);
      if (existing) {
        existing.orderCount += 1;
        existing.totalSpend += Number(o.agent_selling_price || 0);
        if (new Date(o.created_at) > new Date(existing.lastOrder)) {
          existing.lastOrder = o.created_at;
        }
      } else {
        map.set(key, {
          phone: o.customer_phone,
          email: o.customer_email || null,
          name: o.customer_name || null,
          orderCount: 1,
          totalSpend: Number(o.agent_selling_price || 0),
          lastOrder: o.created_at,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.orderCount - a.orderCount);
  }, [orders]);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(c =>
      c.phone.includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.name?.toLowerCase().includes(q)
    );
  }, [customers, search]);

  const handleExportCSV = () => {
    const headers = ['Phone', 'Email', 'Name', 'Orders', 'Total Spend (GHS)', 'Last Order'];
    const rows = customers.map(c => [
      c.phone,
      c.email || '',
      c.name || '',
      c.orderCount,
      c.totalSpend.toFixed(2),
      c.lastOrder ? format(new Date(c.lastOrder), 'yyyy-MM-dd HH:mm') : '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AgentGate>
    <AgentLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Customers</h1>
            <p className="text-xs text-muted-foreground">{customers.length} unique customers</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5 text-xs">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by phone, email, or name..."
            className="pl-10 h-10"
          />
        </div>

        <Card className="card-shadow border-border">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Users className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No customers found</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {filtered.map(customer => (
                  <div key={customer.phone} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-primary/8 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{customer.name || maskPhone(customer.phone)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {maskPhone(customer.phone)}
                        {customer.email && ` · ${customer.email}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ShoppingCart className="w-3 h-3" />
                        <span className="font-semibold">{customer.orderCount}</span>
                      </div>
                      <p className="text-[11px] font-bold text-success">GHS {customer.totalSpend.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {customer.lastOrder ? format(new Date(customer.lastOrder), 'dd MMM') : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AgentLayout>
    </AgentGate>
  );
};

export default AgentCustomers;
