import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin, type DbBundle } from '@/contexts/AdminContext';
import { usePricing } from '@/hooks/usePricing';
import { NETWORK_COLORS, formatPrice, validateGhanaPhone, type Network } from '@/data/bundles';
import { generateOrderId } from '@/data/bundles';
import {
  ShoppingBag, ArrowRight, Loader2, X,
  Zap, Lock, CreditCard, Wallet, CheckCircle2,
} from 'lucide-react';
import Logo from '@/components/layout/Logo';
import { toast } from 'sonner';
import { parseEdgeFunctionError } from '@/lib/edge-function-error';

/* ─── Mini Quick-Buy Modal ──────────────────────────────────────────── */
interface QuickBuyModalProps {
  onClose: () => void;
  onCheckoutInit: (url: string, orderId: string) => void;
  userId: string;
  userEmail?: string;
}

const NETWORKS: Network[] = ['MTN', 'Telecel', 'AirtelTigo'];

function QuickBuyModal({ onClose, onCheckoutInit, userId, userEmail }: QuickBuyModalProps) {
  const { bundles, loadingBundles } = useAdmin();
  const { getSellingPrice, loadingPricing } = usePricing();

  const [network, setNetwork] = useState<Network>('MTN');
  const [selectedBundle, setSelectedBundle] = useState<DbBundle | null>(null);
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'paystack' | 'wallet'>('paystack');
  const [placing, setPlacing] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [payError, setPayError] = useState('');
  const [wallet, setWallet] = useState<number | null>(null);

  // Load wallet balance
  useEffect(() => {
    supabase.from('wallets').select('balance_ghs').eq('user_id', userId).maybeSingle()
      .then(({ data }) => setWallet(data ? Number(data.balance_ghs) : 0));
  }, [userId]);

  const activeBundles = useMemo(
    () => bundles.filter(b => b.active && b.network === network),
    [bundles, network]
  );

  const handlePhoneChange = (v: string) => {
    setPhone(v.replace(/[^0-9]/g, ''));
    setPhoneError('');
    setPayError('');
  };

  const handleProceed = async () => {
    setPayError('');
    if (!selectedBundle) { toast.error('Please select a bundle'); return; }
    if (!phone.trim()) { setPhoneError('Phone number is required'); return; }
    if (!validateGhanaPhone(phone)) { setPhoneError('Enter a valid Ghana number (e.g. 0551234567)'); return; }

    setPlacing(true);
    const price = getSellingPrice(selectedBundle);

    if (paymentMethod === 'wallet') {
      if ((wallet ?? 0) < price) {
        toast.error('Insufficient wallet balance. Use Paystack instead.');
        setPaymentMethod('paystack');
        setPlacing(false);
        return;
      }
      // Wallet flow
      const orderId = generateOrderId();
      const { error: orderErr } = await supabase.from('orders').insert({
        order_id: orderId,
        user_id: userId,
        recipient_number: phone.trim(),
        network: selectedBundle.network,
        product_id: selectedBundle.id,
        bundle_size_gb: selectedBundle.bundle_size_gb,
        amount_ghs: price,
        status: 'Pending',
        payment_method: 'wallet',
        payment_status: 'paid',
        order_source: 'normal_logged_in',
      } as any);
      if (orderErr) { toast.error('Failed to place order. Try again.'); setPlacing(false); return; }
      const { data: wRes, error: wErr } = await supabase.functions.invoke('process-wallet-order', { body: { order_id: orderId } });
      if (wErr) {
        // Clean up ghost Pending order on failure
        await supabase.from('orders').update({ status: 'Cancelled', failure_reason: 'Wallet processing failed' } as any).eq('order_id', orderId).eq('status', 'Pending');
        const parsed = await parseEdgeFunctionError(wErr);
        toast.error(parsed.message || 'Order processing failed. Please try again.');
        setPlacing(false);
        return;
      }
      if (wRes?.success === false) {
        toast.error(wRes.reason || 'Delivery failed. Please try again.');
      } else {
        toast.success('Order placed! Your data is processing. 🎉');
        sessionStorage.setItem('ds_reward_just_activated', '1');
        onCheckoutInit('', orderId);
      }
      setPlacing(false);
      return;
    }

    // Paystack flow
    if (!userEmail) {
      toast.error('Please add an email to your profile to pay with MoMo/Card.');
      setPlacing(false);
      return;
    }

    try {
      const callbackUrl = `${window.location.origin}/paystack/callback`;
      const payload = {
        purpose: 'order',
        product_id: selectedBundle.id,
        recipient_phone: phone.trim(),
        callback_url: callbackUrl,
        flow: 'checkout',
        email: userEmail,
      };

      console.log('[RewardActivation] Paystack init payload:', payload);

      const { data, error } = await supabase.functions.invoke('paystack-initialize', {
        body: payload,
      });

      console.log('[RewardActivation] Paystack init response:', { data, error });

      if (error) {
        console.error('[RewardActivation] Edge function error:', error);
        setPayError('Payment could not start. Please try again.');
        setPlacing(false);
        return;
      }

      if (!data?.success) {
        console.error('[RewardActivation] Paystack init failed:', data);
        setPayError('Payment could not start. Please try again.');
        setPlacing(false);
        return;
      }

      if (!data?.authorization_url) {
        console.error('[RewardActivation] Missing authorization_url:', data);
        setPayError('Payment could not start. Please try again.');
        setPlacing(false);
        return;
      }

      sessionStorage.setItem('yiego_paystack_meta', JSON.stringify({
        purpose: 'order',
        order_id: data.order_id,
        reference: data.reference,
        flow: 'checkout',
      }));

      window.location.href = data.authorization_url;
    } catch (err) {
      console.error('[RewardActivation] Unexpected error during Paystack init:', err);
      setPayError('Payment could not start. Please try again.');
      setPlacing(false);
    }
  };

  const isLoading = loadingBundles || loadingPricing;
  const selectedPrice = selectedBundle ? getSellingPrice(selectedBundle) : null;

  return (
    /* Backdrop — full screen overlay, modal centered, WhatsApp widget hidden via pointer-events */
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      {/* Modal container — max-height 85vh, scrollable internally */}
      <div
        className="w-full max-w-sm rounded-3xl flex flex-col overflow-hidden"
        style={{
          maxHeight: '85vh',
          background: 'linear-gradient(160deg, hsl(222 40% 10%), hsl(222 40% 8%))',
          border: '1px solid rgba(245,158,11,0.2)',
          boxShadow: '0 20px 80px rgba(0,0,0,0.9)',
          animation: 'qb-slide-up 0.28s cubic-bezier(.22,1,.36,1) both',
        }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`
          @keyframes qb-slide-up {
            from { opacity:0; transform:translateY(32px) scale(0.97); }
            to   { opacity:1; transform:translateY(0) scale(1); }
          }
        `}</style>

        {/* Header — fixed within modal */}
        <div
          className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div>
            <p className="text-white font-black text-sm">Buy Your First Bundle</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Unlocks your 25GB reward ladder
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:bg-white/10 active:bg-white/15"
            style={{ color: 'rgba(255,255,255,0.5)' }}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 pt-4 pb-2 space-y-4">

          {/* Network Selector */}
          <div>
            <p className="text-[10px] font-black mb-2 tracking-wider" style={{ color: 'rgba(255,255,255,0.45)' }}>SELECT NETWORK</p>
            <div className="flex gap-2">
              {NETWORKS.map(n => (
                <button
                  key={n}
                  onClick={() => { setNetwork(n); setSelectedBundle(null); }}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black transition-all"
                  style={{
                    background: network === n ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.04)',
                    border: network === n ? '1.5px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.08)',
                    color: network === n ? '#fbbf24' : 'rgba(255,255,255,0.45)',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Bundle Grid */}
          <div>
            <p className="text-[10px] font-black mb-2 tracking-wider" style={{ color: 'rgba(255,255,255,0.45)' }}>SELECT BUNDLE</p>
            {isLoading ? (
              <div className="grid grid-cols-3 gap-2">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
                ))}
              </div>
            ) : activeBundles.length === 0 ? (
              <p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
                No bundles available for {network}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {activeBundles.slice(0, 12).map(b => {
                  const price = getSellingPrice(b);
                  const isSelected = selectedBundle?.id === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setSelectedBundle(b)}
                      className="py-3 px-2 rounded-xl text-center transition-all"
                      style={{
                        background: isSelected ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.04)',
                        border: isSelected ? '1.5px solid rgba(245,158,11,0.55)' : '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <p className="text-sm font-black leading-tight" style={{ color: isSelected ? '#fbbf24' : '#fff' }}>
                        {b.bundle_size_gb}GB
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: isSelected ? '#fcd34d' : 'rgba(255,255,255,0.4)' }}>
                        GHS {price.toFixed(2)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Phone */}
          <div>
            <p className="text-[10px] font-black mb-2 tracking-wider" style={{ color: 'rgba(255,255,255,0.45)' }}>RECIPIENT NUMBER</p>
            <input
              type="tel"
              value={phone}
              onChange={e => handlePhoneChange(e.target.value)}
              placeholder="0551234567"
              maxLength={10}
              inputMode="tel"
              className="w-full h-11 rounded-xl px-4 text-sm font-medium outline-none transition-all"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: phoneError ? '1.5px solid rgba(239,68,68,0.6)' : '1px solid rgba(255,255,255,0.12)',
                color: '#fff',
              }}
            />
            {phoneError && (
              <p className="text-xs mt-1.5" style={{ color: '#f87171' }}>{phoneError}</p>
            )}
            <p className="text-[10px] mt-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
              ⚠️ Double-check — no refunds for wrong numbers.
            </p>
          </div>

          {/* Payment Method */}
          <div>
            <p className="text-[10px] font-black mb-2 tracking-wider" style={{ color: 'rgba(255,255,255,0.45)' }}>PAYMENT METHOD</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setPaymentMethod('paystack'); setPayError(''); }}
                className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: paymentMethod === 'paystack' ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.04)',
                  border: paymentMethod === 'paystack' ? '1.5px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  color: paymentMethod === 'paystack' ? '#fbbf24' : 'rgba(255,255,255,0.45)',
                }}
              >
                <CreditCard className="w-3.5 h-3.5" />
                MoMo / Card
              </button>
              <button
                onClick={() => { setPaymentMethod('wallet'); setPayError(''); }}
                className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: paymentMethod === 'wallet' ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.04)',
                  border: paymentMethod === 'wallet' ? '1.5px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  color: paymentMethod === 'wallet' ? '#fbbf24' : 'rgba(255,255,255,0.45)',
                }}
              >
                <Wallet className="w-3.5 h-3.5" />
                Wallet {wallet !== null ? `(${formatPrice(wallet)})` : ''}
              </button>
            </div>
          </div>

          {/* Price summary */}
          {selectedPrice !== null && (
            <div
              className="flex items-center justify-between px-3 py-2.5 rounded-xl"
              style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}
            >
              <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {selectedBundle?.bundle_size_gb}GB · {network}
              </span>
              <span className="text-sm font-black" style={{ color: '#fbbf24' }}>
                GHS {selectedPrice.toFixed(2)}
              </span>
            </div>
          )}

          {/* Pay error (inline, keeps selections) */}
          {payError && (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              <span className="text-xs" style={{ color: '#f87171' }}>{payError}</span>
            </div>
          )}

        </div>

        {/* Footer CTA — always pinned inside modal, safe padding for iOS */}
        <div
          className="px-5 pt-3 pb-5 shrink-0"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.07)',
            paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
          }}
        >
          <button
            onClick={handleProceed}
            disabled={placing || !selectedBundle}
            className="w-full py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: placing || !selectedBundle
                ? 'rgba(245,158,11,0.25)'
                : 'linear-gradient(135deg, hsl(45 100% 50%), hsl(44 100% 60%))',
              color: '#1a1a0a',
              boxShadow: placing || !selectedBundle ? 'none' : '0 4px 24px rgba(245,158,11,0.35)',
            }}
          >
            {placing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {paymentMethod === 'paystack' ? 'Opening Paystack…' : 'Processing…'}
              </>
            ) : (
              <>
                Continue to Payment
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── MAIN PAGE ─────────────────────────────────────────────────────── */
export default function RewardActivation() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [referrerName, setReferrerName] = useState<string>('a friend');
  const [showModal, setShowModal] = useState(false);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);

  // Hide WhatsApp widget while modal is open
  useEffect(() => {
    if (showModal) {
      document.body.classList.add('modal-open-wa-hide');
    } else {
      document.body.classList.remove('modal-open-wa-hide');
    }
    return () => document.body.classList.remove('modal-open-wa-hide');
  }, [showModal]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/auth?next=/reward-activation', { replace: true }); return; }

    // Clear referral routing flags — user successfully landed on /reward-activation
    localStorage.removeItem('ds_referral_source');
    localStorage.removeItem('ds_referral_code');
    localStorage.removeItem('ds_referral_ts');

    const run = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('reward_activated, referred_by, email, referral_qualified')
        .eq('id', user.id)
        .maybeSingle();

      // If already qualified (first order done), go to reward ladder
      if (profile?.referral_qualified || profile?.reward_activated) {
        navigate('/dashboard/referral', { replace: true });
        return;
      }
      if (!profile?.referred_by) {
        navigate('/dashboard', { replace: true });
        return;
      }

      const email = profile?.email || user.email;
      if (email) setUserEmail(email);

      const { data: ref } = await supabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', profile.referred_by)
        .maybeSingle();
      if (ref) setReferrerName(ref.username ?? ref.full_name ?? 'a friend');

      setChecking(false);
    };
    run();
  }, [user, authLoading, navigate]);

  const handleWalletSuccess = (_url: string, orderId: string) => {
    setTimeout(() => {
      const activated = sessionStorage.getItem('ds_reward_just_activated');
      if (activated) {
        sessionStorage.removeItem('ds_reward_just_activated');
        navigate('/reward-unlocked', { replace: true });
      } else {
        navigate(`/dashboard/orders/${orderId}`);
      }
    }, 800);
  };

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(222 47% 6%)' }}>
        <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(160deg, hsl(222 47% 6%) 0%, hsl(222 42% 9%) 55%, hsl(222 38% 12%) 100%)' }}
    >
      <style>{`
        @keyframes ra-fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ra-glow-pulse {
          0%,100% { box-shadow: 0 0 0 0 hsl(45 100% 50% / 0.28), 0 4px 24px rgba(245,158,11,0.35); }
          50%      { box-shadow: 0 0 0 8px hsl(45 100% 50% / 0), 0 4px 32px rgba(245,158,11,0.55); }
        }
        @keyframes ra-orb {
          0%,100% { opacity: 0.09; transform: scale(1); }
          50%      { opacity: 0.16; transform: scale(1.05); }
        }
        @keyframes ra-lock-bounce {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-3px); }
        }
        .ra-fade-1 { animation: ra-fade-up 0.4s ease-out 0.05s both; }
        .ra-fade-2 { animation: ra-fade-up 0.4s ease-out 0.15s both; }
        .ra-fade-3 { animation: ra-fade-up 0.4s ease-out 0.25s both; }
        .ra-fade-4 { animation: ra-fade-up 0.4s ease-out 0.35s both; }
        .ra-cta    { animation: ra-glow-pulse 2.8s ease-in-out infinite; }
        .ra-lock   { animation: ra-lock-bounce 3s ease-in-out infinite; }
        .ra-tier-first { background: rgba(205,127,50,0.18) !important; border-color: rgba(205,127,50,0.5) !important; }
        .ra-tier-first svg { color: #cd7f32 !important; }
      `}</style>

      {/* Ambient orb */}
      <div
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[280px] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(ellipse, hsl(45 100% 50% / 0.07), transparent 65%)', animation: 'ra-orb 7s ease-in-out infinite' }}
        aria-hidden
      />

      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-white/5 backdrop-blur-md" style={{ background: 'hsl(222 47% 6% / 0.9)' }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/">
            <Logo height="h-7" />
          </Link>
          <Link to="/dashboard" className="text-sm font-medium transition-colors" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Dashboard
          </Link>
        </div>
      </nav>

      {/* Scrollable content */}
      <main
        className="flex-1 overflow-y-auto px-4 pt-6"
        style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-sm mx-auto w-full space-y-4">

          {/* ── Hero header ── */}
          <div className="ra-fade-1 text-center">
            {/* Referrer pill */}
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-4"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#fcd34d' }}
            >
              <Zap className="w-3 h-3" />
              Invited by {referrerName}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight mb-2">
              Unlock Your 25GB Rewards
            </h1>
            <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Make your first purchase to unlock your reward ladder instantly.
            </p>

            {/* Trust bullets */}
            <div className="flex items-center justify-center flex-wrap gap-x-3 gap-y-1">
              {['Instant delivery', 'Secure Paystack checkout', 'MTN, Telecel, AirtelTigo'].map(t => (
                <span key={t} className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  <CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: 'rgba(74,222,128,0.7)' }} />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* ── Locked ladder card ── */}
          <div className="ra-fade-2 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-2.5 mb-3">
              <div
                className="ra-lock w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}
              >
                <Lock className="w-4 h-4 text-yellow-400" />
              </div>
              <div>
                <p className="text-xs font-black text-white">Reward Ladder is Locked</p>
                <p className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Up to 25GB in free data waiting for you
                </p>
              </div>
            </div>

            {/* Ladder tiers */}
            <div className="relative flex items-center justify-center gap-2 py-2">
              <div className="absolute inset-x-0 top-1/2 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              {[
                { label: '1GB', color: '#cd7f32', first: true },
                { label: '5GB', color: '#94a3b8' },
                { label: '10GB', color: '#f59e0b' },
                { label: '15GB', color: '#67e8f9' },
                { label: '25GB', color: '#fbbf24' },
              ].map((t, i) => (
                <div key={i} className="relative flex flex-col items-center gap-1 z-10">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${t.first ? 'ra-tier-first' : ''}`}
                    style={{
                      background: t.first ? undefined : 'rgba(255,255,255,0.04)',
                      border: t.first ? undefined : `1.5px solid ${t.color}22`,
                    }}
                  >
                    <Lock className="w-3.5 h-3.5" style={{ color: t.first ? '#cd7f32' : `${t.color}40` }} />
                  </div>
                  <span className="text-[9px] font-black" style={{ color: t.first ? `${t.color}95` : `${t.color}38` }}>
                    {t.label}
                  </span>
                  {t.first && (
                    <span className="text-[8px] font-black" style={{ color: '#cd7f3280' }}>NEXT</span>
                  )}
                </div>
              ))}
            </div>

            <p className="text-[10px] text-center mt-1 font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Your rewards unlock right after your first purchase.
            </p>
          </div>

          {/* ── How it works ── */}
          <div className="ra-fade-3 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-[10px] font-black tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>HOW IT WORKS</p>
            <div className="space-y-2">

              {/* Step 1 — done */}
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)' }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shrink-0"
                  style={{ background: 'rgba(74,222,128,0.18)', border: '1.5px solid rgba(74,222,128,0.4)', color: '#4ade80' }}
                >
                  ✓
                </div>
                <p className="text-xs font-semibold" style={{ color: '#4ade80' }}>You Registered</p>
                <span
                  className="ml-auto text-[9px] font-black px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}
                >
                  DONE
                </span>
              </div>

              {/* Step 2 — active NOW */}
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1.5px solid rgba(245,158,11,0.3)' }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shrink-0"
                  style={{ background: 'rgba(245,158,11,0.18)', border: '1.5px solid rgba(245,158,11,0.5)', color: '#fbbf24' }}
                >
                  2
                </div>
                <p className="text-xs font-bold text-white">Buy Any Data Bundle</p>
                <span
                  className="ml-auto text-[9px] font-black px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(245,158,11,0.2)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.4)' }}
                >
                  NOW
                </span>
              </div>

              {/* Step 3 — locked */}
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }}
                >
                  <Lock className="w-3 h-3" />
                </div>
                <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Refer Friends &amp; Climb to 25GB
                </p>
              </div>

            </div>
          </div>

          {/* ── In-page CTA ── */}
          <div className="ra-fade-4 space-y-3 pb-2">
            <button
              onClick={() => setShowModal(true)}
              className="ra-cta w-full py-4 flex items-center justify-center gap-2.5 rounded-2xl font-black text-base transition-all"
              style={{
                background: 'linear-gradient(135deg, hsl(45 100% 50%), hsl(44 100% 60%))',
                color: '#1a1a0a',
              }}
            >
              <ShoppingBag className="w-5 h-5 shrink-0" />
              Buy First Bundle (Unlock Rewards)
              <ArrowRight className="w-5 h-5 shrink-0" />
            </button>

            <p className="text-center text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.38)' }}>
              Your first purchase unlocks rewards instantly.
            </p>

            <div className="text-center">
              <Link
                to="/dashboard"
                className="inline-block text-xs py-2 transition-colors"
                style={{ color: 'rgba(255,255,255,0.28)' }}
              >
                Skip for now
              </Link>
            </div>
          </div>

        </div>
      </main>

      {/* Quick Buy Modal — z-[100] so it sits above WhatsApp widget */}
      {showModal && user && (
        <QuickBuyModal
          onClose={() => setShowModal(false)}
          onCheckoutInit={handleWalletSuccess}
          userId={user.id}
          userEmail={userEmail || user.email}
        />
      )}
    </div>
  );
}
