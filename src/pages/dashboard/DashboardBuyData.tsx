import { useState, useEffect, useMemo, useCallback } from 'react';
import { validateNetworkMatch } from '@/lib/network-detect';
import { useDuplicateOrderCheck } from '@/hooks/useDuplicateOrderCheck';
import DuplicateOrderAlert from '@/components/bundles/DuplicateOrderAlert';
import { useNavigate } from 'react-router-dom';
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
import { AlertCircle, CheckCircle, Wallet, CreditCard, Zap, Loader2, Tag, AlertTriangle, Layers, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { generateOrderId } from '@/data/bundles';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import ImportantNotice from '@/components/bundles/ImportantNotice';
import NonExpiryBadge from '@/components/bundles/NonExpiryBadge';
import { useNetworkAvailability } from '@/hooks/useNetworkAvailability';
import NetworkUnavailableBanner from '@/components/bundles/NetworkUnavailableBanner';
import { parseEdgeFunctionError } from '@/lib/edge-function-error';
import { sanitizeToastError } from '@/lib/error-sanitizer';
import LiveDeliveryChip from '@/components/delivery/LiveDeliveryChip';

const DashboardBuyData = () => {
  const navigate = useNavigate();
  const { bundles, loadingBundles } = useAdmin();
  const { user } = useAuth();
  const { wallet, loading: walletLoading, refresh: refreshWallet } = useWallet();
  const { getSellingPrice, getAgentPrice, loadingPricing } = usePricing();
  const { isActiveAgent } = useAgent();
  const { isAgentPricingActive, displayState, loading: subLoading } = useAgentSubscriptionState();
  const { status: sysStatus } = useGlobalSystemStatus();
  const { isNetworkAvailable, getNetworkMessage } = useNetworkAvailability();

  // Agent pricing only applies when subscription is active/expiring/grace
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
    const reorder = sessionStorage.getItem('datasika_reorder');
    if (reorder) {
      const data = JSON.parse(reorder);
      if (data.network) setSelectedNetwork(data.network);
      if (data.recipientPhone) setPhone(data.recipientPhone);
      sessionStorage.removeItem('datasika_reorder');
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

  const handleSelectBundle = (bundle: DbBundle) => {
    setSelectedBundle(bundle);
    setSelectedNetwork(bundle.network as Network);
    setStep(2);
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

  const { blocked: duplicateBlocked, existingOrderId, checking: duplicateChecking } = useDuplicateOrderCheck(phone);

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
        // Clean up ghost Pending order on failure
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

          if (code === 'NETWORK_UNAVAILABLE') {
            message = getNetworkMessage(network);
          } else if (code === 'SYSTEM_OFFLINE') {
            message = sysStatus.message || message;
          }

          console.error('Paystack init error:', error, data);
          toast.error(message);
          setPlacing(false);
          return;
        }

        sessionStorage.setItem('datasika_paystack_meta', JSON.stringify({
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

  // Show expired agent notice when agent is logged in but subscription inactive
  const showExpiredAgentNotice = isActiveAgent && !isAgentPricingActive && !subLoading;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-2xl">
        <h1 className="text-xl font-display font-bold">Buy Data</h1>

        {/* Live delivery chip */}
        {sysStatus.online && (
          <div className="mb-1">
            <LiveDeliveryChip />
          </div>
        )}

        {!sysStatus.online && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">{sysStatus.message}</p>
          </div>
        )}

        {/* Expired agent notice — normal prices applied */}
        {showExpiredAgentNotice && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                Agent subscription inactive — normal prices applied
              </p>
              <p className="text-[11px] text-muted-foreground">
                Renew your subscription to restore agent pricing.
              </p>
              <Link to="/agent/dashboard" className="text-[11px] font-semibold text-primary hover:underline">
                Renew now →
              </Link>
            </div>
          </div>
        )}


        {useAgentPrices && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Tag className="w-3.5 h-3.5" />
              Agent prices applied
            </div>
            <Link to="/dashboard/bulk-purchase">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7">
                <Layers className="w-3.5 h-3.5" /> Bulk Orders
              </Button>
            </Link>
          </div>
        )}

        {/* Step 1: Select bundle */}
        {step === 1 && (
          <>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedNetwork(null)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors btn-press ${
                  !selectedNetwork ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                }`}
              >
                All
              </button>
              {NETWORKS.map((n) => (
                <button
                  key={n}
                  onClick={() => setSelectedNetwork(n)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors btn-press ${
                    selectedNetwork === n ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[130px] w-full rounded-xl" />
                ))}
              </div>
            ) : activeBundles.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No bundles available</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {activeBundles.map((b) => {
                  const price = getBundlePrice(b);
                  return (
                    <button
                      key={b.id}
                      onClick={() => handleSelectBundle(b)}
                      className="bg-card rounded-xl p-4 border border-border card-shadow-light text-left interactive-card animate-fade-in"
                    >
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${NETWORK_COLORS[b.network as Network] || 'bg-muted'}`}>
                        {b.network}
                      </span>
                      <p className="text-lg font-display font-bold mt-2">{b.bundle_size_gb}GB</p>
                      {b.description && <p className="text-[10px] text-muted-foreground">{b.description}</p>}
                      <p className="text-primary font-semibold text-sm">{formatPrice(price)}</p>
                      <NonExpiryBadge size="xs" className="mt-1" network={b.network} />
                    </button>
                  );
                })}
              </div>
            )}

            <ImportantNotice />
          </>
        )}

        {/* Step 2: Enter phone, choose payment, confirm */}
        {step === 2 && selectedBundle && (
          <>
            {!isNetworkAvailable(selectedBundle.network as Network) && (
              <NetworkUnavailableBanner network={selectedBundle.network} message={getNetworkMessage(selectedBundle.network as Network)} />
            )}

            <div className="bg-secondary rounded-xl p-4 flex items-center justify-between animate-fade-in">
              <div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${NETWORK_COLORS[selectedBundle.network as Network]}`}>
                  {selectedBundle.network}
                </span>
                <p className="font-display font-bold text-lg mt-1">{selectedBundle.bundle_size_gb}GB</p>
              </div>
              <p className="text-xl font-bold text-primary">{formatPrice(getBundlePrice(selectedBundle))}</p>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Recipient Phone Number *</Label>
                <Input
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="0551234567"
                  maxLength={10}
                  className="mt-1"
                  inputMode="tel"
                  disabled={placing}
                />
                {errors.phone ? (
                  <p className="text-sm text-destructive flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" />{errors.phone}</p>
                ) : networkMismatchError ? (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />{networkMismatchError}
                    </p>
                    <p className="text-[10px] text-muted-foreground pl-4">Tip: You may want to switch network</p>
                  </div>
                ) : duplicateBlocked ? (
                  <DuplicateOrderAlert existingOrderId={existingOrderId} />
                ) : (
                  <p className="text-[10px] text-muted-foreground mt-1">⚠️ Check number carefully — no refunds for wrong numbers.</p>
                )}
              </div>

              {/* Payment Method */}
              <div>
                <Label className="mb-2 block">Payment Method</Label>
                <div className="space-y-2">
                  <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    paymentMethod === 'wallet' ? 'border-primary bg-primary/5' : 'border-border'
                  } ${walletBalance < getSellingPrice(selectedBundle) ? 'opacity-60' : ''}`}>
                    <input type="radio" name="dashPayment" checked={paymentMethod === 'wallet'} onChange={() => walletBalance >= getBundlePrice(selectedBundle) && setPaymentMethod('wallet')} disabled={walletBalance < getBundlePrice(selectedBundle)} className="sr-only" />
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'wallet' ? 'border-primary' : 'border-muted-foreground/30'}`}>
                      {paymentMethod === 'wallet' && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    <Wallet className="w-4 h-4 text-primary" />
                    <div className="flex-1">
                      <span className="text-sm font-medium">Wallet</span>
                      <span className="text-xs text-muted-foreground ml-2">({formatPrice(walletBalance)}{walletBalance < getBundlePrice(selectedBundle) ? ' — Insufficient' : ''})</span>
                    </div>
                  </label>

                  <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    paymentMethod === 'paystack' ? 'border-primary bg-primary/5' : 'border-border'
                  }`}>
                    <input type="radio" name="dashPayment" checked={paymentMethod === 'paystack'} onChange={() => setPaymentMethod('paystack')} className="sr-only" />
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'paystack' ? 'border-primary' : 'border-muted-foreground/30'}`}>
                      {paymentMethod === 'paystack' && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    <CreditCard className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1">
                      <span className="text-sm font-medium">Pay with Paystack</span>
                      <span className="text-xs text-muted-foreground ml-2">(MoMo, Card)</span>
                    </div>
                  </label>
                </div>
              </div>

              {paymentMethod === 'wallet' && walletBalance >= getBundlePrice(selectedBundle) && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Instant processing:</strong> Your wallet will be charged and data delivered automatically. If delivery fails, your wallet will be refunded.
                  </p>
                </div>
              )}

              {paymentMethod === 'paystack' && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-start gap-2">
                  <CreditCard className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Secure payment:</strong> You'll be redirected to Paystack. Once payment is confirmed, your data will be delivered automatically.
                  </p>
                </div>
              )}

              <ImportantNotice compact />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setStep(1); setSelectedBundle(null); }} className="flex-1 btn-press" disabled={placing}>
                Change Bundle
              </Button>
              <Button onClick={handleOrder} disabled={placing || walletLoading || !sysStatus.online || !isNetworkAvailable(selectedBundle.network as Network) || !!networkMismatchError || duplicateBlocked} className="flex-1 btn-press gap-2">
                {!sysStatus.online ? (
                  <><AlertTriangle className="w-4 h-4" /> System Offline</>
                ) : !isNetworkAvailable(selectedBundle.network as Network) ? (
                  <><AlertTriangle className="w-4 h-4" /> {selectedBundle.network} Unavailable</>
                ) : placing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {paymentMethod === 'paystack' ? 'Redirecting...' : 'Processing...'}
                  </>
                ) : (
                  <>
                    {paymentMethod === 'wallet' ? <Wallet className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                    {paymentMethod === 'wallet' ? 'Pay & Order' : `Pay — ${formatPrice(getBundlePrice(selectedBundle))}`}
                  </>
                )}
              </Button>
            </div>
          </>
        )}
        {/* Bottom breathing space — clears floating widgets and bottom nav */}
        <div aria-hidden className="h-24 md:h-6" />
      </div>
    </DashboardLayout>
  );
};

export default DashboardBuyData;
