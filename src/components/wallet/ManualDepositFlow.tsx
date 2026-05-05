import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Copy, Loader2, Wallet, XCircle } from 'lucide-react';
import { formatPrice } from '@/data/bundles';

export interface ManualDepositSettings {
  active: boolean;
  momo: string;
  account: string;
  network: string;
  instructions: string;
}

type Step = 'amount' | 'instructions' | 'txn' | 'waiting' | 'success' | 'rejected' | 'expired';

interface Props {
  settings: ManualDepositSettings;
  onClose: () => void;
  onCredited: () => void;
}

const ERROR_COPY: Record<string, string> = {
  NOT_AUTHORIZED: 'Manual transfer is not enabled on your account.',
  FEATURE_DISABLED: 'Manual transfer deposits are temporarily unavailable.',
  TOO_MANY_PENDING: 'You already have deposits being confirmed. Please wait a moment.',
  INVALID_AMOUNT: 'Enter an amount between GHS 10 and GHS 50,000.',
  TXN_ID_REQUIRED: 'Please enter the transaction ID from your MoMo confirmation.',
  DUPLICATE_TXN_ID: 'This transaction ID has already been submitted.',
  NOT_AUTHENTICATED: 'Please log in again to continue.',
};

const WAIT_SECONDS = 10 * 60;

