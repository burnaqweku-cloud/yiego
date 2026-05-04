import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import AgentLayout from './AgentLayout';
import AgentGate from '@/components/agent/AgentGate';
import AgentSubscriptionCard from '@/components/agent/AgentSubscriptionCard';
import SEOHead from '@/components/seo/SEOHead';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSubscription, MONTHLY_STANDARD, MONTHLY_PROMO, YEARLY_STANDARD, YEARLY_PROMO } from '@/hooks/useSubscription';
import { useAgentSubscriptionState } from '@/hooks/useAgentSubscriptionState';
import { useAgent } from '@/hooks/useAgent';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Crown, Zap, Store, BarChart3, Wallet, Headphones, Tag, Users,
  CheckCircle2, ShieldCheck, Calendar, Clock, Sparkles, ExternalLink,
  TrendingUp, Receipt, AlertTriangle, Info,
} from 'lucide-react';

const FEATURES = [
  { icon: Store, title: 'Public Storefront', desc: 'Your branded store at yiego.com/store/your-slug' },
  { icon: Tag, title: 'Custom Pricing', desc: 'Set your own selling prices and earn profit per order' },
  { icon: Wallet, title: 'Earnings Wallet', desc: 'Auto-credited profit on every delivered order' },
  { icon: BarChart3, title: 'Analytics & Reports', desc: 'Track sales, profit, customers and trends' },
  { icon: Users, title: 'Customer Management', desc: 'See and manage your customer base' },
  { icon: Zap, title: 'Bulk Orders', desc: 'Process multiple bundles in one go' },
  { icon: Headphones, title: 'Priority Support', desc: 'Faster response on agent issues' },
  { icon: ShieldCheck, title: 'Verified Badge', desc: 'Trust mark visible to your customers' },
];

