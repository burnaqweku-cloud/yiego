import { useState, useEffect, useMemo, useCallback } from 'react';
import { validateNetworkMatch } from '@/lib/network-detect';
import { useDuplicateOrderCheck } from '@/hooks/useDuplicateOrderCheck';
import DuplicateOrderAlert from '@/components/bundles/DuplicateOrderAlert';
import { useNavigate, Link } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useAdmin, type DbBundle } from '@/contexts/AdminContext';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { usePricing } from '@/hooks/usePricing';
import { useAgent } from '@/hooks/useAgent';
import { useAgentSubscriptionState } from '@/hooks/useAgentSubscriptionState';
import { useGlobalSystemStatus } from '@/contexts/SystemStatusContext';
import { NETWORKS, NETWORK_COLORS, formatPrice, validateGhanaPhone, type Network } from '@/data/bundles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertCircle, CheckCircle, Wallet, CreditCard, Loader2, Tag, AlertTriangle,
  Layers, Info, ArrowLeft, ArrowRight, Smartphone, LayoutGrid, Zap,
} from 'lucide-react';
import BundleCard from '@/components/bundles/BundleCard';
import { generateOrderId } from '@/data/bundles';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useNetworkAvailability } from '@/hooks/useNetworkAvailability';
import NetworkUnavailableBanner from '@/components/bundles/NetworkUnavailableBanner';
import { parseEdgeFunctionError } from '@/lib/edge-function-error';
import { sanitizeToastError } from '@/lib/error-sanitizer';

const networkAccent: Record<Network, string> = {
  MTN: 'bg-mtn',
  Telecel: 'bg-telecel',
  AirtelTigo: 'bg-airteltigo',
};