export const ManualDepositFlow = ({ settings, onClose, onCredited }: Props) => {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState('');
  const [txnId, setTxnId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(WAIT_SECONDS);
  const tickRef = useRef<number | null>(null);

  const numAmount = useMemo(() => parseFloat(amount) || 0, [amount]);
  const quickAmounts = [25, 60, 120, 250, 400];

  const copy = (value: string, label: string) => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const goAmount = () => {
    if (isNaN(numAmount) || numAmount < 10) { toast.error('Minimum deposit is GHS 10.00'); return; }
    if (numAmount > 50000) { toast.error('Maximum deposit is GHS 50,000.00'); return; }
    setStep('instructions');
  };

  const submitTxn = async () => {
    if (!txnId.trim() || txnId.trim().length < 4) {
      toast.error('Enter a valid transaction ID'); return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.rpc('submit_manual_deposit_request' as any, {
      p_amount: numAmount,
      p_user_txn_id: txnId.trim(),
      p_note: null,
    });
    setSubmitting(false);
    const res: any = data;
    if (error || !res?.success) {
      const code = res?.error || error?.message || 'UNKNOWN';
      toast.error(ERROR_COPY[code] || `Could not submit request: ${code}`);
      return;
    }
    setRequestId(res.id);
    setReference(res.reference);
    setStep('waiting');
    setSecondsLeft(WAIT_SECONDS);
  };

  // Countdown
  useEffect(() => {
    if (step !== 'waiting') {
      if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
      return;
    }
    tickRef.current = window.setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          if (tickRef.current) window.clearInterval(tickRef.current);
          setStep('expired');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [step]);

  // Realtime: listen for status change on this transaction
  useEffect(() => {
    if (step !== 'waiting' || !requestId || !user) return;
    const channel = supabase
      .channel(`manual-deposit-${requestId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'wallet_transactions',
        filter: `id=eq.${requestId}`,
      }, (payload) => {
        const next = (payload.new as any)?.status;
        if (next === 'confirmed' || next === 'completed') {
          setStep('success');
          onCredited();
        } else if (next === 'rejected' || next === 'failed') {
          setStep('rejected');
        }
      })
      .subscribe();
    // Polling fallback every 12s
    const poll = window.setInterval(async () => {
      const { data } = await supabase
        .from('wallet_transactions')
        .select('status')
        .eq('id', requestId)
        .maybeSingle();
      const s = (data as any)?.status;
      if (s === 'confirmed' || s === 'completed') { setStep('success'); onCredited(); }
      else if (s === 'rejected' || s === 'failed') { setStep('rejected'); }
    }, 12000);
    return () => { supabase.removeChannel(channel); window.clearInterval(poll); };
  }, [step, requestId, user, onCredited]);

  const mmss = (() => {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  })();

  // ── STEP UI ──────────────────────────────────────────────
  if (step === 'amount') {
    return (
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium">Amount (GHS)</Label>
          <Input
            type="number" min="10" step="0.01" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="mt-1.5 text-lg font-semibold h-12"
          />
          <p className="text-[11px] text-muted-foreground mt-1">Minimum GHS 10 · Maximum GHS 50,000</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickAmounts.map(qa => (
            <button key={qa} onClick={() => setAmount(String(qa))}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium border transition-all duration-150 btn-press ${
                amount === String(qa)
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-secondary text-secondary-foreground border-border hover:border-primary/30'
              }`}>GHS {qa}</button>
          ))}
        </div>
        {numAmount >= 10 && (
          <div className="bg-muted rounded-xl p-3 text-sm flex justify-between">
            <span className="text-muted-foreground">You will send</span>
            <span className="font-bold tabular">{formatPrice(numAmount)}</span>
          </div>
        )}
        <Button onClick={goAmount} className="w-full h-11 font-bold gap-2 btn-press">
          Continue <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  if (step === 'instructions') {
    return (
      <div className="space-y-4">
        <div className="bg-primary/5 border border-primary/15 rounded-xl p-3 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Send payment to</p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-2 items-center">
              <span className="text-muted-foreground">Amount</span>
              <button onClick={() => copy(numAmount.toFixed(2), 'Amount')} className="font-bold text-foreground inline-flex items-center gap-1.5 tabular">
                {formatPrice(numAmount)} <Copy className="w-3 h-3" />
              </button>
            </div>
            {settings.network && (
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Network</span><span className="font-semibold">{settings.network}</span></div>
            )}
            {settings.momo && (
              <div className="flex justify-between gap-2 items-center">
                <span className="text-muted-foreground">MoMo Number</span>
                <button onClick={() => copy(settings.momo, 'Number')} className="font-mono font-bold text-foreground inline-flex items-center gap-1.5">
                  {settings.momo} <Copy className="w-3 h-3" />
                </button>
              </div>
            )}
            {settings.account && (
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Account Name</span><span className="font-semibold">{settings.account}</span></div>
            )}
          </div>
        </div>
        {settings.instructions && (
          <div className="bg-muted rounded-xl p-3 text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
            {settings.instructions}
          </div>
        )}
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            Send the <strong>exact amount</strong> to the details below, then enter your transaction ID to confirm your deposit.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep('amount')} className="h-11 gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button>
          <Button onClick={() => setStep('txn')} className="flex-1 h-11 font-bold gap-2 btn-press">
            I have completed payment <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'txn') {
    return (
      <div className="space-y-4">
        <div className="bg-muted rounded-xl p-3 text-sm flex justify-between">
          <span className="text-muted-foreground">Amount sent</span>
          <span className="font-bold tabular">{formatPrice(numAmount)}</span>
        </div>
        <div>
          <Label className="text-sm font-medium">Transaction ID <span className="text-destructive">*</span></Label>
          <Input value={txnId} onChange={(e) => setTxnId(e.target.value)}
            placeholder="e.g. AB12345CD9" className="mt-1.5 font-mono" maxLength={64} />
          <p className="text-[11px] text-muted-foreground mt-1">
            The MoMo confirmation reference from your SMS.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep('instructions')} disabled={submitting} className="h-11 gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button>
          <Button onClick={submitTxn} disabled={submitting || !txnId.trim()} className="flex-1 h-11 font-bold gap-2 btn-press">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Confirming…</> : <>Confirm Deposit <ArrowRight className="w-4 h-4" /></>}
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'waiting') {
    const pct = Math.round(((WAIT_SECONDS - secondsLeft) / WAIT_SECONDS) * 100);
    return (
      <div className="space-y-4 text-center py-2">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Clock className="w-7 h-7 text-primary animate-pulse" />
        </div>
        <div>
          <h3 className="font-display font-bold text-lg">Confirming your payment</h3>
          <p className="text-sm text-muted-foreground mt-1">Your wallet will update once verified.</p>
        </div>
        <div className="bg-muted rounded-xl p-3 space-y-1.5 text-left text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold">{formatPrice(numAmount)}</span></div>
          {reference && <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span className="font-mono text-xs">{reference}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">Transaction ID</span><span className="font-mono text-xs truncate ml-2">{txnId}</span></div>
        </div>
        <div className="space-y-1.5">
          <Progress value={pct} className="h-2" />
          <p className="text-[11px] text-muted-foreground tabular">Time left: {mmss}</p>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="space-y-4 text-center py-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-success/10 border border-success/25 flex items-center justify-center">
          <CheckCircle2 className="w-9 h-9 text-success" />
        </div>
        <div>
          <h3 className="font-display font-bold text-lg">Wallet credited</h3>
          <p className="text-sm text-muted-foreground mt-1">Your wallet has been credited with {formatPrice(numAmount)}.</p>
        </div>
        <Button onClick={onClose} className="w-full h-11 font-bold gap-2 btn-press"><Wallet className="w-4 h-4" /> Done</Button>
      </div>
    );
  }

  if (step === 'rejected') {
    return (
      <div className="space-y-4 text-center py-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 border border-destructive/25 flex items-center justify-center">
          <XCircle className="w-9 h-9 text-destructive" />
        </div>
        <div>
          <h3 className="font-display font-bold text-lg">Could not confirm</h3>
          <p className="text-sm text-muted-foreground mt-1">We could not confirm this deposit. If you believe this is a mistake, please contact support.</p>
        </div>
        <Button onClick={onClose} variant="outline" className="w-full h-11">Close</Button>
      </div>
    );
  }

  // expired
  return (
    <div className="space-y-4 text-center py-4">
      <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center">
        <Clock className="w-9 h-9 text-amber-600" />
      </div>
      <div>
        <h3 className="font-display font-bold text-lg">Confirmation still in progress</h3>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          This confirmation session has ended, but your deposit is still being checked. If payment was successful, your wallet will be credited once confirmed.
        </p>
      </div>
      <Button onClick={onClose} className="w-full h-11 font-bold">Got it</Button>
    </div>
  );
};
