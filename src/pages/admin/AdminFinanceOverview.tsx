import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  DollarSign, TrendingUp, TrendingDown, Shield, Wallet, Package,
  RefreshCw, Download, ChevronDown, ChevronRight, Plus, Info,
  ArrowUpCircle, ArrowDownCircle, Users, CreditCard, AlertTriangle,
  CheckCircle2, Clock, Eye
} from 'lucide-react';

// ═══ Types ═══════════════════════════════════════════════════════
interface SupplierWalletConfig {
  starting_balance_ghs: number;
  starting_balance_set_at: string | null;
  current_balance_ghs: number;
  last_computed_at: string | null;
}

interface SupplierLedgerEntry {
  id: string;
  created_at: string;
  created_by: string | null;
  type: string;
  direction: string;
  amount_ghs: number;
  order_id: string | null;
  supplier_reference: string | null;
  note: string | null;
  reconciliation_status: string;
  evidence_url: string | null;
}

interface LedgerEntry {
  id: string;
  created_at: string;
  entry_date: string;
  type: string;
  direction: string;
  amount: number;
  reference: string | null;
  description: string;
  source: string;
  status: string;
  created_by: string | null;
}

// ═══ Helpers ════════════════════════════════════════════════════
const fmtGHS = (n: number) => `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SUPPLIER_TYPE_LABELS: Record<string, string> = {
  supplier_topup: 'Supplier Top-up',
  supplier_spend_order: 'Order Spend',
  supplier_refund_reversal: 'Refund/Reversal',
  supplier_adjustment: 'Adjustment',
};

const MASTER_TYPE_LABELS: Record<string, string> = {
  paystack_payout_in: 'Paystack Payout',
  supplier_topup_out: 'Supplier Top-up',
  business_expense_out: 'Business Expense',
  agent_commission_paid_out: 'Agent Commission',
  manual_adjustment: 'Adjustment',
};

// ═══ Component ══════════════════════════════════════════════════
const AdminFinanceOverview = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAdmin === false) {
      toast.error('Access denied');
      navigate('/admin');
    }
  }, [isAdmin, navigate]);

  // ─── State ───────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);

  // Master ledger data
  const [masterEntries, setMasterEntries] = useState<LedgerEntry[]>([]);
  const [masterStartingBalance, setMasterStartingBalance] = useState(0);

  // Supplier data
  const [supplierConfig, setSupplierConfig] = useState<SupplierWalletConfig | null>(null);
  const [supplierEntries, setSupplierEntries] = useState<SupplierLedgerEntry[]>([]);

  // Liabilities
  const [userWalletLiability, setUserWalletLiability] = useState(0);
  const [agentCommPayable, setAgentCommPayable] = useState(0);

  // Agent metrics
  const [activeAgentCount, setActiveAgentCount] = useState(0);
  const [activeSubRevenue, setActiveSubRevenue] = useState(0);
  const [totalCommPaid, setTotalCommPaid] = useState(0);

  // Recent activity
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  // Modals
  const [setupModal, setSetupModal] = useState(false);
  const [topupModal, setTopupModal] = useState(false);
  const [adjustModal, setAdjustModal] = useState(false);
  const [masterEntryModal, setMasterEntryModal] = useState(false);
  const [masterEntryType, setMasterEntryType] = useState('paystack_payout_in');

  // Form state
  const [formAmount, setFormAmount] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formDate, setFormDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formEvidence, setFormEvidence] = useState('');
  const [formDirection, setFormDirection] = useState<'credit' | 'debit'>('credit');
  const [formAlsoMaster, setFormAlsoMaster] = useState(false);
  const [saving, setSaving] = useState(false);

  // Collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    cashIn: false, cashOut: false, liabilities: false, supplier: false, agentMetrics: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ─── Fetch ───────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [
      masterRes, settingsRes, supplierWalletRes, supplierLedgerRes,
      walletsRes, pendingWithdrawalsRes,
      activeSubsRes, paidWithdrawalsRes,
    ] = await Promise.all([
      supabase.from('finance_ledger_entries' as any).select('*').eq('status', 'posted').order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(500),
      supabase.from('finance_settings' as any).select('*').eq('id', true).maybeSingle(),
      supabase.from('supplier_shadow_wallet' as any).select('*').eq('id', true).maybeSingle(),
      supabase.from('supplier_ledger' as any).select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('wallets').select('balance_ghs'),
      supabase.from('agent_wallets').select('available_balance, pending_balance'),
      supabase.from('agent_subscriptions').select('plan_price_current, status, expiry_date').eq('status', 'active'),
      supabase.from('agent_withdrawals' as any).select('amount_ghs, status').eq('status', 'paid'),
    ]);

    if (masterRes.data) setMasterEntries(masterRes.data as any);
    if (settingsRes.data) setMasterStartingBalance(Number((settingsRes.data as any).starting_balance || 0));
    if (supplierWalletRes.data) setSupplierConfig(supplierWalletRes.data as any);
    if (supplierLedgerRes.data) setSupplierEntries(supplierLedgerRes.data as any);

    // Liabilities
    const walletTotal = (walletsRes.data || []).reduce((s, w: any) => s + Number(w.balance_ghs || 0), 0);
    setUserWalletLiability(walletTotal);
    const commPayable = (pendingWithdrawalsRes.data || []).reduce((s, w: any) => s + Number(w.available_balance || 0) + Number(w.pending_balance || 0), 0);
    setAgentCommPayable(commPayable);

    // Agent metrics (only active, not expired)
    const now = new Date();
    const activeSubs = (activeSubsRes.data || []).filter((s: any) => new Date(s.expiry_date) > now);
    setActiveAgentCount(activeSubs.length);
    setActiveSubRevenue(activeSubs.reduce((sum: number, s: any) => sum + Number(s.plan_price_current || 0), 0));
    setTotalCommPaid((paidWithdrawalsRes.data || []).reduce((s: number, w: any) => s + Number(w.amount_ghs || 0), 0));

    // Build recent activity feed (merge last 15 from master + supplier)
    const masterRecent = (masterRes.data || []).slice(0, 10).map((e: any) => ({
      id: e.id,
      timestamp: e.created_at,
      type: MASTER_TYPE_LABELS[e.type] || e.type,
      amount: e.amount,
      direction: e.direction,
      reference: e.reference || e.description,
      source: 'master',
      status: e.status,
    }));
    const supplierRecent = (supplierLedgerRes.data || []).slice(0, 10).map((e: any) => ({
      id: e.id,
      timestamp: e.created_at,
      type: SUPPLIER_TYPE_LABELS[e.type] || e.type,
      amount: e.amount_ghs,
      direction: e.direction,
      reference: e.order_id || e.note || '',
      source: 'supplier',
      status: e.reconciliation_status,
    }));
    const merged = [...masterRecent, ...supplierRecent]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 15);
    setRecentActivity(merged);

    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Computed ────────────────────────────────────────────────
  const masterBalance = useMemo(() => {
    let bal = masterStartingBalance;
    const sorted = [...masterEntries].sort((a, b) =>
      a.entry_date === b.entry_date ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime() : a.entry_date.localeCompare(b.entry_date)
    );
    for (const e of sorted) {
      bal += e.direction === 'credit' ? e.amount : -e.amount;
    }
    return bal;
  }, [masterEntries, masterStartingBalance]);

  const totalCashIn = useMemo(() => masterEntries.filter(e => e.direction === 'credit').reduce((s, e) => s + e.amount, 0), [masterEntries]);
  const totalCashOut = useMemo(() => masterEntries.filter(e => e.direction === 'debit').reduce((s, e) => s + e.amount, 0), [masterEntries]);
  const totalLiabilities = userWalletLiability + agentCommPayable;
  const operationalFloat = masterBalance;
  const netAvailable = operationalFloat - totalLiabilities;

  // Supplier computed
  const supplierBalance = useMemo(() => {
    if (!supplierConfig) return 0;
    let bal = supplierConfig.starting_balance_ghs;
    for (const e of supplierEntries) {
      bal += e.direction === 'credit' ? e.amount_ghs : -e.amount_ghs;
    }
    return bal;
  }, [supplierConfig, supplierEntries]);

  const unreconciledCount = useMemo(
    () => supplierEntries.filter(e => e.reconciliation_status === 'unreconciled').length,
    [supplierEntries]
  );

  const supplierConfidence = unreconciledCount === 0 ? 'High' : unreconciledCount <= 5 ? 'Medium' : 'Low';
  const confidenceColor = supplierConfidence === 'High' ? 'bg-emerald-500/10 text-emerald-500' : supplierConfidence === 'Medium' ? 'bg-amber-500/10 text-amber-500' : 'bg-red-500/10 text-red-500';

  const todaySupplierSpend = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return supplierEntries.filter(e => e.direction === 'debit' && e.created_at.startsWith(today)).reduce((s, e) => s + e.amount_ghs, 0);
  }, [supplierEntries]);

  const lastTopupDate = useMemo(() => {
    const topup = supplierEntries.find(e => e.type === 'supplier_topup');
    return topup ? topup.created_at : null;
  }, [supplierEntries]);

  // Cash-in/out breakdown by type
  const cashInByType = useMemo(() => {
    const map: Record<string, number> = {};
    masterEntries.filter(e => e.direction === 'credit').forEach(e => {
      map[e.type] = (map[e.type] || 0) + e.amount;
    });
    return map;
  }, [masterEntries]);

  const cashOutByType = useMemo(() => {
    const map: Record<string, number> = {};
    masterEntries.filter(e => e.direction === 'debit').forEach(e => {
      map[e.type] = (map[e.type] || 0) + e.amount;
    });
    return map;
  }, [masterEntries]);

  // ─── Actions ─────────────────────────────────────────────────
  const resetForm = () => {
    setFormAmount(''); setFormNote(''); setFormDate(format(new Date(), 'yyyy-MM-dd'));
    setFormEvidence(''); setFormDirection('credit'); setFormAlsoMaster(false);
  };

  const saveSetup = async () => {
    const amount = parseFloat(formAmount);
    if (isNaN(amount)) { toast.error('Enter a valid amount'); return; }
    setSaving(true);
    const { error } = await supabase.from('supplier_shadow_wallet' as any).update({
      starting_balance_ghs: amount,
      starting_balance_set_at: new Date().toISOString(),
      starting_balance_set_by: user?.id,
      current_balance_ghs: amount,
      last_computed_at: new Date().toISOString(),
    } as any).eq('id', true);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Starting balance configured');
    setSetupModal(false); resetForm(); fetchAll();
  };

  const saveTopup = async () => {
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) { toast.error('Invalid amount'); return; }
    setSaving(true);
    // Create supplier ledger entry
    const { error: slErr } = await supabase.from('supplier_ledger' as any).insert({
      type: 'supplier_topup',
      direction: 'credit',
      amount_ghs: amount,
      note: formNote.trim() || `Top-up on ${formDate}`,
      evidence_url: formEvidence.trim() || null,
      created_by: user?.id,
      reconciliation_status: 'reconciled',
    } as any);
    if (slErr) { setSaving(false); toast.error(slErr.message); return; }

    // Optionally create master ledger entry
    if (formAlsoMaster) {
      await supabase.from('finance_ledger_entries' as any).insert({
        entry_date: formDate,
        type: 'supplier_topup_out',
        direction: 'debit',
        amount,
        description: `Supplier top-up${formNote ? ': ' + formNote.trim() : ''}`,
        source: 'manual',
        created_by: user?.id,
      } as any);
    }

    setSaving(false);
    toast.success('Supplier top-up recorded');
    setTopupModal(false); resetForm(); fetchAll();
  };

  const saveAdjustment = async () => {
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) { toast.error('Invalid amount'); return; }
    if (!formNote.trim()) { toast.error('Reason is required'); return; }
    setSaving(true);
    const { error } = await supabase.from('supplier_ledger' as any).insert({
      type: 'supplier_adjustment',
      direction: formDirection,
      amount_ghs: amount,
      note: formNote.trim(),
      evidence_url: formEvidence.trim() || null,
      created_by: user?.id,
      reconciliation_status: 'reconciled',
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Adjustment recorded');
    setAdjustModal(false); resetForm(); fetchAll();
  };

  const saveMasterEntry = async () => {
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) { toast.error('Invalid amount'); return; }
    if (!formNote.trim()) { toast.error('Description is required'); return; }
    setSaving(true);
    const directionMap: Record<string, string> = {
      paystack_payout_in: 'credit',
      supplier_topup_out: 'debit',
      business_expense_out: 'debit',
      manual_adjustment: formDirection,
    };
    const { error } = await supabase.from('finance_ledger_entries' as any).insert({
      entry_date: formDate,
      type: masterEntryType,
      direction: directionMap[masterEntryType] || formDirection,
      amount,
      description: formNote.trim(),
      reference: formEvidence.trim() || null,
      source: 'manual',
      created_by: user?.id,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Ledger entry recorded');
    setMasterEntryModal(false); resetForm(); fetchAll();
  };

  const reconcileEntry = async (entry: SupplierLedgerEntry) => {
    const { error } = await supabase.from('supplier_ledger' as any).update({ reconciliation_status: 'reconciled' } as any).eq('id', entry.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Marked as reconciled');
    fetchAll();
  };

  const createReversal = async (entry: SupplierLedgerEntry) => {
    const reason = prompt('Reason for reversal:');
    if (!reason) return;
    const { error } = await supabase.from('supplier_ledger' as any).insert({
      type: 'supplier_refund_reversal',
      direction: 'credit',
      amount_ghs: entry.amount_ghs,
      order_id: entry.order_id,
      note: `Reversal: ${reason}`,
      created_by: user?.id,
      reconciliation_status: 'reconciled',
    } as any);
    if (error) { toast.error(error.message); return; }
    // Mark original as reconciled
    await supabase.from('supplier_ledger' as any).update({ reconciliation_status: 'reconciled' } as any).eq('id', entry.id);
    toast.success('Reversal created');
    fetchAll();
  };

  // ─── CSV Exports ─────────────────────────────────────────────
  const exportMasterCSV = () => {
    const headers = ['Date', 'Type', 'Description', 'Credit', 'Debit', 'Reference', 'Source', 'Status'];
    const rows = masterEntries.map(e => [
      e.entry_date, MASTER_TYPE_LABELS[e.type] || e.type, `"${e.description}"`,
      e.direction === 'credit' ? e.amount.toFixed(2) : '', e.direction === 'debit' ? e.amount.toFixed(2) : '',
      e.reference || '', e.source, e.status,
    ]);
    downloadCSV('master-ledger', headers, rows);
  };

  const exportSupplierCSV = () => {
    const headers = ['Date', 'Type', 'Credit', 'Debit', 'Order ID', 'Note', 'Status'];
    const rows = supplierEntries.map(e => [
      format(new Date(e.created_at), 'yyyy-MM-dd HH:mm'), SUPPLIER_TYPE_LABELS[e.type] || e.type,
      e.direction === 'credit' ? e.amount_ghs.toFixed(2) : '', e.direction === 'debit' ? e.amount_ghs.toFixed(2) : '',
      e.order_id || '', `"${e.note || ''}"`, e.reconciliation_status,
    ]);
    downloadCSV('supplier-ledger', headers, rows);
  };

  const exportLiabilitiesCSV = () => {
    const headers = ['Category', 'Amount (GHS)'];
    const rows = [
      ['User Wallet Liability', userWalletLiability.toFixed(2)],
      ['Agent Commission Payable', agentCommPayable.toFixed(2)],
      ['Pending Refunds', '0.00'],
      ['Total Liabilities', totalLiabilities.toFixed(2)],
    ];
    downloadCSV('liabilities-snapshot', headers, rows);
  };

  const downloadCSV = (name: string, headers: string[], rows: string[][]) => {
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${name}-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (isAdmin === false) return null;

  // ═══ RENDER ═══════════════════════════════════════════════════
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold font-display">Finance Overview</h1>
            <p className="text-sm text-muted-foreground">Balance breakdown, supplier wallet & liabilities</p>
          </div>
          <Button size="sm" variant="outline" onClick={fetchAll}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : (
          <>
            {/* ═══ 1) Operational Snapshot ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-primary/20">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Operational Float</span>
                    <button title="Total Cash-In minus Total Cash-Out from the manual finance ledger." className="ml-auto">
                      <Info className="w-3.5 h-3.5 text-muted-foreground/50" />
                    </button>
                  </div>
                  <p className={`text-2xl font-bold font-display ${operationalFloat >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {fmtGHS(operationalFloat)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">Usable cash from manual ledger entries</p>
                  <Button variant="link" size="sm" className="px-0 h-6 text-xs mt-1" onClick={() => navigate('/admin/finance-ledger')}>
                    View Ledger →
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-amber-500/20">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Liabilities</span>
                    <button title="Funds held that belong to users/agents — not DataSika's money." className="ml-auto">
                      <Info className="w-3.5 h-3.5 text-muted-foreground/50" />
                    </button>
                  </div>
                  <p className="text-2xl font-bold font-display text-amber-600 dark:text-amber-400">
                    {fmtGHS(totalLiabilities)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">User wallets + agent commissions payable</p>
                </CardContent>
              </Card>

              <Card className="border-emerald-500/20">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Available</span>
                    <button title="Operational Float minus Liabilities — estimated disposable balance." className="ml-auto">
                      <Info className="w-3.5 h-3.5 text-muted-foreground/50" />
                    </button>
                  </div>
                  <p className={`text-2xl font-bold font-display ${netAvailable >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {fmtGHS(netAvailable)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">Estimated after all obligations</p>
                </CardContent>
              </Card>
            </div>

            {/* ═══ 2) Supplier Shadow Wallet ═══ */}
            <Card className="border-blue-500/20">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-semibold">Supplier Balance (Estimated)</span>
                    <Badge className={`text-[10px] ${confidenceColor}`}>
                      Confidence: {supplierConfidence}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { resetForm(); setTopupModal(true); }}>
                      <Plus className="w-3 h-3 mr-1" /> Add Top-up
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { resetForm(); setAdjustModal(true); }}>
                      Adjust
                    </Button>
                  </div>
                </div>

                {!supplierConfig?.starting_balance_set_at ? (
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground mb-2">Supplier balance not configured yet</p>
                    <Button size="sm" onClick={() => { resetForm(); setSetupModal(true); }}>
                      Set Starting Balance
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Current Balance</p>
                      <p className={`text-xl font-bold ${supplierBalance >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                        {fmtGHS(supplierBalance)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Unreconciled</p>
                      <p className="text-lg font-bold">{unreconciledCount} pending</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Today's Spend</p>
                      <p className="text-lg font-bold text-red-500">{fmtGHS(todaySupplierSpend)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Last Top-up</p>
                      <p className="text-sm font-medium">{lastTopupDate ? format(new Date(lastTopupDate), 'MMM dd, yyyy') : 'None'}</p>
                    </div>
                  </div>
                )}

                {/* Unreconciled entries */}
                {unreconciledCount > 0 && (
                  <div className="mt-4 border-t border-border pt-3">
                    <p className="text-xs font-semibold text-amber-500 mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Unreconciled Deductions
                    </p>
                    <div className="space-y-2 max-h-40 overflow-auto">
                      {supplierEntries.filter(e => e.reconciliation_status === 'unreconciled').map(e => (
                        <div key={e.id} className="flex items-center justify-between text-xs bg-muted/40 rounded-lg p-2">
                          <div>
                            <span className="font-medium">{fmtGHS(e.amount_ghs)}</span>
                            <span className="text-muted-foreground ml-2">{e.order_id || e.note || 'No ref'}</span>
                            <span className="text-muted-foreground ml-2">{format(new Date(e.created_at), 'MMM dd HH:mm')}</span>
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => reconcileEntry(e)}>
                              <CheckCircle2 className="w-3 h-3 mr-0.5" /> Reconcile
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-red-500" onClick={() => createReversal(e)}>
                              Reverse
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ═══ 3) Balance Breakdown ═══ */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Balance Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {/* Cash-In */}
                <Collapsible open={openSections.cashIn} onOpenChange={() => toggleSection('cashIn')}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      {openSections.cashIn ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <ArrowDownCircle className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm font-medium">Cash-In (Manual)</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{fmtGHS(totalCashIn)}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-10 pr-3 pb-2 space-y-1">
                    {Object.entries(cashInByType).map(([type, amount]) => (
                      <div key={type} className="flex justify-between text-xs text-muted-foreground">
                        <span>{MASTER_TYPE_LABELS[type] || type}</span>
                        <span>{fmtGHS(amount)}</span>
                      </div>
                    ))}
                    {Object.keys(cashInByType).length === 0 && <p className="text-xs text-muted-foreground">No entries</p>}
                  </CollapsibleContent>
                </Collapsible>

                {/* Cash-Out */}
                <Collapsible open={openSections.cashOut} onOpenChange={() => toggleSection('cashOut')}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      {openSections.cashOut ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <ArrowUpCircle className="w-4 h-4 text-red-500" />
                      <span className="text-sm font-medium">Cash-Out (Manual)</span>
                    </div>
                    <span className="text-sm font-bold text-red-600 dark:text-red-400">{fmtGHS(totalCashOut)}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-10 pr-3 pb-2 space-y-1">
                    {Object.entries(cashOutByType).map(([type, amount]) => (
                      <div key={type} className="flex justify-between text-xs text-muted-foreground">
                        <span>{MASTER_TYPE_LABELS[type] || type}</span>
                        <span>{fmtGHS(amount)}</span>
                      </div>
                    ))}
                    {Object.keys(cashOutByType).length === 0 && <p className="text-xs text-muted-foreground">No entries</p>}
                  </CollapsibleContent>
                </Collapsible>

                {/* Liabilities */}
                <Collapsible open={openSections.liabilities} onOpenChange={() => toggleSection('liabilities')}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      {openSections.liabilities ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <Shield className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-medium">Liabilities (Not Yours)</span>
                    </div>
                    <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{fmtGHS(totalLiabilities)}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-10 pr-3 pb-2 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>User Wallet Liability</span>
                      <span>{fmtGHS(userWalletLiability)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Agent Commission Payable</span>
                      <span>{fmtGHS(agentCommPayable)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Pending Refunds</span>
                      <span className="italic">GHS 0.00 — Not configured</span>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Supplier Shadow */}
                <Collapsible open={openSections.supplier} onOpenChange={() => toggleSection('supplier')}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      {openSections.supplier ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <Package className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium">Supplier Shadow Wallet</span>
                    </div>
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{fmtGHS(supplierBalance)}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-10 pr-3 pb-2 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Estimated Balance</span>
                      <span>{fmtGHS(supplierBalance)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Unreconciled Deductions</span>
                      <span>{unreconciledCount}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Today's Spend</span>
                      <span>{fmtGHS(todaySupplierSpend)}</span>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Agent Metrics */}
                <Collapsible open={openSections.agentMetrics} onOpenChange={() => toggleSection('agentMetrics')}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      {openSections.agentMetrics ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <Users className="w-4 h-4 text-purple-500" />
                      <span className="text-sm font-medium">Agent Metrics (Informational)</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Info only</Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-10 pr-3 pb-2 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Active Agents (subscribed & not expired)</span>
                      <span className="font-medium">{activeAgentCount}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Subscription Revenue (active only)</span>
                      <span>{fmtGHS(activeSubRevenue)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Total Commissions Paid (historical)</span>
                      <span>{fmtGHS(totalCommPaid)}</span>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>

            {/* ═══ 4) Recent Activity Feed ═══ */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Recent Finance Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Time</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Amount</TableHead>
                      <TableHead className="text-xs">Reference</TableHead>
                      <TableHead className="text-xs">Source</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentActivity.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No recent activity</TableCell></TableRow>
                    ) : recentActivity.map(a => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs">{format(new Date(a.timestamp), 'MMM dd HH:mm')}</TableCell>
                        <TableCell className="text-xs font-medium">{a.type}</TableCell>
                        <TableCell className={`text-xs font-bold ${a.direction === 'credit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {a.direction === 'credit' ? '+' : '-'}{fmtGHS(a.amount)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{a.reference}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{a.source}</Badge></TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${a.status === 'posted' || a.status === 'reconciled' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                            {a.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* ═══ 5) Quick Actions + Export ═══ */}
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => { resetForm(); setMasterEntryType('paystack_payout_in'); setMasterEntryModal(true); }} className="gap-2">
                <CreditCard className="w-4 h-4" /> Record Paystack Payout
              </Button>
              <Button variant="outline" onClick={() => { resetForm(); setMasterEntryType('business_expense_out'); setMasterEntryModal(true); }} className="gap-2">
                <ArrowUpCircle className="w-4 h-4" /> Record Expense
              </Button>
              <Button variant="outline" onClick={() => { resetForm(); setMasterEntryType('manual_adjustment'); setMasterEntryModal(true); }} className="gap-2">
                <DollarSign className="w-4 h-4" /> Manual Adjustment
              </Button>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={exportMasterCSV} className="gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Master CSV
                </Button>
                <Button size="sm" variant="outline" onClick={exportSupplierCSV} className="gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Supplier CSV
                </Button>
                <Button size="sm" variant="outline" onClick={exportLiabilitiesCSV} className="gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Liabilities
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ═══ MODALS ═══ */}

      {/* Setup Modal */}
      <Dialog open={setupModal} onOpenChange={setSetupModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set Supplier Starting Balance</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Starting Balance (GHS)</Label>
              <Input type="number" step="0.01" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="e.g. 5000" />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Textarea value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="Initial balance as of..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupModal(false)}>Cancel</Button>
            <Button onClick={saveSetup} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top-up Modal */}
      <Dialog open={topupModal} onOpenChange={setTopupModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Supplier Top-up</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount (GHS)</Label>
              <Input type="number" step="0.01" value={formAmount} onChange={e => setFormAmount(e.target.value)} />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
            </div>
            <div>
              <Label>Note</Label>
              <Textarea value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="Top-up details..." rows={2} />
            </div>
            <div>
              <Label>Evidence URL (optional)</Label>
              <Input value={formEvidence} onChange={e => setFormEvidence(e.target.value)} placeholder="https://..." />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="alsoMaster" checked={formAlsoMaster} onChange={e => setFormAlsoMaster(e.target.checked)} className="rounded" />
              <label htmlFor="alsoMaster" className="text-sm">Also record as Cash-Out in Master Ledger</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopupModal(false)}>Cancel</Button>
            <Button onClick={saveTopup} disabled={saving}>{saving ? 'Saving...' : 'Record Top-up'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjustment Modal */}
      <Dialog open={adjustModal} onOpenChange={setAdjustModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Supplier Adjustment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Direction</Label>
              <Select value={formDirection} onValueChange={(v: 'credit' | 'debit') => setFormDirection(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Credit (IN)</SelectItem>
                  <SelectItem value="debit">Debit (OUT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (GHS)</Label>
              <Input type="number" step="0.01" value={formAmount} onChange={e => setFormAmount(e.target.value)} />
            </div>
            <div>
              <Label>Reason (required)</Label>
              <Textarea value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="Reason for adjustment..." rows={2} />
            </div>
            <div>
              <Label>Evidence URL (optional)</Label>
              <Input value={formEvidence} onChange={e => setFormEvidence(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustModal(false)}>Cancel</Button>
            <Button onClick={saveAdjustment} disabled={saving}>{saving ? 'Saving...' : 'Save Adjustment'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Master Entry Modal */}
      <Dialog open={masterEntryModal} onOpenChange={setMasterEntryModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {masterEntryType === 'paystack_payout_in' ? 'Record Paystack Payout' :
               masterEntryType === 'business_expense_out' ? 'Record Business Expense' :
               'Manual Adjustment'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {masterEntryType === 'manual_adjustment' && (
              <div>
                <Label>Direction</Label>
                <Select value={formDirection} onValueChange={(v: 'credit' | 'debit') => setFormDirection(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Credit (IN)</SelectItem>
                    <SelectItem value="debit">Debit (OUT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Amount (GHS)</Label>
              <Input type="number" step="0.01" value={formAmount} onChange={e => setFormAmount(e.target.value)} />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="Description of this entry..." rows={2} />
            </div>
            <div>
              <Label>Reference (optional)</Label>
              <Input value={formEvidence} onChange={e => setFormEvidence(e.target.value)} placeholder="Payout ID, receipt #, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMasterEntryModal(false)}>Cancel</Button>
            <Button onClick={saveMasterEntry} disabled={saving}>{saving ? 'Saving...' : 'Record Entry'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminFinanceOverview;
