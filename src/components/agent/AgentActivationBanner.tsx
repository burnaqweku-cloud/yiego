import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useStoreStatus } from '@/hooks/useStoreStatus';
import { useAgent } from '@/hooks/useAgent';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription, MONTHLY_STANDARD, MONTHLY_PROMO, YEARLY_STANDARD, YEARLY_PROMO } from '@/hooks/useSubscription';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard, Clock, CheckCircle, Rocket, Loader2,
  ShieldOff, XCircle, DollarSign, Tag, TrendingUp,
  Zap, Share2, LifeBuoy, ShoppingCart, Shield,
  AlertTriangle, Sparkles, Globe, Activity, Users, Settings,
  Timer, Wifi, ArrowRight
} from 'lucide-react';
import { getGlobalDailyOrders, getGlobalActiveAgents } from '@/lib/globalActivationStats';

/* ── Live HH:MM:SS Countdown Hook ── */
function useCountdown(targetDate: string | null) {
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!targetDate) {
      setExpired(true);
      setTimeLeft('');
      return;
    }

    const update = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        setExpired(true);
        setTimeLeft('00:00:00');
        return;
      }

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

/* ── Live feed helpers ── */
const NETWORKS_WEIGHTED = [
  ...Array(95).fill('MTN'),
  ...Array(3).fill('AirtelTigo'),
  ...Array(2).fill('Telecel'),
];
const MTN_BUNDLES = ['1GB','2GB','3GB','5GB','10GB','15GB','20GB','25GB','30GB','50GB'];
const OTHER_BUNDLES = ['1GB','2GB','3GB','5GB','10GB'];

const GHANA_FIRST_NAMES = [
  'Kofi','Ama','Kwame','Abena','Kojo','Yaw','Nana','Efua','Akua','Kwesi',
  'Adjoa','Adwoa','Kweku','Afia','Esi','Ekow','Akosua','Mensah','Osei','Asante',
  'Bright','Prince','Grace','Gifty','Mercy','Justice','Wisdom','Collins','Vida','Comfort',
  'Kobby','JNR','Kelvin','Richmond','Desmond','Sandra','Felicia','Harriet','Eugene','Emmanuel',
];
const BRAND_TAGS = [
  'GH','Fast','Pro','Prime','Quick','Smart','King','Boss','24/7','Express',
  'Deals','Link','Top','Net','Plug','Mall','Zone','Sky','Rapid',
];
const BRAND_WORDS = [
  'Nova','Swift','Prime','Bright','Rapid','Alpha','Mega','Ultra','Turbo','Peak',
  'Edge','Apex','Flash','Bolt','Elite','Smart','Nexus','Spark','QuickNet','SkyData',
  'DataKing','DataPlug','RapidData','SmartBundles','PrimeBundles',
];
const SUFFIXES = ['Data','Bundles','Connect','Hub','Data Hub','Data Store','Data Express','Data Spot','Data Mall','Data Deals'];
const GHANA_PLACES = [
  'Osu','East Legon','Madina','Dansoman','Kasoa','Tema','Spintex','Lapaz',
  'Achimota','Kumasi','Tamale','Takoradi',
];

const _recentFeedNames: string[] = [];

function generateStoreName(): string {
  for (let i = 0; i < 25; i++) {
    const name = _pickStoreName();
    if (!_recentFeedNames.includes(name)) {
      _recentFeedNames.push(name);
      if (_recentFeedNames.length > 15) _recentFeedNames.shift();
      return name;
    }
  }
  const fallback = _pickStoreName();
  _recentFeedNames.push(fallback);
  if (_recentFeedNames.length > 15) _recentFeedNames.shift();
  return fallback;
}

