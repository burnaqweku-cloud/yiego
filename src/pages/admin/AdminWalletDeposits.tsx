import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatPrice } from '@/data/bundles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Wallet, RefreshCw, Search, CheckCircle, XCircle, Eye,
  ChevronLeft, ChevronRight, Copy, Download, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';

/* ── Types ── */

interface DepositRow {
  id: string;
  user_id: string;
  amount_ghs: number;
  processing_fee: number | null;
  total_paid: number | null;
  status: string;
  reference: string | null;
  paystack_reference: string | null;
  description: string | null;
  provider: string | null;
  created_at: string;
  // joined
  user_name: string;
  user_email: string;
  user_phone: string;
}

interface PaystackDetail {
  id: string;
  reference: string;
  amount_ghs: number;
  processing_fee: number | null;
  total_paid: number | null;
  status: string;
  currency: string;
  channel: string | null;
  customer_email: string | null;
  paid_at: string | null;
  verified_at: string | null;
  linked_wallet_txn_id: string | null;
  raw_response: any;
  checkout_meta: any;
}

interface DepositDetail extends DepositRow {
  paystack?: PaystackDetail | null;
}

/* ── Constants ── */

const PAGE_SIZE = 20;

const statusOptions = [
  { value: 'all', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Success' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'failed', label: 'Failed' },
];

const channelOptions = [
  { value: 'all', label: 'All Channels' },
  { value: 'mobile_money', label: 'MoMo' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank' },
];

/* ── Component ── */

const AdminWalletDeposits = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<DepositDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate('/auth');
  }, [user, isAdmin, authLoading, navigate]);

  /* ── Fetch deposits (paginated) ── */
  const fetchDeposits = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from('wallet_transactions')
      .select('id, user_id, amount_ghs, processing_fee, total_paid, status, reference, paystack_reference, description, provider, created_at', { count: 'exact' })
      .eq('type', 'deposit')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00');
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');

    const { data, count } = await query;
    setTotalCount(count || 0);

    if (!data || data.length === 0) {
      setDeposits([]);
      setLoading(false);
      return;
    }

    // Enrich with user profiles
    const userIds = [...new Set(data.map((d: any) => d.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone')
      .in('id', userIds);

    const profileMap: Record<string, any> = {};
    profiles?.forEach((p: any) => { profileMap[p.id] = p; });

    // If channel filter is active, we need paystack data to filter
    let paystackChannelMap: Record<string, string> = {};
    if (channelFilter !== 'all') {
      const refs = data.map((d: any) => d.paystack_reference).filter(Boolean);
      if (refs.length > 0) {
        const { data: pData } = await supabase
          .from('paystack_payments')
          .select('reference, channel')
          .in('reference', refs);
        pData?.forEach((p: any) => { paystackChannelMap[p.reference] = p.channel || ''; });
      }
    }

    let enriched: DepositRow[] = data.map((d: any) => ({
      ...d,
      user_name: profileMap[d.user_id]?.full_name || 'Unknown',
      user_email: profileMap[d.user_id]?.email || '',
      user_phone: profileMap[d.user_id]?.phone || '',
    }));

    // Apply channel filter client-side
    if (channelFilter !== 'all') {
      enriched = enriched.filter(d =>
        d.paystack_reference && paystackChannelMap[d.paystack_reference] === channelFilter
      );
    }

    // Apply search filter client-side
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      enriched = enriched.filter(d =>
        d.reference?.toLowerCase().includes(q) ||
        d.paystack_reference?.toLowerCase().includes(q) ||
        d.user_email.toLowerCase().includes(q) ||
        d.user_phone.toLowerCase().includes(q) ||
        d.user_name.toLowerCase().includes(q) ||
        d.user_id.toLowerCase().includes(q)
      );
    }

    setDeposits(enriched);
    setLoading(false);
  }, [page, statusFilter, channelFilter, searchQuery, dateFrom, dateTo]);

  useEffect(() => {
    if (isAdmin) fetchDeposits();
  }, [isAdmin, fetchDeposits]);

  /* ── View detail ── */
  const openDetail = async (dep: DepositRow) => {
    setDrawerOpen(true);
    setDetailLoading(true);
    setSelectedDeposit({ ...dep, paystack: null });

    if (dep.paystack_reference) {
      const { data } = await supabase
        .from('paystack_payments')
        .select('id, reference, amount_ghs, processing_fee, total_paid, status, currency, channel, customer_email, paid_at, verified_at, linked_wallet_txn_id, raw_response, checkout_meta')
        .eq('reference', dep.paystack_reference)
        .maybeSingle();
      setSelectedDeposit({ ...dep, paystack: data || null });
    }
    setDetailLoading(false);
  };

  /* ── Confirm / Reject ── */
  const handleAction = async (txId: string, userId: string, amount: number, action: 'confirm' | 'reject') => {
    const { error: txError } = await supabase
      .from('wallet_transactions')
      .update({ status: action === 'confirm' ? 'confirmed' : 'rejected' })
      .eq('id', txId);
    if (txError) { toast.error('Failed to update transaction'); return; }

    if (action === 'confirm') {
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance_ghs')
        .eq('user_id', userId)
        .single();
      if (wallet) {
        await supabase
          .from('wallets')
          .update({ balance_ghs: Number(wallet.balance_ghs) + amount })
          .eq('user_id', userId);
      }
    }

    toast.success(action === 'confirm' ? 'Deposit confirmed & balance updated' : 'Deposit rejected');
    fetchDeposits();
  };

  /* ── CSV Export ── */
  const exportCSV = () => {
    if (deposits.length === 0) { toast.error('No data to export'); return; }
    const headers = ['Date', 'User', 'Email', 'Phone', 'Amount', 'Fees', 'Net', 'Provider', 'Reference', 'Status'];
    const rows = deposits.map(d => [
      new Date(d.created_at).toLocaleString(),
      d.user_name,
      d.user_email,
      d.user_phone,
      d.amount_ghs,
      d.processing_fee ?? '—',
      d.total_paid ? Number(d.total_paid) - (d.processing_fee ?? 0) : d.amount_ghs,
      d.provider || 'Paystack',
      d.reference || d.paystack_reference || '—',
      d.status,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deposits-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  /* ── Copy helper ── */
  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied');
  };

  if (authLoading || !user || !isAdmin) return null;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const netCredited = (d: DepositRow) => d.amount_ghs;

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold">Wallet Deposits</h2>
            <p className="text-muted-foreground text-sm">Full deposit transaction history &amp; details</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
              <Download className="w-3.5 h-3.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setPage(0); fetchDeposits(); }}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search ref, email, phone, user…"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {statusOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={(v) => { setChannelFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {channelOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} className="h-9 text-sm w-[130px]" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} className="h-9 text-sm w-[130px]" />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : deposits.length === 0 ? (
          <div className="text-center py-16">
            <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No deposits found</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Date</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">User</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Amount</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs hidden lg:table-cell">Fees</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs hidden lg:table-cell">Net</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs hidden md:table-cell">Reference</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Status</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map(d => (
                  <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(d.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                      <br />
                      <span className="text-[10px]">{new Date(d.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-xs font-medium truncate max-w-[120px]">{d.user_name || 'Guest'}</p>
                      <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{d.user_email || '—'}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-xs">{formatPrice(Number(d.total_paid || d.amount_ghs))}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-muted-foreground hidden lg:table-cell">
                      {d.processing_fee ? formatPrice(Number(d.processing_fee)) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-medium hidden lg:table-cell">
                      {formatPrice(netCredited(d))}
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      {d.reference || d.paystack_reference ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[100px]">
                            {(d.reference || d.paystack_reference || '').slice(0, 14)}…
                          </span>
                          <button onClick={() => copyText(d.reference || d.paystack_reference || '')} className="p-0.5 hover:bg-muted rounded">
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </div>
                      ) : <span className="text-[10px] text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5"><DepositStatusBadge status={d.status} /></td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => openDetail(d)} className="h-7 w-7 p-0">
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        {d.status === 'pending' && (
                          <>
                            <Button size="sm" onClick={() => handleAction(d.id, d.user_id, Number(d.amount_ghs), 'confirm')} className="h-7 w-7 p-0 bg-[hsl(142,70%,45%)] hover:bg-[hsl(142,70%,40%)] text-white">
                              <CheckCircle className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleAction(d.id, d.user_id, Number(d.amount_ghs), 'reject')} className="h-7 w-7 p-0 text-destructive">
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} ({totalCount} total)
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail Drawer ── */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-lg font-display">Deposit Details</SheetTitle>
          </SheetHeader>

          {detailLoading ? (
            <div className="space-y-4 mt-6">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          ) : selectedDeposit ? (
            <div className="mt-6 space-y-6">
              {/* Status */}
              <div className="flex items-center gap-3">
                <DepositStatusBadge status={selectedDeposit.status} />
                <span className="text-xs text-muted-foreground">
                  {selectedDeposit.status === 'confirmed' || selectedDeposit.status === 'completed' ? 'Credited to wallet' :
                   selectedDeposit.status === 'rejected' ? 'Rejected by admin' :
                   selectedDeposit.status === 'failed' ? 'Payment failed' : 'Awaiting confirmation'}
                </span>
              </div>

              {/* Financial */}
              <DetailSection title="Financial Details">
                <DetailRow label="Gross Amount" value={formatPrice(Number(selectedDeposit.total_paid || selectedDeposit.amount_ghs))} />
                <DetailRow label="Processing Fee" value={selectedDeposit.processing_fee ? formatPrice(Number(selectedDeposit.processing_fee)) : '—'} />
                <DetailRow label="Net Credited" value={formatPrice(netCredited(selectedDeposit))} bold />
                <DetailRow label="Currency" value={selectedDeposit.paystack?.currency || 'GHS'} />
              </DetailSection>

              {/* User */}
              <DetailSection title="User Information">
                <DetailRow label="User ID" value={selectedDeposit.user_id} mono copyable onCopy={() => copyText(selectedDeposit.user_id)} />
                <DetailRow label="Name" value={selectedDeposit.user_name || '—'} />
                <DetailRow label="Email" value={selectedDeposit.user_email || '—'} />
                <DetailRow label="Phone" value={selectedDeposit.user_phone || '—'} />
              </DetailSection>

              {/* Payment */}
              <DetailSection title="Payment Information">
                <DetailRow label="Deposit ID" value={selectedDeposit.id} mono copyable onCopy={() => copyText(selectedDeposit.id)} />
                <DetailRow label="Reference" value={selectedDeposit.reference || '—'} mono copyable={!!selectedDeposit.reference} onCopy={() => copyText(selectedDeposit.reference || '')} />
                <DetailRow label="Paystack Ref" value={selectedDeposit.paystack_reference || '—'} mono copyable={!!selectedDeposit.paystack_reference} onCopy={() => copyText(selectedDeposit.paystack_reference || '')} />
                <DetailRow label="Channel" value={formatChannel(selectedDeposit.paystack?.channel)} />
                <DetailRow label="Provider" value={selectedDeposit.provider || 'Paystack'} />
              </DetailSection>

              {/* Timeline */}
              <DetailSection title="Timeline">
                <DetailRow label="Created" value={new Date(selectedDeposit.created_at).toLocaleString()} />
                <DetailRow label="Paid At" value={selectedDeposit.paystack?.paid_at ? new Date(selectedDeposit.paystack.paid_at).toLocaleString() : '—'} />
                <DetailRow label="Verified At" value={selectedDeposit.paystack?.verified_at ? new Date(selectedDeposit.paystack.verified_at).toLocaleString() : '—'} />
              </DetailSection>

              {/* Linked */}
              <DetailSection title="Linked Records">
                <DetailRow label="Wallet Transaction ID" value={selectedDeposit.paystack?.linked_wallet_txn_id || '—'} mono />
                <DetailRow label="Paystack Payment ID" value={selectedDeposit.paystack?.id || '—'} mono />
              </DetailSection>

              {/* Raw Metadata */}
              {selectedDeposit.paystack?.raw_response && (
                <Accordion type="single" collapsible>
                  <AccordionItem value="raw" className="border border-border rounded-xl px-3">
                    <AccordionTrigger className="text-xs font-medium py-2.5">Raw Metadata (JSON)</AccordionTrigger>
                    <AccordionContent>
                      <pre className="text-[10px] bg-muted p-3 rounded-lg overflow-x-auto max-h-60 whitespace-pre-wrap break-all font-mono text-muted-foreground">
                        {JSON.stringify(selectedDeposit.paystack.raw_response, null, 2)}
                      </pre>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}

              {/* Actions */}
              {selectedDeposit.status === 'pending' && (
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => { handleAction(selectedDeposit.id, selectedDeposit.user_id, Number(selectedDeposit.amount_ghs), 'confirm'); setDrawerOpen(false); }}
                    className="flex-1 gap-1.5 bg-[hsl(142,70%,45%)] hover:bg-[hsl(142,70%,40%)] text-white"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Confirm Deposit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { handleAction(selectedDeposit.id, selectedDeposit.user_id, Number(selectedDeposit.amount_ghs), 'reject'); setDrawerOpen(false); }}
                    className="flex-1 gap-1.5 text-destructive hover:text-destructive"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
};

/* ── Sub-components ── */

const depositStatusStyles: Record<string, string> = {
  pending: 'bg-primary/15 text-primary',
  confirmed: 'bg-[hsl(142,70%,45%)]/10 text-[hsl(142,70%,45%)]',
  completed: 'bg-[hsl(142,70%,45%)]/10 text-[hsl(142,70%,45%)]',
  rejected: 'bg-destructive/10 text-destructive',
  failed: 'bg-destructive/10 text-destructive',
  reversed: 'bg-muted text-muted-foreground',
};

const DepositStatusBadge = ({ status }: { status: string }) => (
  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${depositStatusStyles[status] || 'bg-muted text-muted-foreground'}`}>
    {status === 'confirmed' ? 'Success' : status}
  </span>
);

const DetailSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</h4>
    <div className="space-y-1.5 bg-muted/30 rounded-xl p-3">{children}</div>
  </div>
);

const DetailRow = ({ label, value, mono, bold, copyable, onCopy }: {
  label: string; value: string; mono?: boolean; bold?: boolean; copyable?: boolean; onCopy?: () => void;
}) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-xs text-muted-foreground shrink-0">{label}</span>
    <div className="flex items-center gap-1 min-w-0">
      <span className={`text-xs truncate ${mono ? 'font-mono' : ''} ${bold ? 'font-bold' : 'font-medium'}`}>{value}</span>
      {copyable && onCopy && (
        <button onClick={onCopy} className="p-0.5 hover:bg-muted rounded shrink-0">
          <Copy className="w-3 h-3 text-muted-foreground" />
        </button>
      )}
    </div>
  </div>
);

const formatChannel = (channel: string | null | undefined) => {
  if (!channel) return '—';
  switch (channel) {
    case 'mobile_money': return 'Mobile Money';
    case 'card': return 'Card';
    case 'bank': return 'Bank Transfer';
    default: return channel;
  }
};

export default AdminWalletDeposits;
