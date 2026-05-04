import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import SEOHead from '@/components/seo/SEOHead';
import ImportantNotice from '@/components/bundles/ImportantNotice';
import NetworkUnavailableBanner from '@/components/bundles/NetworkUnavailableBanner';
import { useNetworkAvailability } from '@/hooks/useNetworkAvailability';
import SiteNoticeBanner from '@/components/layout/SiteNoticeBanner';
import { sanitizeToastError } from '@/lib/error-sanitizer';

import StoreHeader from '@/components/store/StoreHeader';
import StoreSystemStatus from '@/components/store/StoreSystemStatus';
import StoreQuickOrder from '@/components/store/StoreQuickOrder';
import StoreBundleGrid from '@/components/store/StoreBundleGrid';
import StoreCheckoutDrawer from '@/components/store/StoreCheckoutDrawer';
import StorePaymentSuccess from '@/components/store/StorePaymentSuccess';
import DataDeliveryLoader from '@/components/store/DataDeliveryLoader';
import { StoreHeaderSkeleton, StoreStatusSkeleton, StoreBundleSkeleton } from '@/components/store/StoreSkeletons';
import { Store as StoreIcon, AlertTriangle, Timer } from 'lucide-react';

interface Product {
  id: string;
  network: string;
  bundle_size_gb: number;
  price_ghs: number;
  agent_price_ghs: number | null;
  cost_price_ghs: number | null;
  description: string;
  delivery_type: string;
  active: boolean;
}

