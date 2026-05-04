import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, RefreshCw } from 'lucide-react';

const statusColors: Record<string, string> = {
  Processing: 'bg-primary/10 text-primary',
  Delivered: 'bg-success/10 text-success',
  Failed: 'bg-destructive/10 text-destructive',
  Paid: 'bg-info/10 text-info',
};

const DashboardBulkOrders = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');

  const fetchOrders = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_wholesale', true)
      .order('created_at', { ascending: false })
      .limit(200);
    if (data) setOrders(data as any[]);
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, [user]);

  const filtered = tab === 'all' ? orders : orders.filter(o => o.status === tab);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Bulk Orders History</h1>
            <p className="text-xs text-muted-foreground">{orders.length} orders</p>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchOrders}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1 text-xs">All</TabsTrigger>
            <TabsTrigger value="Processing" className="flex-1 text-xs">Processing</TabsTrigger>
            <TabsTrigger value="Delivered" className="flex-1 text-xs">Delivered</TabsTrigger>
            <TabsTrigger value="Failed" className="flex-1 text-xs">Failed</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No bulk orders yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {filtered.map(order => (
              <Card
                key={order.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/dashboard/orders/${order.order_id}`)}
              >
                <CardContent className="p-3.5 flex items-center justify-between">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold">{order.order_id}</span>
                      <Badge variant="outline" className="text-[9px] px-1.5">Bulk</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {order.network} {order.bundle_size_gb}GB → {order.recipient_number}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(order.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-sm font-bold">GHS {Number(order.wholesale_unit_price || order.amount_ghs).toFixed(2)}</p>
                    <Badge className={`text-[10px] ${statusColors[order.status] || 'bg-muted text-muted-foreground'}`}>
                      {order.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DashboardBulkOrders;
