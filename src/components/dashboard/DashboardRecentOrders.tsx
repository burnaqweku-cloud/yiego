import { Link } from 'react-router-dom';
import { ShoppingCart, ArrowRight, CheckCircle, Clock, XCircle, Smartphone } from 'lucide-react';
import { formatPrice } from '@/data/bundles';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

interface Order {
  id: string;
  order_id: string;
  network: string;
  bundle_size_gb: number;
  amount_ghs: number;
  status: string;
  recipient_number?: string;
  created_at: string;
}

interface DashboardRecentOrdersProps {
  orders: Order[];
  loading: boolean;
}

const statusTone: Record<string, string> = {
  Delivered: 'text-emerald-600 bg-emerald-500/10',
  Pending: 'text-amber-600 bg-amber-500/10',
  Processing: 'text-sky-600 bg-sky-500/10',
  Failed: 'text-rose-600 bg-rose-500/10',
  Cancelled: 'text-muted-foreground bg-muted',
};

const statusIcon: Record<string, typeof CheckCircle> = {
  Delivered: CheckCircle,
  Pending: Clock,
  Processing: Clock,
  Failed: XCircle,
  Cancelled: XCircle,
};

const friendlyStatus = (s: string) => statusTone[s] ? s : 'Pending';

const DashboardRecentOrders = ({ orders, loading }: DashboardRecentOrdersProps) => {
  const recent = orders.slice(0, 5);

  return (
    <section className="rounded-2xl border border-border/70 bg-card overflow-hidden">
      <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between border-b border-border/60">
        <div>
          <h3 className="text-sm font-bold tracking-tight">Recent orders</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Across all your services</p>
        </div>
        <Link to="/dashboard/orders" className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : recent.length === 0 ? (
        <div className="p-8 sm:p-10 text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-muted/50 flex items-center justify-center">
            <ShoppingCart className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold mb-1">No orders yet</p>
          <p className="text-xs text-muted-foreground mb-4">Explore YieGo services and place your first order.</p>
          <Link to="/dashboard/buy">
            <Button size="sm">Explore services</Button>
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {recent.map((o) => {
            const status = friendlyStatus(o.status);
            const Icon = statusIcon[status] || Clock;
            return (
              <li key={o.id}>
                <Link to={`/dashboard/orders/${o.order_id}`} className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-muted/40 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold truncate">
                      {o.network} · {o.bundle_size_gb}GB
                    </p>
                    <p className="text-[10.5px] text-muted-foreground truncate tabular">
                      {o.recipient_number ? `${o.recipient_number} · ` : ''}{o.order_id}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[13px] font-bold tabular leading-tight">{formatPrice(Number(o.amount_ghs))}</p>
                    <span className={`mt-1 inline-flex items-center gap-1 text-[9.5px] font-bold px-2 py-0.5 rounded-full ${statusTone[status]}`}>
                      <Icon className="w-2.5 h-2.5" />
                      {status}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default DashboardRecentOrders;
