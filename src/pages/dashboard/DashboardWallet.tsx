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
import { Wallet, ArrowDownCircle, ArrowUpCircle, RefreshCw, Copy, CheckCircle, Clock, XCircle, CreditCard, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { format, formatDistanceToNow } from 'date-fns';
import { ManualDepositFlow, type ManualDepositSettings } from '@/components/wallet/ManualDepositFlow';

/* WhatsApp SVG icon */
const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

/* ── WhatsApp green tokens — #22C55E system ── */
const WA_GREEN = {
  accent: '#22C55E',
  iconBg: 'rgba(34,197,94,0.15)',
  iconBorder: '1.5px solid rgba(34,197,94,0.25)',
  pillBg: 'rgba(34,197,94,0.15)',
  pillBorder: '1px solid rgba(34,197,94,0.25)',
  pillText: '#15803D',
  detailsBg: 'rgba(34,197,94,0.08)',
  detailsBorder: '1px solid rgba(34,197,94,0.20)',
  btn: '#22C55E',
  btnHover: '#16A34A',
} as const;

/* ── Amber/warning tokens for Pending Deposit badge ── */
const AMBER = {
  containerBg: 'rgba(245,158,11,0.10)',
  containerBorder: '1px solid rgba(245,158,11,0.35)',
  pillBg: 'rgba(245,158,11,0.15)',
  pillBorder: '1px solid rgba(245,158,11,0.35)',
  pillText: '#B45309',
} as const;

/* ── Show-once key (spec: yiego_seen_pending_deposit_ref) ── */
const LS_SEEN_KEY = 'yiego_seen_pending_deposit_ref';

const DashboardWallet = () => {
  const { wallet, transactions, loading, refresh, refreshTransactions } = useWallet();
  const { user, profile } = useAuth();

  // Fetch transactions when wallet page mounts (deferred from initial hook load)
  useEffect(() => { refreshTransactions(); }, [refreshTransactions]);
  const [depositOpen, setDepositOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingSupportVisible, setPendingSupportVisible] = useState(false);
  const lastSeenRef = useRef<string | null>(null);

  // Manual deposit access + settings (live)
  const [manualEnabled, setManualEnabled] = useState<boolean | null>(null);
  const [depositTab, setDepositTab] = useState<'paystack' | 'manual'>('paystack');
  const [mdSettings, setMdSettings] = useState<ManualDepositSettings | null>(null);

  // Fetch user-level access flag + subscribe to changes on own profile row
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

  // Fetch global manual deposit settings + realtime updates
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
          // Refetch all keys to keep them consistent
          supabase.from('site_settings').select('key, value').in('key', KEYS)
            .then(({ data }) => apply((data || []) as any));
        }
      )
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, []);

  const manualAvailable = !!manualEnabled && !!mdSettings?.active;

  // If manual becomes unavailable while user is on that tab, switch back
  useEffect(() => {
    if (!manualAvailable && depositTab === 'manual') setDepositTab('paystack');
  }, [manualAvailable, depositTab]);

  const quickAmounts = [25, 60, 120, 250, 400];

  // Manual deposit submit is handled inside ManualDepositFlow component

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

    const processingFee = Math.round(num * 0.04 * 100) / 100;
    const totalPayable = Math.round((num + processingFee) * 100) / 100;

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
        console.error('Failed to create transaction:', txnError);
        toast.error('Failed to initiate deposit');
        setSubmitting(false);
        return;
      }

      sessionStorage.setItem('yiego_paystack_meta', JSON.stringify({
        purpose: 'deposit',
        reference,
        wallet_txn_id: txn.id,
      }));

      const callbackUrl = `${window.location.origin}/paystack/callback`;

      const { data, error } = await supabase.functions.invoke('paystack-initialize', {
        body: {
          amount_ghs: num,
          email: user.email,
          reference,
          purpose: 'deposit',
          metadata: {
            user_id: user.id,
            wallet_txn_id: txn.id,
          },
          callback_url: callbackUrl,
        },
      });

      if (error || !data?.success) {
        console.error('Paystack init error:', error, data);
        toast.error('Failed to initialize payment. Please try again.');
        await supabase.from('wallet_transactions').update({ status: 'failed' }).eq('id', txn.id);
        setSubmitting(false);
        return;
      }

      window.location.href = data.authorization_url;
    } catch (err) {
      console.error('Deposit error:', err);
      toast.error('An unexpected error occurred');
      setSubmitting(false);
    }
  };

  const txStatusIcon = (status: string) => {
    if (status === 'confirmed' || status === 'completed') return <CheckCircle className="w-3.5 h-3.5 text-success" />;
    if (status === 'rejected' || status === 'failed') return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    return <Clock className="w-3.5 h-3.5 text-primary" />;
  };

  const txTypeIcon = (type: string) => {
    if (type === 'deposit') return <ArrowDownCircle className="w-4 h-4 text-success" />;
    if (type === 'debit') return <ArrowUpCircle className="w-4 h-4 text-destructive" />;
    return <RefreshCw className="w-4 h-4 text-primary" />;
  };

  const statusLabel = (status: string) => {
    const s = status?.toLowerCase();
    if (['confirmed', 'completed'].includes(s)) return 'Completed';
    if (['pending'].includes(s)) return 'Pending';
    if (['failed', 'rejected'].includes(s)) return 'Failed';
    return status;
  };

  const statusColor = (status: string) => {
    const s = status?.toLowerCase();
    if (['confirmed', 'completed'].includes(s)) return 'bg-success/10 text-success';
    if (['pending'].includes(s)) return 'bg-primary/10 text-primary';
    return 'bg-destructive/10 text-destructive';
  };

  const copyRef = (ref: string) => {
    navigator.clipboard.writeText(ref);
    toast.success('Reference copied');
  };

  // --- Pending deposit detection (last 60 minutes only) ---
  const pendingDeposit = useMemo(() => {
    const sixtyMinutesAgo = Date.now() - 60 * 60 * 1000;
    return transactions.find(
      t =>
        t.type === 'deposit' &&
        t.status === 'pending' &&
        new Date(t.created_at).getTime() >= sixtyMinutesAgo
    ) || null;
  }, [transactions]);

  // --- Show-once logic per pending deposit reference ---
  // Uses localStorage key: yiego_seen_pending_deposit_ref
  // Value = the reference string of the pending deposit that was already shown
  const pendingRef = pendingDeposit?.reference || pendingDeposit?.id || null;

  useEffect(() => {
    if (!pendingRef) {
      // No pending deposit → reset so a future pending can show
      setPendingSupportVisible(false);
      lastSeenRef.current = null;
      return;
    }
    const seenRef = localStorage.getItem(LS_SEEN_KEY);
    if (seenRef === pendingRef) {
      // Already shown for this reference → do not show again
      setPendingSupportVisible(false);
    } else {
      // New or unseen reference → show card and immediately mark as seen
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
  // Summary stats
  const totalDeposits = transactions.filter(t => t.type === 'deposit' && ['confirmed', 'completed'].includes(t.status?.toLowerCase())).reduce((s, t) => s + Number(t.amount_ghs), 0);
  const totalWalletPayments = transactions.filter(t => t.type === 'debit' && ['confirmed', 'completed'].includes(t.status?.toLowerCase())).reduce((s, t) => s + Number(t.amount_ghs), 0);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
        {/* Page header */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">My account</p>
            <h1 className="text-2xl md:text-3xl font-display font-extrabold tracking-tight mt-1">Wallet</h1>
          </div>
          <Link to="/dashboard/transactions" className="text-xs font-semibold text-primary hover:underline underline-offset-4 inline-flex items-center gap-1">
            All transactions <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Hero balance — split layout */}
        <div className="grid lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 relative overflow-hidden rounded-[2rem] border border-primary/30 p-6 md:p-8 bg-gradient-to-br from-primary/20 via-card to-card">
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/30 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-accent/15 blur-3xl pointer-events-none" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
                  <Wallet className="w-4 h-4 text-primary" />
                </div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Available balance</span>
              </div>
              {loading ? (
                <Skeleton className="h-12 w-48" />
              ) : (
                <p className="text-5xl md:text-6xl font-display font-extrabold tracking-[-0.025em] tabular">{formatPrice(wallet?.balance_ghs || 0)}</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">Fund instantly via Paystack — MoMo, card or bank.</p>
              <div className="flex flex-wrap gap-2 mt-6">
                <Button onClick={() => setDepositOpen(true)} className="rounded-full h-11 px-6 font-bold gap-2">
                  <ArrowDownCircle className="w-4 h-4" /> Top up wallet
                </Button>
                <Link to="/buy-data">
                  <Button variant="outline" className="rounded-full h-11 px-6 font-semibold gap-2">
                    Buy data <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Side metrics column */}
          <div className="lg:col-span-5 grid grid-cols-2 lg:grid-cols-1 gap-3">
            <div className="rounded-2xl border border-border bg-card p-4 flex flex-col">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                <ArrowDownCircle className="w-3.5 h-3.5 text-success" /> Total deposited
              </div>
              <p className="text-xl md:text-2xl font-display font-extrabold tabular mt-2 text-success">
                {loading ? '—' : formatPrice(totalDeposits)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-auto">Across all confirmed top-ups</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 flex flex-col">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                <ArrowUpCircle className="w-3.5 h-3.5 text-destructive" /> Wallet payments
              </div>
              <p className="text-xl md:text-2xl font-display font-extrabold tabular mt-2">
                {loading ? '—' : formatPrice(totalWalletPayments)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-auto">Paid from your YieGo balance</p>
            </div>
          </div>
        </div>

        {/* ── Pending Deposit Assistance Card — shown only ONCE per pending deposit ref ── */}
        {showPendingSupportCard && (
          <div
            className="relative overflow-hidden"
            style={{
              background: AMBER.containerBg,
              border: AMBER.containerBorder,
              borderRadius: '20px',
              backdropFilter: 'blur(16px)',
              boxShadow: '0px 4px 16px rgba(0,0,0,0.08)',
            }}
          >
            {/* Very subtle amber radial glow */}
            <div
              className="pointer-events-none absolute inset-0 rounded-[20px]"
              style={{ background: 'radial-gradient(ellipse 75% 55% at 6% 18%, rgba(245,158,11,0.08), transparent)' }}
            />

            <div className="relative p-4 space-y-3">
              {/* Top pills row */}
              <div className="flex items-center justify-between">
                {/* Pending badge — AMBER */}
                <span
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
                  style={{
                    background: AMBER.pillBg,
                    border: AMBER.pillBorder,
                    color: AMBER.pillText,
                  }}
                >
                  <AlertCircle className="w-3 h-3" />
                  Pending Deposit Detected
                </span>
                {/* Support Online — stays green */}
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: WA_GREEN.pillBg,
                    border: WA_GREEN.pillBorder,
                    color: WA_GREEN.pillText,
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: WA_GREEN.accent }} />
                  Support Online
                </span>
              </div>

              {/* Header row */}
              <div className="flex items-start gap-3">
                {/* WA icon — green circle */}
                <div className="relative shrink-0">
                  <div className="absolute inset-0 rounded-full blur-md opacity-20" style={{ background: 'rgba(34,197,94,0.50)' }} />
                  <div
                    className="relative w-12 h-12 rounded-full flex items-center justify-center shadow-sm"
                    style={{ background: WA_GREEN.iconBg, border: WA_GREEN.iconBorder }}
                  >
                    <WhatsAppIcon className="w-6 h-6 text-white" />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-foreground">Deposit Pending? Need Help?</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                    If your wallet did not update automatically after payment, contact support immediately for verification.
                  </p>
                </div>
              </div>

              {/* Deposit details inner panel */}
              <div
                className="rounded-xl p-3 space-y-1.5"
                style={{ background: WA_GREEN.detailsBg, border: WA_GREEN.detailsBorder }}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Pending Amount</span>
                  <span className="font-bold text-foreground">{formatPrice(Number(pendingDeposit.amount_ghs))}</span>
                </div>
                {pendingDeposit.reference && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Reference</span>
                    <span className="font-mono text-[11px] text-foreground">{pendingDeposit.reference.slice(-16)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Time</span>
                  <span className="text-foreground capitalize">
                    {formatDistanceToNow(new Date(pendingDeposit.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-0.5">
                <a href={buildWaDepositLink()} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button
                    size="sm"
                    className="w-full gap-2 text-xs font-bold rounded-xl h-10 text-white transition-all duration-150 active:scale-95 border-0"
                    style={{ background: WA_GREEN.btn }}
                    onMouseEnter={e => (e.currentTarget.style.background = WA_GREEN.btnHover)}
                    onMouseLeave={e => (e.currentTarget.style.background = WA_GREEN.btn)}
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5" />
                    Chat on WhatsApp
                  </Button>
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs rounded-xl h-10 transition-all duration-150 active:scale-95 px-4 bg-transparent"
                  style={{ borderColor: 'rgba(34,197,94,0.32)', color: WA_GREEN.accent }}
                  onClick={handleCopyDepositDetails}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Details
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Recent Transactions (latest 5) */}
        <div className="bg-card rounded-2xl border border-border card-shadow overflow-hidden">
          {/* Header row: title + View All on top-right */}
          <div className="px-4 py-3.5 border-b border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
                <RefreshCw className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-semibold text-sm leading-tight">Transactions</h3>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Last 5 activities</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={refresh}
                className="p-2 rounded-lg hover:bg-muted/60 transition-colors duration-150 btn-press"
                aria-label="Refresh"
              >
                <RefreshCw className="w-4 h-4 text-muted-foreground" />
              </button>
              <Link
                to="/dashboard/transactions"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary/80 px-2.5 py-1.5 rounded-lg hover:bg-primary/5 transition-colors btn-press"
              >
                View All
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-10 text-center">
              <Wallet className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No transactions yet</p>
              <p className="text-[11px] text-muted-foreground/70 mt-1">Your wallet activity will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {transactions.slice(0, 5).map((tx) => (
                <div key={tx.id} className="px-4 py-3.5 hover:bg-muted/20 transition-colors duration-150">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      {txTypeIcon(tx.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium capitalize">
                            {tx.type === 'deposit' ? 'Wallet Top-up' : tx.type === 'debit' ? 'Order Payment' : tx.type === 'refund' ? 'Refund' : tx.type}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {format(new Date(tx.created_at), 'dd MMM yyyy, HH:mm')}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-bold ${tx.type === 'debit' ? 'text-destructive' : 'text-success'}`}>
                            {tx.type === 'debit' ? '-' : '+'}{formatPrice(Number(tx.amount_ghs))}
                          </p>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusColor(tx.status)}`}>
                            {statusLabel(tx.status)}
                          </span>
                        </div>
                      </div>
                      {tx.description && (
                        <p className="text-[10px] text-muted-foreground mt-1 truncate">{tx.description}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom breathing space — keeps last card clear of floating widgets/nav */}
        <div aria-hidden className="h-24 md:h-6" />
      </div>

      {/* Deposit Dialog */}
      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Top up your wallet</DialogTitle>
            <DialogDescription>
              {depositTab === 'paystack'
                ? 'Fund instantly via Paystack — MoMo, Telecel Cash, AirtelTigo Money or card.'
                : 'Send the exact amount via MoMo and submit the transaction ID to credit your wallet.'}
            </DialogDescription>
          </DialogHeader>

          {/* Method tabs (only when manual access enabled & global active) */}
          {manualAvailable && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-xl">
              <button
                onClick={() => setDepositTab('paystack')}
                className={`text-xs font-semibold py-2 rounded-lg transition-colors ${depositTab === 'paystack' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
              >
                Pay with Paystack
              </button>
              <button
                onClick={() => setDepositTab('manual')}
                className={`text-xs font-semibold py-2 rounded-lg transition-colors ${depositTab === 'manual' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
              >
                Manual Transfer
              </button>
            </div>
          )}

          <div className="space-y-4">
            {depositTab === 'paystack' && (
              <>
                <div>
                  <Label className="text-sm font-medium">Amount (GHS)</Label>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="mt-1.5 text-lg font-semibold h-12"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {quickAmounts.map((qa) => (
                    <button
                      key={qa}
                      onClick={() => setAmount(String(qa))}
                      className={`px-3.5 py-1.5 rounded-lg text-sm font-medium border transition-all duration-150 btn-press ${
                        amount === String(qa)
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-secondary text-secondary-foreground border-border hover:border-primary/30'
                      }`}
                    >
                      GHS {qa}
                    </button>
                  ))}
                </div>

                <div className="bg-secondary rounded-xl p-3 flex items-start gap-2">
                  <CreditCard className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    You'll be redirected to Paystack to complete payment. A 4% payment processing fee will be added. Your wallet will be credited the deposit amount instantly once payment is confirmed.
                  </p>
                </div>

                {amount && parseFloat(amount) >= 10 && (
                  <div className="bg-muted rounded-xl p-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Deposit Amount</span>
                      <span>{formatPrice(parseFloat(amount))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payment Fee (4%)</span>
                      <span>{formatPrice(Math.round(parseFloat(amount) * 0.04 * 100) / 100)}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t border-border pt-1">
                      <span>Total Payable</span>
                      <span>{formatPrice(Math.round(parseFloat(amount) * 1.04 * 100) / 100)}</span>
                    </div>
                  </div>
                )}

                <Button onClick={handlePaystackDeposit} disabled={submitting} className="w-full btn-press h-11 font-bold gap-2">
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Redirecting to Paystack...
                    </span>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      Deposit with Paystack
                    </>
                  )}
                </Button>
              </>
            )}

            {depositTab === 'manual' && manualAvailable && mdSettings && (
              <ManualDepositFlow
                settings={mdSettings}
                onClose={() => { setDepositOpen(false); setDepositTab('paystack'); }}
                onCredited={() => { refresh(); }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default DashboardWallet;
