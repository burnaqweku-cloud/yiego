import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { formatPrice } from '@/data/bundles';
import { format } from 'date-fns';
import AdminLayout from './AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Download, Search, X, Eye, Copy, Check,
  DollarSign, Clock, CheckCircle2, XCircle, CalendarDays, ChevronLeft, ChevronRight,
  ShieldCheck, Ban, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useAuth } from '@/hooks/useAuth';

// ── Types ──────────────────────────────────────────────
interface DepositRow {
  id: string;
  amount_ghs: number;
  processing_fee: number | null;
  total_paid: number | null;
  status: string;
  type: string;
  reference: string | null;
  paystack_reference: string | null;
  provider: string | null;
  created_at: string;
  user_id: string;
  description: string | null;
  user_txn_id?: string | null;
  profile?: { full_name: string; email: string | null; phone: string; created_at: string } | null;
}

interface PaystackDetail {
  id: string;
  amount_ghs: number;
  processing_fee: number | null;
  total_paid: number | null;
  status: string;
  channel: string | null;
  currency: string;
  reference: string;
  customer_email: string | null;
  paid_at: string | null;
  verified_at: string | null;
  created_at: string;
  raw_response: any;
  checkout_meta: any;
  linked_wallet_txn_id: string | null;
  linked_order_id: string | null;
  purpose: string;
}

interface SummaryData {
  total: number;
  successful: number;
  pending: number;
  failed: number;
  todayCount: number;
}

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'pending_review', label: 'Pending Review (Manual)' },
  { value: 'confirmed', label: 'Confirmed / Success' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'reversed', label: 'Reversed' },
];

const CHANNEL_OPTIONS = [
  { value: 'all', label: 'All Channels' },
  { value: 'momo', label: 'MoMo' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank' },
];

// ── Helpers ────────────────────────────────────────────
const statusBadge = (status: string) => {
  const s = status?.toLowerCase() ?? '';
  if (['confirmed', 'completed', 'success'].includes(s))
    return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20">{status}</Badge>;
  if (s === 'pending' || s === 'pending_review')
    return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/20">{status}</Badge>;
  if (['failed', 'rejected'].includes(s))
    return <Badge className="bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/20">{status}</Badge>;
  if (s === 'reversed')
    return <Badge className="bg-purple-500/15 text-purple-600 border-purple-500/30 hover:bg-purple-500/20">{status}</Badge>;
  return <Badge variant="secondary">{status || '---'}</Badge>;
};

const safe = (v: any, fallback = '---') => (v != null && v !== '' ? String(v) : fallback);

const CopyBtn = ({ value, label }: { value: string | null | undefined; label?: string }) => {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-muted-foreground text-xs">---</span>;
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(`${label || 'Value'} copied`);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="inline-flex items-center gap-1 text-xs font-mono hover:text-primary transition-colors max-w-[180px]">
      <span className="truncate">{value}</span>
      {copied ? <Check className="w-3 h-3 text-emerald-500 shrink-0" /> : <Copy className="w-3 h-3 opacity-50 shrink-0" />}
    </button>
  );
};

const guessChannel = (desc: string | null, provider: string | null): string => {
  const t = `${desc ?? ''} ${provider ?? ''}`.toLowerCase();
  if (t.includes('momo') || t.includes('mobile_money') || t.includes('mobile money')) return 'MoMo';
  if (t.includes('card') || t.includes('visa') || t.includes('mastercard')) return 'Card';
  if (t.includes('bank')) return 'Bank';
  return '---';
};

