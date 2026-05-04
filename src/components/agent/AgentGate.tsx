import { ReactNode } from 'react';
import { useStoreStatus } from '@/hooks/useStoreStatus';
import { DashboardSkeleton } from '@/components/agent/AgentSkeletons';
import AgentActivationBanner from '@/components/agent/AgentActivationBanner';
import AgentWhatsAppChannelBanner from '@/components/agent/AgentWhatsAppChannelBanner';
import AgentLayout from '@/pages/agent/AgentLayout';

interface AgentGateProps {
  children: ReactNode;
  /** If true, content is shown even for non-active agents (e.g. Store Settings) */
  allowRestricted?: boolean;
}

/**
 * Layout-level gate for agent panel pages.
 * - Active agents: full access
 * - Expired agents: can view dashboard, orders, earnings, withdraw, renew — but tools are gated
 * - Non-active: activation banner overlay
 */
const AgentGate = ({ children, allowRestricted = false }: AgentGateProps) => {
  const { storeStatus, loading } = useStoreStatus();

  if (loading) {
    return <AgentLayout><DashboardSkeleton /></AgentLayout>;
  }

  // Active: full access
  if (storeStatus === 'active') {
    return <>{children}</>;
  }

  // Expired: Soft-disable — agent can still login, view dashboard, orders, earnings, renew
  // They just can't receive new store orders (enforced at store/checkout level)
  if (storeStatus === 'expired') {
    return <>{children}</>;
  }

  if (allowRestricted) {
    return <>{children}</>;
  }

  // Non-active agents: show activation banner inline with blurred placeholder behind
  return (
    <AgentLayout>
      <div className="relative min-h-[60vh]">
        <div className="pointer-events-none select-none blur-md opacity-30" aria-hidden="true">
          <div className="space-y-4">
            <div className="h-12 bg-muted rounded-xl" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-24 bg-muted rounded-xl" />
              <div className="h-24 bg-muted rounded-xl" />
              <div className="h-24 bg-muted rounded-xl" />
              <div className="h-24 bg-muted rounded-xl" />
            </div>
            <div className="h-40 bg-muted rounded-xl" />
            <div className="h-32 bg-muted rounded-xl" />
          </div>
        </div>

        <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto">
          <div className="w-full max-w-md px-4 pt-4 pb-8 space-y-3">
            <AgentWhatsAppChannelBanner />
            <AgentActivationBanner />
          </div>
        </div>
      </div>
    </AgentLayout>
  );
};

export default AgentGate;
