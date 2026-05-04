import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/* ─── CANONICAL TIER CONFIG (single source of truth) ─────────────── */
export interface TierDef {
  id: string;
  gb: number;
  deliverGb: number;
  label: string;
  tierName: string;
  requiredPerTier: number;
  cumulative: number;
}

export const CANONICAL_TIERS: TierDef[] = [
  { id: 'aaaa0001-0000-0000-0000-000000000001', gb: 1,  deliverGb: 1,  label: '1GB',  tierName: 'Bronze',   requiredPerTier: 5,  cumulative: 5 },
  { id: 'aaaa0002-0000-0000-0000-000000000002', gb: 5,  deliverGb: 4,  label: '5GB',  tierName: 'Silver',   requiredPerTier: 10, cumulative: 15 },
  { id: 'aaaa0003-0000-0000-0000-000000000003', gb: 10, deliverGb: 5,  label: '10GB', tierName: 'Gold',     requiredPerTier: 20, cumulative: 35 },
  { id: 'aaaa0004-0000-0000-0000-000000000004', gb: 15, deliverGb: 5,  label: '15GB', tierName: 'Platinum', requiredPerTier: 20, cumulative: 55 },
  { id: 'aaaa0005-0000-0000-0000-000000000005', gb: 25, deliverGb: 10, label: '25GB', tierName: 'Elite',    requiredPerTier: 40, cumulative: 95 },
];

/* ─── PROGRESS SUMMARY (the canonical shape) ─────────────────────── */
export interface ReferralProgressSummary {
  qualifiedCount: number;
  signupCount: number;
  currentTier: string | null;        // null = no tier reached
  currentTierIdx: number;            // -1 = none
  nextTier: string | null;           // null = max reached
  nextTierIdx: number;               // TIERS.length if maxed
  progressPercent: number;           // 0-100, rounded
  nextTierTotalGB: number;           // e.g. 5
  nextTierLabel: string;             // e.g. "5GB"
  isMaxTier: boolean;
  /** Highest tier that is unlocked AND not yet claimed */
  highestClaimableTier: TierDef | null;
  /** Set of milestone IDs with active claims */
  claimedMilestoneIds: Set<string>;
  /** True when the user has ANY referral activity at all */
  hasAnyActivity: boolean;
}

/* ─── PURE COMPUTATION (no side effects) ─────────────────────────── */
export function computeReferralProgress(
  qualifiedCount: number,
  claimedMilestoneIds: Set<string>,
  signupCount: number = 0,
): ReferralProgressSummary {
  const tiers = CANONICAL_TIERS;

  // Current tier = highest tier whose cumulative requirement is met
  let currentTierIdx = -1;
  for (let i = 0; i < tiers.length; i++) {
    if (qualifiedCount >= tiers[i].cumulative) currentTierIdx = i;
  }

  const isMaxTier = currentTierIdx === tiers.length - 1;

  // Next tier = first tier whose cumulative requirement is NOT met
  let nextTierIdx = tiers.length; // default: past end
  for (let i = 0; i < tiers.length; i++) {
    if (qualifiedCount < tiers[i].cumulative) {
      nextTierIdx = i;
      break;
    }
  }

  // Progress percent toward next tier
  let progressPercent = 100;
  if (!isMaxTier && nextTierIdx < tiers.length) {
    const prevReq = nextTierIdx > 0 ? tiers[nextTierIdx - 1].cumulative : 0;
    const nextReq = tiers[nextTierIdx].cumulative;
    const range = nextReq - prevReq;
    progressPercent = range > 0
      ? Math.min(Math.round(((qualifiedCount - prevReq) / range) * 100), 100)
      : 0;
  }

  // Highest claimable: unlocked + not claimed
  let highestClaimableTier: TierDef | null = null;
  for (const t of tiers) {
    if (qualifiedCount >= t.cumulative && !claimedMilestoneIds.has(t.id)) {
      highestClaimableTier = t;
    }
  }

  const nextTier = nextTierIdx < tiers.length ? tiers[nextTierIdx] : null;

  // Debug log (server-readability via console — will show in browser dev tools for verification)
  console.debug('[ReferralProgress]', {
    qualifiedCount,
    currentTier: currentTierIdx >= 0 ? tiers[currentTierIdx].tierName : null,
    nextTier: nextTier?.tierName ?? null,
    progressPercent,
    isMaxTier,
    highestClaimable: highestClaimableTier?.tierName ?? null,
    claimedCount: claimedMilestoneIds.size,
  });

  const hasAnyActivity = qualifiedCount > 0 || signupCount > 0 || claimedMilestoneIds.size > 0;

  return {
    qualifiedCount,
    signupCount,
    currentTier: currentTierIdx >= 0 ? tiers[currentTierIdx].tierName : null,
    currentTierIdx,
    nextTier: nextTier?.tierName ?? null,
    nextTierIdx,
    progressPercent,
    nextTierTotalGB: nextTier?.gb ?? 0,
    nextTierLabel: nextTier?.label ?? '',
    isMaxTier,
    highestClaimableTier,
    claimedMilestoneIds,
    hasAnyActivity,
  };
}

/* ─── REACT HOOK ─────────────────────────────────────────────────── */
export function useReferralProgress() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ReferralProgressSummary | null>(null);

  const load = useCallback(async () => {
    if (!user) return;

    const [profileRes, claimsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('referral_success_count, referral_signup_count')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('reward_claims')
        .select('milestone_id, status')
        .eq('user_id', user.id),
    ]);

    const count = profileRes.data?.referral_success_count ?? 0;
    const signups = profileRes.data?.referral_signup_count ?? 0;
    const claims = claimsRes.data ?? [];

    const claimedIds = new Set(
      claims
        .filter(c => c.status !== 'rejected' && c.status !== 'failed')
        .map(c => c.milestone_id),
    );

    const result = computeReferralProgress(count, claimedIds, signups);
    setSummary(result);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return { loading, summary, refetch: load };
}