// ── Component ──────────────────────────────────────────
const AdminDeposits = () => {
  // Read search param from URL (e.g. from AI ticket quick link)
  const [urlSearchParams] = useSearchParams();
  const initialSearch = urlSearchParams.get('search') || '';

  // State
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);

  // Filters
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');

  // Summary
  const [summary, setSummary] = useState<SummaryData>({ total: 0, successful: 0, pending: 0, failed: 0, todayCount: 0 });
  const [summaryLoading, setSummaryLoading] = useState(true);

  const { user } = useAuth();
  const { log } = useAuditLog();

  // Drawer
  const [selectedDeposit, setSelectedDeposit] = useState<DepositRow | null>(null);
  const [paystackDetail, setPaystackDetail] = useState<PaystackDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Approve / Decline confirmation
  const [confirmAction, setConfirmAction] = useState<'approve' | 'decline' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Debounce search by 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Fetch summary ──
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      // Use count queries instead of fetching all rows
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const [totalRes, successRes, pendingRes, failedRes, todayRes] = await Promise.all([
        supabase.from('wallet_transactions').select('amount_ghs').eq('type', 'deposit'),
        supabase.from('wallet_transactions').select('amount_ghs').eq('type', 'deposit').in('status', ['confirmed', 'completed', 'success']),
        supabase.from('wallet_transactions').select('amount_ghs').eq('type', 'deposit').eq('status', 'pending'),
        supabase.from('wallet_transactions').select('amount_ghs').eq('type', 'deposit').in('status', ['failed', 'rejected', 'reversed']),
        supabase.from('wallet_transactions').select('id', { count: 'exact', head: true }).eq('type', 'deposit').gte('created_at', `${todayStr}T00:00:00`),
      ]);

      const sumAmount = (rows: any[] | null) => (rows || []).reduce((s, r) => s + (Number(r.amount_ghs) || 0), 0);

      setSummary({
        total: sumAmount(totalRes.data),
        successful: sumAmount(successRes.data),
        pending: sumAmount(pendingRes.data),
        failed: sumAmount(failedRes.data),
        todayCount: todayRes.count || 0,
      });
    } catch {
      // silent
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  // ── Fetch deposits (paginated, server-side filtered) ──
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchDeposits = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const q = debouncedSearch.trim();

      // Step 1: If searching, find matching user_ids from profiles first
      let searchUserIds: string[] | null = null;
      if (q) {
        const { data: matchedProfiles } = await supabase
          .from('profiles')
          .select('id')
          .or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
          .limit(200);
        searchUserIds = (matchedProfiles || []).map((p: any) => p.id);
      }

      // Step 2: Build the main query
      let query = supabase
        .from('wallet_transactions')
        .select('id, amount_ghs, processing_fee, total_paid, status, type, reference, paystack_reference, provider, created_at, user_id, description, user_txn_id', { count: 'exact' })
        .eq('type', 'deposit')
        .order('created_at', { ascending: false });

      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'confirmed') {
          query = query.in('status', ['confirmed', 'completed', 'success']);
        } else {
          query = query.eq('status', statusFilter);
        }
      }

      // Date range
      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);

      // Amount range
      if (amountMin && !isNaN(Number(amountMin))) query = query.gte('amount_ghs', Number(amountMin));
      if (amountMax && !isNaN(Number(amountMax))) query = query.lte('amount_ghs', Number(amountMax));

      // Channel filter (provider/description based)
      if (channelFilter !== 'all') {
        const channelMap: Record<string, string[]> = {
          momo: ['momo', 'mobile_money', 'mobile money'],
          card: ['card', 'visa', 'mastercard'],
          bank: ['bank'],
        };
        const terms = channelMap[channelFilter] || [channelFilter];
        // Use OR across provider and description for each term
        const orParts = terms.flatMap(t => [
          `provider.ilike.%${t}%`,
          `description.ilike.%${t}%`,
        ]);
        query = query.or(orParts.join(','));
      }

      // Search: combine reference field matches with user_id matches from profiles
      if (q) {
        const orParts: string[] = [
          `reference.ilike.%${q}%`,
          `paystack_reference.ilike.%${q}%`,
          `description.ilike.%${q}%`,
        ];
        // If search looks like a UUID, also match by id or user_id exactly
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(q)) {
          orParts.push(`id.eq.${q}`);
          orParts.push(`user_id.eq.${q}`);
        }
        // Add user_id matches from profile search (name/email/phone)
        if (searchUserIds && searchUserIds.length > 0) {
          orParts.push(`user_id.in.(${searchUserIds.join(',')})`);
        }
        query = query.or(orParts.join(','));
      }

      // Pagination
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) {
        console.error('Deposits query error:', error);
        throw error;
      }

      const txns = (data || []) as Omit<DepositRow, 'profile'>[];

      // Batch-fetch profiles for returned user_ids (LEFT JOIN equivalent)
      const userIds = [...new Set(txns.map(t => t.user_id).filter(Boolean))];
      let profileMap: Record<string, DepositRow['profile']> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone, created_at')
          .in('id', userIds);
        if (profiles) {
          profiles.forEach((p: any) => {
            profileMap[p.id] = { full_name: p.full_name, email: p.email, phone: p.phone, created_at: p.created_at };
          });
        }
      }

      const rows: DepositRow[] = txns.map(d => ({
        ...d,
        profile: profileMap[d.user_id] || null,
      }));

      setDeposits(rows);
      setTotalCount(count ?? rows.length);
    } catch (e: any) {
      const msg = e?.message || 'Unknown error';
      console.error('Failed to load deposits:', e);
      setFetchError(msg);
      toast.error(`Couldn't load deposits: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, dateFrom, dateTo, amountMin, amountMax, debouncedSearch, channelFilter]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchDeposits(); }, [fetchDeposits]);

  // ── Open detail drawer ──
  const openDrawer = async (dep: DepositRow) => {
    setSelectedDeposit(dep);
    setPaystackDetail(null);
    if (dep.paystack_reference) {
      setDrawerLoading(true);
      try {
        const { data } = await supabase
          .from('paystack_payments')
          .select('*')
          .eq('reference', dep.paystack_reference)
          .maybeSingle();
        setPaystackDetail(data as PaystackDetail | null);
      } catch { /* silent */ } finally {
        setDrawerLoading(false);
      }
    }
  };

  // ── Approve / Decline handlers ──
  const isManualTransfer = selectedDeposit?.provider === 'manual_transfer';
  const currentStatus = selectedDeposit?.status?.toLowerCase();
  const isPending = currentStatus === 'pending' || currentStatus === 'pending_review';

  const handleDepositAction = async (action: 'approve' | 'decline') => {
    if (!selectedDeposit || actionLoading) return;
    setActionLoading(true);
    try {
      // Manual transfer deposits go through dedicated RPCs (atomic, idempotent server-side)
      if (isManualTransfer) {
        const rpcName = action === 'approve' ? 'approve_manual_deposit' : 'reject_manual_deposit';
        const params: any = action === 'approve'
          ? { p_txn_id: selectedDeposit.id, p_admin_note: null }
          : { p_txn_id: selectedDeposit.id, p_reason: null };
        const { data, error } = await supabase.rpc(rpcName as any, params);
        if (error) throw error;
        const res: any = data;
        if (!res?.success) {
          toast.error(`Action failed: ${res?.error || 'Unknown'}`);
          if (res?.current_status) {
            setSelectedDeposit({ ...selectedDeposit, status: res.current_status });
          }
          return;
        }
        await log({
          action: action === 'approve' ? 'manual_deposit_approved' : 'manual_deposit_rejected',
          entity_type: 'wallet_transaction',
          entity_id: selectedDeposit.id,
          changes: { status: { before: selectedDeposit.status || 'pending', after: action === 'approve' ? 'confirmed' : 'rejected' } },
          metadata: { user_id: selectedDeposit.user_id, amount: selectedDeposit.amount_ghs, admin_id: user?.id, provider: 'manual_transfer' },
        });
        setSelectedDeposit({ ...selectedDeposit, status: action === 'approve' ? 'confirmed' : 'rejected' });
        toast.success(action === 'approve' ? 'Manual deposit approved & wallet credited' : 'Manual deposit rejected');
        fetchDeposits();
        fetchSummary();
        return;
      }

      // Original Paystack-style pending flow (unchanged)
      const newStatus = action === 'approve' ? 'confirmed' : 'rejected';

      // Atomic guard: only update if still pending (prevents double-credit)
      const { data: updated, error } = await supabase
        .from('wallet_transactions')
        .update({ status: newStatus })
        .eq('id', selectedDeposit.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();

      if (error) throw error;

      if (!updated) {
        toast.error('This deposit is no longer pending — it may have already been processed.');
        // Refresh the deposit to get current status
        const { data: fresh } = await supabase
          .from('wallet_transactions')
          .select('status')
          .eq('id', selectedDeposit.id)
          .single();
        if (fresh) setSelectedDeposit({ ...selectedDeposit, status: fresh.status });
        return;
      }

      // Credit wallet only on approve
      if (action === 'approve') {
        const { data: wallet } = await supabase
          .from('wallets')
          .select('balance_ghs')
          .eq('user_id', selectedDeposit.user_id)
          .single();

        if (wallet) {
          await supabase
            .from('wallets')
            .update({ balance_ghs: Number(wallet.balance_ghs) + selectedDeposit.amount_ghs })
            .eq('user_id', selectedDeposit.user_id);
        }
      }

      // Audit log
      await log({
        action: action === 'approve' ? 'deposit_confirmed' : 'deposit_rejected',
        entity_type: 'wallet_transaction',
        entity_id: selectedDeposit.id,
        changes: { status: { before: 'pending', after: newStatus } },
        metadata: { user_id: selectedDeposit.user_id, amount: selectedDeposit.amount_ghs, admin_id: user?.id },
      });

      // Update local state
      setSelectedDeposit({ ...selectedDeposit, status: newStatus });
      toast.success(action === 'approve' ? 'Deposit approved & wallet credited' : 'Deposit declined');
      fetchDeposits();
      fetchSummary();
    } catch (e: any) {
      toast.error(`Action failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  // ── Clear filters ──
  const clearFilters = () => {
    setSearch(''); setDebouncedSearch(''); setStatusFilter('all'); setChannelFilter('all');
    setDateFrom(''); setDateTo(''); setAmountMin(''); setAmountMax('');
    setPage(0);
  };

  // ── CSV Export ──
  const exportCSV = () => {
    if (!deposits.length) return toast.error('No data to export');
    const headers = ['Date', 'Deposit ID', 'Status', 'Amount (GHS)', 'Fees (GHS)', 'Net (GHS)', 'Channel', 'Provider', 'User', 'Email', 'Phone', 'Reference', 'Paystack Ref', 'Wallet Txn ID'];
    const csvRows = deposits.map(d => [
      format(new Date(d.created_at), 'yyyy-MM-dd HH:mm'),
      d.id,
      d.status,
      d.amount_ghs,
      d.processing_fee ?? '',
      d.total_paid ? (d.amount_ghs) : '',
      guessChannel(d.description, d.provider),
      safe(d.provider, ''),
      safe(d.profile?.full_name, 'Guest'),
      safe(d.profile?.email, ''),
      safe(d.profile?.phone, ''),
      safe(d.reference, ''),
      safe(d.paystack_reference, ''),
      d.id,
    ]);
    const csv = [headers, ...csvRows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `deposits-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const netAmount = (d: DepositRow) => d.amount_ghs;

  // ── Render ───────────────────────────────────────────
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Deposits</h1>
            <p className="text-sm text-muted-foreground">Comprehensive deposit ledger &amp; details</p>
          </div>
          <Button onClick={exportCSV} variant="outline" size="sm" className="gap-2 self-start">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'Total Deposits', value: summary.total, icon: DollarSign, color: 'text-primary' },
            { label: 'Successful', value: summary.successful, icon: CheckCircle2, color: 'text-emerald-600' },
            { label: 'Pending', value: summary.pending, icon: Clock, color: 'text-amber-600' },
            { label: 'Failed / Rejected', value: summary.failed, icon: XCircle, color: 'text-destructive' },
            { label: 'Today', value: summary.todayCount, icon: CalendarDays, color: 'text-primary', isCount: true },
          ].map(c => (
            <div key={c.label} className="bg-card border border-border rounded-xl p-4 space-y-1">
              <div className="flex items-center gap-2">
                <c.icon className={`w-4 h-4 ${c.color}`} />
                <span className="text-xs text-muted-foreground font-medium">{c.label}</span>
              </div>
              {summaryLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <p className="text-lg font-bold">
                  {(c as any).isCount ? c.value : formatPrice(c.value)}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search ref, email, phone, ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={channelFilter} onValueChange={v => { setChannelFilter(v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CHANNEL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input type="date" placeholder="From" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} />
            <Input type="date" placeholder="To" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} />
            <Input type="number" placeholder="Min GHS" value={amountMin} onChange={e => { setAmountMin(e.target.value); setPage(0); }} />
            <Input type="number" placeholder="Max GHS" value={amountMax} onChange={e => { setAmountMax(e.target.value); setPage(0); }} />
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs">
              <X className="w-3 h-3" /> Clear Filters
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date/Time</TableHead>
                  <TableHead className="hidden xl:table-cell">Deposit ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">Fees</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">Net</TableHead>
                  <TableHead className="hidden md:table-cell">Channel</TableHead>
                  <TableHead className="hidden xl:table-cell">Provider</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="hidden lg:table-cell">Phone</TableHead>
                  <TableHead className="hidden xl:table-cell">Reference</TableHead>
                  <TableHead className="hidden xl:table-cell">Paystack Ref</TableHead>
                  <TableHead className="w-[60px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 13 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : deposits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-12 text-muted-foreground">
                      {fetchError ? `Couldn't load deposits: ${fetchError}` : 'No deposits found for the selected filters.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  deposits.map(d => (
                    <TableRow key={d.id} className="group">
                      <TableCell className="text-xs whitespace-nowrap">{format(new Date(d.created_at), 'dd MMM yy, HH:mm')}</TableCell>
                      <TableCell className="hidden xl:table-cell"><span className="text-xs font-mono truncate max-w-[100px] block">{d.id.slice(0, 8)}…</span></TableCell>
                      <TableCell>{statusBadge(d.status)}</TableCell>
                      <TableCell className="text-right font-semibold text-sm">{formatPrice(d.amount_ghs)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground hidden lg:table-cell">{d.processing_fee != null ? formatPrice(d.processing_fee) : '---'}</TableCell>
                      <TableCell className="text-right text-xs hidden lg:table-cell">{formatPrice(netAmount(d))}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs">{guessChannel(d.description, d.provider)}</TableCell>
                      <TableCell className="hidden xl:table-cell text-xs">{safe(d.provider)}</TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <p className="font-medium truncate max-w-[120px]">{safe(d.profile?.full_name, 'Guest')}</p>
                          <p className="text-muted-foreground truncate max-w-[120px]">{safe(d.profile?.email)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs">{safe(d.profile?.phone)}</TableCell>
                      <TableCell className="hidden xl:table-cell"><CopyBtn value={d.reference} label="Reference" /></TableCell>
                      <TableCell className="hidden xl:table-cell"><CopyBtn value={d.paystack_reference} label="Paystack Ref" /></TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDrawer(d)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted-foreground">
              <span>Page {page + 1} of {totalPages} ({totalCount} records)</span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Detail Drawer ── */}
      <Sheet open={!!selectedDeposit} onOpenChange={o => { if (!o) setSelectedDeposit(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Deposit Details</SheetTitle>
          </SheetHeader>

          {selectedDeposit && (
            <div className="space-y-6 mt-4">
              {/* Quick copy strip */}
              <div className="flex flex-wrap gap-2">
                {[
                  { v: selectedDeposit.id, l: 'Deposit ID' },
                  { v: selectedDeposit.paystack_reference, l: 'Paystack Ref' },
                  { v: selectedDeposit.reference, l: 'Internal Ref' },
                  { v: selectedDeposit.user_txn_id, l: 'User Txn ID' },
                  { v: selectedDeposit.profile?.email, l: 'Email' },
                  { v: selectedDeposit.profile?.phone, l: 'Phone' },
                ].filter(x => x.v).map(x => (
                  <div key={x.l} className="bg-muted rounded-lg px-2 py-1">
                    <p className="text-[10px] text-muted-foreground">{x.l}</p>
                    <CopyBtn value={x.v} label={x.l} />
                  </div>
                ))}
              </div>

              {/* ── Admin Actions ── */}
              {isPending ? (
                <div className="flex gap-2">
                  <Button
                    className="flex-1 gap-2"
                    onClick={() => setConfirmAction('approve')}
                    disabled={actionLoading}
                  >
                    <ShieldCheck className="w-4 h-4" /> Approve &amp; Credit
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 gap-2"
                    onClick={() => setConfirmAction('decline')}
                    disabled={actionLoading}
                  >
                    <Ban className="w-4 h-4" /> Decline
                  </Button>
                </div>
              ) : (
                <div className="bg-muted rounded-lg px-3 py-2 text-xs text-muted-foreground">
                  Status: <span className="font-semibold">{selectedDeposit.status}</span> — no further actions available.
                </div>
              )}

              {/* User Details */}
              <Section title="User Details">
                <Row label="Full Name" value={safe(selectedDeposit.profile?.full_name, 'Guest')} />
                <Row label="Email" value={safe(selectedDeposit.profile?.email)} />
                <Row label="Phone" value={safe(selectedDeposit.profile?.phone)} />
                <Row label="User ID">
                  <CopyBtn value={selectedDeposit.user_id} label="User ID" />
                </Row>
                <Row label="Account Created" value={selectedDeposit.profile?.created_at ? format(new Date(selectedDeposit.profile.created_at), 'dd MMM yyyy') : '---'} />
              </Section>

              {/* Payment Details */}
              <Section title="Payment Details">
                <Row label="Amount" value={formatPrice(selectedDeposit.amount_ghs)} />
                <Row label="Fees" value={selectedDeposit.processing_fee != null ? formatPrice(selectedDeposit.processing_fee) : '---'} />
                <Row label="Net Credited" value={formatPrice(netAmount(selectedDeposit))} />
                <Row label="Status">{statusBadge(selectedDeposit.status)}</Row>
                <Row label="Channel" value={paystackDetail?.channel || guessChannel(selectedDeposit.description, selectedDeposit.provider)} />
                <Row label="Provider" value={safe(selectedDeposit.provider)} />
                <Row label="Currency" value={paystackDetail?.currency || 'GHS'} />
                <Row label="Paystack Ref"><CopyBtn value={selectedDeposit.paystack_reference} label="Paystack Ref" /></Row>
                <Row label="Internal Ref"><CopyBtn value={selectedDeposit.reference} label="Internal Ref" /></Row>
                {isManualTransfer && (
                  <Row label="User Txn ID"><CopyBtn value={selectedDeposit.user_txn_id || ''} label="User Txn ID" /></Row>
                )}
                {paystackDetail && (
                  <Row label="Gateway Message" value={safe((paystackDetail.raw_response as any)?.gateway_response)} />
                )}
              </Section>

              {/* Links */}
              <Section title="Links / Relations">
                <Row label="Wallet Txn ID"><CopyBtn value={selectedDeposit.id} label="Wallet Txn ID" /></Row>
                {paystackDetail?.linked_order_id && (
                  <Row label="Linked Order ID"><CopyBtn value={paystackDetail.linked_order_id} label="Order ID" /></Row>
                )}
              </Section>

              {/* Timeline */}
              <Section title="Timeline">
                <Row label="Created" value={format(new Date(selectedDeposit.created_at), 'dd MMM yyyy, HH:mm:ss')} />
                {drawerLoading ? (
                  <Skeleton className="h-4 w-40" />
                ) : paystackDetail ? (
                  <>
                    <Row label="Paid At" value={paystackDetail.paid_at ? format(new Date(paystackDetail.paid_at), 'dd MMM yyyy, HH:mm:ss') : '---'} />
                    <Row label="Verified At" value={paystackDetail.verified_at ? format(new Date(paystackDetail.verified_at), 'dd MMM yyyy, HH:mm:ss') : '---'} />
                  </>
                ) : (
                  <Row label="Paystack Data" value="No Paystack record found" />
                )}
              </Section>

              {/* Raw JSON */}
              {paystackDetail?.raw_response && (
                <Accordion type="single" collapsible>
                  <AccordionItem value="raw">
                    <AccordionTrigger className="text-sm font-semibold">Raw Metadata (JSON)</AccordionTrigger>
                    <AccordionContent>
                      <div className="relative">
                        <pre className="text-[11px] bg-muted rounded-lg p-3 overflow-x-auto max-h-64 whitespace-pre-wrap">
                          {JSON.stringify(paystackDetail.raw_response, null, 2)}
                        </pre>
                        <Button
                          variant="ghost" size="icon"
                          className="absolute top-2 right-2 h-6 w-6"
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(paystackDetail.raw_response, null, 2));
                            toast.success('JSON copied');
                          }}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Confirmation Dialog ── */}
      <AlertDialog open={!!confirmAction} onOpenChange={o => { if (!o) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'approve' ? 'Approve & Credit Deposit?' : 'Decline Deposit?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {selectedDeposit && (
                  <>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-muted rounded-lg p-3 text-xs">
                      <span className="text-muted-foreground">Deposit ID</span>
                      <span className="font-mono truncate">{selectedDeposit.id.slice(0, 12)}…</span>
                      <span className="text-muted-foreground">User</span>
                      <span>{safe(selectedDeposit.profile?.full_name, 'Guest')}</span>
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-semibold">{formatPrice(selectedDeposit.amount_ghs)}</span>
                      <span className="text-muted-foreground">Current Status</span>
                      <span>{selectedDeposit.status}</span>
                    </div>
                    <p className="text-destructive font-medium text-xs">
                      {confirmAction === 'approve'
                        ? '⚠️ This will credit the user\'s wallet with the deposit amount. This action cannot be undone.'
                        : '⚠️ This will mark the deposit as rejected. The wallet will NOT be credited.'}
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && handleDepositAction(confirmAction)}
              disabled={actionLoading}
              className={confirmAction === 'decline' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              {confirmAction === 'approve' ? 'Confirm Approve' : 'Confirm Decline'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

// ── Small sub-components ──
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <h3 className="text-sm font-semibold border-b border-border pb-1">{title}</h3>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const Row = ({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) => (
  <div className="flex justify-between items-start gap-4">
    <span className="text-xs text-muted-foreground shrink-0">{label}</span>
    {children || <span className="text-xs font-medium text-right">{value}</span>}
  </div>
);

export default AdminDeposits;
