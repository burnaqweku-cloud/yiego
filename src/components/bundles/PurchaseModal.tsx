import { useState, useEffect, useMemo } from 'react';
import { useDuplicateOrderCheck } from '@/hooks/useDuplicateOrderCheck';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type Network, formatPrice, validateGhanaPhone, NETWORK_COLORS } from '@/data/bundles';
import { AlertCircle, ArrowRight, Zap, CreditCard, Loader2, Lock, AlertTriangle, Sparkles } from 'lucide-react';
import ImportantNotice from '@/components/bundles/ImportantNotice';
import DuplicateOrderAlert from '@/components/bundles/DuplicateOrderAlert';
import type { DbBundle } from '@/contexts/AdminContext';
import NonExpiryBadge from '@/components/bundles/NonExpiryBadge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useGlobalSystemStatus } from '@/contexts/SystemStatusContext';
import { useNetworkAvailability } from '@/hooks/useNetworkAvailability';
import NetworkUnavailableBanner from '@/components/bundles/NetworkUnavailableBanner';
import { parseEdgeFunctionError } from '@/lib/edge-function-error';
import { validateNetworkMatch } from '@/lib/network-detect';
import { useLoyalty } from '@/hooks/useLoyalty';

interface PurchaseModalProps {
  bundle: DbBundle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getSellingPrice?: (bundle: DbBundle) => number;
}

