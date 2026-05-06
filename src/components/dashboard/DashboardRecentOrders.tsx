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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const statusTone: Record<string, string> = {
  Delivered: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/25',
  Pending: 'text-amber-600 bg-amber-500/10 border-amber-500/25',
  Processing: 'text-sky-600 bg-sky-500/10 border-sky-500/25',
  Failed: 'text-rose-600 bg-rose-500/10 border-rose-500/25',
  Cancelled: 'text-muted-foreground bg-muted border-border/50',
};

const statusIcon: Record<string, typeof CheckCircle> = {
  Delivered: CheckCircle,
  Pending: Clock,
  Processing: Clock,
  Failed: XCircle,
  Cancelled: XCircle,
};

const networkRail: Record<string, string> = {
  MTN: 'bg-mtn',
  Telecel: 'bg-telecel',
  AirtelTigo: 'bg-airteltigo',
};

const friendlyStatus = (s: string) => statusTone[s] ? s : 'Pending';

const DashboardRecentOrders = ({ orders, loading }: DashboardRecentOrdersProps) => {
  const recent = orders.slice(0, 5);

  return (
    <section className="rounded-3xl glass-card overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-border/60">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Recent orders</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Your latest activity across services</p>
        </div>
        <Link
          to="/dashboard/orders"
          className="inline-flex items-center gap-1.5 text-xs text-primary font-semibold hover:gap-2.5 transition-all"
        >
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
          <div className="relative w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 flex items-center justify-center shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.3)]">
            <ShoppingCart className="w-6 h-6 text-primary" strokeWidth={1.9} />
          </div>
          <p className="font-display font-bold text-base">No orders yet</p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-[18rem] mx-auto leading-relaxed">
            Browse the services hub above and place your first order.
          </p>
          <Link to="/dashboard/buy" className="inline-block mt-5">
            <Button size="sm" className="rounded-full font-semibold gap-1.5 px-5 shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.55)]">
              Buy data <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border/50">
          {recent.map((o) => {
            const status = friendlyStatus(o.status);
            const Icon = statusIcon[status] || Clock;
            const rail = networkRail[o.network] || 'bg-primary';
            return (
              <li key={o.id}>
                <Link
                  to={`/dashboard/orders/${o.order_id}`}
                  className="relative flex items-center gap-3 pl-5 pr-4 py-3.5 hover:bg-primary/5 transition-colors group"
                >
                  {/* Network color rail */}
                  <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full ${rail} opacity-90`} />

                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 text-primary flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold truncate">
                      <span className="font-bold">{o.bundle_size_gb}GB</span>
                      <span className="text-muted-foreground"> · {o.network}</span>
                    </p>
                    <p className="text-[10.5px] text-muted-foreground truncate tabular mt-0.5">
                      {o.recipient_number ? `${o.recipient_number} · ` : ''}
                      <span className="text-muted-foreground/80">{relativeTime(o.created_at)}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[13.5px] font-bold tabular leading-tight">{formatPrice(Number(o.amount_ghs))}</p>
                    <span className={`mt-1.5 inline-flex items-center gap-1 text-[9.5px] font-bold px-2 py-0.5 rounded-full border ${statusTone[status]}`}>
                      <Icon className="w-2.5 h-2.5" />
                      {status}
                    </span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
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
