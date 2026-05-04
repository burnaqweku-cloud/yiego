import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSubscription, MONTHLY_STANDARD, MONTHLY_PROMO, YEARLY_STANDARD, YEARLY_PROMO } from '@/hooks/useSubscription';
import { useAgentSubscriptionState, type AgentDisplayState } from '@/hooks/useAgentSubscriptionState';
import { useAgent } from '@/hooks/useAgent';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  CreditCard, Calendar, Clock, AlertTriangle, CheckCircle, Loader2, ChevronDown, ChevronUp, Timer, Shield, ShoppingCart, TrendingUp, Wallet, ArrowDownCircle
} from 'lucide-react';

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

const AgentSubscriptionCard = () => {
  const {
    subscription, history, subscriptionState, daysRemaining, loading, refresh,
    isPromoActive, promoExpiresAt, promoContext,
  } = useSubscription();
  const { displayState, timestamps, isStoreActive } = useAgentSubscriptionState();
  const { agent } = useAgent();
  const { user } = useAuth();
  const [paying, setPaying] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [renewPlan, setRenewPlan] = useState<'monthly' | 'yearly'>('monthly');
  const { timeLeft, expired: promoExpired } = useCountdown(promoExpiresAt);
  const { timeLeft: graceTimeLeft } = useCountdown(timestamps.graceEndDate);
  const { timeLeft: promoWindowTimeLeft, expired: promoWindowExpired } = useCountdown(timestamps.promoEndDate);

  const handleSubscribe = async () => {
    if (!agent || !user) return;
    setPaying(true);
    try {
      const { error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) {
        toast.error('Session expired. Please log in again.');
        setPaying(false);
        return;
      }

      const callbackUrl = `${window.location.origin}/agent/subscription/callback`;
      const { data, error } = await supabase.functions.invoke('agent-initialize-payment', {
        body: {
          purpose: 'agent_subscription',
          agent_id: agent.id,
          email: user.email,
          callback_url: callbackUrl,
          plan: renewPlan,
        },
      });

      if (error || !data?.authorization_url) throw new Error(data?.error || 'Failed to start payment');
      window.location.href = data.authorization_url;
    } catch (err: any) {
      toast.error(err.message || 'Payment failed. Please try again.');
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <Card className="card-shadow">
        <CardContent className="p-5">
          <div className="h-20 animate-pulse bg-muted rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  // Show for active (with renewal option) and expired states
  if (subscriptionState !== 'active' && subscriptionState !== 'expired') return null;

  const isExpired = subscriptionState === 'expired';

  // Determine border/header colors based on display state
  const isWarningState = displayState === 'expiring_soon' || displayState === 'grace_period';
  const isExpiredState = displayState === 'expired_promo_window' || displayState === 'expired_standard';
  const borderColor = isExpiredState ? 'border-destructive/20' : isWarningState ? 'border-amber-500/20' : 'border-success/20';
  const barColor = isExpiredState ? 'bg-destructive' : isWarningState ? 'bg-amber-500' : 'bg-success';

  // Renewal pricing: use promo if eligible
  const monthlyPrice = isPromoActive ? MONTHLY_PROMO : MONTHLY_STANDARD;
  const yearlyPrice = isPromoActive ? YEARLY_PROMO : YEARLY_STANDARD;

  // Show renewal options when expiring, grace, or expired
  const showRenewalOptions = displayState === 'expiring_soon' || displayState === 'grace_period' || isExpiredState;

  return (
    <Card className={`card-shadow overflow-hidden ${borderColor}`}>
      <div className={`h-1 ${barColor}`} />
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              isExpiredState ? 'bg-destructive/10' : isWarningState ? 'bg-amber-500/10' : 'bg-success/10'
            }`}>
              {isExpiredState ? (
                <AlertTriangle className="w-5 h-5 text-destructive" />
              ) : isWarningState ? (
                <Timer className="w-5 h-5 text-amber-500" />
              ) : (
                <CheckCircle className="w-5 h-5 text-success" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-sm">
                {displayState === 'active' && 'Subscription Active'}
                {displayState === 'expiring_soon' && 'Subscription Expiring Soon'}
                {displayState === 'grace_period' && 'Grace Period Active'}
                {displayState === 'expired_promo_window' && 'Subscription Expired'}
                {displayState === 'expired_standard' && 'Subscription Expired'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {displayState === 'active' && `${daysRemaining} days remaining`}
                {displayState === 'expiring_soon' && `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left — renew early and save`}
                {displayState === 'grace_period' && 'Store still active — renew now to avoid disruption'}
                {displayState === 'expired_promo_window' && 'Your store is inactive for new orders'}
                {displayState === 'expired_standard' && 'Your store is inactive for new orders'}
              </p>
            </div>
          </div>
          <Badge variant="outline" className={`text-[10px] ${
            isExpiredState ? 'text-destructive border-destructive/30' :
            isWarningState ? 'text-amber-600 border-amber-500/30' :
            'text-success border-success/30'
          }`}>
            {displayState === 'active' && 'Active'}
            {displayState === 'expiring_soon' && 'Expiring'}
            {displayState === 'grace_period' && 'Grace'}
            {displayState === 'expired_promo_window' && 'Expired'}
            {displayState === 'expired_standard' && 'Expired'}
          </Badge>
        </div>

        {/* Exact timestamps */}
        {subscription && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Paid</span>
              </div>
              <p className="text-xs font-semibold">{format(new Date(subscription.paid_at), 'dd MMM yyyy')}</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {isExpiredState ? 'Expired' : 'Expires'}
                </span>
              </div>
              <p className="text-xs font-semibold">{format(new Date(subscription.expiry_date), 'dd MMM yyyy, HH:mm')}</p>
            </div>
          </div>
        )}

        {/* Grace period countdown */}
        {displayState === 'grace_period' && graceTimeLeft && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center space-y-1">
            <div className="flex items-center justify-center gap-1.5">
              <Timer className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">Grace period ends in</span>
            </div>
            <p className="text-lg font-bold text-foreground font-mono">{graceTimeLeft}</p>
            <p className="text-[10px] text-muted-foreground">Store will become inactive after grace period</p>
          </div>
        )}

        {/* Post-grace promo countdown */}
        {displayState === 'expired_promo_window' && !promoWindowExpired && promoWindowTimeLeft && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-center space-y-1">
            <div className="flex items-center justify-center gap-1.5">
              <Timer className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] font-bold text-primary">Renewal promo pricing available</span>
            </div>
            <p className="text-lg font-bold text-foreground font-mono">{promoWindowTimeLeft}</p>
            <p className="text-[10px] text-muted-foreground">Promo pricing ends after this countdown</p>
          </div>
        )}

        {/* Expiring soon promo */}
        {displayState === 'expiring_soon' && isPromoActive && !promoExpired && timeLeft && (
          <div className="bg-success/10 border border-success/20 rounded-xl p-3 text-center space-y-1">
            <div className="flex items-center justify-center gap-1.5">
              <Timer className="w-3.5 h-3.5 text-success" />
              <span className="text-[11px] font-bold text-success">Renew early and save with promo pricing!</span>
            </div>
            <p className="text-xs font-semibold text-foreground">Promo ends in: {timeLeft}</p>
          </div>
        )}

        {/* What still works / what is paused — for expired states */}
        {isExpiredState && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-success/5 border border-success/10 rounded-xl p-3 space-y-1.5">
              <p className="text-[10px] font-bold text-success uppercase tracking-wider">Still Available</p>
              <ul className="text-[10px] text-muted-foreground space-y-1">
                <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-success" /> Dashboard</li>
                <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-success" /> Order History</li>
                <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-success" /> Earnings</li>
                <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-success" /> Withdrawals</li>
                <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-success" /> Renewal</li>
              </ul>
            </div>
            <div className="bg-destructive/5 border border-destructive/10 rounded-xl p-3 space-y-1.5">
              <p className="text-[10px] font-bold text-destructive uppercase tracking-wider">Paused</p>
              <ul className="text-[10px] text-muted-foreground space-y-1">
                <li className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-destructive" /> Store Checkout</li>
                <li className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-destructive" /> Agent Pricing</li>
                <li className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-destructive" /> Bulk Orders</li>
              </ul>
            </div>
          </div>
        )}

        {/* Renewal options */}
        {showRenewalOptions && (
          <>
            {/* Plan selector */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setRenewPlan('monthly')}
                className={`p-2.5 rounded-xl border-2 text-center transition-all ${
                  renewPlan === 'monthly' ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <p className="text-[10px] font-semibold text-foreground">Monthly</p>
                <div className="flex items-baseline justify-center gap-1">
                  {isPromoActive && <span className="text-[9px] text-muted-foreground line-through">GHS {MONTHLY_STANDARD}</span>}
                  <p className="text-sm font-bold text-primary">GHS {monthlyPrice}</p>
                </div>
              </button>
              <button
                onClick={() => setRenewPlan('yearly')}
                className={`p-2.5 rounded-xl border-2 text-center transition-all relative ${
                  renewPlan === 'yearly' ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-success text-success-foreground text-[7px] px-1 py-0 border-0">
                  {isPromoActive ? 'Promo' : 'Save 58%'}
                </Badge>
                <p className="text-[10px] font-semibold text-foreground">Yearly</p>
                <div className="flex items-baseline justify-center gap-1">
                  {isPromoActive && <span className="text-[9px] text-muted-foreground line-through">GHS {YEARLY_STANDARD}</span>}
                  <p className="text-sm font-bold text-primary">GHS {yearlyPrice}</p>
                </div>
              </button>
            </div>

            <Button onClick={handleSubscribe} disabled={paying} variant={isExpiredState ? 'default' : 'outline'} className="w-full">
              {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  {isExpiredState ? 'Renew Now' : 'Renew Early'} — GHS {renewPlan === 'yearly' ? yearlyPrice : monthlyPrice}
                </>
              )}
            </Button>
          </>
        )}

        {/* Subscription History */}
        {history.length > 1 && (
          <div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Subscription History ({history.length})
            </button>
            {showHistory && (
              <div className="mt-2 space-y-1.5">
                {history.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 text-xs">
                    <span>{format(new Date(sub.paid_at), 'dd MMM yyyy')}</span>
                    <span className="font-medium">GHS {Number(sub.plan_price_current).toFixed(2)}</span>
                    <Badge variant={sub.status === 'active' ? 'default' : 'secondary'} className="text-[9px]">
                      {sub.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AgentSubscriptionCard;