const PurchaseModal = ({ bundle, open, onOpenChange, getSellingPrice }: PurchaseModalProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { status: sysStatus } = useGlobalSystemStatus();
  const { isNetworkAvailable, getNetworkMessage, loading } = useNetworkAvailability();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [paying, setPaying] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [redeeming, setRedeeming] = useState(false);

  // Loyalty (logged-in only)
  const { account, settings, refresh: refreshLoyalty } = useLoyalty();

  useEffect(() => {
    if (bundle) {
      setPhone('');
      setName('');
      setErrors({});
      setPaying(false);
      setPointsToRedeem(0);
    }
  }, [bundle]);

  // Hide floating WhatsApp + AI Support widgets while purchase modal is open
  useEffect(() => {
    if (open) {
      document.body.classList.add('modal-open-wa-hide');
    } else {
      document.body.classList.remove('modal-open-wa-hide');
    }
    return () => document.body.classList.remove('modal-open-wa-hide');
  }, [open]);

  const handlePhoneChange = (value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    setPhone(cleaned);
    if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
  };

  const networkMismatchError = useMemo(() => {
    if (!bundle) return '';
    return validateNetworkMatch(phone, bundle.network);
  }, [phone, bundle]);

  const { blocked: duplicateBlocked, existingOrderId, checking: duplicateChecking } = useDuplicateOrderCheck(phone);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) {
      newErrors.name = 'Full name is required (min 2 characters)';
    }
    if (!phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!validateGhanaPhone(phone)) {
      newErrors.phone = 'Enter a valid Ghana number (e.g. 0551234567)';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Guest flow: pay directly with Paystack (server creates order)
  const handleGuestPay = async () => {
    if (!validate() || !bundle) return;

    const network = bundle.network as Network;

    if (!sysStatus.online) {
      toast.error(sysStatus.message || 'System is currently offline. Please try again later.');
      return;
    }

    if (loading) {
      toast.error('Checking network availability...');
      return;
    }

    if (!isNetworkAvailable(network)) {
      toast.error(getNetworkMessage(network));
      return;
    }

    setPaying(true);

    try {
      const callbackUrl = `${window.location.origin}/paystack/callback`;

      const { data, error } = await supabase.functions.invoke('paystack-initialize', {
        body: {
          purpose: 'order',
          product_id: bundle.id,
          recipient_phone: phone.trim(),
          customer_name: name.trim(),
          callback_url: callbackUrl,
          flow: 'guest',
        },
      });

      if (error || !data?.success) {
        let message = data?.error || 'Failed to initialize payment. Please try again.';
        let code: string | undefined = data?.code;

        if (error) {
          const parsed = await parseEdgeFunctionError(error, message);
          message = parsed.message;
          code = code || parsed.code;
        }

        if (code === 'NETWORK_UNAVAILABLE') {
          message = getNetworkMessage(network);
        } else if (code === 'SYSTEM_OFFLINE') {
          message = sysStatus.message || message;
        }

        console.error('Paystack init error:', error, data);
        toast.error(message);
        setPaying(false);
        return;
      }

      // Store flow metadata for PaystackCallback
      sessionStorage.setItem('yiego_paystack_meta', JSON.stringify({
        purpose: 'order',
        order_id: data.order_id,
        reference: data.reference,
        flow: 'guest',
      }));

      onOpenChange(false);
      window.location.href = data.authorization_url;
    } catch (err: any) {
      console.error('Payment error:', err);
      const parsed = await parseEdgeFunctionError(err, 'Something went wrong. Please try again.');
      let message = parsed.message;

      if (parsed.code === 'NETWORK_UNAVAILABLE') {
        message = getNetworkMessage(network);
      } else if (parsed.code === 'SYSTEM_OFFLINE') {
        message = sysStatus.message || message;
      }

      toast.error(message);
      setPaying(false);
    }
  };

  // Logged-in flow: proceed to checkout page (wallet or Paystack)
  const handleProceedToCheckout = async () => {
    if (!validate() || !bundle) return;

    const sellingPrice = getSellingPrice ? getSellingPrice(bundle) : Number(bundle.price_ghs);

    // Optionally commit a points → wallet redemption FIRST.
    // The wallet credit becomes available immediately; the user can then pay
    // partially or fully from wallet on the next screen — no changes needed
    // to the checkout/order/wallet code paths.
    if (pointsToRedeem > 0 && account) {
      setRedeeming(true);
      try {
        const { data, error } = await supabase.rpc('redeem_loyalty_points', {
          p_points: pointsToRedeem,
          p_type: 'wallet_credit',
          p_bundle_amount: null,
        });
        if (error) throw error;
        const result = data as any;
        if (!result?.success) {
          toast.error(result?.message || result?.error || 'Could not redeem points');
          setRedeeming(false);
          return;
        }
        toast.success(`Redeemed ${pointsToRedeem} pts → ${formatPrice(Number(result.ghs_value || 0))} added to wallet`);
        await refreshLoyalty();
      } catch (err: any) {
        console.error('Redeem error:', err);
        toast.error(err?.message || 'Redemption failed');
        setRedeeming(false);
        return;
      }
      setRedeeming(false);
    }

    const purchaseData = {
      bundle: { ...bundle, price_ghs: sellingPrice },
      recipientPhone: phone.trim(),
      customerName: name.trim(),
      network: bundle.network,
    };
    sessionStorage.setItem('yiego_purchase', JSON.stringify(purchaseData));
    onOpenChange(false);
    navigate('/checkout');
  };

  if (!bundle) return null;

  const bundleNetwork = bundle.network as Network;
  const networkAvailable = !loading && isNetworkAvailable(bundleNetwork);
  const checkingAvailability = loading;
  const displayPrice = getSellingPrice ? getSellingPrice(bundle) : Number(bundle.price_ghs);
  const processingFee = Math.round(displayPrice * 0.04 * 100) / 100;
  const totalPayable = Math.round((displayPrice + processingFee) * 100) / 100;
  const isBlocked = !sysStatus.online || checkingAvailability || !networkAvailable || !!networkMismatchError || duplicateBlocked;

  // Loyalty redemption math (logged-in only)
  const pointsRate = settings?.points_to_ghs_rate ?? 0;
  const maxRedeemPct = settings?.max_redeem_percent_per_order ?? 0.5;
  const maxRedeemGhs = Math.floor(displayPrice * maxRedeemPct * 100) / 100;
  const maxRedeemPoints = pointsRate > 0
    ? Math.min(account?.points_balance ?? 0, Math.floor(maxRedeemGhs / pointsRate))
    : 0;
  const redeemValueGhs = Math.round(pointsToRedeem * pointsRate * 100) / 100;
  const showRedeem = !!user && !!settings?.program_active && !!account && maxRedeemPoints > 0;


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-3xl border border-border/60 bg-card shadow-[0_30px_80px_-20px_hsl(var(--primary)/0.25)]">
        {/* ── HERO: Bundle summary with ambient accent ── */}
        <div className="relative px-6 pt-6 pb-5 border-b border-border/50 bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent">
          <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

          <DialogHeader className="text-left mb-4">
            <div className="inline-flex items-center gap-1.5 self-start text-[10px] font-bold uppercase tracking-[0.18em] text-primary mb-1.5">
              <Sparkles className="w-3 h-3" /> Order summary
            </div>
            <DialogTitle className="font-display text-xl tracking-tight">
              {bundle.bundle_size_gb}GB · {bundle.network}
            </DialogTitle>
            <DialogDescription className="text-[12.5px] mt-0.5">
              Confirm recipient details to continue
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-end justify-between">
            <div className="space-y-1.5">
              <span className={`inline-flex text-[10px] font-bold px-2.5 py-1 rounded-full ${NETWORK_COLORS[bundle.network as Network]}`}>
                {bundle.network}
              </span>
              <NonExpiryBadge size="xs" network={bundle.network} />
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Bundle</p>
              <p className="text-2xl font-display font-extrabold tabular leading-none mt-1">{formatPrice(displayPrice)}</p>
            </div>
          </div>
        </div>

        {/* ── FORM ── */}
        <div className="px-6 py-5 space-y-4">
          {/* Field: Name */}
          <div className="space-y-1.5">
            <Label htmlFor="fullName" className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Your name
            </Label>
            <Input
              id="fullName"
              placeholder="e.g. Nana Osei"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              maxLength={100}
              className="h-12 rounded-xl bg-muted/30 border-border/60 focus-visible:ring-2 focus-visible:ring-primary/40"
              disabled={paying}
            />
            {errors.name && (
              <p className="text-[11px] text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />{errors.name}
              </p>
            )}
          </div>

          {/* Field: Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Recipient number
            </Label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-muted-foreground/80 tabular pointer-events-none">+233</span>
              <Input
                id="phone"
                placeholder="55 123 4567"
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value.startsWith('0') ? e.target.value : e.target.value)}
                maxLength={10}
                className="h-12 rounded-xl pl-[58px] bg-muted/30 border-border/60 tabular focus-visible:ring-2 focus-visible:ring-primary/40"
                inputMode="tel"
                disabled={paying}
              />
            </div>
            {errors.phone ? (
              <p className="text-[11px] text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />{errors.phone}
              </p>
            ) : networkMismatchError ? (
              <p className="text-[11px] text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0" />{networkMismatchError}
              </p>
            ) : duplicateBlocked ? (
              <DuplicateOrderAlert existingOrderId={existingOrderId} />
            ) : (
              <p className="text-[10.5px] text-muted-foreground/80">
                Double-check the number — refunds aren't possible for wrong numbers.
              </p>
            )}
          </div>

          {/* Fee breakdown — guest only */}
          {!user && (
            <div className="rounded-2xl bg-muted/30 border border-border/50 p-3.5 space-y-1.5 text-[12.5px]">
              <div className="flex justify-between text-muted-foreground">
                <span>Bundle</span>
                <span className="tabular text-foreground/80">{formatPrice(displayPrice)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Payment fee (4%)</span>
                <span className="tabular text-foreground/80">{formatPrice(processingFee)}</span>
              </div>
              <div className="h-px bg-border/60 my-1" />
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span className="tabular text-primary">{formatPrice(totalPayable)}</span>
              </div>
            </div>
          )}

          {/* Loyalty redemption (logged-in only) */}
          {showRedeem && (
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-3.5">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[12px] font-bold leading-none">Use loyalty points</p>
                    <p className="text-[10px] text-muted-foreground mt-1 tabular">
                      {(account?.points_balance ?? 0).toLocaleString()} pts available
                    </p>
                  </div>
                </div>
                {pointsToRedeem > 0 && (
                  <button
                    type="button"
                    onClick={() => setPointsToRedeem(0)}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={maxRedeemPoints}
                  step={1}
                  value={pointsToRedeem || ''}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(maxRedeemPoints, Math.floor(Number(e.target.value) || 0)));
                    setPointsToRedeem(v);
                  }}
                  placeholder={`Max ${maxRedeemPoints}`}
                  className="h-9 rounded-lg text-sm tabular flex-1 bg-background"
                  disabled={paying || redeeming}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 rounded-lg text-[11px] font-semibold whitespace-nowrap"
                  onClick={() => setPointsToRedeem(maxRedeemPoints)}
                  disabled={paying || redeeming || maxRedeemPoints === 0}
                >
                  Max
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                {pointsToRedeem > 0 ? (
                  <>Redeems for <span className="text-primary font-semibold">{formatPrice(redeemValueGhs)}</span> wallet credit at checkout.</>
                ) : (
                  <>Up to {Math.round(maxRedeemPct * 100)}% ({formatPrice(maxRedeemGhs)}) redeemable here.</>
                )}
              </p>
            </div>
          )}

          {/* Inline notice */}
          <ImportantNotice compact />
        </div>

        {/* Status banners */}
        {!sysStatus.online && (
          <div className="mx-6 mb-3 bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">{sysStatus.message}</p>
          </div>
        )}
        {sysStatus.online && !checkingAvailability && !networkAvailable && (
          <div className="mx-6 mb-3">
            <NetworkUnavailableBanner network={bundle.network} message={getNetworkMessage(bundleNetwork)} />
          </div>
        )}

        {/* ── STICKY ACTION FOOTER ── */}
        <div className="px-6 py-4 border-t border-border/60 bg-background/60 backdrop-blur-sm">
          {user ? (
            <Button
              onClick={handleProceedToCheckout}
              className="w-full h-12 rounded-xl btn-press font-bold text-[15px] gap-2 shadow-[0_10px_24px_-8px_hsl(var(--primary)/0.5)]"
              size="lg"
              disabled={paying || redeeming || isBlocked}
            >
              {!sysStatus.online ? (
                <><Lock className="w-4 h-4" /> System offline</>
              ) : checkingAvailability ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Checking availability…</>
              ) : !networkAvailable ? (
                <><Lock className="w-4 h-4" /> {bundle.network} unavailable</>
              ) : redeeming ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Redeeming points…</>
              ) : (
                <>Proceed to checkout <ArrowRight className="w-4 h-4" /></>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleGuestPay}
              className="w-full h-12 rounded-xl btn-press font-bold text-[15px] gap-2 shadow-[0_10px_24px_-8px_hsl(var(--primary)/0.5)]"
              size="lg"
              disabled={paying || isBlocked}
            >
              {!sysStatus.online ? (
                <><Lock className="w-4 h-4" /> System offline</>
              ) : checkingAvailability ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Checking availability…</>
              ) : !networkAvailable ? (
                <><Lock className="w-4 h-4" /> {bundle.network} unavailable</>
              ) : paying ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting to Paystack…</>
              ) : (
                <><CreditCard className="w-4 h-4" /> Pay {formatPrice(totalPayable)}</>
              )}
            </Button>
          )}
          <p className="text-[10.5px] text-center text-muted-foreground mt-2.5 flex items-center justify-center gap-1.5">
            <Lock className="w-2.5 h-2.5" /> Secured by Paystack · No account needed
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PurchaseModal;
