import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/hooks/useAuth';
import { formatPrice } from '@/data/bundles';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Wallet, ArrowDownLeft, ArrowUpRight, RefreshCw, Copy, CheckCircle, Clock, XCircle,
  CreditCard, Loader2, AlertCircle, ArrowRight, Plus, Receipt, RotateCcw, TrendingUp,
  Eye, EyeOff, Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { format, formatDistanceToNow } from 'date-fns';
import { ManualDepositFlow, type ManualDepositSettings } from '@/components/wallet/ManualDepositFlow';
import { useIsMobile } from '@/hooks/use-mobile';

/* WhatsApp SVG icon */
const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const LS_SEEN_KEY = 'yiego_seen_pending_deposit_ref';

const QUICK_AMOUNTS = [25, 60, 120, 250, 400];

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

function useCountUp(target: number, duration = 800, enabled = true) {
  const [value, setValue] = useState(0);
  const raf = useRef<number>();
  useEffect(() => {
    if (!enabled) return;
    const start = performance.now();
    const animate = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(eased * target);
      if (p < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration, enabled]);
  return value;
}

const DashboardWallet = () => {
  const { wallet, transactions, loading, refresh, refreshTransactions } = useWallet();
  const { user, profile } = useAuth();
  const isMobile = useIsMobile();

  useEffect(() => { refreshTransactions(); }, [refreshTransactions]);

  const [depositOpen, setDepositOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [pendingSupportVisible, setPendingSupportVisible] = useState(false);
  const lastSeenRef = useRef<string | null>(null);

  const [manualEnabled, setManualEnabled] = useState<boolean | null>(null);
  const [depositTab, setDepositTab] = useState<'paystack' | 'manual'>('paystack');
  const [mdSettings, setMdSettings] = useState<ManualDepositSettings | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const fetchFlag = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('manual_deposit_enabled' as any)
        .eq('id', user.id)
        .maybeSingle();
      if (alive) setManualEnabled(!!(data as any)?.manual_deposit_enabled);
    };
    fetchFlag();
    const channel = supabase
      .channel(`profile-md-${user.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => {
          const next = (payload.new as any)?.manual_deposit_enabled;
          if (typeof next === 'boolean') setManualEnabled(next);
        }
      )
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    let alive = true;
    const KEYS = ['manual_deposit_active','manual_deposit_momo_number','manual_deposit_account_name','manual_deposit_network','manual_deposit_instructions'];
    const apply = (rows: { key: string; value: string }[]) => {
      const m = Object.fromEntries(rows.map(r => [r.key, r.value || '']));
      if (!alive) return;
      setMdSettings(prev => ({
        active: m['manual_deposit_active'] === 'true',
        momo: m['manual_deposit_momo_number'] ?? prev?.momo ?? '',
        account: m['manual_deposit_account_name'] ?? prev?.account ?? '',
        network: m['manual_deposit_network'] ?? prev?.network ?? '',
        instructions: m['manual_deposit_instructions'] ?? prev?.instructions ?? '',
      }));
    };
    supabase.from('site_settings').select('key, value').in('key', KEYS)
      .then(({ data }) => apply((data || []) as any));
    const channel = supabase
      .channel('site-settings-md')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'site_settings' },
        (payload) => {
          const row: any = payload.new || payload.old;
          if (!row?.key || !KEYS.includes(row.key)) return;
          supabase.from('site_settings').select('key, value').in('key', KEYS)
            .then(({ data }) => apply((data || []) as any));
        }
      )
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, []);

  const manualAvailable = !!manualEnabled && !!mdSettings?.active;
  useEffect(() => {
    if (!manualAvailable && depositTab === 'manual') setDepositTab('paystack');
  }, [manualAvailable, depositTab]);

  const balance = Number(wallet?.balance_ghs || 0);
  const animatedBalance = useCountUp(balance, 850, !loading);

  // Summary stats
  const totalDeposits = transactions
    .filter(t => t.type === 'deposit' && ['confirmed', 'completed'].includes((t.status || '').toLowerCase()))
    .reduce((s, t) => s + Number(t.amount_ghs), 0);
  const totalWalletPayments = transactions
    .filter(t => t.type === 'debit' && ['confirmed', 'completed'].includes((t.status || '').toLowerCase()))
    .reduce((s, t) => s + Number(t.amount_ghs), 0);

  // Pending deposit detection (last 60 min)
  const pendingDeposit = useMemo(() => {
    const sixtyMinutesAgo = Date.now() - 60 * 60 * 1000;
    return transactions.find(
      t => t.type === 'deposit' && t.status === 'pending' &&
        new Date(t.created_at).getTime() >= sixtyMinutesAgo
    ) || null;
  }, [transactions]);

  const pendingRef = pendingDeposit?.reference || pendingDeposit?.id || null;
  useEffect(() => {
    if (!pendingRef) {
      setPendingSupportVisible(false);
      lastSeenRef.current = null;
      return;
    }
    const seenRef = localStorage.getItem(LS_SEEN_KEY);
    if (seenRef === pendingRef) {
      setPendingSupportVisible(false);
    } else {
      localStorage.setItem(LS_SEEN_KEY, pendingRef);
      lastSeenRef.current = pendingRef;
      setPendingSupportVisible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRef]);

  const showPendingSupportCard = !loading && !!pendingDeposit && pendingSupportVisible;

  const userName = profile?.full_name || profile?.username || '';
  const userEmail = user?.email || '';

  const buildWaDepositLink = () => {
    const parts = [
      `Hello YieGo Support, my name is ${userName || 'a YieGo user'}.`,
      'I made a wallet deposit but it has not reflected automatically.',
    ];
    if (pendingDeposit?.amount_ghs) parts.push(`Amount: GHS ${Number(pendingDeposit.amount_ghs).toFixed(2)}.`);
    if (pendingDeposit?.reference) parts.push(`Reference: ${pendingDeposit.reference}.`);
    parts.push('Please assist.');
    return `https://wa.me/233275644195?text=${encodeURIComponent(parts.join(' '))}`;
  };

  const handleCopyDepositDetails = () => {
    const lines = [
      'Hello YieGo Support, I need help with a pending wallet deposit.',
      '',
      `Name: ${userName || 'N/A'}`,
      `Email: ${userEmail || 'N/A'}`,
    ];
    if (pendingDeposit?.amount_ghs) lines.push(`Amount: GHS ${Number(pendingDeposit.amount_ghs).toFixed(2)}`);
    if (pendingDeposit?.reference) lines.push(`Reference: ${pendingDeposit.reference}`);
    if (pendingDeposit?.created_at) lines.push(`Time: ${format(new Date(pendingDeposit.created_at), 'dd MMM yyyy, HH:mm')}`);
    navigator.clipboard.writeText(lines.join('\n'));
    toast.success('Deposit details copied');
  };

  const handlePaystackDeposit = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num < 10) {
      toast.error('Enter a valid amount (min GHS 10.00)');
      return;
    }
    if (!user) {
      toast.error('Please log in to deposit');
      return;
    }

    setSubmitting(true);

    try {
      const reference = `DEP-${user.id.substring(0, 8)}-${Date.now().toString(36).toUpperCase()}`;
      const { data: txn, error: txnError } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: user.id,
          type: 'deposit',
          amount_ghs: num,
          status: 'pending',
          reference,
          provider: 'paystack',
          paystack_reference: reference,
          description: `Wallet deposit of GHS ${num.toFixed(2)} via Paystack`,
        })
        .select()
        .single();

      if (txnError || !txn) {
        toast.error('Failed to initiate deposit');
        setSubmitting(false);
        return;
      }

      sessionStorage.setItem('yiego_paystack_meta', JSON.stringify({
        purpose: 'deposit', reference, wallet_txn_id: txn.id,
      }));

      const callbackUrl = `${window.location.origin}/paystack/callback`;
      const { data, error } = await supabase.functions.invoke('paystack-initialize', {
        body: { amount_ghs: num, email: user.email, reference, purpose: 'deposit',
          metadata: { user_id: user.id, wallet_txn_id: txn.id }, callback_url: callbackUrl },
      });

      if (error || !data?.success) {
        toast.error('Failed to initialize payment. Please try again.');
        await supabase.from('wallet_transactions').update({ status: 'failed' }).eq('id', txn.id);
        setSubmitting(false);
        return;
      }
      window.location.href = data.authorization_url;
    } catch {
      toast.error('An unexpected error occurred');
      setSubmitting(false);
    }
  };

  // ── Render
  return (
    <DashboardLayout>
      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-24 md:pb-8 max-w-5xl mx-auto space-y-5">
        {/* ── Compact header ── */}
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-primary">My account</span>
            </div>
            <h1 className="text-2xl md:text-[1.85rem] font-display font-extrabold tracking-[-0.025em] leading-[1.05]">
              Wallet
            </h1>
            <p className="text-[12.5px] text-muted-foreground mt-1">
              Fund once. Pay for any service. Track every move.
            </p>
          </div>
          <button
            onClick={refresh}
            className="w-10 h-10 rounded-full border border-border/70 bg-card/70 backdrop-blur-md text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card transition-all flex items-center justify-center shrink-0 group"
            aria-label="Refresh wallet"
          >
            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          </button>
        </header>

        {/* ── Wallet hero ── */}
        <section className="glass-hero-emerald relative overflow-hidden rounded-3xl p-6 md:p-8 text-primary-foreground card-shine-effect">
          <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-white/15 blur-3xl pointer-events-none glow-drift" />
          <div className="absolute -bottom-24 -left-16 w-64 h-64 rounded-full bg-[hsl(42_96%_60%/0.22)] blur-3xl pointer-events-none glow-drift-slow" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none" />
          <div className="noise-overlay" style={{ mixBlendMode: 'soft-light', opacity: 0.18 }} />

          <div className="relative">
            <div className="flex items-start justify-between mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.15)]">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-50" />
                  <span className="relative w-1.5 h-1.5 rounded-full bg-white" />
                </span>
                <Wallet className="w-3 h-3 text-white/85" />
                <span className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-white/90">YieGo Wallet</span>
              </div>
              <button
                onClick={() => setHidden(h => !h)}
                aria-label={hidden ? 'Show balance' : 'Hide balance'}
                className="w-9 h-9 rounded-full hover:bg-white/10 transition-colors flex items-center justify-center"
              >
                {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="mb-7">
              <p className="text-[10.5px] uppercase tracking-[0.22em] font-bold text-white/65 mb-2">
                Available balance
              </p>
              {loading ? (
                <Skeleton className="h-14 w-56 bg-white/15" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-[10.5px] font-bold text-white/55 mb-2">GHS</span>
                  <p className="text-[2.8rem] sm:text-[3.4rem] md:text-[3.8rem] leading-[0.95] font-display font-extrabold tracking-[-0.04em] tabular">
                    {hidden ? '••••••' : Number(animatedBalance.toFixed(2)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mb-6">
              <button
                onClick={() => setDepositOpen(true)}
                className="group flex-1 inline-flex items-center justify-center gap-1.5 h-12 rounded-full bg-white text-[hsl(225_28%_10%)] text-[13.5px] font-bold shadow-[0_12px_28px_-10px_hsl(0_0%_0%/0.45)] hover:-translate-y-0.5 transition-all active:scale-[0.98]"
              >
                <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" /> Top up wallet
              </button>
              <Link
                to="/dashboard/buy"
                className="inline-flex items-center justify-center gap-1.5 h-12 px-5 rounded-full bg-white/10 hover:bg-white/20 text-[13px] font-semibold border border-white/15 backdrop-blur-md transition-all active:scale-[0.98]"
              >
                <Smartphone className="w-4 h-4" /> Buy data
              </Link>
            </div>

            {/* Stats grid inside hero */}
            <div className="grid grid-cols-2 gap-4 pt-5 border-t border-white/15">
              <div>
                <div className="inline-flex items-center gap-1 text-[9.5px] uppercase tracking-[0.18em] font-bold text-white/60 mb-1.5">
                  <ArrowDownLeft className="w-2.5 h-2.5" /> Total deposited
                </div>
                <p className="text-[15px] font-bold tabular leading-tight">
                  {loading ? '—' : formatPrice(totalDeposits)}
                </p>
              </div>
              <div className="text-right">
                <div className="inline-flex items-center gap-1 text-[9.5px] uppercase tracking-[0.18em] font-bold text-white/60 mb-1.5">
                  <TrendingUp className="w-2.5 h-2.5" /> Wallet payments
                </div>
                <p className="text-[15px] font-bold tabular leading-tight">
                  {loading ? '—' : formatPrice(totalWalletPayments)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pending deposit help card (when applicable) ── */}
        {showPendingSupportCard && (
          <section className="relative overflow-hidden rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] backdrop-blur-sm p-4 space-y-3">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.14em] bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300">
                <AlertCircle className="w-3 h-3" /> Pending deposit
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/12 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
                  <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-500" />
                </span>
                Support online
              </span>
            </div>

            <div className="flex items-start gap-3">
              <div className="relative shrink-0">
                <div className="absolute inset-0 rounded-2xl blur-md opacity-25 bg-emerald-500/40" />
                <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center bg-emerald-500/15 ring-1 ring-emerald-500/30">
                  <WhatsAppIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-[13.5px] font-bold tracking-tight">Deposit pending? We can help.</h4>
                <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-0.5">
                  If your wallet didn't update automatically after payment, message support so we can verify and credit it.
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/60 p-3 space-y-1.5 text-[12px]">
              <Row label="Pending amount" value={formatPrice(Number(pendingDeposit.amount_ghs))} bold />
              {pendingDeposit.reference && (
                <Row label="Reference" value={<span className="font-mono text-[11px]">{pendingDeposit.reference.slice(-16)}</span>} />
              )}
              <Row label="Time" value={formatDistanceToNow(new Date(pendingDeposit.created_at), { addSuffix: true })} />
            </div>

            <div className="flex items-center gap-2">
              <a href={buildWaDepositLink()} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button
                  size="sm"
                  className="w-full gap-2 text-[12.5px] font-bold rounded-xl h-10 text-white border-0 bg-emerald-500 hover:bg-emerald-600 transition-colors"
                >
                  <WhatsAppIcon className="w-3.5 h-3.5" /> Chat on WhatsApp
                </Button>
              </a>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-[12.5px] rounded-xl h-10 px-4 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-transparent hover:bg-emerald-500/10"
                onClick={handleCopyDepositDetails}
              >
                <Copy className="w-3.5 h-3.5" /> Copy
              </Button>
            </div>
          </section>
        )}

        {/* ── Recent transactions ── */}
        <section className="rounded-3xl glass-card overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-border/60">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Recent transactions</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Last 5 wallet movements</p>
            </div>
            <Link
              to="/dashboard/transactions"
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
          ) : transactions.length === 0 ? (
            <div className="p-10 text-center">
              <div className="relative w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 flex items-center justify-center shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.4)]">
                <Receipt className="w-7 h-7 text-primary" strokeWidth={1.8} />
              </div>
              <p className="font-display font-bold text-base">No transactions yet</p>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-[18rem] mx-auto leading-relaxed">
                Top up your wallet to see your activity here.
              </p>
              <Button
                size="sm"
                onClick={() => setDepositOpen(true)}
                className="mt-5 rounded-full font-semibold gap-1.5 px-5 shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.55)]"
              >
                Top up wallet <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {transactions.slice(0, 5).map((tx) => <TransactionRow key={tx.id} tx={tx} />)}
            </ul>
          )}
        </section>

        <div aria-hidden className="h-2" />
      </div>

      {/* ── Deposit dialog (desktop) / drawer (mobile) ── */}
      {isMobile ? (
        <Drawer open={depositOpen} onOpenChange={setDepositOpen}>
          <DrawerContent className="rounded-t-3xl border-t border-border/60 bg-card/95 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_-24px_60px_-20px_hsl(var(--primary)/0.3)] max-h-[92vh]">
            <DrawerTitle className="sr-only">Top up your wallet</DrawerTitle>
            <DrawerDescription className="sr-only">Add funds to your YieGo wallet.</DrawerDescription>
            <DepositBody
              amount={amount}
              setAmount={setAmount}
              submitting={submitting}
              depositTab={depositTab}
              setDepositTab={setDepositTab}
              manualAvailable={manualAvailable}
              mdSettings={mdSettings}
              handlePaystackDeposit={handlePaystackDeposit}
              onCloseDeposit={() => { setDepositOpen(false); setDepositTab('paystack'); }}
              onCredited={refresh}
            />
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
          <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_30px_80px_-20px_hsl(var(--primary)/0.35)]">
            <DialogTitle className="sr-only">Top up your wallet</DialogTitle>
            <DialogDescription className="sr-only">Add funds to your YieGo wallet.</DialogDescription>
            <DepositBody
              amount={amount}
              setAmount={setAmount}
              submitting={submitting}
              depositTab={depositTab}
              setDepositTab={setDepositTab}
              manualAvailable={manualAvailable}
              mdSettings={mdSettings}
              handlePaystackDeposit={handlePaystackDeposit}
              onCloseDeposit={() => { setDepositOpen(false); setDepositTab('paystack'); }}
              onCredited={refresh}
            />
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
};

const Row = ({ label, value, bold = false }: { label: string; value: React.ReactNode; bold?: boolean }) => (
  <div className="flex items-center justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className={bold ? 'font-bold tabular' : 'tabular text-foreground/85'}>{value}</span>
  </div>
);

const TX_META: Record<string, { label: string; tone: string; rail: string; icon: typeof ArrowDownLeft }> = {
  deposit: {
    label: 'Wallet top-up', tone: 'text-emerald-600 bg-emerald-500/10 ring-emerald-500/20', rail: 'bg-emerald-500',
    icon: ArrowDownLeft,
  },
  debit: {
    label: 'Order payment', tone: 'text-rose-600 bg-rose-500/10 ring-rose-500/20', rail: 'bg-rose-500',
    icon: ArrowUpRight,
  },
  refund: {
    label: 'Refund', tone: 'text-sky-600 bg-sky-500/10 ring-sky-500/20', rail: 'bg-sky-500',
    icon: RotateCcw,
  },
};

function txState(status: string): 'success' | 'pending' | 'failed' {
  const s = (status || '').toLowerCase();
  if (['confirmed', 'completed', 'paid', 'delivered', 'success'].includes(s)) return 'success';
  if (['pending', 'processing'].includes(s)) return 'pending';
  return 'failed';
}

const STATUS_LABEL = (s: string) => {
  const state = txState(s);
  if (state === 'success') return 'Completed';
  if (state === 'pending') return s?.toLowerCase() === 'processing' ? 'Processing' : 'Pending';
  return 'Failed';
};

const STATUS_TONE = (s: string) => {
  const state = txState(s);
  if (state === 'success') return { className: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/25', icon: CheckCircle };
  if (state === 'pending') return {
    className: 'text-amber-600 bg-amber-500/12 border-amber-500/30',
    icon: s?.toLowerCase() === 'processing' ? Loader2 : Clock,
  };
  return { className: 'text-rose-600 bg-rose-500/10 border-rose-500/25', icon: XCircle };
};

function amountStyle(type: string, status: string) {
  const state = txState(status);
  if (state === 'failed') return { className: 'text-rose-600 dark:text-rose-400 line-through opacity-80', sign: '' };
  if (state === 'pending') return { className: 'text-amber-600 dark:text-amber-400', sign: '' };
  if (type === 'debit') return { className: 'text-foreground', sign: '−' };
  return { className: 'text-emerald-600 dark:text-emerald-400', sign: '+' };
}

const TransactionRow = ({ tx }: { tx: any }) => {
  const meta = TX_META[tx.type] || TX_META.debit;
  const Icon = meta.icon;
  const status = STATUS_TONE(tx.status);
  const StatusIcon = status.icon;
  const amt = amountStyle(tx.type, tx.status);
  const state = txState(tx.status);
  const isPending = state === 'pending';
  return (
    <li className="relative flex items-center gap-3 pl-5 pr-4 py-3.5 hover:bg-primary/[0.04] transition-colors">
      <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full ${meta.rail} ${isPending ? 'opacity-50' : 'opacity-80'}`} />
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1 ${meta.tone} ${isPending ? 'opacity-70' : ''}`}>
        <Icon className="w-4 h-4" strokeWidth={2.1} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold truncate">{meta.label}</p>
        <p className="text-[10.5px] text-muted-foreground truncate tabular mt-0.5">
          {relativeTime(tx.created_at)}
          {tx.description && <> · <span className="truncate">{tx.description}</span></>}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-[13.5px] font-bold tabular leading-tight ${amt.className}`}>
          {amt.sign}{formatPrice(Number(tx.amount_ghs))}
        </p>
        <span className={`mt-1.5 inline-flex items-center gap-1 text-[9.5px] font-bold tracking-wide px-2 py-0.5 rounded-full border ${status.className}`}>
          <StatusIcon className={`w-2.5 h-2.5 ${STATUS_LABEL(tx.status) === 'Processing' ? 'animate-spin' : ''}`} />
          {STATUS_LABEL(tx.status)}
        </span>
      </div>
    </li>
  );
};

const DepositBody = ({
  amount,
  setAmount,
  submitting,
  depositTab,
  setDepositTab,
  manualAvailable,
  mdSettings,
  handlePaystackDeposit,
  onCloseDeposit,
  onCredited,
}: {
  amount: string;
  setAmount: (v: string) => void;
  submitting: boolean;
  depositTab: 'paystack' | 'manual';
  setDepositTab: (t: 'paystack' | 'manual') => void;
  manualAvailable: boolean;
  mdSettings: ManualDepositSettings | null;
  handlePaystackDeposit: () => Promise<void>;
  onCloseDeposit: () => void;
  onCredited: () => void;
}) => {
  const num = parseFloat(amount || '0');
  const isValid = !isNaN(num) && num >= 10;
  const fee = isValid ? Math.round(num * 0.04 * 100) / 100 : 0;
  const total = isValid ? Math.round((num + fee) * 100) / 100 : 0;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="relative px-5 pt-5 pb-4 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="absolute -top-12 -right-8 w-40 h-40 rounded-full bg-primary/12 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-primary">Top up</span>
          </div>
          <h3 className="font-display font-extrabold text-[1.4rem] tracking-[-0.025em] leading-tight">
            Fund your wallet
          </h3>
          <p className="text-[12.5px] text-muted-foreground mt-1">
            Pay once, spend across every YieGo service.
          </p>
        </div>
      </div>

      {/* Method tabs */}
      {manualAvailable && (
        <div className="px-5 pb-2">
          <div className="grid grid-cols-2 gap-1 p-1 bg-muted/50 backdrop-blur-sm border border-border/60 rounded-full">
            <button
              onClick={() => setDepositTab('paystack')}
              className={`text-[12px] font-semibold py-2 rounded-full transition-all ${
                depositTab === 'paystack'
                  ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.5)]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Card / MoMo
            </button>
            <button
              onClick={() => setDepositTab('manual')}
              className={`text-[12px] font-semibold py-2 rounded-full transition-all ${
                depositTab === 'manual'
                  ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.5)]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Manual transfer
            </button>
          </div>
        </div>
      )}

      <div className="px-5 pb-5 space-y-4 overflow-y-auto">
        {depositTab === 'paystack' && (
          <>
            {/* Amount input */}
            <div className="space-y-1.5">
              <Label className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Amount (GHS)
              </Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-muted-foreground/80 tabular pointer-events-none">
                  GHS
                </span>
                <Input
                  type="number"
                  min="10"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="pl-14 h-14 rounded-2xl bg-muted/30 border-border/60 text-[1.5rem] font-display font-extrabold tabular tracking-[-0.02em] focus:bg-background"
                  inputMode="decimal"
                />
              </div>
              <p className="text-[10.5px] text-muted-foreground/80">Minimum top-up: GHS 10.00</p>
            </div>

            {/* Quick amount chips */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_AMOUNTS.map((qa) => {
                const active = amount === String(qa);
                return (
                  <button
                    key={qa}
                    onClick={() => setAmount(String(qa))}
                    className={`shrink-0 inline-flex items-center px-3.5 h-9 rounded-full text-[12px] font-semibold tabular transition-all duration-200 ${
                      active
                        ? 'bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.55)]'
                        : 'bg-card/70 backdrop-blur-sm border border-border/70 text-foreground/75 hover:text-foreground hover:border-primary/40'
                    }`}
                  >
                    GHS {qa}
                  </button>
                );
              })}
            </div>

            {/* Live breakdown */}
            {isValid && (
              <div className="rounded-xl bg-muted/40 border border-border/60 px-3.5 py-3 space-y-1.5 text-[12.5px]">
                <div className="flex justify-between text-muted-foreground">
                  <span>Deposit amount</span>
                  <span className="tabular text-foreground/85">{formatPrice(num)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Processing fee (4%)</span>
                  <span className="tabular text-foreground/85">{formatPrice(fee)}</span>
                </div>
                <div className="h-px bg-border/60 my-0.5" />
                <div className="flex justify-between font-bold text-[13px]">
                  <span>You'll pay</span>
                  <span className="tabular text-primary">{formatPrice(total)}</span>
                </div>
                <p className="text-[10.5px] text-muted-foreground/80 pt-1 leading-relaxed">
                  Wallet credited <strong className="text-foreground">{formatPrice(num)}</strong> after payment confirms.
                </p>
              </div>
            )}

            <Button
              onClick={handlePaystackDeposit}
              disabled={submitting || !isValid}
              className="w-full h-12 rounded-xl font-bold text-[14px] gap-2 shadow-[0_12px_28px_-10px_hsl(var(--primary)/0.55)] hover:shadow-[0_16px_32px_-10px_hsl(var(--primary)/0.65)] hover:-translate-y-0.5 transition-all"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting…</>
              ) : (
                <><CreditCard className="w-4 h-4" /> {isValid ? `Pay ${formatPrice(total)}` : 'Enter an amount'}</>
              )}
            </Button>
          </>
        )}

        {depositTab === 'manual' && manualAvailable && mdSettings && (
          <ManualDepositFlow
            settings={mdSettings}
            onClose={onCloseDeposit}
            onCredited={onCredited}
          />
        )}
      </div>
    </div>
  );
};

export default DashboardWallet;
