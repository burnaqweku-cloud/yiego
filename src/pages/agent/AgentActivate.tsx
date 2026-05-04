import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAgent } from '@/hooks/useAgent';
import { useSubscription, MONTHLY_STANDARD, MONTHLY_PROMO, YEARLY_STANDARD, YEARLY_PROMO } from '@/hooks/useSubscription';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Layout from '@/components/layout/Layout';
import { toast } from 'sonner';
import {
  CreditCard, Loader2, AlertTriangle, Mail, Rocket, Shield,
  Zap, Sparkles, CheckCircle, Tag, DollarSign, Globe,
  ShoppingCart, TrendingUp, Share2, Users, LifeBuoy,
  Timer, ArrowRight
} from 'lucide-react';
import { getGlobalDailyOrders, getGlobalActiveAgents } from '@/lib/globalActivationStats';

/* ── Live HH:MM:SS Countdown Hook ── */
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
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return { timeLeft, expired };
}

const AgentActivate = () => {
  const { user } = useAuth();
  const { agent, isPending, isActiveAgent, refresh } = useAgent();
  const { isPromoActive, promoExpiresAt } = useSubscription();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const { timeLeft, expired: promoExpired } = useCountdown(promoExpiresAt);

  const [orderCount, setOrderCount] = useState(getGlobalDailyOrders);
  const [agentCount, setAgentCount] = useState(getGlobalActiveAgents);

  useEffect(() => {
    if (isActiveAgent) navigate('/agent/dashboard');
  }, [isActiveAgent, navigate]);

  useEffect(() => {
    const interval = setInterval(() => {
      setOrderCount(getGlobalDailyOrders());
      setAgentCount(getGlobalActiveAgents());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const monthlyPrice = isPromoActive ? MONTHLY_PROMO : MONTHLY_STANDARD;
  const yearlyPrice = isPromoActive ? YEARLY_PROMO : YEARLY_STANDARD;
  const currentPrice = selectedPlan === 'yearly' ? yearlyPrice : monthlyPrice;
  const currentStandard = selectedPlan === 'yearly' ? YEARLY_STANDARD : MONTHLY_STANDARD;

  const payingRef = useRef(false);

  const handlePay = async () => {
    // Double-click guard using ref (survives re-renders)
    if (payingRef.current) return;
    setInitError(null);

    if (!agent || !user) {
      setInitError('You must be logged in with an approved agent account.');
      return;
    }
    if (!user.email) {
      setInitError('Add an email to your profile to continue.');
      return;
    }

    payingRef.current = true;
    setPaying(true);

    try {
      // Refresh session to prevent stale token errors (common on mobile/PWA)
      const { error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) {
        console.warn('[AgentActivate] Session refresh failed:', refreshErr.message);
        // If refresh fails, session may be expired — redirect to login
        setInitError('Your session has expired. Please log in again.');
        toast.error('Session expired. Redirecting to login...');
        setPaying(false);
        payingRef.current = false;
        setTimeout(() => navigate('/auth'), 1500);
        return;
      }

      const callbackUrl = `${window.location.origin}/agent/subscription/callback`;
      const { data, error } = await supabase.functions.invoke('agent-initialize-payment', {
        body: {
          purpose: 'agent_subscription',
          agent_id: agent.id,
          email: user.email,
          callback_url: callbackUrl,
          plan: selectedPlan,
        },
      });

      // supabase.functions.invoke puts non-2xx response bodies in error
      if (error) {
        // Try to extract the actual server error message
        let serverMsg = '';
        try {
          const parsed = typeof error === 'object' && error?.context?.body
            ? JSON.parse(await error.context.body.text?.() || '{}')
            : (typeof error.message === 'string' ? { error: error.message } : {});
          serverMsg = parsed?.error || '';
        } catch { /* ignore parse errors */ }

        // Auth-specific errors
        if (serverMsg.includes('Unauthorized') || serverMsg.includes('session')) {
          setInitError('Your session has expired. Please log in again.');
          toast.error('Session expired. Redirecting to login...');
          setPaying(false);
          payingRef.current = false;
          setTimeout(() => navigate('/auth'), 1500);
          return;
        }

        throw new Error(serverMsg || 'Failed to connect to payment service');
      }

      if (!data?.success || !data?.authorization_url) {
        throw new Error(data?.error || 'Failed to initialize payment. Please try again.');
      }

      // Redirect to Paystack checkout
      window.location.href = data.authorization_url;
    } catch (err: any) {
      const message = err?.message || 'Payment initialization failed. Please try again.';
      setInitError(message);
      toast.error(message);
      setPaying(false);
      payingRef.current = false;
    }
  };

  const whatsappLink = `https://wa.me/233275644195?text=${encodeURIComponent(
    "Hi DataSika Support, I'm an approved agent. My store name is " +
    (agent?.store_name || 'not showing') +
    ". I need help with activating my store subscription."
  )}`;

  if (isPending) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-12">
          <Card><CardContent className="p-8 text-center space-y-4">
            <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto" />
            <h2 className="text-xl font-bold">Application Under Review</h2>
            <p className="text-muted-foreground text-sm">Your application must be approved before you can activate your store.</p>
            <Button variant="outline" onClick={() => navigate('/agent/dashboard')}>Back to Dashboard</Button>
          </CardContent></Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto px-4 py-6 sm:py-10 space-y-4 animate-fade-in">

        {/* ── Header ── */}
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto animate-bounce-gentle">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Activate Store 🎉</h2>
          <p className="text-xs text-muted-foreground">Your store is approved! Activate to start earning.</p>
          <Badge className="bg-primary/10 text-primary border-primary/20 font-semibold text-[10px] px-2.5 py-0.5 animate-glow-subtle">
            <Zap className="w-3 h-3 mr-1" /> Start earning today
          </Badge>
        </div>

        {/* ── Promo Countdown ── */}
        {isPromoActive && !promoExpired && timeLeft && (
          <Card className="card-shadow border-success/30">
            <CardContent className="p-3 text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5">
                <Timer className="w-3.5 h-3.5 text-success" />
                <span className="text-[11px] font-bold text-success">Early Bird Promo</span>
              </div>
              <p className="text-xs font-semibold text-foreground">Ends in: {timeLeft}</p>
              <p className="text-[10px] text-muted-foreground">Lock in discounted pricing before it expires!</p>
            </CardContent>
          </Card>
        )}
        {!isPromoActive && (
          <div className="bg-muted/50 border border-border/50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">Standard pricing applies.</p>
          </div>
        )}

        {/* ── Urgency Warning ── */}
        <div className="flex items-start gap-2 p-2.5 bg-amber-500/8 border border-amber-500/20 rounded-xl">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
            Every day you delay activation, customers who could be buying from your store will buy from other agents.
          </p>
        </div>

        {/* ── Social Proof Stats ── */}
        <Card className="card-shadow border-border/50">
          <CardContent className="p-4 space-y-2.5">
            <div className="text-center">
              <p className="text-xs font-bold text-foreground">Agents are already making daily sales on DataSika.</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="text-center p-3 bg-muted/50 rounded-xl border border-border/50">
                <ShoppingCart className="w-4 h-4 text-primary mx-auto mb-1" />
                <p className="text-lg font-extrabold text-foreground">{orderCount.toLocaleString()}</p>
                <p className="text-[9px] text-muted-foreground font-medium">Today's Orders</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-xl border border-border/50">
                <Users className="w-4 h-4 text-primary mx-auto mb-1" />
                <p className="text-lg font-extrabold text-foreground">{agentCount.toLocaleString()}</p>
                <p className="text-[9px] text-muted-foreground font-medium">Active Agents</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Profit Calculator ── */}
        <Card className="card-shadow border-border/50">
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-primary" /> How much can you earn?
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 bg-muted/40 rounded-xl border border-border/50 space-y-1.5">
                <p className="text-[10px] font-semibold text-foreground">15 sales/day</p>
                <div className="space-y-0.5 text-[10px] text-muted-foreground">
                  <p>Per sale: <span className="font-semibold text-foreground">GHS 1.80</span></p>
                  <p>Monthly: <span className="font-bold text-primary">GHS 810</span></p>
                </div>
              </div>
              <div className="p-3 bg-primary/5 rounded-xl border border-primary/20 space-y-1.5">
                <p className="text-[10px] font-semibold text-foreground">30 sales/day</p>
                <div className="space-y-0.5 text-[10px] text-muted-foreground">
                  <p>Per sale: <span className="font-semibold text-foreground">GHS 2.10</span></p>
                  <p>Monthly: <span className="font-bold text-primary">GHS 1,890</span></p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Plan Selection + CTA Card ── */}
        <Card className="card-shadow overflow-hidden border-primary/30">
          <div className="h-1.5 bg-gradient-to-r from-primary via-accent to-primary" />
          <CardContent className="p-4 space-y-3">
            {/* Plan Selector */}
            <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold text-center">Choose your plan</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSelectedPlan('monthly')}
                className={`p-3 rounded-xl border-2 text-center transition-all ${
                  selectedPlan === 'monthly' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                }`}
              >
                <p className="text-[10px] font-semibold text-foreground">Monthly</p>
                <div className="flex items-baseline justify-center gap-1 mt-1">
                  {isPromoActive && <span className="text-[9px] text-muted-foreground line-through">GHS {MONTHLY_STANDARD}</span>}
                  <span className="text-lg font-extrabold text-primary">GHS {monthlyPrice}</span>
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5">per month</p>
              </button>
              <button
                onClick={() => setSelectedPlan('yearly')}
                className={`p-3 rounded-xl border-2 text-center transition-all relative ${
                  selectedPlan === 'yearly' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                }`}
              >
                <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-success text-success-foreground text-[8px] px-1.5 py-0 border-0">
                  Best Value
                </Badge>
                <p className="text-[10px] font-semibold text-foreground">Yearly</p>
                <div className="flex items-baseline justify-center gap-1 mt-1">
                  {isPromoActive && <span className="text-[9px] text-muted-foreground line-through">GHS {YEARLY_STANDARD}</span>}
                  <span className="text-lg font-extrabold text-primary">GHS {yearlyPrice}</span>
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5">per year</p>
              </button>
            </div>

            {isPromoActive && (
              <div className="text-center">
                <Badge className="bg-success/10 text-success border-success/20 text-[10px] font-semibold px-2.5 py-0.5">
                  Save GHS {(currentStandard - currentPrice).toFixed(2)} (promo)
                </Badge>
              </div>
            )}

            {/* Error display */}
            {initError && (
              <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{initError}</span>
              </div>
            )}

            {/* Missing email warning */}
            {user && !user.email && (
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-700 flex items-start gap-2">
                <Mail className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>Add an email to your profile before subscribing.</span>
              </div>
            )}

            {/* CTA */}
            <div className="space-y-1.5">
              <Button
                onClick={handlePay}
                disabled={paying || !user?.email}
                className="w-full h-auto py-3 px-4 text-sm font-bold bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-primary-foreground shadow-md hover:shadow-lg transition-all duration-200 active:scale-[0.98] rounded-xl"
                size="default"
              >
                {paying ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    Redirecting to payment...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Rocket className="w-4 h-4 shrink-0" />
                    Activate Now & Start Earning
                  </span>
                )}
              </Button>
              <div className="flex items-center justify-center gap-3 text-[9px] text-muted-foreground">
                <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Secure Payment</span>
                <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Instant Activation</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Benefits ── */}
        <Card className="card-shadow border-border/50">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-bold text-foreground">What you get after activation:</p>
            <ul className="space-y-1.5">
              {[
                'Discounted agent prices — buy cheaper than normal users',
                'Set your own selling price — your own profit',
                'Your store link goes live instantly after activation',
                'Customers can buy 24/7 even when you\'re offline',
                'Profit credited automatically on every order',
                'Withdraw earnings anytime',
              ].map((text) => (
                <li key={text} className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                  <span className="text-[11px] text-muted-foreground leading-relaxed">{text}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* ── WhatsApp Support ── */}
        <div className="text-center space-y-1.5 pb-2">
          <p className="text-[10px] text-muted-foreground">
            Need help activating? Chat with DataSika Support on WhatsApp.
          </p>
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5 text-[11px] h-8">
              <LifeBuoy className="w-3.5 h-3.5" />
              Chat Support on WhatsApp
            </Button>
          </a>
        </div>
      </div>
    </Layout>
  );
};

export default AgentActivate;