function _pickStoreName(): string {
  const roll = Math.random();
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

  if (roll < 0.50) {
    const name = pick(GHANA_FIRST_NAMES);
    const r = Math.random();
    if (r < 0.4) return `${name} ${pick(SUFFIXES)}`;
    if (r < 0.7) return `${name} ${pick(BRAND_TAGS)} Data`;
    return `${name} Data ${pick(['Hub','Store','Express','Deals','Connect'])}`;
  } else if (roll < 0.80) {
    const brand = pick(BRAND_WORDS);
    const r = Math.random();
    if (r < 0.35) return `${brand} GH`;
    if (r < 0.6) return `${brand} ${pick(['Hub','Store','Express'])}`;
    return brand;
  } else {
    return `${pick(GHANA_PLACES)} ${pick(['Data Hub','Data Store','Bundles','Data','Connect'])}`;
  }
}

function generateTimeLabel(): string {
  const r = Math.random();
  if (r < 0.10) return 'just now';
  if (r < 0.20) return `${Math.floor(Math.random() * 8) + 4}s ago`;
  if (r < 0.35) return `${Math.floor(Math.random() * 30) + 12}s ago`;
  if (r < 0.55) return `${Math.floor(Math.random() * 3) + 1}m ago`;
  if (r < 0.75) return `${Math.floor(Math.random() * 3) + 3}m ago`;
  return `${Math.floor(Math.random() * 4) + 6}m ago`;
}

function generateFeedItem() {
  const network = NETWORKS_WEIGHTED[Math.floor(Math.random() * NETWORKS_WEIGHTED.length)];
  const bundles = network === 'MTN' ? MTN_BUNDLES : OTHER_BUNDLES;
  const bundle = bundles[Math.floor(Math.random() * bundles.length)];
  const store = generateStoreName();
  const timeLabel = generateTimeLabel();
  return { network, bundle, store, timeLabel, id: Math.random().toString(36).slice(2) };
}