const AgentSubscription = () => {
  const { subscription, history, subscriptionState, isPromoActive, daysRemaining } = useSubscription();
  const { displayState } = useAgentSubscriptionState();
  const { agent } = useAgent();

  const totalPaid = useMemo(
    () => history.reduce((sum, s) => sum + Number(s.plan_price_current || 0), 0),
    [history]
  );

  const monthlyPrice = isPromoActive ? MONTHLY_PROMO : MONTHLY_STANDARD;
  const yearlyPrice = isPromoActive ? YEARLY_PROMO : YEARLY_STANDARD;
  const yearlySavingsPct = Math.round((1 - YEARLY_STANDARD / (MONTHLY_STANDARD * 12)) * 100);

  const stateLabel = {
    active: { text: 'Active', tone: 'text-success border-success/30 bg-success/10' },
    expiring_soon: { text: 'Expiring Soon', tone: 'text-amber-600 border-amber-500/30 bg-amber-500/10' },
    grace_period: { text: 'Grace Period', tone: 'text-amber-600 border-amber-500/30 bg-amber-500/10' },
    expired_promo_window: { text: 'Expired', tone: 'text-destructive border-destructive/30 bg-destructive/10' },
    expired_standard: { text: 'Expired', tone: 'text-destructive border-destructive/30 bg-destructive/10' },
    never_subscribed: { text: 'Not Subscribed', tone: 'text-muted-foreground border-border bg-muted' },
    pending: { text: 'Pending', tone: 'text-primary border-primary/30 bg-primary/10' },
  }[displayState];

  return (
    <AgentGate>
      <AgentLayout>
        <SEOHead
          title="Subscription | Agent Dashboard | YieGo"
          description="Manage your YieGo agent subscription plan."
          path="/agent/subscription"
          noIndex
        />

        <div className="space-y-5">
          {/* Page header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-lg font-bold">Subscription</h1>
                <Badge variant="outline" className={`text-[10px] ${stateLabel.tone}`}>
                  {stateLabel.text}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Plan, renewals, billing history and what your subscription unlocks</p>
            </div>
          </div>

          {/* Premium hero / plan summary */}
          <Card className="card-shadow overflow-hidden border-primary/20 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 pointer-events-none" />
            <CardContent className="p-5 relative">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-primary/15 ring-1 ring-primary/20 flex items-center justify-center">
                    <Crown className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Agent Plan</p>
                    <h2 className="text-base font-bold">YieGo Reseller</h2>
                  </div>
                </div>
                {isPromoActive && (
                  <Badge className="bg-success text-success-foreground border-0 text-[10px] gap-1">
                    <Sparkles className="w-3 h-3" /> Promo Pricing
                  </Badge>
                )}
              </div>

              {/* Pricing strip */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="surface-premium rounded-2xl p-3 ring-1 ring-border/50">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Monthly</p>
                  <div className="flex items-baseline gap-1.5">
                    {isPromoActive && <span className="text-[10px] text-muted-foreground line-through">GHS {MONTHLY_STANDARD}</span>}
                    <p className="text-lg font-bold text-foreground">GHS {monthlyPrice}</p>
                    <span className="text-[10px] text-muted-foreground">/mo</span>
                  </div>
                </div>
                <div className="surface-premium rounded-2xl p-3 ring-1 ring-primary/30 relative">
                  <Badge className="absolute -top-2 right-2 bg-primary text-primary-foreground text-[9px] px-1.5 py-0 border-0">
                    Save {yearlySavingsPct}%
                  </Badge>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Yearly</p>
                  <div className="flex items-baseline gap-1.5">
                    {isPromoActive && <span className="text-[10px] text-muted-foreground line-through">GHS {YEARLY_STANDARD}</span>}
                    <p className="text-lg font-bold text-foreground">GHS {yearlyPrice}</p>
                    <span className="text-[10px] text-muted-foreground">/yr</span>
                  </div>
                </div>
              </div>

              {/* Quick stats row */}
              {subscription && (
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/50">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Days Left</p>
                    <p className="text-sm font-bold">{subscriptionState === 'active' ? daysRemaining : 0}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Cycles</p>
                    <p className="text-sm font-bold">{history.length}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Total Paid</p>
                    <p className="text-sm font-bold">GHS {totalPaid.toFixed(2)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Existing subscription action card (renew / status / countdowns / history) */}
          <AgentSubscriptionCard />

          {/* Current plan details */}
          {subscription && (
            <Card className="card-shadow">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Receipt className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold">Current Cycle</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <DetailRow icon={Calendar} label="Started" value={format(new Date(subscription.paid_at), 'dd MMM yyyy')} />
                  <DetailRow icon={Clock} label="Expires" value={format(new Date(subscription.expiry_date), 'dd MMM yyyy')} />
                  <DetailRow icon={TrendingUp} label="Paid" value={`GHS ${Number(subscription.plan_price_current).toFixed(2)}`} />
                  <DetailRow
                    icon={Info}
                    label="Reference"
                    value={subscription.paystack_reference ? `${subscription.paystack_reference.slice(0, 10)}…` : '—'}
                  />
                </div>
                {subscriptionState === 'active' && (
                  <p className="text-[11px] text-muted-foreground pt-1">
                    Renews in <span className="font-semibold text-foreground">{formatDistanceToNow(new Date(subscription.expiry_date))}</span>. We'll remind you 7 days before.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* What's included */}
          <Card className="card-shadow">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold">What's Included</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FEATURES.map((f) => (
                  <div key={f.title} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-muted/40 border border-border/50">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <f.icon className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold leading-tight">{f.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{f.desc}</p>
                    </div>
                    <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-1" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Billing history */}
          <Card className="card-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold">Billing History</h3>
                </div>
                <span className="text-[10px] text-muted-foreground">{history.length} record{history.length !== 1 ? 's' : ''}</span>
              </div>
              {history.length === 0 ? (
                <div className="py-8 text-center">
                  <Receipt className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No subscription payments yet</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50 -mx-5">
                  {history.slice(0, 10).map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">{format(new Date(sub.paid_at), 'dd MMM yyyy, HH:mm')}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {sub.paystack_reference ? `Ref: ${sub.paystack_reference.slice(0, 16)}…` : 'No reference'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold">GHS {Number(sub.plan_price_current).toFixed(2)}</p>
                        <Badge
                          variant="outline"
                          className={`text-[9px] mt-0.5 ${
                            sub.status === 'active' ? 'text-success border-success/30' :
                            sub.status === 'pending' ? 'text-primary border-primary/30' :
                            'text-muted-foreground border-border'
                          }`}
                        >
                          {sub.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Important notes */}
          <Card className="card-shadow border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Important Notes</p>
                  <ul className="text-[11px] text-muted-foreground space-y-1 list-disc pl-4">
                    <li>Your store stops accepting new orders if your subscription expires beyond the 24h grace period.</li>
                    <li>Earnings, withdrawals and order history remain accessible at all times — even after expiry.</li>
                    <li>A 4% Paystack processing fee is added to subscription payments.</li>
                    <li>Renewing during the promo window keeps your discounted pricing.</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick links */}
          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="outline" size="sm" className="h-10">
              <Link to="/agent/earnings"><Wallet className="w-3.5 h-3.5 mr-1.5" /> Earnings</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-10">
              <Link to="/agent/support"><Headphones className="w-3.5 h-3.5 mr-1.5" /> Get Help</Link>
            </Button>
            {agent?.store_slug && (
              <Button asChild variant="outline" size="sm" className="h-10 col-span-2">
                <Link to={`/store/${agent.store_slug}`} target="_blank">
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> View My Store
                </Link>
              </Button>
            )}
          </div>
        </div>
      </AgentLayout>
    </AgentGate>
  );
};

const DetailRow = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
  <div className="bg-muted/40 rounded-xl p-3 border border-border/40">
    <div className="flex items-center gap-1.5 mb-1">
      <Icon className="w-3 h-3 text-muted-foreground" />
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{label}</span>
    </div>
    <p className="text-xs font-semibold truncate">{value}</p>
  </div>
);

export default AgentSubscription;
