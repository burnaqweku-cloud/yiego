import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useUserOrders } from '@/hooks/useUserOrders';
import { useAuth } from '@/hooks/useAuth';
import { markOrdersSeen } from '@/hooks/useOrdersBadge';
import { formatPrice, type Network } from '@/data/bundles';
import {
  ClipboardList, RefreshCw, Search, ArrowRight, Smartphone,
  ChevronLeft, ChevronRight, CheckCircle, Clock, XCircle, Loader2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const PAGE_SIZE = 10;

const STATUS_OPTIONS: string[] = ['all', 'Processing', 'Delivered', 'Failed', 'Pending'];

const STATUS_TONE: Record<string, { className: string; icon: typeof CheckCircle }> = {
  Delivered: { className: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/25', icon: CheckCircle },
  Pending: { className: 'text-amber-600 bg-amber-500/10 border-amber-500/25', icon: Clock },
  Processing: { className: 'text-sky-600 bg-sky-500/10 border-sky-500/25', icon: Loader2 },
  Reprocessed: { className: 'text-indigo-600 bg-indigo-500/10 border-indigo-500/25', icon: Clock },
  Failed: { className: 'text-rose-600 bg-rose-500/10 border-rose-500/25', icon: XCircle },
  Voided: { className: 'text-muted-foreground bg-muted border-border/50', icon: XCircle },
};

const NETWORK_RAIL: Record<string, string> = {
  MTN: 'bg-mtn',
  Telecel: 'bg-telecel',
  AirtelTigo: 'bg-airteltigo',
};

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

const DashboardOrders = () => {
  const { orders, loading, refresh } = useUserOrders();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (user) markOrdersSeen(user.id);
  }, [user]);

  const filteredOrders = useMemo(() => orders.filter((o) => {
    const matchesSearch = !search ||
      o.order_id.toLowerCase().includes(search.toLowerCase()) ||
      o.recipient_number.includes(search);
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [orders, search, statusFilter]);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedOrders = filteredOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Quick counts for status tabs
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    STATUS_OPTIONS.slice(1).forEach((s) => { c[s] = orders.filter((o) => o.status === s).length; });
    return c;
  }, [orders]);

  return (
    <DashboardLayout>
      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-24 md:pb-8 max-w-5xl mx-auto space-y-5">
        {/* ── Compact header ── */}
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-primary">Activity</span>
            </div>
            <h1 className="text-2xl md:text-[1.85rem] font-display font-extrabold tracking-[-0.025em] leading-[1.05]">
              My orders
            </h1>
            <p className="text-[12.5px] text-muted-foreground mt-1">
              <span className="font-bold text-foreground tabular">{orders.length}</span> order{orders.length === 1 ? '' : 's'} across all services.
            </p>
          </div>
          <button
            onClick={refresh}
            className="w-10 h-10 rounded-full border border-border/70 bg-card/70 backdrop-blur-md text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card transition-all flex items-center justify-center shrink-0 group"
            aria-label="Refresh"
          >
            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          </button>
        </header>

        {/* ── Search ── */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order ID or phone number…"
            className="pl-11 h-11 rounded-2xl bg-muted/30 border-border/60 focus:bg-background"
          />
        </div>

        {/* ── Status filter pills ── */}
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 snap-row">
          {STATUS_OPTIONS.map((s) => {
            const active = statusFilter === s;
            const count = counts[s] || 0;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`shrink-0 inline-flex items-center gap-2 px-3.5 h-9 rounded-full text-[12px] font-semibold transition-all duration-200 ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.55)]'
                    : 'bg-card/70 backdrop-blur-sm border border-border/70 text-foreground/75 hover:text-foreground hover:border-primary/40'
                }`}
              >
                {s === 'all' ? 'All' : s}
                <span className={`tabular text-[10.5px] px-1.5 rounded-full ${active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Orders list ── */}
        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => <OrderSkeleton key={i} />)}
          </div>
        ) : filteredOrders.length === 0 ? (
          <EmptyState hasFilter={!!search || statusFilter !== 'all'} />
        ) : (
          <>
            <div className="space-y-2.5">
              {pagedOrders.map((order) => {
                const tone = STATUS_TONE[order.status] || { className: 'text-muted-foreground bg-muted border-border/50', icon: Clock };
                const Icon = tone.icon;
                const rail = NETWORK_RAIL[order.network as Network] || 'bg-primary';
                const isProcessing = order.status === 'Processing';
                return (
                  <Link
                    key={order.id}
                    to={`/dashboard/orders/${order.order_id}`}
                    className="group relative block rounded-2xl border border-border/70 bg-card overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_40px_-20px_hsl(var(--primary)/0.3)]"
                  >
                    {/* Network color rail */}
                    <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${rail} opacity-90`} />
                    {/* Hover sheen */}
                    <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="relative flex items-center gap-3 pl-5 pr-4 py-3.5">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 text-primary flex items-center justify-center shrink-0 shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.3)]">
                        <Smartphone className="w-4 h-4" strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold truncate">
                          <span className="font-bold">{order.bundle_size_gb}GB</span>
                          <span className="text-muted-foreground"> · {order.network}</span>
                        </p>
                        <p className="text-[10.5px] text-muted-foreground truncate tabular mt-0.5">
                          {order.recipient_number} · <span className="text-muted-foreground/85">{relativeTime(order.created_at)}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[13.5px] font-bold tabular leading-tight">
                          {formatPrice(Number(order.amount_ghs))}
                        </p>
                        <span className={`mt-1.5 inline-flex items-center gap-1 text-[9.5px] font-bold tracking-wide px-2 py-0.5 rounded-full border ${tone.className}`}>
                          <Icon className={`w-2.5 h-2.5 ${isProcessing ? 'animate-spin' : ''}`} />
                          {order.status}
                        </span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>
                    {/* Order ID footer (subtle) */}
                    <div className="relative px-5 pb-3 -mt-1">
                      <span className="font-mono text-[9.5px] text-muted-foreground/60 tracking-wide">{order.order_id}</span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 pt-2">
                <span className="text-[11px] text-muted-foreground font-medium tabular">
                  Page {safePage} of {totalPages} · {filteredOrders.length} order{filteredOrders.length === 1 ? '' : 's'}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 px-3 text-[12px] rounded-full bg-card/60 backdrop-blur-sm hover:border-primary/35"
                    disabled={safePage === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline ml-1">Prev</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 px-3 text-[12px] rounded-full bg-card/60 backdrop-blur-sm hover:border-primary/35"
                    disabled={safePage === totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  >
                    <span className="hidden sm:inline mr-1">Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        <div aria-hidden className="h-2" />
      </div>
    </DashboardLayout>
  );
};

const OrderSkeleton = () => (
  <div className="relative rounded-2xl border border-border/70 bg-card overflow-hidden p-3.5 pl-5">
    <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-muted skeleton-shimmer" />
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl skeleton-shimmer shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-2/3 rounded skeleton-shimmer" />
        <div className="h-2.5 w-1/2 rounded skeleton-shimmer" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3.5 w-16 rounded skeleton-shimmer" />
        <div className="h-3 w-14 rounded-full skeleton-shimmer" />
      </div>
    </div>
  </div>
);

const EmptyState = ({ hasFilter }: { hasFilter: boolean }) => (
  <div className="text-center py-16 max-w-md mx-auto">
    <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 mx-auto mb-5 flex items-center justify-center shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.4)]">
      <ClipboardList className="w-7 h-7 text-primary" strokeWidth={1.8} />
    </div>
    <h3 className="font-display font-bold text-xl tracking-tight">
      {hasFilter ? 'No matching orders' : 'No orders yet'}
    </h3>
    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
      {hasFilter
        ? 'Try a different search or filter to find what you need.'
        : 'When you place your first order, it will show up here.'}
    </p>
    {!hasFilter && (
      <Link to="/dashboard/buy" className="inline-block mt-6">
        <Button
          size="sm"
          className="rounded-full font-semibold gap-1.5 px-5 shadow-[0_10px_28px_-10px_hsl(var(--primary)/0.6)] hover:-translate-y-0.5 transition-all"
        >
          Buy your first bundle <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </Link>
    )}
  </div>
);

export default DashboardOrders;