const DashboardBuyData = () => {
  const navigate = useNavigate();
  const { bundles, loadingBundles } = useAdmin();
  const { user } = useAuth();
  const { wallet, loading: walletLoading, refresh: refreshWallet } = useWallet();
  const { getSellingPrice, getAgentPrice, loadingPricing } = usePricing();
  const { isActiveAgent } = useAgent();
  const { isAgentPricingActive, loading: subLoading } = useAgentSubscriptionState();
  const { status: sysStatus } = useGlobalSystemStatus();
  const { isNetworkAvailable, getNetworkMessage } = useNetworkAvailability();

  const useAgentPrices = isActiveAgent && isAgentPricingActive;

  const getBundlePrice = useCallback((b: DbBundle) =>
    useAgentPrices ? getAgentPrice(b) : getSellingPrice(b),
    [useAgentPrices, getAgentPrice, getSellingPrice]
  );

  const [step, setStep] = useState(1);
  const [selectedNetwork, setSelectedNetwork] = useState<Network | null>('MTN');
  const [selectedBundle, setSelectedBundle] = useState<DbBundle | null>(null);
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'paystack'>('wallet');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState(false);

  // Pre-fill from reorder
  useEffect(() => {
    const reorder = sessionStorage.getItem('yiego_reorder');
    if (reorder) {
      const data = JSON.parse(reorder);
      if (data.network) setSelectedNetwork(data.network);
      if (data.recipientPhone) setPhone(data.recipientPhone);
      sessionStorage.removeItem('yiego_reorder');
    }
  }, []);

  // Hide floating support widgets while user is on the recipient/payment step
  useEffect(() => {
    if (step === 2) {
      document.body.classList.add('modal-open-wa-hide');
    } else {
      document.body.classList.remove('modal-open-wa-hide');
    }
    return () => document.body.classList.remove('modal-open-wa-hide');
  }, [step]);

  const activeBundles = useMemo(() =>
    bundles.filter(b => b.active && (!selectedNetwork || b.network === selectedNetwork)),
    [bundles, selectedNetwork]
  );

  const networkCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    NETWORKS.forEach((n) => { counts[n] = 0; });
    bundles.forEach((b) => {
      if (!b.active) return;
      counts.all++;
      counts[b.network] = (counts[b.network] || 0) + 1;
    });
    return counts;
  }, [bundles]);

  const handleSelectBundle = (bundle: DbBundle) => {
    setSelectedBundle(bundle);
    setSelectedNetwork(bundle.network as Network);
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePhoneChange = (value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    setPhone(cleaned);
    if (errors.phone) setErrors({});
  };

  const networkMismatchError = useMemo(() => {
    if (!selectedBundle) return '';
    return validateNetworkMatch(phone, selectedBundle.network);
  }, [phone, selectedBundle]);

  const { blocked: duplicateBlocked, existingOrderId } = useDuplicateOrderCheck(phone);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!phone.trim()) e.phone = 'Phone number is required';
    else if (!validateGhanaPhone(phone)) e.phone = 'Enter a valid Ghana number (e.g. 0551234567)';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleOrder = async () => {
    if (!validate() || !selectedBundle || !user) return;

    const network = selectedBundle.network as Network;

    if (!sysStatus.online) {
      toast.error(sysStatus.message || 'System is currently offline.');
      return;
    }

    if (!isNetworkAvailable(network)) {
      toast.error(getNetworkMessage(network));
      return;
    }

    setPlacing(true);

    const sellingPrice = getBundlePrice(selectedBundle);
    const isWalletPayment = paymentMethod === 'wallet';

    if (isWalletPayment) {
      if (!wallet || Number(wallet.balance_ghs) < sellingPrice) {
        toast.error('Insufficient wallet balance');
        setPlacing(false);
        return;
      }

      const orderId = generateOrderId();

      const { data: createdOrder, error: orderErr } = await supabase
        .from('orders')
        .insert({
          order_id: orderId,
          user_id: user.id,
          recipient_number: phone.trim(),
          network: selectedBundle.network,
          product_id: selectedBundle.id,
          bundle_size_gb: selectedBundle.bundle_size_gb,
          amount_ghs: sellingPrice,
          status: 'Pending',
          payment_method: 'wallet',
          payment_status: 'paid',
        } as any)
        .select()
        .single();

      if (orderErr || !createdOrder) {
        console.error('Order creation error:', orderErr);
        toast.error('Failed to place order. Please try again.');
        setPlacing(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('process-wallet-order', {
        body: { order_id: orderId },
      });

      if (error) {
        console.error('Wallet order error:', error);
        await supabase.from('orders').update({ status: 'Cancelled', failure_reason: 'Wallet processing failed' } as any).eq('order_id', orderId).eq('status', 'Pending');
        const parsed = await parseEdgeFunctionError(error);
        toast.error(sanitizeToastError(parsed.message, 'Order processing failed. Please try again.'));
        setPlacing(false);
        return;
      }

      if (data && !data.success) {
        toast.error(sanitizeToastError(data, 'We could not complete this order at the moment. Your wallet has been refunded.'));
      } else {
        toast.success('Order placed and processing! ID: ' + orderId);
      }

      await refreshWallet();
      navigate(`/dashboard/orders/${orderId}`);

    } else {
      try {
        const callbackUrl = `${window.location.origin}/paystack/callback`;

        const { data, error } = await supabase.functions.invoke('paystack-initialize', {
          body: {
            purpose: 'order',
            product_id: selectedBundle.id,
            recipient_phone: phone.trim(),
            callback_url: callbackUrl,
            flow: 'dashboard',
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
          setPlacing(false);
          return;
        }

        sessionStorage.setItem('yiego_paystack_meta', JSON.stringify({
          purpose: 'order',
          order_id: data.order_id,
          reference: data.reference,
          flow: 'dashboard',
        }));

        window.location.href = data.authorization_url;
        return;
      } catch (err: any) {
        console.error('Payment error:', err);
        toast.error('Something went wrong. Please try again.');
      }
    }

    setPlacing(false);
  };

  const isLoading = loadingBundles || loadingPricing;
  const walletBalance = wallet ? Number(wallet.balance_ghs) : 0;
  const showExpiredAgentNotice = isActiveAgent && !isAgentPricingActive && !subLoading;
  const bundlePriceForSelected = selectedBundle ? getBundlePrice(selectedBundle) : 0;

  return (
    <DashboardLayout>
      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-24 md:pb-8 max-w-5xl mx-auto space-y-5">
        {/* ── Compact header ── */}
        <header>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-primary">
              {step === 1 ? 'Buy data' : 'Confirm order'}
            </span>
          </div>
          <h1 className="text-2xl md:text-[1.75rem] font-display font-extrabold tracking-[-0.025em] leading-[1.05]">
            {step === 1 ? 'Pick a bundle' : 'Almost there'}
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-1">
            {step === 1
              ? 'Delivered to any MTN, Telecel, or AirtelTigo number.'
              : 'Confirm the recipient and choose how to pay.'}
          </p>
        </header>

        {/* ── Wallet + status pill row ── */}
        {step === 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/dashboard/wallet"
              className="group inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-primary/25 bg-gradient-to-r from-primary/12 via-primary/5 to-primary/12 backdrop-blur-sm hover:border-primary/40 hover:-translate-y-0.5 transition-all shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.2)]"
            >
              <Wallet className="w-3 h-3 text-primary" />
              <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-primary">Wallet</span>
              <span className="text-[13px] font-display font-extrabold tabular text-primary">
                {walletLoading ? '—' : formatPrice(walletBalance)}
              </span>
              <ArrowRight className="w-3 h-3 text-primary/60 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            {sysStatus.online && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/70 bg-card/60 backdrop-blur-sm text-[11px] font-medium text-muted-foreground">
                <Zap className="w-3 h-3 text-primary" /> Delivery in minutes
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/70 bg-card/60 backdrop-blur-sm text-[11px] font-medium text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              {networkCounts.all || 0} bundles live
            </span>
          </div>
        )}

        {/* ── Status banners ── */}
        {!sysStatus.online && (
          <div className="bg-destructive/10 border border-destructive/25 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">{sysStatus.message}</p>
          </div>
        )}

        {showExpiredAgentNotice && (
          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 ring-1 ring-amber-500/30 flex items-center justify-center shrink-0">
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="space-y-1 flex-1">
              <p className="text-[13px] font-bold text-amber-700 dark:text-amber-300">
                Agent subscription inactive — normal prices applied
              </p>
              <p className="text-[11.5px] text-muted-foreground">
                Renew your subscription to restore agent pricing.
              </p>
              <Link to="/agent/dashboard" className="inline-flex items-center gap-1 mt-1.5 text-[11.5px] font-semibold text-primary hover:gap-1.5 transition-all">
                Renew now <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}

        {useAgentPrices && (
          <div className="inline-flex items-center gap-1.5 self-start text-[11px] font-bold text-primary px-3 py-1.5 rounded-full bg-primary/10 ring-1 ring-primary/25 shadow-[0_4px_16px_-8px_hsl(var(--primary)/0.3)]">
            <Tag className="w-3 h-3" /> Agent prices applied
          </div>
        )}

        {/* ── Step 1: Network filter + bundle grid ── */}
        {step === 1 && (
          <>
            {/* Bulk purchase callout */}
            <Link
              to="/dashboard/bulk-purchase"
              className="group relative overflow-hidden rounded-2xl flex items-center gap-3 p-3.5 bg-gradient-to-r from-primary/[0.09] via-primary/[0.04] to-transparent border border-primary/25 hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-18px_hsl(var(--primary)/0.3)] transition-all duration-300"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/25 text-primary flex items-center justify-center shrink-0 shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.35)] group-hover:scale-105 transition-transform">
                <Layers className="w-5 h-5" strokeWidth={1.9} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-bold leading-tight tracking-tight">
                  Buying for many numbers?
                </p>
                <p className="text-[11.5px] text-muted-foreground leading-tight mt-0.5 truncate">
                  Send the same bundle to multiple lines in one go.
                </p>
              </div>
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/25 text-[11.5px] font-bold text-primary group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary group-hover:shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.55)] transition-all shrink-0">
                Try Bulk <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </Link>

            {/* Network filter chips */}
            <div className="flex items-center gap-2 overflow-x-auto snap-row -mx-1 px-1 pb-1">
              <FilterChip
                active={!selectedNetwork}
                onClick={() => setSelectedNetwork(null)}
                count={networkCounts.all || 0}
              >
                <Smartphone className="w-3.5 h-3.5" /> All
              </FilterChip>
              {NETWORKS.map((n) => (
                <FilterChip
                  key={n}
                  active={selectedNetwork === n}
                  onClick={() => setSelectedNetwork(n)}
                  count={networkCounts[n] ?? 0}
                  dot={networkAccent[n]}
                >
                  {n}
                </FilterChip>
              ))}
            </div>

            {/* Results context strip */}
            {!isLoading && activeBundles.length > 0 && (
              <div className="flex items-center justify-between -mt-1">
                <p className="text-[12px] text-muted-foreground">
                  Showing <span className="font-bold text-foreground tabular">{activeBundles.length}</span>
                  {selectedNetwork ? <> <span className="font-semibold">{selectedNetwork}</span> bundle{activeBundles.length === 1 ? '' : 's'}</> : <> bundle{activeBundles.length === 1 ? '' : 's'}</>}
                </p>
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                  <span className="w-1 h-1 rounded-full bg-success" /> Tap to buy
                </span>
              </div>
            )}

            {/* Bundle grid */}
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <BundleSkeleton key={i} />
                ))}
              </div>
            ) : activeBundles.length === 0 ? (
              <EmptyBundles selectedNetwork={selectedNetwork} onClear={() => setSelectedNetwork(null)} />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                {activeBundles.map((b) => (
                  <BundleCard key={b.id} bundle={b} onBuy={handleSelectBundle} sellingPrice={getBundlePrice(b)} />
                ))}
              </div>
            )}

          </>
        )}

        {/* ── Step 2: Recipient + payment ── */}
        {step === 2 && selectedBundle && (
          <div className="space-y-4 max-w-xl mx-auto w-full">
            {!isNetworkAvailable(selectedBundle.network as Network) && (
              <NetworkUnavailableBanner network={selectedBundle.network} message={getNetworkMessage(selectedBundle.network as Network)} />
            )}

            {/* Bundle summary — more dramatic */}
            <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_18px_40px_-20px_hsl(var(--primary)/0.25)]">
              <span className={`absolute inset-x-0 top-0 h-0.5 ${networkAccent[selectedBundle.network as Network]} opacity-90`} />
              <div className="absolute -top-20 -right-14 w-56 h-56 rounded-full bg-primary/12 blur-3xl pointer-events-none glow-drift" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent pointer-events-none" />
              <div className="noise-overlay" />

              <div className="relative flex items-center justify-between gap-3 p-5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase px-2 py-1 rounded-full ${NETWORK_COLORS[selectedBundle.network as Network]} shadow-sm`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-white/85" />
                    {selectedBundle.network}
                  </span>
                  <div>
                    <p className="font-display text-[1.6rem] md:text-[1.75rem] font-extrabold tracking-[-0.03em] leading-none tabular">
                      {selectedBundle.bundle_size_gb}<span className="text-muted-foreground text-base ml-0.5">GB</span>
                    </p>
                    <p className="text-[10.5px] text-muted-foreground mt-1.5 inline-flex items-center gap-1">
                      <span className={`w-1 h-1 rounded-full ${networkAccent[selectedBundle.network as Network]}`} />
                      Your order
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground/70 font-bold">Total</p>
                  <p className="text-[1.6rem] md:text-[1.75rem] font-display font-extrabold tabular leading-none mt-1 text-primary">
                    {formatPrice(bundlePriceForSelected)}
                  </p>
                </div>
              </div>
            </div>

            {/* Recipient section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
                <Label className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-primary">
                  Recipient
                </Label>
              </div>
              <Input
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="0551234567"
                maxLength={10}
                className="h-12 rounded-xl bg-muted/30 border-border/60 tabular focus:bg-background"
                inputMode="numeric"
                disabled={placing}
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

            {/* Payment section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
                <Label className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-primary">
                  Payment
                </Label>
              </div>
              <PaymentOption
                selected={paymentMethod === 'wallet'}
                disabled={walletBalance < bundlePriceForSelected}
                onClick={() => walletBalance >= bundlePriceForSelected && setPaymentMethod('wallet')}
                icon={Wallet}
                title="YieGo Wallet"
                desc={`Balance: ${formatPrice(walletBalance)}${walletBalance < bundlePriceForSelected ? ' · Insufficient' : ''}`}
                badge={walletBalance >= bundlePriceForSelected ? 'Instant' : undefined}
              />
              <PaymentOption
                selected={paymentMethod === 'paystack'}
                onClick={() => setPaymentMethod('paystack')}
                icon={CreditCard}
                title="Card or Mobile Money"
                desc="Visa, Mastercard, MoMo, Telecel Cash, AirtelTigo Money"
              />
            </div>

            {/* Confirmation hint — minimal one-liner */}
            <p className="text-[11px] text-muted-foreground/85 flex items-center gap-1.5 px-1">
              {paymentMethod === 'wallet' ? (
                walletBalance >= bundlePriceForSelected ? (
                  <>
                    <CheckCircle className="w-3 h-3 text-primary" />
                    Instant delivery. Failed orders are auto-refunded.
                  </>
                ) : null
              ) : (
                <>
                  <CreditCard className="w-3 h-3 text-primary" />
                  You'll be redirected to checkout. Delivered automatically after payment.
                </>
              )}
            </p>

            {/* CTA actions */}
            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                onClick={() => { setStep(1); setSelectedBundle(null); }}
                className="rounded-full h-12 px-5 gap-1.5 backdrop-blur-sm bg-card/40 hover:bg-card hover:border-primary/35"
                disabled={placing}
              >
                <ArrowLeft className="w-4 h-4" /> Change
              </Button>
              <Button
                onClick={handleOrder}
                disabled={placing || walletLoading || !sysStatus.online || !isNetworkAvailable(selectedBundle.network as Network) || !!networkMismatchError || duplicateBlocked}
                className="flex-1 rounded-full h-12 font-bold text-[14px] gap-2 shadow-[0_12px_28px_-10px_hsl(var(--primary)/0.55)] hover:shadow-[0_16px_32px_-10px_hsl(var(--primary)/0.65)] hover:-translate-y-0.5 transition-all"
              >
                {!sysStatus.online ? (
                  <><AlertTriangle className="w-4 h-4" /> System offline</>
                ) : !isNetworkAvailable(selectedBundle.network as Network) ? (
                  <><AlertTriangle className="w-4 h-4" /> {selectedBundle.network} unavailable</>
                ) : placing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {paymentMethod === 'paystack' ? 'Redirecting…' : 'Processing…'}
                  </>
                ) : (
                  <>
                    {paymentMethod === 'wallet' ? <Wallet className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                    {paymentMethod === 'wallet' ? 'Pay & order' : `Pay ${formatPrice(bundlePriceForSelected)}`}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        <div aria-hidden className="h-4 md:h-2" />
      </div>
    </DashboardLayout>
  );
};

const FilterChip = ({
  active,
  onClick,
  count,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  dot?: string;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={`shrink-0 inline-flex items-center gap-2 px-3.5 h-9 rounded-full text-[12px] font-semibold transition-all duration-200 ${
      active
        ? 'bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.55)]'
        : 'bg-card/70 backdrop-blur-sm border border-border/70 text-foreground/75 hover:text-foreground hover:border-primary/40'
    }`}
  >
    {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot} ${active ? 'shadow-[0_0_8px_currentColor]' : ''}`} />}
    {children}
    <span className={`tabular text-[10.5px] px-1.5 rounded-full ${active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground'}`}>
      {count}
    </span>
  </button>
);

const PaymentOption = ({
  selected,
  disabled = false,
  onClick,
  icon: Icon,
  title,
  desc,
  badge,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: typeof Wallet;
  title: string;
  desc: string;
  badge?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`group relative w-full text-left flex items-center gap-3 p-3.5 rounded-2xl border transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden ${
      selected
        ? 'border-primary/50 bg-gradient-to-br from-primary/10 to-primary/[0.03] shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.4),inset_0_1px_0_0_hsl(var(--primary)/0.2)]'
        : 'border-border/70 bg-card hover:border-primary/30'
    }`}
  >
    {selected && (
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
    )}
    <span
      className={`relative w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
        selected ? 'border-primary' : 'border-muted-foreground/30'
      }`}
    >
      {selected && <span className="w-2 h-2 rounded-full bg-primary" />}
    </span>
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${
      selected
        ? 'bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/25 text-primary shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.4)]'
        : 'bg-muted/50 text-muted-foreground'
    }`}>
      <Icon className="w-[18px] h-[18px]" strokeWidth={1.9} />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[13px] font-bold leading-tight truncate">{title}</p>
      <p className="text-[10.5px] text-muted-foreground leading-tight mt-0.5 truncate">{desc}</p>
    </div>
    {badge && (
      <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25 shrink-0">
        {badge}
      </span>
    )}
  </button>
);

const BundleSkeleton = () => (
  <div className="relative rounded-3xl overflow-hidden border border-border/70 bg-card p-5 h-[260px]">
    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/40 via-primary/15 to-primary/40 skeleton-shimmer" />
    <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/10 to-transparent" />
    <div className="relative flex flex-col h-full">
      <div className="flex items-center justify-between mb-5">
        <div className="h-6 w-20 rounded-full skeleton-shimmer" />
        <div className="h-5 w-14 rounded-md skeleton-shimmer" />
      </div>
      <div className="h-12 w-24 rounded-lg skeleton-shimmer mb-2" />
      <div className="h-3 w-28 rounded-full skeleton-shimmer" />
      <div className="mt-auto pt-4 border-t border-dashed border-border/60 flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-2.5 w-12 rounded-full skeleton-shimmer" />
          <div className="h-5 w-20 rounded-md skeleton-shimmer" />
        </div>
        <div className="h-8 w-20 rounded-full skeleton-shimmer" />
      </div>
    </div>
  </div>
);

const EmptyBundles = ({
  selectedNetwork,
  onClear,
}: {
  selectedNetwork: Network | null;
  onClear: () => void;
}) => (
  <div className="text-center py-16 max-w-md mx-auto">
    <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 mx-auto mb-5 flex items-center justify-center shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.4)]">
      <LayoutGrid className="w-7 h-7 text-primary" strokeWidth={1.8} />
    </div>
    <h3 className="font-display font-bold text-xl tracking-tight">
      {selectedNetwork ? `No ${selectedNetwork} bundles right now` : 'No bundles available'}
    </h3>
    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
      {selectedNetwork
        ? 'This network is temporarily out of stock. Try another network or check back soon.'
        : 'Bundles are being refreshed — try again in a moment.'}
    </p>
    {selectedNetwork && (
      <button
        onClick={onClear}
        className="mt-6 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-[0_10px_28px_-10px_hsl(var(--primary)/0.6)] hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-10px_hsl(var(--primary)/0.7)] transition-all"
      >
        <Smartphone className="w-3.5 h-3.5" /> Show all networks
      </button>
    )}
  </div>
);

export default DashboardBuyData;
