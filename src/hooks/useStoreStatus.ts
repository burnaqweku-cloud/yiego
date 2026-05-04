import { useAgent } from './useAgent';
import { useSubscription } from './useSubscription';

export type StoreStatus = 'loading' | 'pending_review' | 'approved_not_subscribed' | 'active' | 'expired';

export const useStoreStatus = () => {
  const { agent, isPending, loading: agentLoading } = useAgent();
  const { subscriptionState, loading: subLoading, daysRemaining } = useSubscription();

  const loading = agentLoading || subLoading;

  let storeStatus: StoreStatus = 'loading';

  if (!loading && agent) {
    if (isPending) {
      storeStatus = 'pending_review';
    } else if (subscriptionState === 'active') {
      storeStatus = 'active';
    } else if (subscriptionState === 'expired') {
      storeStatus = 'expired';
    } else {
      // approved but not subscribed (never_subscribed or pending payment)
      storeStatus = 'approved_not_subscribed';
    }
  }

  return {
    storeStatus,
    loading,
    daysRemaining,
  };
};
