import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import {
  DollarSign, TrendingUp, TrendingDown, ArrowDownCircle, ArrowUpCircle,
  Plus, Download, Search, RefreshCw, Eye, Ban, Wallet, CreditCard, Receipt,
  PiggyBank, ArrowLeftRight, Link2, Undo2, Users, ChevronLeft, ChevronRight,
  Tag, CalendarDays, Clock, CheckCircle2, ChevronDown, ChevronUp, X
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────
interface LedgerEntry {
  id: string;
  created_at: string;
  created_by: string | null;
  entry_date: string;
  type: string;
  direction: string;
  amount: number;
  currency: string;
  reference: string | null;
  description: string;
  category: string | null;
  category_id: string | null;
  notes: string | null;
  source: string;
  source_id: string | null;
  status: string;
  bucket: string;
  transfer_group_id: string | null;
  expected_date: string | null;
}

interface FinanceSettings { starting_balance: number; }
interface AgentRow { id: string; store_name: string | null; store_email: string | null; }
interface CategoryRow { id: string; name: string; color_hex: string | null; sort_order: number; archived: boolean; }

const TYPE_LABELS: Record<string, string> = {
  paystack_payout_in: 'Paystack Payout',
  supplier_topup_out: 'Supplier Top-up',
  business_expense_out: 'Business Expense',
  agent_commission_paid_out: 'Agent Commission',
  manual_adjustment: 'Manual Adjustment',
  bucket_transfer_in: 'Transfer In',
  bucket_transfer_out: 'Transfer Out',
  agent_payout: 'Agent Payout',
};

const TYPE_COLORS: Record<string, string> = {
  paystack_payout_in: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  supplier_topup_out: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  business_expense_out: 'bg-red-500/10 text-red-600 dark:text-red-400',
  agent_commission_paid_out: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  manual_adjustment: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  bucket_transfer_in: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
  bucket_transfer_out: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
  agent_payout: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

const PAGE_SIZE = 20;

const AdminFinanceLedger = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (isAdmin === false) { toast.error('Access denied'); navigate('/admin'); }
  }, [isAdmin, navigate]);

  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  // Data
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [pendingRows, setPendingRows] = useState<LedgerEntry[]>([]);
  const [pendingTotals, setPendingTotals] = useState({ credits: 0, debits: 0 });
  const [pendingPanelOpen, setPendingPanelOpen] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [balances, setBalances] = useState({ master: 0, available: 0, savings: 0 });
  const [settings, setSettings] = useState<FinanceSettings>({ starting_balance: 0 });
  const [last30, setLast30] = useState({ totalIn: 0, totalOut: 0, net: 0 });
  const [reportData, setReportData] = useState({ commPaid: 0, commPending: 0, subRevenue: 0 });
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewEntry, setViewEntry] = useState<LedgerEntry | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [filterType, setFilterType] = useState(searchParams.get('type') || 'all');
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || 'posted');
  const [filterBucket, setFilterBucket] = useState(searchParams.get('bucket') || 'all');
  const [filterCategory, setFilterCategory] = useState(searchParams.get('category') || 'all');
  const [filterDateFrom, setFilterDateFrom] = useState(searchParams.get('from') || '');
  const [filterDateTo, setFilterDateTo] = useState(searchParams.get('to') || '');

  // Modals
  const [entryModal, setEntryModal] = useState<null | 'paystack_payout_in' | 'supplier_topup_out' | 'business_expense_out' | 'manual_adjustment'>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quickCatOpen, setQuickCatOpen] = useState(false);
  const [quickCatName, setQuickCatName] = useState('');
  const [quickCatDesc, setQuickCatDesc] = useState('');
  const [markPaidEntry, setMarkPaidEntry] = useState<LedgerEntry | null>(null);
  const [markPaidDate, setMarkPaidDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [editPendingEntry, setEditPendingEntry] = useState<LedgerEntry | null>(null);

  // Generic entry form
  const [formDate, setFormDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formAmount, setFormAmount] = useState('');
  const [formRef, setFormRef] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCategoryId, setFormCategoryId] = useState<string>('');
  const [formNotes, setFormNotes] = useState('');
  const [formDirection, setFormDirection] = useState<'credit' | 'debit'>('credit');
  const [formIsPending, setFormIsPending] = useState(false);
  const [formExpectedDate, setFormExpectedDate] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));

  // Transfer form
  const [tDirection, setTDirection] = useState<'to_savings' | 'to_available'>('to_savings');
  const [tAmount, setTAmount] = useState('');
  const [tNote, setTNote] = useState('');

  // Payout form
  const [pAmount, setPAmount] = useState('');
  const [pAgent, setPAgent] = useState<string>('');
  const [pRef, setPRef] = useState('');
  const [pNote, setPNote] = useState('');
  const [pDate, setPDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [pBucket, setPBucket] = useState<'main' | 'savings'>('main');
  const [pIsPending, setPIsPending] = useState(false);
  const [pExpectedDate, setPExpectedDate] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));

  // Helpers
  const fmtGHS = (n: number) => `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryRow>();
    categories.forEach(c => m.set(c.id, c));
    return m;
  }, [categories]);
  const activeCategories = useMemo(() => categories.filter(c => !c.archived), [categories]);

  // ─── Sync filter changes to URL ─────────────────────────────────
  const updateUrlParams = useCallback((overrides: Record<string, string | null> = {}) => {
    const next = new URLSearchParams(searchParams);
    const set = (k: string, v: string | null) => {
      if (!v || v === 'all' || v === '') next.delete(k);
      else next.set(k, v);
    };
    const apply = {
      page: String(overrides.page ?? currentPage),
      q: overrides.q ?? searchTerm,
      type: overrides.type ?? filterType,
      status: overrides.status ?? filterStatus,
      bucket: overrides.bucket ?? filterBucket,
      category: overrides.category ?? filterCategory,
      from: overrides.from ?? filterDateFrom,
      to: overrides.to ?? filterDateTo,
    };
    Object.entries(apply).forEach(([k, v]) => set(k, k === 'page' && v === '1' ? null : v));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, currentPage, searchTerm, filterType, filterStatus, filterBucket, filterCategory, filterDateFrom, filterDateTo]);

  // ─── Fetch ──────────────────────────────────────────────────────
  const fetchBalances = useCallback(async () => {
    const res = await supabase.rpc('get_finance_bucket_balances' as never);
    const data = res.data as Array<{ master: number; available: number; savings: number }> | null;
    if (!res.error && Array.isArray(data) && data.length) {
      const r = data[0];
      setBalances({ master: Number(r.master), available: Number(r.available), savings: Number(r.savings) });
    }
  }, []);

  const fetchPending = useCallback(async () => {
    const { data, error } = await supabase
      .from('finance_ledger_entries')
      .select('*')
      .eq('status', 'pending')
      .order('expected_date', { ascending: true });
    if (error) return;
    const list = (data || []) as LedgerEntry[];
    setPendingRows(list);
    const credits = list.filter(r => r.direction === 'credit').reduce((s, r) => s + Number(r.amount), 0);
    const debits = list.filter(r => r.direction === 'debit').reduce((s, r) => s + Number(r.amount), 0);
    setPendingTotals({ credits, debits });
  }, []);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = supabase.from('finance_ledger_entries').select('*', { count: 'exact' });
    if (filterStatus !== 'all') q = q.eq('status', filterStatus);
    if (filterType !== 'all') q = q.eq('type', filterType);
    if (filterBucket !== 'all') q = q.eq('bucket', filterBucket);
    if (filterCategory === 'none') q = q.is('category_id', null);
    else if (filterCategory !== 'all') q = q.eq('category_id', filterCategory);
    if (filterDateFrom) q = q.gte('entry_date', filterDateFrom);
    if (filterDateTo) q = q.lte('entry_date', filterDateTo);
    if (searchTerm.trim()) {
      const t = searchTerm.trim().replace(/[%,]/g, ' ');
      q = q.or(`description.ilike.%${t}%,reference.ilike.%${t}%,category.ilike.%${t}%`);
    }
    const { data, error, count } = await q
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) { toast.error(error.message); setLoading(false); return; }
    setEntries((data || []) as LedgerEntry[]);
    setTotalCount(count || 0);
    setLoading(false);
  }, [currentPage, filterStatus, filterType, filterBucket, filterCategory, filterDateFrom, filterDateTo, searchTerm]);

  const fetchAux = useCallback(async () => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = format(cutoff, 'yyyy-MM-dd');
    const [settingsRes, recentRes, paidRes, pendingComm, subRes, agentsRes, catsRes] = await Promise.all([
      supabase.from('finance_settings').select('*').eq('id', true).maybeSingle(),
      supabase.from('finance_ledger_entries').select('amount,direction').eq('status', 'posted').gte('entry_date', cutoffStr),
      supabase.from('agent_withdrawals').select('amount_ghs').eq('status', 'paid'),
      supabase.from('agent_withdrawals').select('amount_ghs').in('status', ['pending', 'approved']),
      supabase.from('agent_subscriptions').select('plan_price_current'),
      supabase.from('agents').select('id, store_name, store_email').order('store_name', { ascending: true }),
      supabase.from('finance_categories').select('id, name, color_hex, sort_order, archived').order('sort_order').order('name'),
    ]);
    if (settingsRes.data) setSettings({ starting_balance: Number((settingsRes.data as { starting_balance: number }).starting_balance) });
    const recent = (recentRes.data || []) as { amount: number; direction: string }[];
    const totalIn = recent.filter(r => r.direction === 'credit').reduce((s, r) => s + Number(r.amount), 0);
    const totalOut = recent.filter(r => r.direction === 'debit').reduce((s, r) => s + Number(r.amount), 0);
    setLast30({ totalIn, totalOut, net: totalIn - totalOut });
    setReportData({
      commPaid: ((paidRes.data || []) as { amount_ghs: number }[]).reduce((s, r) => s + Number(r.amount_ghs), 0),
      commPending: ((pendingComm.data || []) as { amount_ghs: number }[]).reduce((s, r) => s + Number(r.amount_ghs), 0),
      subRevenue: ((subRes.data || []) as { plan_price_current: number }[]).reduce((s, r) => s + Number(r.plan_price_current), 0),
    });
    setAgents(((agentsRes.data || []) as AgentRow[]).map(a => ({ id: a.id, store_name: a.store_name, store_email: a.store_email })));
    setCategories((catsRes.data || []) as CategoryRow[]);
  }, []);

  useEffect(() => { fetchPage(); fetchBalances(); fetchPending(); }, [fetchPage, fetchBalances, fetchPending]);
  useEffect(() => { fetchAux(); }, [fetchAux]);

  const refreshAll = () => { fetchPage(); fetchBalances(); fetchPending(); fetchAux(); };

  // Derived
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const reconciliation = useMemo(() => Math.abs(balances.master - (balances.available + balances.savings)) < 0.01, [balances]);
  const pairCount = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach(e => { if (e.transfer_group_id) map.set(e.transfer_group_id, (map.get(e.transfer_group_id) || 0) + 1); });
    return map;
  }, [entries]);

  // Pending net impact per bucket
  const pendingByBucket = useMemo(() => {
    const out = { main: { credits: 0, debits: 0 }, savings: { credits: 0, debits: 0 } };
    pendingRows.forEach(r => {
      const b = r.bucket === 'savings' ? 'savings' : 'main';
      if (r.direction === 'credit') out[b].credits += Number(r.amount);
      else out[b].debits += Number(r.amount);
    });
    return out;
  }, [pendingRows]);

  // ─── Modal openers ──────────────────────────────────────────────
  const openEntryModal = (type: NonNullable<typeof entryModal>) => {
    setFormDate(format(new Date(), 'yyyy-MM-dd'));
    setFormAmount(''); setFormRef(''); setFormDesc(''); setFormCategoryId(''); setFormNotes('');
    setFormDirection(type === 'paystack_payout_in' || type === 'manual_adjustment' ? 'credit' : 'debit');
    setFormIsPending(false);
    setFormExpectedDate(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
    setEditPendingEntry(null);
    setEntryModal(type);
  };

  const openEditPending = (e: LedgerEntry) => {
    setFormDate(e.entry_date);
    setFormAmount(String(e.amount));
    setFormRef(e.reference || '');
    setFormDesc(e.description);
    setFormCategoryId(e.category_id || '');
    setFormNotes(e.notes || '');
    setFormDirection(e.direction as 'credit' | 'debit');
    setFormIsPending(true);
    setFormExpectedDate(e.expected_date || format(addDays(new Date(), 7), 'yyyy-MM-dd'));
    setEditPendingEntry(e);
    setEntryModal(e.type as never);
  };

  // ─── Save entry (handles create + edit-pending) ─────────────────
  const saveEntry = async () => {
    if (!entryModal) return;
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) return toast.error('Amount must be greater than 0');
    if (!formDesc.trim()) return toast.error('Description is required');

    const supportsCategory = entryModal === 'business_expense_out' || entryModal === 'manual_adjustment';
    const cat = supportsCategory && formCategoryId ? categoriesById.get(formCategoryId) : null;

    setSaving(true);
    if (editPendingEntry) {
      const { error } = await supabase.from('finance_ledger_entries').update({
        amount,
        direction: formDirection,
        reference: formRef.trim() || null,
        description: formDesc.trim(),
        category: cat?.name ?? (supportsCategory ? null : editPendingEntry.category),
        category_id: supportsCategory ? (formCategoryId || null) : editPendingEntry.category_id,
        notes: formNotes.trim() || null,
        status: formIsPending ? 'pending' : 'posted',
        expected_date: formIsPending ? formExpectedDate : null,
        entry_date: formIsPending ? formExpectedDate : formDate,
      }).eq('id', editPendingEntry.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success('Pending entry updated');
    } else {
      const { error } = await supabase.from('finance_ledger_entries').insert({
        entry_date: formIsPending ? formExpectedDate : formDate,
        type: entryModal,
        direction: formDirection,
        amount,
        reference: formRef.trim() || null,
        description: formDesc.trim(),
        category: cat?.name || null,
        category_id: supportsCategory ? (formCategoryId || null) : null,
        notes: formNotes.trim() || null,
        source: 'manual',
        created_by: user?.id,
        bucket: 'main',
        status: formIsPending ? 'pending' : 'posted',
        expected_date: formIsPending ? formExpectedDate : null,
      });
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success(formIsPending ? 'Pending entry scheduled' : 'Entry recorded');
    }
    setEntryModal(null);
    setEditPendingEntry(null);
    refreshAll();
  };

  const submitTransfer = async () => {
    const amount = parseFloat(tAmount);
    if (!amount || amount <= 0) return toast.error('Amount must be greater than 0');
    const sourceBalance = tDirection === 'to_savings' ? balances.available : balances.savings;
    if (amount > sourceBalance) return toast.error(`Insufficient balance — only ${fmtGHS(sourceBalance)} available`);
    setSaving(true);
    const { error } = await supabase.rpc('finance_transfer_buckets' as never, {
      p_direction: tDirection, p_amount: amount, p_note: tNote.trim() || null,
    } as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Transfer recorded');
    setTransferOpen(false); setTAmount(''); setTNote('');
    refreshAll();
  };

  const submitPayout = async () => {
    const amount = parseFloat(pAmount);
    if (!amount || amount <= 0) return toast.error('Amount must be greater than 0');
    const agent = agents.find(a => a.id === pAgent);
    const snapshot = agent ? (agent.store_name?.trim() || agent.store_email || `Agent ${agent.id.slice(0, 8)}`) : null;
    setSaving(true);
    if (pIsPending) {
      // Pending agent payout: insert directly (no balance pre-check needed since not posted)
      const desc = 'Agent payout' + (snapshot ? ` — ${snapshot}` : '');
      const { error } = await supabase.from('finance_ledger_entries').insert({
        entry_date: pExpectedDate,
        expected_date: pExpectedDate,
        type: 'agent_payout',
        direction: 'debit',
        amount,
        description: desc,
        reference: pRef.trim() || null,
        notes: pNote.trim() || null,
        source: 'manual',
        source_id: pAgent || null,
        created_by: user?.id,
        bucket: pBucket,
        status: 'pending',
      });
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success('Pending agent payout scheduled');
    } else {
      const { error } = await supabase.rpc('finance_record_agent_payout' as never, {
        p_amount: amount, p_agent_id: pAgent || null, p_agent_name: snapshot,
        p_reference: pRef.trim() || null, p_note: pNote.trim() || null,
        p_entry_date: pDate, p_bucket: pBucket,
      } as never);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success('Agent payout recorded');
    }
    setPayoutOpen(false); setPAmount(''); setPAgent(''); setPRef(''); setPNote(''); setPIsPending(false);
    refreshAll();
  };

  const voidEntry = async (e: LedgerEntry) => {
    if (e.status === 'void') return;
    if (e.transfer_group_id) return toast.error('This is part of a bucket transfer — use Undo Transfer instead');
    const { error } = await supabase.from('finance_ledger_entries')
      .update({ status: 'void', notes: (e.notes || '') + '\n[Voided by admin]' })
      .eq('id', e.id);
    if (error) return toast.error(error.message);
    toast.success(e.status === 'pending' ? 'Pending entry cancelled' : 'Entry voided');
    refreshAll();
  };

  const undoTransfer = async (groupId: string) => {
    if (!confirm('Undo this bucket transfer? Both rows will be deleted.')) return;
    const { error } = await supabase.rpc('finance_undo_transfer' as never, { p_transfer_group_id: groupId } as never);
    if (error) return toast.error(error.message);
    toast.success('Transfer undone');
    setViewEntry(null);
    refreshAll();
  };

  const openMarkPaid = (e: LedgerEntry) => {
    setMarkPaidEntry(e);
    setMarkPaidDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const submitMarkPaid = async () => {
    if (!markPaidEntry) return;
    setSaving(true);
    const { error } = await supabase.rpc('finance_mark_pending_as_paid' as never, {
      p_entry_id: markPaidEntry.id, p_actual_date: markPaidDate,
    } as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Marked as paid');
    setMarkPaidEntry(null);
    refreshAll();
  };

  const quickCreateCategory = async () => {
    if (!quickCatName.trim()) return toast.error('Name required');
    setSaving(true);
    const { data, error } = await supabase.from('finance_categories').insert({
      name: quickCatName.trim(),
      description: quickCatDesc.trim() || null,
      color_hex: '#94a3b8',
      sort_order: 100,
      created_by: user?.id,
    }).select().single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Category created');
    setQuickCatOpen(false); setQuickCatName(''); setQuickCatDesc('');
    await fetchAux();
    if (data?.id) setFormCategoryId(data.id);
  };

  const exportCSV = async () => {
    let q = supabase.from('finance_ledger_entries').select('*');
    if (filterStatus !== 'all') q = q.eq('status', filterStatus);
    if (filterType !== 'all') q = q.eq('type', filterType);
    if (filterBucket !== 'all') q = q.eq('bucket', filterBucket);
    if (filterCategory === 'none') q = q.is('category_id', null);
    else if (filterCategory !== 'all') q = q.eq('category_id', filterCategory);
    if (filterDateFrom) q = q.gte('entry_date', filterDateFrom);
    if (filterDateTo) q = q.lte('entry_date', filterDateTo);
    const { data, error } = await q.order('entry_date', { ascending: false }).limit(5000);
    if (error) return toast.error(error.message);
    const rows = (data || []) as LedgerEntry[];
    const headers = ['Date', 'Type', 'Bucket', 'Description', 'Reference', 'Category', 'Category ID', 'Credit (GHS)', 'Debit (GHS)', 'Status', 'Expected', 'Created'];
    const csvRows = rows.map(e => [
      e.entry_date, TYPE_LABELS[e.type] || e.type, e.bucket,
      `"${(e.description || '').replace(/"/g, '""')}"`, e.reference || '', e.category || '', e.category_id || '',
      e.direction === 'credit' ? Number(e.amount).toFixed(2) : '',
      e.direction === 'debit' ? Number(e.amount).toFixed(2) : '',
      e.status, e.expected_date || '', format(new Date(e.created_at), 'yyyy-MM-dd HH:mm'),
    ]);
    const csv = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `finance-ledger-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const onFilterChange = (key: string, value: string) => {
    if (key === 'q') setSearchTerm(value);
    else if (key === 'type') setFilterType(value);
    else if (key === 'status') setFilterStatus(value);
    else if (key === 'bucket') setFilterBucket(value);
    else if (key === 'category') setFilterCategory(value);
    else if (key === 'from') setFilterDateFrom(value);
    else if (key === 'to') setFilterDateTo(value);
    updateUrlParams({ [key]: value, page: '1' });
  };

  const goToPage = (p: number) => {
    const next = Math.min(Math.max(1, p), totalPages);
    updateUrlParams({ page: String(next) });
  };

  if (isAdmin === false) return null;

  const supportsCategory = entryModal === 'business_expense_out' || entryModal === 'manual_adjustment';
  const pendingCount = pendingRows.length;
  const pendingNet = pendingTotals.credits - pendingTotals.debits;

  const renderCategoryPill = (e: LedgerEntry) => {
    const cat = e.category_id ? categoriesById.get(e.category_id) : null;
    if (cat) {
      return (
        <Badge variant="outline" style={{ borderColor: cat.color_hex || undefined, color: cat.color_hex || undefined }} className="text-[10px]">
          {cat.name}
        </Badge>
      );
    }
    if (e.category) {
      return <span className="text-xs italic text-muted-foreground/70" title="Needs re-categorising">{e.category}</span>;
    }
    return <span className="text-[10px] text-muted-foreground/50">—</span>;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold">Finance Ledger</h1>
            <p className="text-sm text-muted-foreground">Master balance tracker — Available + Savings</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate('/admin/finance-categories')} className="gap-1.5">
              <Tag className="w-3.5 h-3.5" /> Manage Categories
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate('/admin/finance-snapshots')} className="gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" /> Snapshots
            </Button>
            <Button size="sm" variant="outline" onClick={refreshAll}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
          </div>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground font-medium">Master Balance</span>
              </div>
              <p className={`text-lg font-bold tabular-nums ${balances.master >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {fmtGHS(balances.master)}
              </p>
              {(pendingTotals.credits > 0 || pendingTotals.debits > 0) && (
                <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                  Pending: <span className="text-emerald-600">+{fmtGHS(pendingTotals.credits)}</span> / <span className="text-red-600">−{fmtGHS(pendingTotals.debits)}</span>
                </p>
              )}
              {!reconciliation && <p className="text-[10px] text-red-500 mt-1">⚠ Reconciliation mismatch</p>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-muted-foreground font-medium">Available</span>
              </div>
              <p className="text-lg font-bold tabular-nums">{fmtGHS(balances.available)}</p>
              {(pendingByBucket.main.credits > 0 || pendingByBucket.main.debits > 0) && (
                <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                  Pending: <span className="text-emerald-600">+{fmtGHS(pendingByBucket.main.credits)}</span> / <span className="text-red-600">−{fmtGHS(pendingByBucket.main.debits)}</span>
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <PiggyBank className="w-4 h-4 text-amber-600" />
                <span className="text-xs text-muted-foreground font-medium">Savings</span>
              </div>
              <p className="text-lg font-bold tabular-nums">{fmtGHS(balances.savings)}</p>
              {(pendingByBucket.savings.credits > 0 || pendingByBucket.savings.debits > 0) && (
                <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                  Pending: <span className="text-emerald-600">+{fmtGHS(pendingByBucket.savings.credits)}</span> / <span className="text-red-600">−{fmtGHS(pendingByBucket.savings.debits)}</span>
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 30-day stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><ArrowDownCircle className="w-3 h-3 text-emerald-500" />In (30d)</div>
            <p className="text-sm font-semibold tabular-nums mt-0.5">{fmtGHS(last30.totalIn)}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><ArrowUpCircle className="w-3 h-3 text-red-500" />Out (30d)</div>
            <p className="text-sm font-semibold tabular-nums mt-0.5">{fmtGHS(last30.totalOut)}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{last30.net >= 0 ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : <TrendingDown className="w-3 h-3 text-red-500" />}Net (30d)</div>
            <p className={`text-sm font-semibold tabular-nums mt-0.5 ${last30.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtGHS(last30.net)}</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => openEntryModal('paystack_payout_in')} className="gap-2">
            <CreditCard className="w-4 h-4" /> Paystack Payout
          </Button>
          <Button variant="outline" onClick={() => openEntryModal('supplier_topup_out')} className="gap-2">
            <Wallet className="w-4 h-4" /> Supplier Top-up
          </Button>
          <Button variant="outline" onClick={() => openEntryModal('business_expense_out')} className="gap-2">
            <Receipt className="w-4 h-4" /> Expense
          </Button>
          <Button variant="outline" onClick={() => openEntryModal('manual_adjustment')} className="gap-2">
            <Plus className="w-4 h-4" /> Manual Adjustment
          </Button>
          <Button variant="outline" onClick={() => { setPayoutOpen(true); setPDate(format(new Date(), 'yyyy-MM-dd')); setPBucket('main'); setPIsPending(false); }} className="gap-2">
            <Users className="w-4 h-4" /> Agent Payout
          </Button>
          <Button variant="outline" onClick={() => { setTransferOpen(true); setTDirection('to_savings'); }} className="gap-2 ml-auto">
            <ArrowLeftRight className="w-4 h-4" /> Transfer Buckets
          </Button>
        </div>

        {/* Pending & Scheduled panel */}
        {pendingCount > 0 && (
          <Card className="border-amber-500/30">
            <CardHeader className="pb-2 cursor-pointer" onClick={() => setPendingPanelOpen(o => !o)}>
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Pending & Scheduled — {pendingCount} entry{pendingCount === 1 ? '' : 'ies'}
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    Net impact: <span className={`ml-1 font-bold ${pendingNet >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{pendingNet >= 0 ? '+' : ''}{fmtGHS(pendingNet)}</span>
                  </Badge>
                </span>
                {pendingPanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </CardTitle>
            </CardHeader>
            {pendingPanelOpen && (
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30 text-left text-muted-foreground text-xs">
                        <th className="px-3 py-2">Expected</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2">Bucket</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingRows.map(p => (
                        <tr key={p.id} className="border-b border-dashed last:border-0 opacity-90 hover:opacity-100 hover:bg-muted/20">
                          <td className="px-3 py-2 text-xs whitespace-nowrap">{p.expected_date || p.entry_date}</td>
                          <td className="px-3 py-2">
                            <Badge variant="secondary" className={`text-[10px] ${TYPE_COLORS[p.type] || ''}`}>{TYPE_LABELS[p.type] || p.type}</Badge>
                          </td>
                          <td className="px-3 py-2 max-w-xs truncate">{p.description}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={`text-[10px] ${p.bucket === 'savings' ? 'border-amber-500/40 text-amber-700' : 'border-emerald-500/40 text-emerald-700'}`}>
                              {p.bucket === 'savings' ? 'Savings' : 'Main'}
                            </Badge>
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums font-mono text-xs ${p.direction === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {p.direction === 'credit' ? '+' : '−'}{Number(p.amount).toFixed(2)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-600" onClick={() => openMarkPaid(p)} title="Mark as Paid">
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> <span className="text-xs">Paid</span>
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditPending(p)} title="Edit">
                                <Receipt className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => voidEntry(p)} title="Cancel">
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[180px]">
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Description, reference, category…"
                    className="pl-8 h-9 text-sm"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    onBlur={() => updateUrlParams({ q: searchTerm, page: '1' })}
                    onKeyDown={e => { if (e.key === 'Enter') updateUrlParams({ q: searchTerm, page: '1' }); }}
                  />
                </div>
              </div>
              <div className="min-w-[140px]">
                <Label className="text-xs">Type</Label>
                <Select value={filterType} onValueChange={v => onFilterChange('type', v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[140px]">
                <Label className="text-xs">Category</Label>
                <Select value={filterCategory} onValueChange={v => onFilterChange('category', v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="none">Uncategorised</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.archived ? ' (archived)' : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[120px]">
                <Label className="text-xs">Bucket</Label>
                <Select value={filterBucket} onValueChange={v => onFilterChange('bucket', v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Buckets</SelectItem>
                    <SelectItem value="main">Available</SelectItem>
                    <SelectItem value="savings">Savings</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[120px]">
                <Label className="text-xs">Status</Label>
                <Select value={filterStatus} onValueChange={v => onFilterChange('status', v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="posted">Posted</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="void">Void</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" className="h-9 text-sm w-[140px]" value={filterDateFrom} onChange={e => onFilterChange('from', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" className="h-9 text-sm w-[140px]" value={filterDateTo} onChange={e => onFilterChange('to', e.target.value)} />
              </div>
              <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Ledger Table */}
        <Card className="card-shadow">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 rounded" />)}</div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <DollarSign className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-semibold text-muted-foreground">No ledger entries match these filters</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                      <th className="px-3 py-3 font-medium w-[80px]">Bucket</th>
                      <th className="px-3 py-3 font-medium">Date</th>
                      <th className="px-3 py-3 font-medium">Type</th>
                      <th className="px-3 py-3 font-medium">Description</th>
                      <th className="px-3 py-3 font-medium">Category</th>
                      <th className="px-3 py-3 font-medium">Reference</th>
                      <th className="px-3 py-3 font-medium text-right">Credit</th>
                      <th className="px-3 py-3 font-medium text-right">Debit</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Created</th>
                      <th className="px-3 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(e => {
                      const isPair = !!e.transfer_group_id && (pairCount.get(e.transfer_group_id) || 0) >= 2;
                      const needsRecat = !!e.category && !e.category_id;
                      return (
                        <tr key={e.id} className={`border-b last:border-0 hover:bg-muted/20 ${e.status === 'void' ? 'opacity-50 line-through' : ''} ${e.status === 'pending' ? 'bg-amber-500/5' : ''}`}>
                          <td className="px-3 py-3">
                            <Badge variant="outline" className={`text-[10px] ${e.bucket === 'savings' ? 'border-amber-500/40 text-amber-700 dark:text-amber-400' : 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400'}`}>
                              {e.bucket === 'savings' ? 'Savings' : 'Main'}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-xs whitespace-nowrap">{e.entry_date}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="secondary" className={`text-[10px] ${TYPE_COLORS[e.type] || ''}`}>
                                {TYPE_LABELS[e.type] || e.type}
                              </Badge>
                              {isPair && <Link2 className="w-3 h-3 text-teal-600" aria-label="Linked transfer pair" />}
                            </div>
                          </td>
                          <td className={`px-3 py-3 max-w-[220px] truncate ${needsRecat ? 'italic text-muted-foreground' : ''}`}>{e.description}</td>
                          <td className="px-3 py-3">{renderCategoryPill(e)}</td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">{e.reference || '—'}</td>
                          <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                            {e.direction === 'credit' ? Number(e.amount).toFixed(2) : ''}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-red-600 dark:text-red-400">
                            {e.direction === 'debit' ? Number(e.amount).toFixed(2) : ''}
                          </td>
                          <td className="px-3 py-3">
                            {e.status === 'pending' ? (
                              <Badge className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40" variant="outline">Pending</Badge>
                            ) : e.status === 'void' ? (
                              <Badge variant="destructive" className="text-[10px]">Void</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-700 dark:text-emerald-400">Posted</Badge>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(e.created_at), 'dd MMM HH:mm')}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewEntry(e)}>
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              {e.status === 'pending' && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-600" onClick={() => openMarkPaid(e)} title="Mark as Paid">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {e.status === 'posted' && !e.transfer_group_id && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => voidEntry(e)}>
                                  <Ban className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {e.transfer_group_id && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-600" onClick={() => undoTransfer(e.transfer_group_id!)} title="Undo Transfer">
                                  <Undo2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && totalCount > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-sm">
                <div className="text-xs text-muted-foreground tabular-nums">{totalCount.toLocaleString()} transactions</div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
                    <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Prev
                  </Button>
                  <span className="text-xs tabular-nums px-2">Page {currentPage} of {totalPages}</span>
                  <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)}>
                    Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Platform Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              Platform Summary (Reporting Only)
            </CardTitle>
            <p className="text-xs text-muted-foreground">These figures do NOT affect the master balance.</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-muted/30 border">
                <p className="text-xs text-muted-foreground">Agent Commissions Paid (All Time)</p>
                <p className="text-base font-bold mt-1 tabular-nums">{fmtGHS(reportData.commPaid)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border">
                <p className="text-xs text-muted-foreground">Agent Commissions Pending</p>
                <p className="text-base font-bold mt-1 tabular-nums">{fmtGHS(reportData.commPending)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border">
                <p className="text-xs text-muted-foreground">Agent Subscription Revenue (All Time)</p>
                <p className="text-base font-bold mt-1 tabular-nums">{fmtGHS(reportData.subRevenue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Generic Entry Modal */}
      <Dialog open={!!entryModal} onOpenChange={o => { if (!o) { setEntryModal(null); setEditPendingEntry(null); } }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {editPendingEntry ? 'Edit Pending: ' : ''}{entryModal ? TYPE_LABELS[entryModal] : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Save-as toggle (entry types other than transfer) */}
            <div className="flex gap-2 rounded-md border p-1 bg-muted/30">
              <button
                type="button"
                onClick={() => setFormIsPending(false)}
                className={`flex-1 text-xs py-1.5 rounded ${!formIsPending ? 'bg-background shadow-sm font-semibold' : 'text-muted-foreground'}`}
              >Posted now</button>
              <button
                type="button"
                onClick={() => setFormIsPending(true)}
                className={`flex-1 text-xs py-1.5 rounded ${formIsPending ? 'bg-background shadow-sm font-semibold' : 'text-muted-foreground'}`}
              >Pending / scheduled</button>
            </div>

            {!formIsPending ? (
              <div>
                <Label>Date</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
              </div>
            ) : (
              <div>
                <Label>Expected date</Label>
                <Input type="date" value={formExpectedDate} onChange={e => setFormExpectedDate(e.target.value)} />
                <p className="text-[10px] text-muted-foreground mt-1">Will not affect balances until marked as paid.</p>
              </div>
            )}
            <div>
              <Label>Amount (GHS) *</Label>
              <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={formAmount} onChange={e => setFormAmount(e.target.value)} />
            </div>
            {entryModal === 'manual_adjustment' && (
              <div>
                <Label>Direction</Label>
                <Select value={formDirection} onValueChange={v => setFormDirection(v as 'credit' | 'debit')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Credit (Money In)</SelectItem>
                    <SelectItem value="debit">Debit (Money Out)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Reference</Label>
              <Input placeholder="Paystack ref, receipt ID..." value={formRef} onChange={e => setFormRef(e.target.value)} />
            </div>
            <div>
              <Label>Description *</Label>
              <Textarea placeholder="What is this entry for?" value={formDesc} onChange={e => setFormDesc(e.target.value)} />
            </div>
            {supportsCategory && (
              <div>
                <Label>Category</Label>
                <Select value={formCategoryId || 'none'} onValueChange={v => setFormCategoryId(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent className="max-h-[280px]">
                    <SelectItem value="none">— Uncategorised —</SelectItem>
                    {activeCategories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button type="button" onClick={() => setQuickCatOpen(true)} className="text-xs text-primary mt-1 hover:underline">+ Add new category</button>
              </div>
            )}
            <div>
              <Label>Notes</Label>
              <Textarea placeholder="Internal notes..." rows={2} value={formNotes} onChange={e => setFormNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEntryModal(null); setEditPendingEntry(null); }}>Cancel</Button>
            <Button onClick={saveEntry} disabled={saving}>{saving ? 'Saving…' : editPendingEntry ? 'Update' : (formIsPending ? 'Schedule' : 'Save Entry')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick-create category modal */}
      <Dialog open={quickCatOpen} onOpenChange={setQuickCatOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>New Category</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={quickCatName} onChange={e => setQuickCatName(e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={2} value={quickCatDesc} onChange={e => setQuickCatDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickCatOpen(false)}>Cancel</Button>
            <Button onClick={quickCreateCategory} disabled={saving}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Paid modal */}
      <Dialog open={!!markPaidEntry} onOpenChange={() => setMarkPaidEntry(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Mark as Paid</DialogTitle></DialogHeader>
          {markPaidEntry && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{markPaidEntry.description}</p>
              <p className="text-sm tabular-nums">
                Amount: <strong className={markPaidEntry.direction === 'credit' ? 'text-emerald-600' : 'text-red-600'}>
                  {markPaidEntry.direction === 'credit' ? '+' : '−'}{fmtGHS(Number(markPaidEntry.amount))}
                </strong>
              </p>
              <div>
                <Label>Actual date</Label>
                <Input type="date" value={markPaidDate} onChange={e => setMarkPaidDate(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaidEntry(null)}>Cancel</Button>
            <Button onClick={submitMarkPaid} disabled={saving}>{saving ? 'Saving…' : 'Mark Paid'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Modal */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowLeftRight className="w-4 h-4" /> Transfer Between Buckets</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-3 bg-muted/20 text-xs space-y-1 tabular-nums">
              <div className="flex justify-between"><span className="text-muted-foreground">Available</span><span className="font-semibold">{fmtGHS(balances.available)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Savings</span><span className="font-semibold">{fmtGHS(balances.savings)}</span></div>
              <div className="flex justify-between border-t pt-1 mt-1"><span className="text-muted-foreground">Master</span><span className="font-bold">{fmtGHS(balances.master)}</span></div>
            </div>
            <div>
              <Label>Direction</Label>
              <Select value={tDirection} onValueChange={v => setTDirection(v as 'to_savings' | 'to_available')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="to_savings">Available → Savings</SelectItem>
                  <SelectItem value="to_available">Savings → Available</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (GHS) *</Label>
              <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={tAmount} onChange={e => setTAmount(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">
                Source: {tDirection === 'to_savings' ? fmtGHS(balances.available) : fmtGHS(balances.savings)} available
              </p>
            </div>
            <div>
              <Label>Note</Label>
              <Textarea placeholder="Why are you moving this money?" rows={2} value={tNote} onChange={e => setTNote(e.target.value)} />
            </div>
            <div className="text-xs text-muted-foreground rounded-md bg-muted/40 p-2">
              Master balance will <strong>not</strong> change — money moves between buckets. Transfers are immediate.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button onClick={submitTransfer} disabled={saving}>{saving ? 'Transferring…' : 'Transfer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agent Payout Modal */}
      <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="w-4 h-4" /> Record Agent Payout</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2 rounded-md border p-1 bg-muted/30">
              <button type="button" onClick={() => setPIsPending(false)}
                className={`flex-1 text-xs py-1.5 rounded ${!pIsPending ? 'bg-background shadow-sm font-semibold' : 'text-muted-foreground'}`}>Posted now</button>
              <button type="button" onClick={() => setPIsPending(true)}
                className={`flex-1 text-xs py-1.5 rounded ${pIsPending ? 'bg-background shadow-sm font-semibold' : 'text-muted-foreground'}`}>Pending / scheduled</button>
            </div>
            {!pIsPending ? (
              <div>
                <Label>Date</Label>
                <Input type="date" value={pDate} onChange={e => setPDate(e.target.value)} />
              </div>
            ) : (
              <div>
                <Label>Expected date</Label>
                <Input type="date" value={pExpectedDate} onChange={e => setPExpectedDate(e.target.value)} />
              </div>
            )}
            <div>
              <Label>Amount (GHS) *</Label>
              <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={pAmount} onChange={e => setPAmount(e.target.value)} />
            </div>
            <div>
              <Label>Agent</Label>
              <Select value={pAgent} onValueChange={setPAgent}>
                <SelectTrigger><SelectValue placeholder="Select agent (optional)" /></SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.store_name?.trim() || a.store_email || `Agent ${a.id.slice(0, 8)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source Bucket</Label>
              <Select value={pBucket} onValueChange={v => setPBucket(v as 'main' | 'savings')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">Available ({fmtGHS(balances.available)})</SelectItem>
                  <SelectItem value="savings">Savings ({fmtGHS(balances.savings)})</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference</Label>
              <Input placeholder="Withdrawal ID, transfer ref…" value={pRef} onChange={e => setPRef(e.target.value)} />
            </div>
            <div>
              <Label>Note</Label>
              <Textarea placeholder="Internal note…" rows={2} value={pNote} onChange={e => setPNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayoutOpen(false)}>Cancel</Button>
            <Button onClick={submitPayout} disabled={saving}>{saving ? 'Saving…' : (pIsPending ? 'Schedule' : 'Save Payout')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Detail */}
      <Dialog open={!!viewEntry} onOpenChange={() => setViewEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Ledger Entry Detail</DialogTitle></DialogHeader>
          {viewEntry && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Date:</span> {viewEntry.entry_date}</div>
                <div><span className="text-muted-foreground">Type:</span> {TYPE_LABELS[viewEntry.type]}</div>
                <div><span className="text-muted-foreground">Bucket:</span> {viewEntry.bucket === 'savings' ? 'Savings' : 'Main'}</div>
                <div><span className="text-muted-foreground">Direction:</span> {viewEntry.direction}</div>
                <div><span className="text-muted-foreground">Amount:</span> <span className="tabular-nums">{fmtGHS(viewEntry.amount)}</span></div>
                <div>
                  <span className="text-muted-foreground">Status:</span>{' '}
                  {viewEntry.status === 'pending' ? (
                    <Badge className="text-[10px] bg-amber-500/15 text-amber-700 border-amber-500/40" variant="outline">Pending</Badge>
                  ) : (
                    <Badge variant={viewEntry.status === 'void' ? 'destructive' : 'default'}>{viewEntry.status}</Badge>
                  )}
                </div>
                <div><span className="text-muted-foreground">Source:</span> {viewEntry.source}</div>
                {viewEntry.expected_date && <div><span className="text-muted-foreground">Expected:</span> {viewEntry.expected_date}</div>}
              </div>
              <div><span className="text-muted-foreground">Description:</span> {viewEntry.description}</div>
              {viewEntry.reference && <div><span className="text-muted-foreground">Reference:</span> {viewEntry.reference}</div>}
              {(viewEntry.category_id || viewEntry.category) && (
                <div><span className="text-muted-foreground">Category:</span>{' '}{renderCategoryPill(viewEntry)}</div>
              )}
              {viewEntry.notes && <div><span className="text-muted-foreground">Notes:</span> {viewEntry.notes}</div>}
              {viewEntry.transfer_group_id && (
                <div className="rounded-md bg-muted/40 p-2 text-xs space-y-2">
                  <div className="flex items-center gap-1.5"><Link2 className="w-3 h-3 text-teal-600" />Part of bucket transfer</div>
                  <div className="font-mono break-all text-muted-foreground">{viewEntry.transfer_group_id}</div>
                  <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => undoTransfer(viewEntry.transfer_group_id!)}>
                    <Undo2 className="w-3.5 h-3.5" /> Undo Transfer (deletes both rows)
                  </Button>
                </div>
              )}
              {viewEntry.status === 'pending' && (
                <Button size="sm" className="w-full gap-1.5" onClick={() => { openMarkPaid(viewEntry); setViewEntry(null); }}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Mark as Paid
                </Button>
              )}
              <div className="text-xs text-muted-foreground">Created: {format(new Date(viewEntry.created_at), 'yyyy-MM-dd HH:mm:ss')}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminFinanceLedger;
