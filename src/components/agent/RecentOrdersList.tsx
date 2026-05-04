import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ShoppingCart, ArrowRight } from 'lucide-react';

interface RecentOrdersListProps {
  orders: any[];
}

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    Delivered: 'badge-delivered',
    Processing: 'badge-processing',
    Paid: 'badge-processing',
    Failed: 'badge-failed',
    pending: 'badge-pending',
    awaiting_payment: 'badge-pending',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${map[status] || 'badge-pending'}`}>
      {status}
    </span>
  );
};

const NETWORK_DOT: Record<string, string> = {
  MTN: 'bg-mtn',
  Telecel: 'bg-telecel',
  AirtelTigo: 'bg-airteltigo',
};

const RecentOrdersList = ({ orders }: RecentOrdersListProps) => {
  const navigate = useNavigate();

  return (
    <Card className="surface-premium border-0">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm font-bold tracking-tight">Recent Orders</CardTitle>
        <Button variant="ghost" size="sm" className="text-xs text-primary h-7 gap-1" onClick={() => navigate('/agent/orders')}>
          View All <ArrowRight className="w-3 h-3" />
        </Button>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <div className="py-10 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-muted/40 ring-1 ring-border/60 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground font-medium">No orders yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Share your store link to start selling</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {orders.map((order: any) => (
              <div
                key={order.id}
                className="flex items-center gap-3 py-3 border-b border-border/40 last:border-0 transition-colors hover:bg-muted/20 -mx-2 px-2 rounded-lg"
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${NETWORK_DOT[order.network] || 'bg-muted'}`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${NETWORK_DOT[order.network] || 'bg-muted'}`} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{order.network} {order.bundle_size_gb}GB</p>
                    {statusBadge(order.status)}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 tabular">
                    {order.customer_phone} · {order.created_at ? format(new Date(order.created_at), 'dd MMM, HH:mm') : ''}
                  </p>
                </div>
                <span className="text-sm font-bold text-success shrink-0 tabular">
                  +GHS {Number(order.profit_ghs).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentOrdersList;
