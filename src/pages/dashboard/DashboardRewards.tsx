import { useState, useMemo } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import SEOHead from '@/components/seo/SEOHead';
import { useLoyalty, usePointTransactions, useLoyaltyReferrals, useLoyaltyRedemptions, tierVisual } from '@/hooks/useLoyalty';
import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Sparkles, TrendingUp, Gift, Users, History, Copy, Share2, Wallet as WalletIcon, ArrowRight, Crown, Award, Star, ShieldAlert, Zap, Calendar } from 'lucide-react';
import { formatPrice } from '@/data/bundles';
import { format, formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const TierIcon = ({ tier, className }: { tier: string; className?: string }) => {
  const map: Record<string, any> = { bronze: Award, silver: Star, gold: Crown, platinum: Sparkles };
  const Icon = map[tier] || Award;
  return <Icon className={className} />;
};

const RewardsHero = () => {
  const { account, currentTierConfig, nextTierConfig, progressToNextTier, ghsRemainingToNext, pointsValueGhs, loading } = useLoyalty();

  if (loading) return <Skeleton className="h-56 w-full rounded-2xl" />;

  const tier = account?.current_tier || 'bronze';
  const visual = tierVisual(tier);

  return (
    <div className="surface-premium rounded-2xl overflow-hidden relative">
      <div className={`absolute -top-20 -right-20 w-60 h-60 rounded-full opacity-25 blur-3xl pointer-events-none bg-gradient-to-br ${visual.gradient}`} />
      <div className={`absolute -bottom-24 -left-12 w-48 h-48 rounded-full opacity-15 blur-3xl pointer-events-none bg-gradient-to-tr ${visual.gradient}`} />

      <div className="p-5 md:p-6 relative">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${visual.gradient} flex items-center justify-center shadow-lg`}>
              <TierIcon tier={tier} className="w-6 h-6 text-foreground" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Your tier</p>
              <p className="text-xl font-display font-bold tracking-tight">{currentTierConfig?.display_name || 'Bronze'}</p>
            </div>
          </div>
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Zap className="w-3 h-3" />
            {currentTierConfig?.point_multiplier || 1}× points
          </Badge>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Points balance</p>
          <div className="flex items-baseline gap-3">
            <p className="text-5xl font-display font-bold tracking-tight tabular">{(account?.points_balance || 0).toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">≈ {formatPrice(pointsValueGhs)}</p>
          </div>
        </div>

        {nextTierConfig ? (
          <div className="mt-5 p-3 rounded-xl bg-secondary/50 border border-border/50">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-muted-foreground">
                Spend <span className="font-semibold text-foreground">{formatPrice(ghsRemainingToNext)}</span> more to reach
              </span>
              <span className="font-semibold">{nextTierConfig.display_name}</span>
            </div>
            <Progress value={progressToNextTier} className="h-2" />
          </div>
        ) : (
          <div className="mt-5 p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center gap-2 text-sm">
            <Crown className="w-4 h-4 text-primary" />
            <span className="font-medium">You've reached the highest tier!</span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          <div className="p-2 rounded-lg bg-secondary/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Earned</p>
            <p className="text-sm font-bold tabular">{(account?.lifetime_points_earned || 0).toLocaleString()}</p>
          </div>
          <div className="p-2 rounded-lg bg-secondary/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Redeemed</p>
            <p className="text-sm font-bold tabular">{(account?.lifetime_points_redeemed || 0).toLocaleString()}</p>
          </div>
          <div className="p-2 rounded-lg bg-secondary/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Spent</p>
            <p className="text-sm font-bold tabular">{formatPrice(account?.lifetime_spend_ghs || 0)}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const EarnTab = () => {
  const { settings, currentTierConfig, tiers } = useLoyalty();
  if (!settings) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const earnRules = [
    { icon: Sparkles, title: 'Buy data bundles', desc: `Earn ${settings.points_per_ghs} pt per GHS spent (min ${formatPrice(settings.min_order_ghs_for_points)} order)` },
    { icon: Users, title: 'Refer a friend', desc: `Get ${settings.referral_bonus_referrer_points} pts when they place their first order` },
    { icon: Calendar, title: 'Birthday bonus', desc: `${settings.birthday_bonus_points} bonus points on your birthday` },
    { icon: Zap, title: 'Tier multipliers', desc: `Up to ${Math.max(...tiers.map(t => t.point_multiplier), 1)}× points as you climb tiers` },
  ];

  return (
    <div className="space-y-3">
      <div className="surface-premium rounded-2xl p-5">
        <h3 className="font-display font-bold text-lg mb-3">How to earn</h3>
        <div className="space-y-3">
          {earnRules.map((r, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-secondary/40">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
                <r.icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">{r.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="surface-premium rounded-2xl p-5">
        <h3 className="font-display font-bold text-lg mb-3">Tiers</h3>
        <div className="space-y-2">
          {tiers.map((t) => {
            const visual = tierVisual(t.tier_name);
            const isCurrent = currentTierConfig?.tier_name === t.tier_name;
            return (
              <div key={t.id} className={`flex items-center gap-3 p-3 rounded-xl border ${isCurrent ? 'border-primary bg-primary/5' : 'border-border/60 bg-secondary/30'}`}>
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${visual.gradient} flex items-center justify-center shrink-0`}>
                  <TierIcon tier={t.tier_name} className="w-5 h-5 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{t.display_name}</p>
                    {isCurrent && <Badge variant="default" className="text-[9px] h-4 px-1.5">Current</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">From {formatPrice(t.min_lifetime_spend)} lifetime spend · {t.point_multiplier}× points</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const RedeemTab = () => {
  const { account, settings, pointsValueGhs, refresh } = useLoyalty();
  const { refresh: refreshWallet } = useWallet();
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState('');
  const [loading, setLoading] = useState(false);

  if (!account || !settings) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const minRedeem = 100;
  const maxRedeemable = account.points_balance;
  const ghsValue = Number(points || 0) * settings.points_to_ghs_rate;

  const handleRedeem = async () => {
    const pts = parseInt(points, 10);
    if (!pts || pts < minRedeem) return toast.error(`Minimum redemption is ${minRedeem} points`);
    if (pts > maxRedeemable) return toast.error('Insufficient points');

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('redeem_loyalty_points', {
        p_points: pts,
        p_type: 'wallet_credit',
      } as any);
      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.message || result?.error || 'Redemption failed');

      toast.success(`Redeemed ${pts.toLocaleString()} pts → ${formatPrice(ghsValue)} wallet credit`);
      setOpen(false);
      setPoints('');
      await Promise.all([refresh(), refreshWallet()]);
    } catch (e: any) {
      toast.error(e?.message || 'Could not redeem points');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="surface-premium rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-display font-bold text-lg">Redeem points</h3>
            <p className="text-xs text-muted-foreground">{settings.points_to_ghs_rate} GHS per point · {minRedeem} pts minimum</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Available</p>
            <p className="text-sm font-bold tabular">{account.points_balance.toLocaleString()} pts</p>
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => setOpen(true)}
            disabled={account.points_balance < minRedeem}
            className="w-full p-4 rounded-xl border border-border/60 bg-secondary/40 hover:bg-secondary/70 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center">
                <WalletIcon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">Convert to wallet credit</p>
                <p className="text-xs text-muted-foreground">Use balance for any purchase</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          <div className="p-4 rounded-xl border border-dashed border-border/60 bg-secondary/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <Gift className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">Direct bundle discount</p>
                <p className="text-xs text-muted-foreground">Apply at checkout — coming to bundle cards soon</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-info/10 border border-info/20 flex items-start gap-2 text-xs">
          <ShieldAlert className="w-4 h-4 text-info shrink-0 mt-0.5" />
          <span className="text-foreground/80">
            Up to {settings.max_redeem_percent_per_order}% of an order can be paid with points.
          </span>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redeem to wallet</DialogTitle>
            <DialogDescription>
              Convert points to GHS wallet credit. {settings.points_to_ghs_rate} GHS = 1 point.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Points to redeem</label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder={String(minRedeem)}
                value={points}
                onChange={(e) => setPoints(e.target.value.replace(/[^0-9]/g, ''))}
                min={minRedeem}
                max={maxRedeemable}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Wallet credit: <span className="font-semibold text-foreground tabular">{formatPrice(ghsValue)}</span>
              </p>
            </div>
            <div className="flex gap-2">
              {[100, 500, 1000, account.points_balance].filter((v, i, a) => v >= minRedeem && v <= maxRedeemable && a.indexOf(v) === i).slice(0, 4).map(v => (
                <Button key={v} variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setPoints(String(v))}>
                  {v.toLocaleString()}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
            <Button variant="premium" onClick={handleRedeem} disabled={loading || !points}>
              {loading ? 'Processing…' : 'Redeem'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ReferralsTab = () => {
  const { referralCode } = useLoyalty();
  const { referrals, stats, loading } = useLoyaltyReferrals();
  const { settings } = useLoyalty();
  const link = referralCode ? `${window.location.origin}/auth?ref=${referralCode}` : '';

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'Join DataSika', text: `Use my code ${referralCode} and get rewards on DataSika`, url: link }); } catch {}
    } else copy(link);
  };

  return (
    <div className="space-y-3">
      <div className="surface-premium rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center">
            <Users className="w-[18px] h-[18px] text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">Refer & earn</p>
            <p className="text-[11px] text-muted-foreground">
              Get {settings?.referral_bonus_referrer_points || 200} pts · they get {formatPrice(settings?.referral_bonus_referee_ghs || 2)} wallet credit
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Input value={referralCode || '...'} readOnly className="font-mono font-bold text-center tracking-widest" />
            <Button variant="outline" size="icon" onClick={() => copy(referralCode || '')}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Input value={link} readOnly className="text-xs" />
            <Button variant="premium" size="icon" onClick={share}>
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="surface-premium rounded-xl p-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Completed</p>
          <p className="text-xl font-bold tabular mt-1">{stats.completed}</p>
        </div>
        <div className="surface-premium rounded-xl p-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Points earned</p>
          <p className="text-xl font-bold tabular mt-1">{stats.pointsEarned.toLocaleString()}</p>
        </div>
      </div>

      <div className="surface-premium rounded-2xl p-5">
        <p className="font-semibold text-sm mb-3">Recent referrals</p>
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : referrals.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No referrals yet — share your code to start earning</p>
        ) : (
          <div className="space-y-2">
            {referrals.slice(0, 10).map(r => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                <div>
                  <p className="text-xs font-medium">Code {r.code_used}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</p>
                </div>
                <Badge variant={r.status === 'completed' ? 'default' : r.status === 'pending' ? 'secondary' : 'destructive'} className="text-[10px]">
                  {r.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const HistoryTab = () => {
  const { transactions, loading } = usePointTransactions(100);

  const labelFor = (t: any) => {
    if (t.type === 'earn' && t.source === 'order') return 'Earned from order';
    if (t.type === 'earn' && t.source === 'referral') return 'Referral reward';
    if (t.type === 'signup_bonus') return 'Signup bonus';
    if (t.type === 'birthday_bonus') return 'Birthday bonus';
    if (t.type === 'redeem') return 'Redemption';
    if (t.type === 'adjust') return 'Adjustment';
    if (t.type === 'expire') return 'Expired';
    return t.type;
  };

  if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div className="surface-premium rounded-2xl p-5">
      <p className="font-semibold text-sm mb-3">Points history</p>
      {transactions.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">No transactions yet</p>
      ) : (
        <div className="divide-y divide-border/50">
          {transactions.map(t => (
            <div key={t.id} className="flex items-center justify-between py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{labelFor(t)}</p>
                <p className="text-[11px] text-muted-foreground">{format(new Date(t.created_at), 'MMM d, yyyy · HH:mm')}</p>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className={`text-sm font-bold tabular ${t.amount >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {t.amount >= 0 ? '+' : ''}{t.amount.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground tabular">bal: {t.balance_after.toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const DashboardRewards = () => {
  const { settings, loading } = useLoyalty();

  if (!loading && settings && !settings.program_active) {
    return (
      <DashboardLayout>
        <div className="p-4 max-w-2xl mx-auto">
          <div className="surface-premium rounded-2xl p-8 text-center">
            <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h2 className="font-display font-bold text-xl">Rewards program is currently paused</h2>
            <p className="text-sm text-muted-foreground mt-2">Check back soon — your existing points balance is safe.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <SEOHead title="Rewards | DataSika" description="Earn and redeem DataSika reward points." path="/dashboard/rewards" noIndex />
      <div className="p-4 md:p-6 space-y-4 max-w-2xl">
        <div>
          <h1 className="font-display font-bold text-2xl tracking-tight">Rewards</h1>
          <p className="text-sm text-muted-foreground">Earn points on every order. Redeem for wallet credit or bundles.</p>
        </div>

        <RewardsHero />

        <Tabs defaultValue="earn" className="w-full">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="earn" className="text-xs"><TrendingUp className="w-3.5 h-3.5 mr-1" />Earn</TabsTrigger>
            <TabsTrigger value="redeem" className="text-xs"><Gift className="w-3.5 h-3.5 mr-1" />Redeem</TabsTrigger>
            <TabsTrigger value="referrals" className="text-xs"><Users className="w-3.5 h-3.5 mr-1" />Refer</TabsTrigger>
            <TabsTrigger value="history" className="text-xs"><History className="w-3.5 h-3.5 mr-1" />History</TabsTrigger>
          </TabsList>
          <TabsContent value="earn" className="mt-3"><EarnTab /></TabsContent>
          <TabsContent value="redeem" className="mt-3"><RedeemTab /></TabsContent>
          <TabsContent value="referrals" className="mt-3"><ReferralsTab /></TabsContent>
          <TabsContent value="history" className="mt-3"><HistoryTab /></TabsContent>
        </Tabs>

        <div aria-hidden className="h-24 md:h-6" />
      </div>
    </DashboardLayout>
  );
};

export default DashboardRewards;
