import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { formatPrice, generateOrderId, NETWORK_COLORS, type Network } from '@/data/bundles';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { supabase } from '@/integrations/supabase/client';
import { Smartphone, CheckCircle, Wallet, CreditCard, Loader2, Zap, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import ImportantNotice from '@/components/bundles/ImportantNotice';
import type { DbBundle } from '@/contexts/AdminContext';
import NonExpiryBadge from '@/components/bundles/NonExpiryBadge';
import { useGlobalSystemStatus } from '@/contexts/SystemStatusContext';
import { useNetworkAvailability } from '@/hooks/useNetworkAvailability';
import NetworkUnavailableBanner from '@/components/bundles/NetworkUnavailableBanner';
import { parseEdgeFunctionError } from '@/lib/edge-function-error';
import { sanitizeToastError } from '@/lib/error-sanitizer';

interface PurchaseData {
  bundle: DbBundle;
  recipientPhone: string;
  customerName?: string;
  network: string;
}

const Checkout = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { wallet, loading: walletLoading, refresh: refreshWallet } = useWallet();
  const { status: sysStatus } = useGlobalSystemStatus();
  const { isNetworkAvailable, getNetworkMessage } = useNetworkAvailability();
  const [purchaseData, setPurchaseData] = useState<PurchaseData | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'paystack'>('paystack');
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('datasika_purchase');
    if (stored) {
      setPurchaseData(JSON.parse(stored));
    } else {
      navigate('/buy-data');
    }
  }, [navigate]);

  // Auto-select wallet if user is logged in and has sufficient balance
  useEffect(() => {
    if (user && wallet && purchaseData) {
      const price = Number(purchaseData.bundle.price_ghs);
      if (Number(wallet.balance_ghs) >= price) {
        setPaymentMethod('wallet');
      }
    }
  }, [user, wallet, purchaseData]);

  const handlePlaceOrder = async () => {
    if (!purchaseData) return;

    const network = purchaseData.network as Network;

    if (!sysStatus.online) {
      toast.error(sysStatus.message || 'System is currently offline.');
      return;
    }

    if (!isNetworkAvailable(network)) {
      toast.error(getNetworkMessage(network));
      return;
    }

    setPlacing(true);

    const price = Number(purchaseData.bundle.price_ghs);
    const isWalletPayment = paymentMethod === 'wallet' && user;
    const isPaystackPayment = paymentMethod === 'paystack';

    if (isWalletPayment) {
      // ── WALLET FLOW: create order client-side, process via edge function ──
      if (!wallet || Number(wallet.balance_ghs) < price) {
        toast.error('Insufficient wallet balance');
        setPlacing(false);
        return;
      }

      const orderId = generateOrderId();

      // Insert order directly
      const { data: createdOrder, error: orderErr } = await supabase
        .from('orders')
        .insert({
          order_id: orderId,
          user_id: user.id,
          recipient_number: purchaseData.recipientPhone,
          customer_name: purchaseData.customerName || null,
          network: purchaseData.network,
          product_id: purchaseData.bundle.id,
          bundle_size_gb: purchaseData.bundle.bundle_size_gb,
          amount_ghs: price,
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

      // Store for confirmation page
      sessionStorage.setItem('datasika_order', JSON.stringify({
        orderId: (createdOrder as any).order_id,
        recipientNumber: (createdOrder as any).recipient_number,
        network: (createdOrder as any).network,
        bundleSizeGB: (createdOrder as any).bundle_size_gb,
        amountGHS: (createdOrder as any).amount_ghs,
        status: (createdOrder as any).status,
        paymentMethod: 'wallet',
        createdAt: (createdOrder as any).created_at,
        updatedAt: (createdOrder as any).updated_at,
      }));
      sessionStorage.removeItem('datasika_purchase');

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
        toast.success('Order placed and processing!');
      }

      await refreshWallet();
      navigate('/order-confirmation');

    } else if (isPaystackPayment) {
      // ── PAYSTACK FLOW: server creates order + initializes payment ──
      const callbackUrl = `${window.location.origin}/paystack/callback`;

      const { data, error } = await supabase.functions.invoke('paystack-initialize', {
        body: {
          purpose: 'order',
          product_id: purchaseData.bundle.id,
          recipient_phone: purchaseData.recipientPhone,
          customer_name: purchaseData.customerName || null,
          callback_url: callbackUrl,
          flow: 'checkout',
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

      // Store flow metadata for PaystackCallback
      sessionStorage.setItem('datasika_paystack_meta', JSON.stringify({
        purpose: 'order',
        order_id: data.order_id,
        reference: data.reference,
        flow: 'checkout',
      }));
      sessionStorage.removeItem('datasika_purchase');

      window.location.href = data.authorization_url;
      return;
    }

    setPlacing(false);
  };

  if (!purchaseData) return null;

  const bundle = purchaseData.bundle;
  const price = Number(bundle.price_ghs);
  const isPaystack = paymentMethod === 'paystack';
  const processingFee = isPaystack ? Math.round(price * 0.04 * 100) / 100 : 0;
  const totalPayable = isPaystack ? Math.round((price + processingFee) * 100) / 100 : price;
  const hasWallet = user && wallet;
  const walletBalance = wallet ? Number(wallet.balance_ghs) : 0;
  const canPayWithWallet = hasWallet && walletBalance >= price;

  return (
    <Layout>
      <div className="container py-8 md:py-12 max-w-2xl">
        <h1 className="text-3xl font-display font-bold mb-2">Checkout</h1>
        <p className="text-muted-foreground mb-8">Review your order and confirm payment</p>

        {/* Order summary */}
        <div className="bg-card rounded-2xl p-6 card-shadow border border-border mb-6 animate-fade-in">
          <h2 className="font-display font-semibold text-lg mb-4">Order Summary</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Bundle</span>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${NETWORK_COLORS[bundle.network as Network]}`}>
                  {bundle.network}
                </span>
                <span className="font-semibold">{bundle.bundle_size_gb}GB</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Recipient</span>
              <span className="font-medium flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-muted-foreground" />
                {purchaseData.recipientPhone}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Validity</span>
              <NonExpiryBadge size="sm" network={purchaseData.network} />
            </div>
            <div className="border-t border-border pt-3 mt-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Bundle Price</span>
                <span className="font-medium">{formatPrice(price)}</span>
              </div>
              {isPaystack && processingFee > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">Payment Fee (4%)</span>
                  <span className="font-medium text-sm">{formatPrice(processingFee)}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="font-semibold text-lg">Total</span>
                <span className="font-display font-bold text-xl">{formatPrice(totalPayable)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Payment method */}
        <div className="bg-card rounded-2xl p-6 card-shadow border border-border mb-6 animate-fade-in">
          <h2 className="font-display font-semibold text-lg mb-4">Payment Method</h2>
          <div className="space-y-3">
            {hasWallet && (
              <label
                className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  paymentMethod === 'wallet' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                } ${!canPayWithWallet ? 'opacity-60' : ''}`}
              >
                <input type="radio" name="payment" value="wallet" checked={paymentMethod === 'wallet'} onChange={() => canPayWithWallet && setPaymentMethod('wallet')} disabled={!canPayWithWallet} className="sr-only" />
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'wallet' ? 'border-primary' : 'border-muted-foreground/30'}`}>
                  {paymentMethod === 'wallet' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                </div>
                <Wallet className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <span className="font-medium">Pay with Wallet</span>
                  <p className="text-xs text-muted-foreground">Balance: {formatPrice(walletBalance)}{!canPayWithWallet && ' (Insufficient)'}</p>
                </div>
              </label>
            )}

            <label
              className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                paymentMethod === 'paystack' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
              }`}
            >
              <input type="radio" name="payment" value="paystack" checked={paymentMethod === 'paystack'} onChange={() => setPaymentMethod('paystack')} className="sr-only" />
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'paystack' ? 'border-primary' : 'border-muted-foreground/30'}`}>
                {paymentMethod === 'paystack' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
              </div>
              <CreditCard className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <span className="font-medium">Pay with Paystack</span>
                <p className="text-xs text-muted-foreground">MoMo, Telecel Cash, AirtelTigo Money, or Bank Card</p>
              </div>
              <span className="text-xs font-semibold text-muted-foreground bg-secondary px-2 py-1 rounded-lg">Secure</span>
            </label>
          </div>

          {paymentMethod === 'wallet' && canPayWithWallet && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mt-4 flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Instant processing:</strong> Your wallet will be charged {formatPrice(price)} and the data will be delivered automatically. If delivery fails, your wallet will be automatically refunded.
              </p>
            </div>
          )}

          {paymentMethod === 'paystack' && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mt-4 flex items-start gap-2">
              <CreditCard className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Secure payment:</strong> You'll be redirected to Paystack to complete payment via Mobile Money or card. Once payment is confirmed, your data will be delivered automatically.
              </p>
            </div>
          )}
        </div>

        {/* Important Notice */}
        <div className="mb-6">
          <ImportantNotice compact />
        </div>

        {/* System offline banner */}
        {!sysStatus.online && (
          <div className="mb-6 bg-destructive/10 border border-destructive/20 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">{sysStatus.message}</p>
          </div>
        )}

        {/* Network unavailable banner */}
        {sysStatus.online && !isNetworkAvailable(purchaseData.network as Network) && (
          <div className="mb-6">
            <NetworkUnavailableBanner network={purchaseData.network} message={getNetworkMessage(purchaseData.network as Network)} />
          </div>
        )}

        {/* Place order */}
        <Button
          onClick={handlePlaceOrder}
          disabled={placing || walletLoading || !sysStatus.online || !isNetworkAvailable(purchaseData.network as Network)}
          className="w-full gap-2 text-base py-3 h-auto rounded-xl"
          size="lg"
        >
          {!sysStatus.online ? (
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              System Offline
            </span>
          ) : !isNetworkAvailable(purchaseData.network as Network) ? (
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {purchaseData.network} Unavailable
            </span>
          ) : placing ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </span>
          ) : (
            <>
              {paymentMethod === 'wallet' ? (
                <>
                  <Wallet className="w-5 h-5" />
                  Pay with Wallet — {formatPrice(price)}
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5" />
                  Pay with Paystack — {formatPrice(totalPayable)}
                </>
              )}
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center mt-4">
          By placing this order, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </Layout>
  );
};

export default Checkout;
