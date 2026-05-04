import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface LoyaltyAccount {
  id: string;
  user_id: string;
  points_balance: number;
  lifetime_points_earned: number;
  lifetime_points_redeemed: number;
  lifetime_spend_ghs: number;
  current_tier: string;
  tier_achieved_at: string | null;
  birthday: string | null;
  banned_from_program: boolean;
  banned_reason: string | null;
}

export interface LoyaltyTier {
  id: string;
  tier_name: string;
  display_name: string;
  min_lifetime_spend: number;
  point_multiplier: number;
  color_hex: string;
  icon_name: string;
  perks: any;
  sort_order: number;
  active: boolean;
}

export interface LoyaltySettings {
  points_per_ghs: number;
  points_to_ghs_rate: number;
  min_order_ghs_for_points: number;
  signup_bonus_points: number;
  birthday_bonus_points: number;
  referral_bonus_referrer_points: number;
  referral_bonus_referee_ghs: number;
  max_referrals_per_month: number;
  max_redeem_percent_per_order: number;
  program_active: boolean;
  points_expiry_months: number | null;
}

export interface PointTransaction {
  id: string;
  user_id: string;
  type: string;
  source: string;
  amount: number;
  balance_after: number;
  reference_id: string | null;
  description: string | null;
  metadata: any;
  created_at: string;
}

export interface LoyaltyReferral {
  id: string;
  referrer_id: string;
  referee_id: string;
  status: string;
  code_used: string | null;
  referrer_reward_points: number;
  referee_reward_ghs: number;
  rewards_issued_at: string | null;
  flagged: boolean;
  flag_reason: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface LoyaltyRedemption {
  id: string;
  user_id: string;
  type: string;
  points_used: number;
  ghs_value: number;
  status: string;
  order_id: string | null;
  metadata: any;
  created_at: string;
}

export function useLoyalty() {
  const { user } = useAuth();
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const [accRes, tiersRes, setRes, codeRes] = await Promise.all([
      supabase.from('loyalty_accounts').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('loyalty_tiers_config').select('*').eq('active', true).order('sort_order'),
      supabase.from('loyalty_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('loyalty_referral_codes').select('code').eq('user_id', user.id).eq('active', true).maybeSingle(),
    ]);

    if (accRes.data) setAccount(accRes.data as LoyaltyAccount);
    if (tiersRes.data) setTiers(tiersRes.data as LoyaltyTier[]);
    if (setRes.data) setSettings(setRes.data as LoyaltySettings);
    if (codeRes.data) setReferralCode((codeRes.data as any).code);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`loyalty-${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'loyalty_accounts', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType !== 'DELETE') setAccount(payload.new as LoyaltyAccount);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Derived
  const currentTierConfig = tiers.find(t => t.tier_name === account?.current_tier) || tiers[0];
  const nextTierConfig = tiers.find(t => (t.min_lifetime_spend > (account?.lifetime_spend_ghs || 0))) || null;
  const progressToNextTier = nextTierConfig
    ? Math.min(100, ((account?.lifetime_spend_ghs || 0) / nextTierConfig.min_lifetime_spend) * 100)
    : 100;
  const ghsRemainingToNext = nextTierConfig
    ? Math.max(0, nextTierConfig.min_lifetime_spend - (account?.lifetime_spend_ghs || 0))
    : 0;

  const pointsValueGhs = account && settings
    ? (account.points_balance * settings.points_to_ghs_rate)
    : 0;

  return {
    account, tiers, settings, referralCode, loading, refresh,
    currentTierConfig, nextTierConfig, progressToNextTier, ghsRemainingToNext,
    pointsValueGhs,
  };
}

export function usePointTransactions(limit = 50) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('point_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (data) setTransactions(data as PointTransaction[]);
    setLoading(false);
  }, [user, limit]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`pt-${user.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'point_transactions', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as PointTransaction;
          setTransactions(prev => prev.some(t => t.id === row.id) ? prev : [row, ...prev].slice(0, limit));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, limit]);

  return { transactions, loading, refresh };
}

export function useLoyaltyReferrals() {
  const { user } = useAuth();
  const [referrals, setReferrals] = useState<LoyaltyReferral[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('loyalty_referrals')
      .select('*')
      .eq('referrer_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setReferrals(data as LoyaltyReferral[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const stats = {
    total: referrals.length,
    pending: referrals.filter(r => r.status === 'pending').length,
    completed: referrals.filter(r => r.status === 'completed').length,
    rejected: referrals.filter(r => r.status === 'rejected').length,
    pointsEarned: referrals.filter(r => r.status === 'completed')
      .reduce((s, r) => s + Number(r.referrer_reward_points || 0), 0),
  };

  return { referrals, loading, stats, refresh };
}

export function useLoyaltyRedemptions() {
  const { user } = useAuth();
  const [redemptions, setRedemptions] = useState<LoyaltyRedemption[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('loyalty_redemptions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setRedemptions(data as LoyaltyRedemption[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return { redemptions, loading, refresh };
}

/** Tier visual mapping — uses semantic tokens via custom HSL values */
export function tierVisual(tierName: string) {
  switch (tierName) {
    case 'platinum': return { gradient: 'from-slate-300 via-slate-100 to-slate-300', ring: 'ring-slate-300', label: 'Platinum' };
    case 'gold':     return { gradient: 'from-amber-400 via-yellow-300 to-amber-500', ring: 'ring-amber-400', label: 'Gold' };
    case 'silver':   return { gradient: 'from-gray-300 via-gray-100 to-gray-400', ring: 'ring-gray-300', label: 'Silver' };
    default:         return { gradient: 'from-orange-700 via-orange-500 to-amber-700', ring: 'ring-orange-500', label: 'Bronze' };
  }
}
