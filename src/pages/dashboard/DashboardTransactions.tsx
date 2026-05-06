import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import {
  ArrowDownLeft, ArrowUpRight, RefreshCw, Receipt, Search, ShoppingCart,
  Copy, ChevronLeft, ChevronRight, ExternalLink, X, RotateCcw,
  CheckCircle, Clock, XCircle, ArrowRight, Loader2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/data/bundles';
import { sanitizeFieldForCustomer } from '@/lib/error-sanitizer';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';

type TxnFilter = 'all' | 'orders' | 'topups';

const PAGE_SIZE = 10;

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

/** Map raw status string → semantic state. */
function txState(status: string): 'success' | 'pending' | 'failed' {
  const s = (status || '').toLowerCase();
  if (['confirmed', 'completed', 'paid', 'delivered', 'success'].includes(s)) return 'success';
  if (['pending', 'processing'].includes(s)) return 'pending';
  return 'failed';
}

/** Status-aware amount style. Pending shows muted/amber WITHOUT a sign because the money hasn't actually moved. */
function amountStyle(type: string, status: string) {
  const state = txState(status);
  if (state === 'failed') {
    return { className: 'text-rose-600 dark:text-rose-400 line-through opacity-80', sign: '' };
  }
  if (state === 'pending') {
    return { className: 'text-amber-600 dark:text-amber-400', sign: '' };
  }
  // success
  if (type === 'debit' || type === 'order') return { className: 'text-foreground', sign: '−' };
  return { className: 'text-emerald-600 dark:text-emerald-400', sign: '+' };
}

/** Per-type rail color for the left edge. */
function railClass(type: string, category: string): string {
  if (type === 'deposit' || category === 'topup') return 'bg-emerald-500';
  if (type === 'refund') return 'bg-sky-500';
  if (category === 'order' || type === 'debit' || type === 'order') return 'bg-primary';
  return 'bg-muted-foreground';
}

/** Per-type icon + tile class. */
function iconMeta(type: string, category: string) {
  if (type === 'deposit' || category === 'topup') {
    return { Icon: ArrowDownLeft, tone: 'text-emerald-600 bg-emerald-500/10 ring-emerald-500/20' };
  }
  if (type === 'refund') {
    return { Icon: RotateCcw, tone: 'text-sky-600 bg-sky-500/10 ring-sky-500/20' };
  }
  if (category === 'order') {
    return { Icon: ShoppingCart, tone: 'text-primary bg-primary/10 ring-primary/25' };
  }
  return { Icon: ArrowUpRight, tone: 'text-rose-600 bg-rose-500/10 ring-rose-500/20' };
}

/** Status badge meta. */
function statusBadge(status: string) {
  const state = txState(status);
  if (state === 'success') {
    return {
      className: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/25',
      Icon: CheckCircle,
      label: 'Completed',
    };
  }
  if (state === 'pending') {
    return {
      className: 'text-amber-600 bg-amber-500/12 border-amber-500/30',
      Icon: status?.toLowerCase() === 'processing' ? Loader2 : Clock,
      label: status?.toLowerCase() === 'processing' ? 'Processing' : 'Pending',
    };
  }
  return {
    className: 'text-rose-600 bg-rose-500/10 border-rose-500/25',
    Icon: XCircle,
    label: 'Failed',
  };
}

function txTypeLabel(item: any): string {
  if (item.category === 'order') return item.network && item.bundleSize
    ? `${item.network} ${item.bundleSize}GB`
    : 'Order payment';
  if (item.type === 'deposit') return 'Wallet top-up';
  if (item.type === 'refund') return 'Refund';
  if (item.type === 'debit') return 'Wallet payment';
  return item.description || 'Transaction';
}

const FILTERS: { label: string; value: TxnFilter; icon: typeof Receipt }[] = [
  { label: 'All', value: 'all', icon: Receipt },
  { label: 'Orders', value: 'orders', icon: ShoppingCart },
  { label: 'Top-ups', value: 'topups', icon: ArrowDownLeft },
];

const DashboardTransactions = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [walletTxns, setWalletTxns] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TxnFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user]);

  useEffect(() => { setPage(1); }, [filter, search]);

  useEffect(() => {
    if (selected) document.body.classList.add('modal-open-wa-hide');
    else document.body.classList.remove('modal-open-wa-hide');
    return () => document.body.classList.remove('modal-open-wa-hide');
  }, [selected]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [txnRes, ordersRes] = await Promise.all([
      supabase.from('wallet_transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);
    if (txnRes.data) setWalletTxns(txnRes.data);
    if (ordersRes.data) setOrders(ordersRes.data);
    setLoading(false);
  };

  const unified = useMemo(() => {
    const items: any[] = [];
    walletTxns.forEach(t => {
      items.push({
        id: t.id,
        date: t.created_at,
        category: t.type === 'deposit' ? 'topup' : t.type === 'debit' ? 'order' : t.type,
        type: t.type,
        description: t.description || (t.type === 'deposit' ? 'Wallet Top-up' : t.type === 'debit' ? 'Wallet Order Payment' : t.type === 'refund' ? 'Refund' : 'Transaction'),
        amount: Number(t.amount_ghs),
        status: t.status,
        reference: t.reference || t.paystack_reference || '',
        paymentMethod: t.provider === 'paystack' ? 'Paystack' : 'Wallet',
        network: null,
        bundleSize: null,
        phone: null,
        orderId: null,
        provider: t.provider || null,
      });
    });
    orders.forEach(o => {
      if (o.payment_method === 'wallet') return;
      items.push({
        id: `order-${o.id}`,
        date: o.created_at,
        category: 'order',
        type: 'order',
        description: `${o.network} ${o.bundle_size_gb}GB → ${o.recipient_number}`,
        amount: Number(o.amount_ghs),
        status: o.status,
        reference: o.paystack_reference || o.order_id || '',
        paymentMethod: 'Paystack Direct',
        network: o.network,
        bundleSize: o.bundle_size_gb,
        phone: o.recipient_number,
        orderId: o.order_id,
        deliveryNote: sanitizeFieldForCustomer(o.delivery_note),
      });
    });
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [walletTxns, orders]);

  const filtered = useMemo(() => {
    let result = unified;
    if (filter === 'orders') result = result.filter(t => t.category === 'order');
    if (filter === 'topups') result = result.filter(t => t.category === 'topup' || t.type === 'deposit');
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.reference?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.orderId?.toLowerCase().includes(q) ||
        t.phone?.includes(q)
      );
    }
    return result;
  }, [unified, filter, search]);

  // Quick counts for filter chips
  const counts = useMemo(() => ({
    all: unified.length,
    orders: unified.filter(t => t.category === 'order').length,
    topups: unified.filter(t => t.category === 'topup' || t.type === 'deposit').length,
  }), [unified]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const copyText = (text: string, msg = 'Copied') => {
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  return (
    <DashboardLayout>
      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-24 md:pb-8 max-w-3xl mx-auto space-y-5">
        {/* ── Compact header ── */}
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-primary">Activity</span>
            </div>
            <h1 className="text-2xl md:text-[1.85rem] font-display font-extrabold tracking-[-0.025em] leading-[1.05]">
              Transactions
            </h1>
            <p className="text-[12.5px] text-muted-foreground mt-1">
              Every wallet movement and order payment in one place.
            </p>
          </div>
          <button
            onClick={fetchData}
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
            placeholder="Search reference, order ID, phone…"
            className="pl-11 h-11 rounded-2xl bg-muted/30 border-border/60 focus:bg-background"
          />
        </div>

        {/* ── Filter pills ── */}
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 snap-row">
          {FILTERS.map(f => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`shrink-0 inline-flex items-center gap-2 px-3.5 h-9 rounded-full text-[12px] font-semibold transition-all duration-200 ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.55)]'
                    : 'bg-card/70 backdrop-blur-sm border border-border/70 text-foreground/75 hover:text-foreground hover:border-primary/40'
                }`}
              >
                <f.icon className="w-3.5 h-3.5" />
                {f.label}
                <span className={`tabular text-[10.5px] px-1.5 rounded-full ${active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground'}`}>
                  {counts[f.value] || 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── List ── */}
        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState hasFilter={!!search || filter !== 'all'} />
        ) : (
          <>
            <ul className="space-y-2.5">
              {paged.map(item => <TransactionRow key={item.id} item={item} onClick={() => setSelected(item)} />)}
            </ul>

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 pt-2">
                <span className="text-[11px] text-muted-foreground font-medium tabular">
                  Page {safePage} of {totalPages} · {filtered.length} total
                </span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" className="h-9 px-3 text-[12px] rounded-full bg-card/60 backdrop-blur-sm hover:border-primary/35"
                    disabled={safePage === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}>
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline ml-1">Prev</span>
                  </Button>
                  <Button size="sm" variant="outline" className="h-9 px-3 text-[12px] rounded-full bg-card/60 backdrop-blur-sm hover:border-primary/35"
                    disabled={safePage === totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
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

      {/* ── Detail (drawer on mobile, dialog on desktop) ── */}
      {isMobile ? (
        <Drawer open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DrawerContent className="rounded-t-3xl border-t border-border/60 bg-card/95 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_-24px_60px_-20px_hsl(var(--primary)/0.3)] max-h-[92vh]">
            <DrawerTitle className="sr-only">Transaction details</DrawerTitle>
            <DrawerDescription className="sr-only">View full details for this transaction.</DrawerDescription>
            {selected && <DetailBody item={selected} onClose={() => setSelected(null)} onCopy={copyText} />}
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_30px_80px_-20px_hsl(var(--primary)/0.35)]">
            <DialogTitle className="sr-only">Transaction details</DialogTitle>
            {selected && <DetailBody item={selected} onClose={() => setSelected(null)} onCopy={copyText} />}
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
};

const TransactionRow = ({ item, onClick }: { item: any; onClick: () => void }) => {
  const { Icon, tone } = iconMeta(item.type, item.category);
  const amt = amountStyle(item.type, item.status);
  const status = statusBadge(item.status);
  const StatusIcon = status.Icon;
  const rail = railClass(item.type, item.category);
  const state = txState(item.status);
  const isPending = state === 'pending';

  return (
    <li>
      <button
        onClick={onClick}
        className={`group relative w-full text-left rounded-2xl border bg-card overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_hsl(var(--primary)/0.3)] ${
          isPending
            ? 'border-amber-500/30 hover:border-amber-500/45'
            : 'border-border/70 hover:border-primary/30'
        }`}
      >
        <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${rail} ${isPending ? 'opacity-60' : 'opacity-90'}`} />
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        <div className="relative flex items-center gap-3 pl-5 pr-4 py-3.5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1 ${tone} ${isPending ? 'opacity-70' : ''}`}>
            <Icon className="w-4 h-4" strokeWidth={2.1} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold truncate">{txTypeLabel(item)}</p>
            <p className="text-[10.5px] text-muted-foreground truncate tabular mt-0.5">
              {relativeTime(item.date)} · {item.paymentMethod}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-[13.5px] font-bold tabular leading-tight ${amt.className}`}>
              {amt.sign}{formatPrice(item.amount)}
            </p>
            <span className={`mt-1.5 inline-flex items-center gap-1 text-[9.5px] font-bold tracking-wide px-2 py-0.5 rounded-full border ${status.className}`}>
              <StatusIcon className={`w-2.5 h-2.5 ${status.label === 'Processing' ? 'animate-spin' : ''}`} />
              {status.label}
            </span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
      </button>
    </li>
  );
};

const DetailBody = ({
  item,
  onClose,
  onCopy,
}: {
  item: any;
  onClose: () => void;
  onCopy: (text: string, msg?: string) => void;
}) => {
  const { Icon, tone } = iconMeta(item.type, item.category);
  const amt = amountStyle(item.type, item.status);
  const status = statusBadge(item.status);
  const StatusIcon = status.Icon;
  const state = txState(item.status);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="relative px-5 pt-5 pb-4 border-b border-border/60 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="absolute -top-12 -right-8 w-40 h-40 rounded-full bg-primary/12 blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ring-1 ${tone}`}>
              <Icon className="w-5 h-5" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-bold tracking-tight truncate">{txTypeLabel(item)}</p>
              <p className="text-[10.5px] text-muted-foreground mt-0.5 truncate">
                {format(new Date(item.date), 'EEEE, dd MMM yyyy · HH:mm')}
              </p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${status.className}`}>
            <StatusIcon className={`w-2.5 h-2.5 ${status.label === 'Processing' ? 'animate-spin' : ''}`} />
            {status.label}
          </span>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Amount block — status-aware */}
        <div
          className={`relative rounded-2xl py-4 px-4 text-center overflow-hidden border ${
            state === 'pending' ? 'bg-amber-500/[0.07] border-amber-500/25'
            : state === 'failed' ? 'bg-rose-500/[0.07] border-rose-500/25'
            : 'bg-muted/40 border-border/60'
          }`}
        >
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/80">
            {state === 'pending' ? 'Pending amount' : state === 'failed' ? 'Did not complete' : 'Amount'}
          </p>
          <p className={`text-[2rem] font-display font-extrabold tabular tracking-[-0.025em] mt-1.5 leading-none ${amt.className}`}>
            {amt.sign}{formatPrice(item.amount)}
          </p>
          <p className="text-[10.5px] text-muted-foreground mt-1.5">
            {item.paymentMethod}
            {state === 'pending' && <> · awaiting confirmation</>}
            {state === 'failed' && <> · no money was deducted</>}
          </p>
        </div>

        {/* Detail rows */}
        <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
          <DetailRow label="Description" value={item.description} />
          {item.network && <DetailRow label="Network" value={item.network} />}
          {item.bundleSize && <DetailRow label="Bundle" value={`${item.bundleSize} GB`} />}
          {item.phone && <DetailRow label="Recipient" value={item.phone} mono />}
          {item.orderId && (
            <DetailRow
              label="Order ID"
              value={item.orderId}
              mono
              copyable
              onCopy={() => onCopy(item.orderId, 'Order ID copied')}
            />
          )}
          {item.reference && (
            <DetailRow
              label="Reference"
              value={item.reference}
              mono
              copyable
              onCopy={() => onCopy(item.reference, 'Reference copied')}
            />
          )}
          {item.deliveryNote && <DetailRow label="Delivery note" value={item.deliveryNote} />}
        </div>

        {/* Order link */}
        {item.orderId && (
          <Link to={`/dashboard/orders/${item.orderId}`}>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 h-11 rounded-full bg-card/60 backdrop-blur-sm hover:border-primary/35"
            >
              View full order <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </Link>
        )}

        <Button
          onClick={onClose}
          variant="ghost"
          size="sm"
          className="w-full gap-2 h-10 text-[12.5px] rounded-full"
        >
          <X className="w-3.5 h-3.5" /> Close
        </Button>
      </div>
    </div>
  );
};

const DetailRow = ({
  label, value, mono, copyable, onCopy,
}: { label: string; value: string; mono?: boolean; copyable?: boolean; onCopy?: () => void }) => (
  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 odd:bg-muted/30 text-[12px]">
    <span className="text-muted-foreground font-medium shrink-0">{label}</span>
    <div className="flex items-center gap-1.5 min-w-0">
      <span className={`text-foreground font-semibold truncate ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
      {copyable && (
        <button onClick={onCopy} className="text-muted-foreground hover:text-primary transition-colors shrink-0" aria-label={`Copy ${label}`}>
          <Copy className="w-3 h-3" />
        </button>
      )}
    </div>
  </div>
);

const RowSkeleton = () => (
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
      <Receipt className="w-7 h-7 text-primary" strokeWidth={1.8} />
    </div>
    <h3 className="font-display font-bold text-xl tracking-tight">
      {hasFilter ? 'No matching transactions' : 'No transactions yet'}
    </h3>
    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
      {hasFilter
        ? 'Try a different search or filter.'
        : 'Wallet top-ups and order payments will appear here.'}
    </p>
  </div>
);

export default DashboardTransactions;
