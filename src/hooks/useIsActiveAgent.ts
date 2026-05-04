import { useAgent } from './useAgent';
import { useAgentSubscriptionState } from './useAgentSubscriptionState';

/**
 * Canonical "live active agent" check used by all user-facing surfaces
 * (dashboard greeting badge, mobile bottom-nav indicator, etc.).
 *
 * An agent is considered LIVE-ACTIVE only when:
 *   • the agent record exists and is approved/active (not suspended/rejected/pending),
 *   • the subscription is functionally active (active, expiring soon, or grace period).
 *
 * Expired / never-subscribed / pending stores must NOT appear active.
 */
export function useIsActiveAgent() {
  const { agent, isActiveAgent, loading: agentLoading } = useAgent();
  const { isStoreActive, loading: subLoading } = useAgentSubscriptionState();

  const loading = agentLoading || subLoading;
  // Must have an agent record with status=active AND a non-expired subscription window.
  const isLiveActiveAgent = !!agent && isActiveAgent && isStoreActive;

  return { isLiveActiveAgent, loading };
}
