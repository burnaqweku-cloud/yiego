import { useState, useEffect, useMemo } from 'react';
import { useDuplicateOrderCheck } from '@/hooks/useDuplicateOrderCheck';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type Network, formatPrice, validateGhanaPhone, NETWORK_COLORS } from '@/data/bundles';
import { AlertCircle, ArrowRight, CreditCard, Loader2, Lock, AlertTriangle } from 'lucide-react';
import DuplicateOrderAlert from '@/components/bundles/DuplicateOrderAlert';
import type { DbBundle } from '@/contexts/AdminContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useGlobalSystemStatus } from '@/contexts/SystemStatusContext';
import { useNetworkAvailability } from '@/hooks/useNetworkAvailability';
import NetworkUnavailableBanner from '@/components/bundles/NetworkUnavailableBanner';
import { parseEdgeFunctionError } from '@/lib/edge-function-error';
import { validateNetworkMatch } from '@/lib/network-detect';
import { useIsMobile } from '@/hooks/use-mobile';

interface PurchaseModalProps {
  bundle: DbBundle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getSellingPrice?: (bundle: DbBundle) => number;
}

const NETWORK_DOT: Record<Network, string> = {
  MTN: 'bg-mtn',
  Telecel: 'bg-telecel',
  AirtelTigo: 'bg-airteltigo',
};

