import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAgent } from './useAgent';

export interface Subscription {
  id: string;
  agent_id: string;
  plan_price_standard: number;
  plan_price_current: number;
  currency: string;
  status: string;
  paid_at: string;
  next_billing_date: string;
  expiry_date: string;
  paystack_reference: string | null;
  created_at: string;
}

/**
 * Clear subscription state machine:
 * - never_subscribed: no subscription record exists at all
 * - pending: a record exists but status is 'pending' (payment initiated, not yet verified)
 * - active: status is 'active' AND expiry_date is in the future
 * - expired: a previous subscription exists but has expired or been cancelled
 */
export type SubscriptionState = 'never_subscribed' | 'pending' | 'active' | 'expired';

// ─── Pricing Constants (must match edge function) ───
export const MONTHLY_STANDARD = 50;
export const MONTHLY_PROMO = 35;
export const YEARLY_STANDARD = 250;
export const YEARLY_PROMO = 185;
export const PROMO_WINDOW_HOURS = 24;

// ─── Renewal promo config ───
const RENEWAL_REMINDER_DAYS = 7;
const RENEWAL_GRACE_HOURS = 24;
const RENEWAL_POST_GRACE_PROMO_HOURS = 24;

export const useSubscription = () => {
  const { agent, loading: agentLoading, refresh: refreshAgent } = useAgent();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [history, setHistory] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    if (agentLoading) return;

    if (!agent) {
      setSubscription(null);
      setHistory([]);
      setLoading(false);
      return;
    }

    try {
      const { data: subs } = await supabase
        .from('agent_subscriptions' as any)
        .select('*')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false });

      const allSubs = (subs as unknown as Subscription[]) || [];
      setHistory(allSubs);

      if (allSubs.length > 0) {
        const latest = allSubs[0];
        const now = new Date();
        const expiry = new Date(latest.expiry_date);
        if (expiry < now && latest.status === 'active') {
          setSubscription({ ...latest, status: 'expired' });
        } else {
          setSubscription(latest);
        }
      } else {
        setSubscription(null);
      }
    } catch (err) {
      console.error('Error fetching subscription:', err);
    } finally {
      setLoading(false);
    }
  }, [agent, agentLoading]);

  useEffect(() => { fetchSubscription(); }, [fetchSubscription]);

  // ── Realtime: subscription updates (instant reflection after Paystack webhook activates) ──
  useEffect(() => {
    if (!agent?.id) return;
    const channel = supabase
      .channel(`agent-subscription-${agent.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'agent_subscriptions', filter: `agent_id=eq.${agent.id}` },
        () => { fetchSubscription(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [agent?.id, fetchSubscription]);

  // ── Focus revalidation ──
  useEffect(() => {
    if (!agent?.id) return;
    const onFocus = () => fetchSubscription();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [agent?.id, fetchSubscription]);

  const subscriptionState: SubscriptionState = useMemo(() => {
    if (!subscription) return 'never_subscribed';
    if (subscription.status === 'pending') return 'pending';
    if (subscription.status === 'active' && new Date(subscription.expiry_date) > new Date()) return 'active';
    return 'expired';
  }, [subscription]);

  const isActive = subscriptionState === 'active';
  const isExpired = subscriptionState === 'expired';
  const isNeverSubscribed = subscriptionState === 'never_subscribed';
  const isPending = subscriptionState === 'pending';

  const daysRemaining = subscription && isActive
    ? Math.max(0, Math.ceil((new Date(subscription.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  // ─── One-time server-side repair for missing activation promo timestamp ───
  useEffect(() => {
    if (!agent) return;
    if ((agent as any).status !== 'approved') return;
    if ((agent as any).activation_paid) return;
    const expiresAt = (agent as any).activation_discount_expires_at as string | null;
    const resetApplied = (agent as any).activation_promo_reset_applied as boolean;
    // If expires_at is null or already expired AND reset not yet applied, repair once
    if (!resetApplied && (!expiresAt || new Date(expiresAt) <= new Date())) {
      const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      supabase
        .from('agents' as any)
        .update({
          activation_discount_expires_at: newExpiry,
          activation_promo_reset_applied: true,
        })
        .eq('id', agent.id)
        .then(() => {
          // Refresh agent data so UI picks up the new timestamp
          refreshAgent();
        });
    }
  }, [agent]);

  // ─── Activation promo window logic (first-time activation only) ───
  const activationPromoData = useMemo(() => {
    if (!agent) return { active: false, expiresAt: null };
    // Only for agents that haven't activated yet (status = 'approved')
    if ((agent as any).status !== 'approved') return { active: false, expiresAt: null };

    const extendedUntil = (agent as any).discount_extended_until as string | null;
    const defaultExpiry = (agent as any).activation_discount_expires_at as string | null;
    const effectiveExpiry = extendedUntil || defaultExpiry;
    if (!effectiveExpiry) return { active: false, expiresAt: null };

    return {
      active: new Date(effectiveExpiry) > new Date(),
      expiresAt: effectiveExpiry,
    };
  }, [agent]);

  // ─── Renewal promo window logic (for active/expired agents) ───
  const renewalPromoData = useMemo(() => {
    if (!agent) return { active: false, expiresAt: null, context: null as string | null };
    // Only for agents who have subscribed before (not first activation)
    if ((agent as any).status === 'approved') return { active: false, expiresAt: null, context: null as string | null };
    if (!subscription) return { active: false, expiresAt: null, context: null as string | null };

    const expiryDate = new Date(subscription.expiry_date);
    const now = new Date();

    const reminderStart = new Date(expiryDate.getTime() - RENEWAL_REMINDER_DAYS * 24 * 60 * 60 * 1000);
    const graceEnd = new Date(expiryDate.getTime() + RENEWAL_GRACE_HOURS * 60 * 60 * 1000);
    const postGracePromoEnd = new Date(graceEnd.getTime() + RENEWAL_POST_GRACE_PROMO_HOURS * 60 * 60 * 1000);

    // In reminder period (before expiry)
    if (now >= reminderStart && now <= expiryDate) {
      return { active: true, expiresAt: expiryDate.toISOString(), context: 'reminder' };
    }
    // In grace period (expiry passed but within grace)
    if (now > expiryDate && now <= graceEnd) {
      return { active: true, expiresAt: graceEnd.toISOString(), context: 'grace' };
    }
    // Post-grace promo countdown
    if (now > graceEnd && now <= postGracePromoEnd) {
      return { active: true, expiresAt: postGracePromoEnd.toISOString(), context: 'post_grace' };
    }

    return { active: false, expiresAt: null, context: null };
  }, [agent, subscription]);

  // ─── Unified promo state ───
  const isPromoActive = activationPromoData.active || renewalPromoData.active;
  const promoExpiresAt = activationPromoData.expiresAt || renewalPromoData.expiresAt;
  const promoContext = activationPromoData.active ? 'activation' : (renewalPromoData.active ? renewalPromoData.context : null);

  return {
    subscription,
    history,
    loading,
    subscriptionState,
    isActive,
    isExpired,
    isNeverSubscribed,
    isPending,
    daysRemaining,
    isPromoActive,
    promoExpiresAt,
    promoContext,
    renewalPromoData,
    refresh: fetchSubscription,
  };
};
