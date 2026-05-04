import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ArrowDownCircle, ArrowUpCircle, RefreshCw, Receipt, Search, ShoppingCart, Copy, ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/data/bundles';
import { sanitizeFieldForCustomer } from '@/lib/error-sanitizer';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type TxnFilter = 'all' | 'orders' | 'topups';

const PAGE_SIZE = 10;

const DashboardTransactions = () => {
  const { user } = useAuth();
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

  // Reset to page 1 whenever filter/search changes
  useEffect(() => { setPage(1); }, [filter, search]);

  // Hide floating widgets while transaction detail dialog is open
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
        rawNote: t.description || null,
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
        // supplierStatus / supplierMessage are internal-only and never rendered
        // to customers. delivery_note is sanitized so any supplier-named text is
        // dropped before it can reach the UI.
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const filters: { label: string; value: TxnFilter; icon: any }[] = [
    { label: 'All', value: 'all', icon: Receipt },
    { label: 'Orders', value: 'orders', icon: ShoppingCart },
    { label: 'Top-ups', value: 'topups', icon: ArrowDownCircle },
  ];

  const txIcon = (item: any) => {
    if (item.type === 'deposit' || item.category === 'topup') return <ArrowDownCircle className="w-4 h-4 text-success" />;
    if (item.type === 'refund') return <RefreshCw className="w-4 h-4 text-info" />;
    if (item.category === 'order') return <ShoppingCart className="w-4 h-4 text-primary" />;
    return <ArrowUpCircle className="w-4 h-4 text-destructive" />;
  };

  const txColor = (item: any) => {
    if (item.type === 'deposit' || item.category === 'topup') return 'text-success';
    if (item.type === 'refund') return 'text-info';
    return 'text-destructive';
  };

  const txSign = (item: any) => {
    if (item.type === 'deposit' || item.type === 'refund') return '+';
    return '-';
  };

  const statusColor = (status: string) => {
    const s = status?.toLowerCase();
    if (['completed', 'confirmed', 'paid', 'delivered', 'success'].includes(s)) return 'bg-success/10 text-success';
    if (['pending', 'processing'].includes(s)) return 'bg-primary/10 text-primary';
    return 'bg-destructive/10 text-destructive';
  };

  const copyRef = (ref: string) => {
    navigator.clipboard.writeText(ref);
    toast.success('Reference copied');
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-2xl">
        <div>
          <h1 className="text-xl font-display font-bold">Transactions</h1>
          <p className="text-xs text-muted-foreground">Your complete transaction history</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-1.5">
            {filters.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  filter === f.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <f.icon className="w-3 h-3" />
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative sm:ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search reference, order ID, phone..."
              className="pl-9 h-9 text-xs w-full sm:w-56"
            />
          </div>
        </div>

        {/* List */}
        <div className="bg-card rounded-2xl border border-border card-shadow overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Receipt className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No transactions found</p>
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                {search || filter !== 'all' ? 'Try a different filter or search term.' : 'New transactions will appear here.'}
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border/50">
                {paged.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className="w-full text-left px-4 py-3.5 hover:bg-muted/30 transition-colors active:bg-muted/40"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        {txIcon(item)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{item.description}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-muted-foreground">
                                {format(new Date(item.date), 'dd MMM yyyy, HH:mm')}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium">
                                {item.paymentMethod}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-bold ${txColor(item)}`}>
                              {txSign(item)}GHS {item.amount.toFixed(2)}
                            </p>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusColor(item.status)}`}>
                              {item.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Pagination footer */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border bg-secondary/20">
                  <span className="text-[11px] text-muted-foreground font-medium">
                    Page {safePage} of {totalPages} · {filtered.length} total
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2.5 text-xs"
                      disabled={safePage === 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline ml-1">Prev</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2.5 text-xs"
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
        </div>
      </div>

      {/* Transaction detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          {selected && (
            <>
              <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                      {txIcon(selected)}
                    </div>
                    <div className="min-w-0">
                      <DialogTitle className="text-sm font-bold truncate">
                        {selected.category === 'order' && selected.orderId ? 'Order Payment' :
                         selected.type === 'deposit' ? 'Wallet Top-up' :
                         selected.type === 'refund' ? 'Refund' : 'Transaction'}
                      </DialogTitle>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {format(new Date(selected.date), 'EEEE, dd MMM yyyy · HH:mm')}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${statusColor(selected.status)} shrink-0`}>
                    {selected.status}
                  </span>
                </div>
              </DialogHeader>

              <div className="px-5 py-4 space-y-4">
                {/* Amount */}
                <div className="text-center py-3 rounded-xl bg-secondary/40 ring-1 ring-border/50">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Amount</p>
                  <p className={`text-2xl font-display font-bold tabular mt-1 ${txColor(selected)}`}>
                    {txSign(selected)}{formatPrice(selected.amount)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{selected.paymentMethod}</p>
                </div>

                {/* Detail rows */}
                <div className="rounded-xl border border-border overflow-hidden">
                  <DetailRow label="Description" value={selected.description} />
                  {selected.network && <DetailRow label="Network" value={selected.network} />}
                  {selected.bundleSize && <DetailRow label="Bundle" value={`${selected.bundleSize} GB`} />}
                  {selected.phone && <DetailRow label="Recipient" value={selected.phone} mono />}
                  {selected.orderId && <DetailRow label="Order ID" value={selected.orderId} mono copyable onCopy={() => copyRef(selected.orderId)} />}
                  {selected.reference && <DetailRow label="Reference" value={selected.reference} mono copyable onCopy={() => copyRef(selected.reference)} />}
                  {selected.deliveryNote && <DetailRow label="Delivery Note" value={selected.deliveryNote} />}
                </div>

                {/* Order link */}
                {selected.orderId && (
                  <Link to={`/dashboard/orders/${selected.orderId}`}>
                    <Button variant="outline" size="sm" className="w-full gap-2 h-10">
                      View Full Order
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                )}

                <Button onClick={() => setSelected(null)} variant="ghost" size="sm" className="w-full gap-2 h-9 text-xs">
                  <X className="w-3.5 h-3.5" />
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

const DetailRow = ({
  label, value, mono, copyable, onCopy,
}: { label: string; value: string; mono?: boolean; copyable?: boolean; onCopy?: () => void }) => (
  <div className="flex items-center justify-between gap-3 px-3 py-2.5 odd:bg-secondary/30 text-xs">
    <span className="text-muted-foreground font-medium shrink-0">{label}</span>
    <div className="flex items-center gap-1.5 min-w-0">
      <span className={`text-foreground font-semibold truncate ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
      {copyable && (
        <button onClick={onCopy} className="text-muted-foreground hover:text-foreground transition-colors shrink-0" aria-label={`Copy ${label}`}>
          <Copy className="w-3 h-3" />
        </button>
      )}
    </div>
  </div>
);

export default DashboardTransactions;