const AgentActivationBanner = () => {
  const { agent } = useAgent();
  const { storeStatus, loading } = useStoreStatus();
  const { user } = useAuth();
  const { isPromoActive, promoExpiresAt, subscriptionState } = useSubscription();
  const [paying, setPaying] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const navigate = useNavigate();
  const { timeLeft, expired: promoExpired } = useCountdown(promoExpiresAt);

  // Global shared counters
  const [orderCount, setOrderCount] = useState(getGlobalDailyOrders);
  const [agentCount, setAgentCount] = useState(getGlobalActiveAgents);

  // Live feed
  const [feedItems, setFeedItems] = useState(() =>
    Array.from({ length: 5 }, generateFeedItem)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setOrderCount(getGlobalDailyOrders());
      setAgentCount(getGlobalActiveAgents());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const delay = (8 + Math.floor(Math.random() * 18)) * 1000;
      timeout = setTimeout(() => {
        setFeedItems(prev => {
          const idx = Math.floor(Math.random() * prev.length);
          const next = [...prev];
          next[idx] = generateFeedItem();
          return next;
        });
        scheduleNext();
      }, delay);
    };
    scheduleNext();
    return () => clearTimeout(timeout);
  }, []);

  if (loading) {
    return (
      <Card className="card-shadow overflow-hidden">
        <div className="h-1 bg-muted" />
        <CardContent className="p-4 sm:p-5 space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (storeStatus === 'active') return null;

  // ── PENDING REVIEW ──
  if (storeStatus === 'pending_review') {
    return (
      <div className="space-y-4">
        <Card className="card-shadow border-amber-500/30 overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-amber-400 to-amber-600" />
          <CardContent className="p-5 sm:p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6 text-amber-500" />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base">Application Under Review</h3>
                  <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">Pending</Badge>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Your application is being reviewed by our team. You'll be notified once approved — usually within 24 hours.
                </p>
              </div>
            </div>

            <div className="p-3 bg-muted/50 rounded-xl">
              <p className="text-[11px] font-semibold text-muted-foreground mb-2">While you wait:</p>
              <ul className="text-[11px] text-muted-foreground space-y-1.5">
                <li className="flex items-center gap-2"><Settings className="w-3.5 h-3.5 text-primary" /> You can update your Store Settings</li>
                <li className="flex items-center gap-2"><ShieldOff className="w-3.5 h-3.5 text-amber-500" /> Store is not yet live</li>
                <li className="flex items-center gap-2"><XCircle className="w-3.5 h-3.5 text-amber-500" /> Cannot receive customer orders yet</li>
              </ul>
            </div>

            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-success" /><span>Applied</span></div>
              <div className="w-4 h-px bg-border" />
              <div className="flex items-center gap-1 animate-pulse"><Clock className="w-3.5 h-3.5 text-amber-500" /><span className="font-semibold text-amber-600 dark:text-amber-400">Review</span></div>
              <div className="w-4 h-px bg-border" />
              <div className="flex items-center gap-1 opacity-40"><CreditCard className="w-3.5 h-3.5" /><span>Subscribe</span></div>
              <div className="w-4 h-px bg-border" />
              <div className="flex items-center gap-1 opacity-40"><Rocket className="w-3.5 h-3.5" /><span>Go Live</span></div>
            </div>

            <a href={`https://wa.me/233275644195?text=${encodeURIComponent("Hi DataSika Support, I'm an agent. My store name is " + (agent?.store_name || '') + ". I need help with my application review.")}`} target="_blank" rel="noopener noreferrer" className="w-full">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full">
                <LifeBuoy className="w-3.5 h-3.5" /> Need help? Chat on WhatsApp
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── APPROVED NOT SUBSCRIBED / EXPIRED — premium activation experience ──
  const handleSubscribe = async () => {
    if (!agent || !user) return;
    if (!user.email) {
      toast.error('Add an email to your profile to subscribe.');
      return;
    }
    setPaying(true);
    try {
      // Refresh session to prevent stale token errors on mobile/PWA
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
          plan: selectedPlan,
        },
      });
      if (error || !data?.authorization_url) {
        throw new Error(data?.error || 'Failed to initialize payment');
      }
      window.location.href = data.authorization_url;
    } catch (err: any) {
      toast.error(err.message || 'Payment failed. Please try again.');
      setPaying(false);
    }
  };

  // Determine pricing
  const monthlyPrice = isPromoActive ? MONTHLY_PROMO : MONTHLY_STANDARD;
  const yearlyPrice = isPromoActive ? YEARLY_PROMO : YEARLY_STANDARD;
  const currentPrice = selectedPlan === 'yearly' ? yearlyPrice : monthlyPrice;
  const currentStandard = selectedPlan === 'yearly' ? YEARLY_STANDARD : MONTHLY_STANDARD;
  const isExpiredState = storeStatus === 'expired' || subscriptionState === 'expired';

  const whatsappLink = `https://wa.me/233275644195?text=${encodeURIComponent(
    "Hi DataSika Support, I'm an approved agent. My store name is " +
    (agent?.store_name || 'not showing') +
    ". I need help with activation."
  )}`;

  return (
    <div className="space-y-3 animate-fade-in">
      {/* ── Header Card ── */}
      <Card className="card-shadow overflow-hidden border-primary/30">
        <div className="h-1.5 bg-gradient-to-r from-primary via-accent to-primary" />
        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* Header */}
          <div className="text-center space-y-1.5">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            {isExpiredState ? (
              <>
                <h3 className="text-lg font-bold text-foreground">Subscription Expired</h3>
                <p className="text-xs text-muted-foreground">
                  Renew to reactivate your store and continue earning.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-foreground">Your Store is Approved 🎉</h3>
                <p className="text-xs text-muted-foreground">
                  You're one step away from earning daily profit.
                </p>
              </>
            )}
            <Badge className="bg-primary/10 text-primary border-primary/20 font-semibold text-[10px] px-2.5 py-0.5">
              <Zap className="w-3 h-3 mr-1" /> {isExpiredState ? 'Renew now' : 'Start earning today'}
            </Badge>
          </div>

          {/* ── Promo Countdown ── */}
          {isPromoActive && !promoExpired && timeLeft && (
            <div className="bg-success/10 border border-success/20 rounded-xl p-3 text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5">
                <Timer className="w-3.5 h-3.5 text-success" />
                <span className="text-[11px] font-bold text-success">Early Bird Promo</span>
              </div>
              <p className="text-xs font-semibold text-foreground">Ends in: {timeLeft}</p>
              <p className="text-[10px] text-muted-foreground">Lock in discounted pricing before it expires!</p>
            </div>
          )}
          {!isPromoActive && storeStatus === 'approved_not_subscribed' && (
            <div className="bg-muted/50 border border-border/50 rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Promo expired. Standard pricing applies.</p>
            </div>
          )}

          {/* ── Social Proof Stats ── */}
          {!isExpiredState && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-foreground text-center">Agents are already making daily sales on DataSika.</p>
              <p className="text-[10px] text-muted-foreground text-center">Activate now so you don't miss customers buying every day.</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="text-center p-2.5 bg-muted/50 rounded-xl border border-border/50">
                  <ShoppingCart className="w-4 h-4 text-primary mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground tabular-nums">{orderCount.toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground">Today's Platform Orders</p>
                </div>
                <div className="text-center p-2.5 bg-muted/50 rounded-xl border border-border/50">
                  <Users className="w-4 h-4 text-primary mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground tabular-nums">{agentCount.toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground">Active Agents</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Urgency Warning ── */}
          {!isExpiredState && (
            <div className="flex items-start gap-2 p-2.5 bg-amber-500/8 border border-amber-500/20 rounded-xl">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
                ⚠️ Every day you delay activation, customers who could be buying from your store will buy from other agents.
              </p>
            </div>
          )}

          {/* ── Profit Calculator ── */}
          {!isExpiredState && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-foreground">💰 How much can you earn?</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-muted/40 rounded-xl border border-border/50 space-y-1">
                  <p className="text-[10px] font-semibold text-foreground">15 sales/day</p>
                  <div className="text-[9px] text-muted-foreground space-y-0.5">
                    <p>Avg profit/sale: <span className="text-foreground font-medium">GHS 1.80</span></p>
                    <p>Daily: <span className="text-foreground font-medium">GHS 27.00</span></p>
                    <p>Weekly: <span className="text-foreground font-medium">GHS 189.00</span></p>
                    <p>Monthly: <span className="text-success font-bold">GHS 810.00</span></p>
                  </div>
                </div>
                <div className="p-2.5 bg-muted/40 rounded-xl border border-border/50 space-y-1">
                  <p className="text-[10px] font-semibold text-foreground">30 sales/day</p>
                  <div className="text-[9px] text-muted-foreground space-y-0.5">
                    <p>Avg profit/sale: <span className="text-foreground font-medium">GHS 2.10</span></p>
                    <p>Daily: <span className="text-foreground font-medium">GHS 63.00</span></p>
                    <p>Weekly: <span className="text-foreground font-medium">GHS 441.00</span></p>
                    <p>Monthly: <span className="text-success font-bold">GHS 1,890.00</span></p>
                  </div>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground text-center">Your store can receive orders 24/7 even when you're offline.</p>
            </div>
          )}

          {/* ── Plan Selector ── */}
          <div className="space-y-2">
            <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold text-center">Choose your plan</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSelectedPlan('monthly')}
                className={`p-3 rounded-xl border-2 text-center transition-all ${
                  selectedPlan === 'monthly'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/30'
                }`}
              >
                <p className="text-[10px] font-semibold text-foreground">Monthly</p>
                <div className="flex items-baseline justify-center gap-1 mt-1">
                  {isPromoActive && (
                    <span className="text-[9px] text-muted-foreground line-through">GHS {MONTHLY_STANDARD}</span>
                  )}
                  <span className="text-lg font-extrabold text-primary">GHS {monthlyPrice}</span>
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5">per month</p>
              </button>
              <button
                onClick={() => setSelectedPlan('yearly')}
                className={`p-3 rounded-xl border-2 text-center transition-all relative ${
                  selectedPlan === 'yearly'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/30'
                }`}
              >
                <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-success text-success-foreground text-[8px] px-1.5 py-0 border-0">
                  Best Value
                </Badge>
                <p className="text-[10px] font-semibold text-foreground">Yearly</p>
                <div className="flex items-baseline justify-center gap-1 mt-1">
                  {isPromoActive && (
                    <span className="text-[9px] text-muted-foreground line-through">GHS {YEARLY_STANDARD}</span>
                  )}
                  <span className="text-lg font-extrabold text-primary">GHS {yearlyPrice}</span>
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5">per year</p>
              </button>
            </div>
            {isPromoActive && (
              <div className="text-center">
                <Badge className="bg-success/10 text-success border-success/20 text-[10px] font-semibold px-2 py-0.5">
                  Save GHS {(currentStandard - currentPrice).toFixed(2)} {isPromoActive ? '(promo)' : ''}
                </Badge>
              </div>
            )}
          </div>

          {/* ── CTA Button ── */}
          <div className="space-y-1.5">
            <Button
              onClick={handleSubscribe}
              disabled={paying}
              className="w-full h-10 py-2 px-4 text-sm font-bold bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-primary-foreground shadow-md hover:shadow-lg transition-all duration-200 active:scale-[0.98] rounded-xl"
            >
              {paying ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  Redirecting to payment...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Rocket className="w-4 h-4 shrink-0" />
                  {isExpiredState ? 'Renew Now' : 'Activate Now & Start Earning'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              )}
            </Button>
            <div className="flex items-center justify-center gap-3 text-[9px] text-muted-foreground">
              <span className="flex items-center gap-1"><Timer className="w-3 h-3" /> 60-second activation</span>
              <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Secure Payment</span>
            </div>
          </div>

          {/* ── Benefits List ── */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-foreground">What you get after activation:</p>
            <ul className="space-y-1.5">
              {[
                { icon: Tag, text: 'Discounted agent prices — buy cheaper than normal users' },
                { icon: DollarSign, text: 'Set your own selling price — your own profit' },
                { icon: Globe, text: 'Your store link goes live instantly after activation' },
                { icon: ShoppingCart, text: 'Customers can buy 24/7 even when you\'re offline' },
                { icon: TrendingUp, text: 'Profit credited automatically on every order' },
                { icon: Share2, text: 'Withdraw earnings anytime' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-success/10 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle className="w-2.5 h-2.5 text-success" />
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-relaxed">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Progress tracker ── */}
          <div className="flex items-center justify-between text-[9px] text-muted-foreground px-1">
            <div className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-success" /><span>Applied</span></div>
            <div className="flex-1 h-px bg-success mx-1" />
            <div className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-success" /><span>Approved</span></div>
            <div className="flex-1 h-px bg-border mx-1" />
            <div className="flex items-center gap-1 font-semibold text-primary"><CreditCard className="w-3 h-3 text-primary" /><span>Subscribe</span></div>
            <div className="flex-1 h-px bg-border mx-1" />
            <div className="flex items-center gap-1 opacity-40"><Rocket className="w-3 h-3" /><span>Go Live</span></div>
          </div>

          {/* ── WhatsApp Support ── */}
          <div className="text-center pt-2 border-t border-border space-y-1.5">
            <p className="text-[10px] text-muted-foreground">
              Need help activating? Chat with DataSika Support on WhatsApp.
            </p>
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="inline-block">
              <Button variant="outline" size="sm" className="gap-1.5 text-[10px] h-7">
                <LifeBuoy className="w-3 h-3" />
                Chat Support on WhatsApp
              </Button>
            </a>
          </div>

        </CardContent>
      </Card>
    </div>
  );
};

export default AgentActivationBanner;