const PurchaseModal = ({ bundle, open, onOpenChange, getSellingPrice }: PurchaseModalProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { status: sysStatus } = useGlobalSystemStatus();
  const { isNetworkAvailable, getNetworkMessage, loading } = useNetworkAvailability();
  const isMobile = useIsMobile();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (bundle) {
      setPhone('');
      setName('');
      setErrors({});
      setPaying(false);
    }
  }, [bundle]);

  // Hide floating WhatsApp + AI Support widgets while purchase modal is open
  useEffect(() => {
    if (open) document.body.classList.add('modal-open-wa-hide');
    else document.body.classList.remove('modal-open-wa-hide');
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

  const { blocked: duplicateBlocked, existingOrderId } = useDuplicateOrderCheck(phone);

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
        if (code === 'NETWORK_UNAVAILABLE') message = getNetworkMessage(network);
        else if (code === 'SYSTEM_OFFLINE') message = sysStatus.message || message;
        console.error('Paystack init error:', error, data);
        toast.error(message);
        setPaying(false);
        return;
      }

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
      if (parsed.code === 'NETWORK_UNAVAILABLE') message = getNetworkMessage(network);
      else if (parsed.code === 'SYSTEM_OFFLINE') message = sysStatus.message || message;
      toast.error(message);
      setPaying(false);
    }
  };

  // Logged-in flow: proceed to checkout page (wallet, Paystack, loyalty redemption all live there)
  const handleProceedToCheckout = () => {
    if (!validate() || !bundle) return;
    const sellingPrice = getSellingPrice ? getSellingPrice(bundle) : Number(bundle.price_ghs);
    sessionStorage.setItem('yiego_purchase', JSON.stringify({
      bundle: { ...bundle, price_ghs: sellingPrice },
      recipientPhone: phone.trim(),
      customerName: name.trim(),
      network: bundle.network,
    }));
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

  const ctaLabel = (() => {
    if (!sysStatus.online) return { icon: <Lock className="w-4 h-4" />, text: 'System offline' };
    if (checkingAvailability) return { icon: <Loader2 className="w-4 h-4 animate-spin" />, text: 'Checking…' };
    if (!networkAvailable) return { icon: <Lock className="w-4 h-4" />, text: `${bundle.network} unavailable` };
    if (paying) return { icon: <Loader2 className="w-4 h-4 animate-spin" />, text: 'Redirecting…' };
    if (user) return { icon: <ArrowRight className="w-4 h-4" />, text: 'Continue to checkout' };
    return { icon: <CreditCard className="w-4 h-4" />, text: `Pay ${formatPrice(totalPayable)}` };
  })();

  const handleSubmit = () => {
    if (user) handleProceedToCheckout();
    else handleGuestPay();
  };

  const Body = (
    <div className="flex flex-col">
      {/* ── Compact bundle header ── */}
      <div className="relative px-5 pt-5 pb-4 overflow-hidden">
        <div className={`absolute inset-x-0 top-0 h-0.5 ${NETWORK_DOT[bundleNetwork]} opacity-90`} />
        <div className="absolute -top-16 -right-12 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase px-2 py-1 rounded-full ${NETWORK_COLORS[bundleNetwork]}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
              {bundle.network}
            </span>
            <div className="min-w-0">
              <p className="font-display text-[1.35rem] font-extrabold tracking-[-0.025em] leading-none tabular">
                {bundle.bundle_size_gb}<span className="text-muted-foreground text-base ml-0.5">GB</span>
              </p>
              <p className="text-[10.5px] text-muted-foreground mt-1">Recipient details</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground/70 font-bold">Bundle</p>
            <p className="text-[1.35rem] font-display font-extrabold tabular leading-none mt-0.5 text-primary">
              {formatPrice(displayPrice)}
            </p>
          </div>
        </div>
      </div>

      <div className="h-px bg-border/60" />

      {/* ── Form ── */}
      <div className="px-5 py-4 space-y-3.5">
        <div className="space-y-1.5">
          <Label htmlFor="fullName" className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Your name
          </Label>
          <Input
            id="fullName"
            placeholder="e.g. Nana Osei"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            maxLength={100}
            className="h-11 rounded-xl bg-muted/40 border-border/60"
            disabled={paying}
          />
          {errors.name && (
            <p className="text-[11px] text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />{errors.name}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone" className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Recipient number
          </Label>
          <Input
            id="phone"
            placeholder="0551234567"
            value={phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            maxLength={10}
            className="h-11 rounded-xl bg-muted/40 border-border/60 tabular"
            inputMode="numeric"
            disabled={paying}
          />
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
          ) : phone.length > 0 && phone.length < 10 ? (
            <p className="text-[10.5px] text-muted-foreground/80 tabular">
              {10 - phone.length} more digit{10 - phone.length === 1 ? '' : 's'} to go
            </p>
          ) : (
            <p className="text-[10.5px] text-muted-foreground/80">
              Double-check — wrong numbers can't be refunded.
            </p>
          )}
        </div>

        {/* Payment breakdown — guest only (logged-in users see full breakdown at /checkout) */}
        {!user && (
          <div className="rounded-xl bg-muted/40 border border-border/60 px-3.5 py-3 space-y-1.5 text-[12.5px]">
            <div className="flex justify-between text-muted-foreground">
              <span>Bundle</span>
              <span className="tabular text-foreground/85">{formatPrice(displayPrice)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Processing fee (4%)</span>
              <span className="tabular text-foreground/85">{formatPrice(processingFee)}</span>
            </div>
            <div className="h-px bg-border/60 my-0.5" />
            <div className="flex justify-between font-bold text-[13px]">
              <span>Total</span>
              <span className="tabular text-primary">{formatPrice(totalPayable)}</span>
            </div>
          </div>
        )}

        {/* Inline status banners */}
        {!sysStatus.online && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-2.5 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-snug">{sysStatus.message}</p>
          </div>
        )}
        {sysStatus.online && !checkingAvailability && !networkAvailable && (
          <NetworkUnavailableBanner network={bundle.network} message={getNetworkMessage(bundleNetwork)} />
        )}
      </div>

      {/* ── CTA Footer ── */}
      <div className="px-5 pb-5 pt-1">
        <Button
          onClick={handleSubmit}
          className="w-full h-12 rounded-xl btn-press font-bold text-[14.5px] gap-2 shadow-[0_12px_28px_-10px_hsl(var(--primary)/0.55)] hover:shadow-[0_16px_32px_-10px_hsl(var(--primary)/0.65)] hover:-translate-y-0.5 transition-all"
          size="lg"
          disabled={paying || isBlocked}
        >
          {ctaLabel.icon}
          {ctaLabel.text}
        </Button>
        <p className="text-[10px] text-center text-muted-foreground/80 mt-2.5 flex items-center justify-center gap-1.5">
          <Lock className="w-2.5 h-2.5" /> Secured by Paystack
          {!user && <> · No account needed</>}
        </p>
      </div>
    </div>
  );

  // Mobile: vaul bottom-sheet drawer (content-height, doesn't dominate the screen)
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="rounded-t-3xl border-t border-border/60 bg-card/95 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_-24px_60px_-20px_hsl(var(--primary)/0.3)] max-h-[88vh]">
          <DrawerTitle className="sr-only">Buy {bundle.bundle_size_gb}GB {bundle.network}</DrawerTitle>
          <DrawerDescription className="sr-only">
            Enter recipient name and phone number to confirm your data bundle order.
          </DrawerDescription>
          {Body}
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: compact centered dialog
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_30px_80px_-20px_hsl(var(--primary)/0.35)]">
        <DialogTitle className="sr-only">Buy {bundle.bundle_size_gb}GB {bundle.network}</DialogTitle>
        <DialogDescription className="sr-only">
          Enter recipient name and phone number to confirm your data bundle order.
        </DialogDescription>
        {Body}
      </DialogContent>
    </Dialog>
  );
};

export default PurchaseModal;
