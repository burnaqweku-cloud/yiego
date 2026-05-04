import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useUserOrders } from '@/hooks/useUserOrders';
import { useAuth } from '@/hooks/useAuth';
import { markOrdersSeen } from '@/hooks/useOrdersBadge';
import { formatPrice, NETWORK_COLORS, type Network } from '@/data/bundles';
import { Skeleton } from '@/components/ui/skeleton';
import { ClipboardList, RefreshCw, Search, ArrowRight, Smartphone, Gift, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const PAGE_SIZE = 10;

const DashboardOrders = () => {
  const { orders, loading, refresh } = useUserOrders();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'reward'>('all');
  const [page, setPage] = useState(1);

  // Clear the Orders bottom-tab badge: stamp orders_last_seen_at = now()
  // on every mount of this list page (single update per visit).
  useEffect(() => {
    if (user) markOrdersSeen(user.id);
  }, [user]);

  const filteredOrders = useMemo(() => orders.filter((o) => {
    const matchesSearch = !search ||
      o.order_id.toLowerCase().includes(search.toLowerCase()) ||
      o.recipient_number.includes(search);
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    const matchesType = typeFilter === 'all' || (o as any).order_type === 'reward';
    return matchesSearch && matchesStatus && matchesType;
  }), [orders, search, statusFilter, typeFilter]);

  useEffect(() => { setPage(1); }, [search, statusFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedOrders = filteredOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const statusOptions = ['all', 'Processing', 'Delivered', 'Failed', 'Pending', 'Pending Approval', 'Rejected'];

  // Quick counts for status tabs
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    statusOptions.slice(1).forEach((s) => { c[s] = orders.filter((o) => o.status === s).length; });
    return c;
  }, [orders]);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
        {/* Page header */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">Activity</p>
            <h1 className="text-2xl md:text-3xl font-display font-extrabold tracking-tight mt-1">My orders</h1>
            <p className="text-xs text-muted-foreground mt-1">{orders.length} order{orders.length === 1 ? '' : 's'} across all services.</p>
          </div>
          <button onClick={refresh} className="p-2.5 rounded-full border border-border hover:bg-muted/50 transition-colors" aria-label="Refresh">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Status pill rail */}
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 snap-row">
          <button
            onClick={() => setTypeFilter(typeFilter === 'reward' ? 'all' : 'reward')}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all border ${
              typeFilter === 'reward' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            <Gift className="w-3 h-3" /> Rewards
          </button>
          {statusOptions.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold transition-all border ${
                statusFilter === s
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-card text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              {s === 'all' ? 'All' : s}
              <span className={`text-[10px] tabular px-1.5 py-0.5 rounded-full ${statusFilter === s ? 'bg-background/20' : 'bg-muted'}`}>{counts[s] || 0}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order ID or phone number…"
            className="pl-11 h-11 rounded-2xl"
          />
        </div>

        {/* Orders List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl p-4 border border-border flex items-center gap-3">
                <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm mb-4">
              {search || statusFilter !== 'all' || typeFilter !== 'all' ? 'No matching orders' : 'No orders yet'}
            </p>
            {!search && statusFilter === 'all' && typeFilter === 'all' && (
              <Link to="/dashboard/buy">
                <Button size="sm" className="btn-press">Buy Your First Bundle</Button>
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2.5">
              {pagedOrders.map((order) => {
                const isReward = (order as any).order_type === 'reward';
                return (
                  <Link
                    key={order.id}
                    to={`/dashboard/orders/${order.order_id}`}
                    className="block bg-card rounded-xl p-4 border border-border card-shadow hover:border-primary/20 transition-all duration-150 group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shadow-sm ${isReward ? 'bg-primary/15' : NETWORK_COLORS[order.network as Network] || 'bg-muted'}`}>
                          {isReward ? <Gift className="w-4 h-4 text-primary" /> : <Smartphone className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-sm font-bold">{order.order_id}</span>
                            {isReward && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                                REWARD
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {order.network} · {isReward ? `${order.bundle_size_gb}GB Reward` : `${order.bundle_size_gb}GB`}
                          </p>
                        </div>
                      </div>
                      <OrderStatusBadge status={order.status} isReward={isReward} />
                    </div>
                    <div className="flex items-center justify-between text-sm pl-[46px]">
                      <span className="text-xs text-muted-foreground">
                        {order.recipient_number} · {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">
                          {isReward ? 'Free' : formatPrice(Number(order.amount_ghs))}
                        </span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className="text-[11px] text-muted-foreground font-medium">
                  Page {safePage} of {totalPages} · {filteredOrders.length} order{filteredOrders.length === 1 ? '' : 's'}
                </span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" disabled={safePage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline ml-1">Prev</span>
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" disabled={safePage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                    <span className="hidden sm:inline mr-1">Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

const BADGE_CLASSES: Record<string, string> = {
  Pending:            'badge-pending',
  'Pending Approval': 'badge-pending',
  Paid:               'badge-processing',
  Processing:         'badge-processing',
  Reprocessed:        'badge-reprocessed',
  Delivered:          'badge-delivered',
  Failed:             'badge-failed',
  Rejected:           'badge-failed',
  // Voided is admin-set: order is null/closed, not a success or failure.
  // Render with a neutral muted-slate look in the customer's history.
  Voided:             'bg-slate-200 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300',
};

const OrderStatusBadge = ({ status, isReward }: { status: string; isReward?: boolean }) => {
  const cls = BADGE_CLASSES[status] || 'bg-muted text-muted-foreground';
  return (
    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${cls}`}>
      {status === 'Pending Approval' && isReward ? '⏳ Pending Approval' : status}
    </span>
  );
};

export default DashboardOrders;
