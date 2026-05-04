import { useMemo } from 'react';
import { useSubscription } from './useSubscription';

/**
 * Canonical display states for agent subscription.
 * Derived purely from existing subscription data — NO new financial logic.
 */
export type AgentDisplayState =
  | 'active'
  | 'expiring_soon'
  | 'grace_period'
  | 'expired_promo_window'
  | 'expired_standard'
  | 'never_subscribed'
  | 'pending';

const RENEWAL_REMINDER_DAYS = 7;
const GRACE_HOURS = 24;
const POST_GRACE_PROMO_HOURS = 24;

export function useAgentSubscriptionState() {
  const {
    subscription,
    subscriptionState,
    loading,
    daysRemaining,
    isPromoActive,
    promoExpiresAt,
    promoContext,
    renewalPromoData,
    refresh,
  } = useSubscription();

  const displayState: AgentDisplayState = useMemo(() => {
    if (!subscription) return subscriptionState === 'pending' ? 'pending' : 'never_subscribed';
    if (subscriptionState === 'pending') return 'pending';

    const now = new Date();
    const expiry = new Date(subscription.expiry_date);
    const graceEnd = new Date(expiry.getTime() + GRACE_HOURS * 60 * 60 * 1000);
    const postGracePromoEnd = new Date(graceEnd.getTime() + POST_GRACE_PROMO_HOURS * 60 * 60 * 1000);
    const reminderStart = new Date(expiry.getTime() - RENEWAL_REMINDER_DAYS * 24 * 60 * 60 * 1000);

    // Still before expiry
    if (now < expiry) {
      if (now >= reminderStart) return 'expiring_soon';
      return 'active';
    }

    // Past expiry — in grace?
    if (now <= graceEnd) return 'grace_period';

    // Past grace — in post-grace promo?
    if (now <= postGracePromoEnd) return 'expired_promo_window';

    return 'expired_standard';
  }, [subscription, subscriptionState]);

  // Compute exact timestamps for UI
  const timestamps = useMemo(() => {
    if (!subscription) return { expiryDate: null, graceEndDate: null, promoEndDate: null };
    const expiry = new Date(subscription.expiry_date);
    const graceEnd = new Date(expiry.getTime() + GRACE_HOURS * 60 * 60 * 1000);
    const postGracePromoEnd = new Date(graceEnd.getTime() + POST_GRACE_PROMO_HOURS * 60 * 60 * 1000);
    return {
      expiryDate: expiry.toISOString(),
      graceEndDate: graceEnd.toISOString(),
      promoEndDate: postGracePromoEnd.toISOString(),
    };
  }, [subscription]);

  // Is the store functionally active (can accept orders)?
  const isStoreActive = displayState === 'active' || displayState === 'expiring_soon' || displayState === 'grace_period';

  // Should agent pricing apply?
  const isAgentPricingActive = isStoreActive;

  return {
    displayState,
    isStoreActive,
    isAgentPricingActive,
    timestamps,
    subscription,
    daysRemaining,
    loading,
    isPromoActive,
    promoExpiresAt,
    promoContext,
    renewalPromoData,
    refresh,
  };
}