/* ── Countdown hook for promo timer ── */
function useCountdown(targetDate: string | null) {
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!targetDate) { setExpired(true); setTimeLeft(''); return; }
    const update = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) { setExpired(true); setTimeLeft('00:00:00'); return; }
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`);
      setExpired(false);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [targetDate]);
  return { timeLeft, expired };
}

const GRACE_HOURS = 24;
const POST_GRACE_PROMO_HOURS = 24;

type StoreSubState = 'active' | 'grace' | 'expired_promo' | 'expired_standard';

const AgentStore = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const [agent, setAgent] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [agentPricing, setAgentPricing] = useState<any[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState('MTN');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [paymentResult, setPaymentResult] = useState<'success' | 'failed' | null>(null);
  const [orderId, setOrderId] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [storeInactive, setStoreInactive] = useState(false);
  const [storeSubState, setStoreSubState] = useState<StoreSubState>('active');
  const [promoEndDate, setPromoEndDate] = useState<string | null>(null);

  const orderDetailsRef = useRef<{
    network: string;
    bundleSizeGb: number;
    amountPaid: number;
    recipientPhone: string;
    paystackReference: string;
    storeName: string;
    customerName: string;
  } | null>(null);

  const { timeLeft: promoTimeLeft, expired: promoTimerExpired } = useCountdown(promoEndDate);

  // Verify payment on return from Paystack
  useEffect(() => {
    const ref = searchParams.get('trxref') || searchParams.get('reference');
    if (ref && !verifying && !paymentResult) verifyPayment(ref);
  }, [searchParams]);

  useEffect(() => { fetchStoreData(); }, [slug]);

  const fetchStoreData = async () => {
    if (!slug) return;
    setLoading(true);

    const { data: agentData } = await supabase.rpc('get_public_agent_store', { p_slug: slug });
    const agentRecord = agentData && agentData.length > 0 ? agentData[0] : null;
    if (!agentRecord) { setNotFound(true); setLoading(false); return; }
    
    // Check if agent record status is active
    if (agentRecord.status !== 'active') {
      setAgent(agentRecord);
      setStoreInactive(true);
      setLoading(false);
      return;
    }
    
    setAgent(agentRecord);

    // Check subscription status via canonical server-safe RPC
    const { data: stateRows } = await supabase.rpc('get_agent_effective_state' as any, {
      p_agent_id: agentRecord.id,
    });

    const agentState = Array.isArray(stateRows) && stateRows.length > 0 ? (stateRows as any[])[0] : null;

    if (agentState && agentState.can_store_accept_orders) {
      if (agentState.effective_state === 'grace_period') {
        setStoreSubState('grace');
      } else {
        setStoreSubState('active');
      }
    } else if (agentState?.effective_state === 'expired_promo') {
      setStoreSubState('expired_promo');
      if (agentState.promo_end) setPromoEndDate(agentState.promo_end);
      setStoreInactive(true);
    } else {
      // expired_standard, not_found, or query failure — fail-closed
      setStoreSubState('expired_standard');
      setStoreInactive(true);
    }

    const [prodRes, pricingRes] = await Promise.all([
      supabase.from('products').select('*').eq('active', true).order('bundle_size_gb'),
      supabase.rpc('get_agent_store_pricing', { p_agent_id: agentRecord.id }),
    ]);
    if (prodRes.data) setProducts(prodRes.data);
    if (pricingRes.data) setAgentPricing(pricingRes.data);
    setLoading(false);
  };

  const getSellingPrice = useCallback((product: Product) => {
    const productOverride = agentPricing.find((p: any) => p.product_id === product.id);
    if (productOverride?.custom_price && Number(productOverride.custom_price) > 0) {
      return Number(productOverride.custom_price);
    }
    if (productOverride?.markup_percent != null) {
      const base = product.agent_price_ghs || product.cost_price_ghs || product.price_ghs * 0.8;
      return Math.round(base * (1 + Number(productOverride.markup_percent) / 100) * 100) / 100;
    }
    const networkOverride = agentPricing.find(
      (p: any) => p.network === product.network && !p.product_id
    );
    if (networkOverride?.markup_percent != null) {
      const base = product.agent_price_ghs || product.cost_price_ghs || product.price_ghs * 0.8;
      return Math.round(base * (1 + Number(networkOverride.markup_percent) / 100) * 100) / 100;
    }
    return product.price_ghs;
  }, [agentPricing]);

  const handleBuyNow = (product: Product) => {
    setSelectedProduct(product);
    setShowCheckout(true);
  };

  const handleQuickBuy = (product: Product, phone: string, name?: string) => {
    setSelectedProduct(product);
    initiatePayment(product, phone, name);
  };

  const handleDrawerPay = (phone: string, name?: string) => {
    if (!selectedProduct) return;
    initiatePayment(selectedProduct, phone, name);
  };

  const initiatePayment = async (product: Product, phone: string, customerName?: string) => {
    if (!agent) return;
    if (!/^0[2-5][0-9]{8}$/.test(phone)) {
      toast.error('Enter a valid Ghana phone number');
      return;
    }
    // Network availability check is done in StoreQuickOrder/StoreBundleGrid via props

    setPaying(true);
    const sellingPrice = getSellingPrice(product);
    const fee = Math.round(sellingPrice * 0.04 * 100) / 100;
    const totalPayable = Math.round((sellingPrice + fee) * 100) / 100;
    orderDetailsRef.current = {
      network: product.network,
      bundleSizeGb: product.bundle_size_gb,
      amountPaid: sellingPrice,
      recipientPhone: phone,
      paystackReference: '',
      storeName: agent?.store_name || '',
      customerName: customerName || '',
    };

    try {
      const callbackUrl = `${window.location.origin}/store/${slug}`;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-initialize-payment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            purpose: 'agent_order',
            agent_id: agent.id,
            product_id: product.id,
            customer_phone: phone,
            customer_name: customerName || null,
            customer_email: null,
            callback_url: callbackUrl,
          }),
        }
      );
      const data = await res.json();
      console.log('[AgentStore] Payment init response:', res.status, data);
      if (!res.ok || !data?.authorization_url) {
        throw new Error(data?.error || 'Payment could not start. Please try again.');
      }
      setOrderId(data.order_id || '');
      setShowCheckout(false);
      window.location.href = data.authorization_url;
    } catch (err: any) {
      console.error('[AgentStore] Payment init error:', err);
      toast.error(sanitizeToastError(err, 'Payment could not start. Please try again.'));
      setPaying(false);
    }
  };

  const verifyPayment = async (ref: string) => {
    setVerifying(true);
    try {
      const { data } = await supabase.functions.invoke('paystack-verify', { body: { reference: ref } });
      setPaymentResult(data?.verified ? 'success' : 'failed');
      if (data?.order_id) setOrderId(data.order_id);
      if (data?.verified && data?.purpose === 'agent_order') {
        orderDetailsRef.current = {
          network: data.network || '',
          bundleSizeGb: Number(data.bundle_size_gb) || 0,
          amountPaid: Number(data.agent_selling_price) || Number(data.amount_ghs) || 0,
          recipientPhone: data.recipient_phone || '',
          paystackReference: ref,
          storeName: agent?.store_name || '',
          customerName: data.customer_name || '',
        };
      }
    } catch {
      setPaymentResult('failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleBackToStore = () => {
    setPaymentResult(null);
    orderDetailsRef.current = null;
    window.history.replaceState({}, '', `/store/${slug}`);
  };

  // --- Loading State ---
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <StoreHeaderSkeleton />
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
          <StoreStatusSkeleton />
          <StoreBundleSkeleton />
        </div>
      </div>
    );
  }

  // --- Not Found ---
  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm animate-hero-in">
          <div className="w-20 h-20 rounded-3xl bg-secondary flex items-center justify-center mx-auto">
            <StoreIcon className="w-10 h-10 text-muted-foreground/30" />
          </div>
          <h1 className="text-xl font-bold">Store Not Available</h1>
          <p className="text-sm text-muted-foreground">This store does not exist or is not active yet.</p>
        </div>
      </div>
    );
  }

  // --- Store Inactive (subscription expired post-grace OR agent status not active) ---
  if (storeInactive) {
    return (
      <div className="min-h-screen bg-background">
        <StoreHeader agent={agent} />
        <div className="max-w-md mx-auto px-4 py-12">
          <div className="text-center space-y-4 animate-hero-in">
            <div className="w-20 h-20 rounded-3xl bg-amber-500/10 flex items-center justify-center mx-auto">
              <StoreIcon className="w-10 h-10 text-amber-500" />
            </div>
            <h1 className="text-xl font-bold">Store Temporarily Inactive</h1>
            <p className="text-sm text-muted-foreground">
              This agent needs to renew their subscription before accepting new orders. Please check back later.
            </p>

            {/* Show promo countdown if in expired_promo window */}
            {storeSubState === 'expired_promo' && promoEndDate && !promoTimerExpired && (
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-1">
                <div className="flex items-center justify-center gap-1.5">
                  <Timer className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-primary">Renewal promo active for this store</span>
                </div>
                <p className="text-xs text-muted-foreground">Promo pricing ends in: <span className="font-semibold text-foreground">{promoTimeLeft}</span></p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Verifying ---
  if (verifying) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 animate-hero-in">
          <DataDeliveryLoader />
          <p className="font-semibold mt-2">Verifying your payment…</p>
          <p className="text-sm text-muted-foreground">Please wait a moment.</p>
        </div>
      </div>
    );
  }

  // --- Payment Result ---
  if (paymentResult === 'success') {
    const details = orderDetailsRef.current;
    const ref = searchParams.get('trxref') || searchParams.get('reference') || '';
    return (
      <StorePaymentSuccess
        orderId={orderId}
        storeName={details?.storeName || agent?.store_name || 'Agent Store'}
        network={details?.network || '—'}
        bundleSizeGb={details?.bundleSizeGb || 0}
        amountPaid={details?.amountPaid || 0}
        recipientPhone={details?.recipientPhone || '—'}
        paystackReference={details?.paystackReference || ref}
        slug={slug || ''}
        onBackToStore={handleBackToStore}
      />
    );
  }

  if (paymentResult === 'failed') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-card rounded-3xl card-shadow-elevated p-8 text-center space-y-4 animate-hero-in">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold">Payment Failed</h2>
          <p className="text-sm text-muted-foreground">Something went wrong. Please try again.</p>
          <button
            onClick={handleBackToStore}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold btn-press"
          >
            Back to Store
          </button>
        </div>
      </div>
    );
  }

  // --- Main Store ---
  return (
    <div className="min-h-screen bg-background pb-8">
      <SiteNoticeBanner />
      <SEOHead
        title={`${agent?.store_name || 'Agent Store'} — Data Bundles`}
        description={agent?.store_description || 'Buy affordable MTN, Telecel & AirtelTigo data bundles'}
        path={`/store/${slug}`}
        ogImage={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/og-store-image?slug=${encodeURIComponent(slug || '')}&v=2`}
      />

      <StoreHeader agent={agent} />

      {/* Grace period banner */}
      {storeSubState === 'grace' && (
        <div className="max-w-2xl mx-auto px-4 pt-3">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              This store is in a grace period. Service will continue temporarily.
            </p>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <StoreSystemStatus />

        <StoreQuickOrder
          products={products}
          getSellingPrice={getSellingPrice}
          onBuy={handleQuickBuy}
          paying={paying}
          agentWhatsApp={agent?.whatsapp_number}
        />

        <div className="animate-hero-in hero-stagger-4">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">
            All Bundles
          </h2>
        </div>

        <StoreBundleGrid
          products={products}
          selectedNetwork={selectedNetwork}
          onNetworkChange={setSelectedNetwork}
          getSellingPrice={getSellingPrice}
          onBuyNow={handleBuyNow}
        />

        <div className="animate-hero-in hero-stagger-5">
          <ImportantNotice />
        </div>
      </div>

      <StoreCheckoutDrawer
        open={showCheckout}
        onOpenChange={setShowCheckout}
        product={selectedProduct}
        sellingPrice={selectedProduct ? getSellingPrice(selectedProduct) : 0}
        prefillPhone=""
        paying={paying}
        onPay={handleDrawerPay}
        agentWhatsApp={agent?.whatsapp_number}
      />
    </div>
  );
};

export default AgentStore;
