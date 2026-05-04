import { Link } from 'react-router-dom';
import { ShoppingCart, ArrowRight, CheckCircle, Clock, XCircle } from 'lucide-react';
import { formatPrice, NETWORK_COLORS, type Network } from '@/data/bundles';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

interface Order {
  id: string;
  order_id: string;
  network: string;
  bundle_size_gb: number;
  amount_ghs: number;
  status: string;
  created_at: string;
}

interface DashboardRecentOrdersProps {
  orders: Order[];
  loading: boolean;
}

const statusConfig: Record<string, { icon: typeof CheckCircle; class: string }> = {
  Delivered: { icon: CheckCircle, class: 'badge-delivered' },
  Pending: { icon: Clock, class: 'badge-pending' },
  Processing: { icon: Clock, class: 'badge-processing' },
  Failed: { icon: XCircle, class: 'badge-failed' },
};

const DashboardRecentOrders = ({ orders, loading }: DashboardRecentOrdersProps) => {
  const recentOrders = orders.slice(0, 5);

  return (
    <div className="surface-premium rounded-2xl overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-border/60">
        <div>
          <h3 className="font-display font-semibold text-sm tracking-tight">Recent Orders</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Latest 5 transactions</p>
        </div>
        <Link to="/dashboard/orders" className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
          View All <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : recentOrders.length === 0 ? (
        <div className="p-10 text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-muted/40 flex items-center justify-center">
            <ShoppingCart className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium mb-1">No orders yet</p>
          <p className="text-xs text-muted-foreground mb-4">Buy your first bundle to see it here</p>
          <Link to="/dashboard/buy">
            <Button size="sm" variant="premium">Buy Your First Bundle</Button>
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {recentOrders.map((order, i) => {
            const config = statusConfig[order.status] || { icon: Clock, class: 'bg-muted text-muted-foreground' };
            const StatusIcon = config.icon;

            return (
              <Link
                key={order.id}
                to={`/dashboard/orders/${order.order_id}`}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors duration-150 dash-section group"
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${NETWORK_COLORS[order.network as Network] || 'bg-muted text-muted-foreground'}`}>
                    {order.network}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate tabular">
                      {order.bundle_size_gb}GB · {formatPrice(Number(order.amount_ghs))}
                    </p>
                    <p className="text-[10px] text-muted-foreground tabular truncate">
                      {order.order_id} · {new Date(order.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${config.class}`}>
                  <StatusIcon className="w-3 h-3" />
                  {order.status}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DashboardRecentOrders;
