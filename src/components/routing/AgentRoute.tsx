import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAgent } from '@/hooks/useAgent';
import { ReactNode } from 'react';
import DataSikaLoader from '@/components/ui/DataSikaLoader';

const AgentRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { agent, loading: agentLoading } = useAgent();

  if (authLoading || agentLoading) {
    return <DataSikaLoader fullScreen label="Loading agent dashboard..." />;
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!agent) return <Navigate to="/agent" replace />;

  // Allow pending_review, approved (awaiting payment), and active agents into the dashboard
  const allowedStatuses = ['pending_review', 'approved', 'active'];
  if (allowedStatuses.includes(agent.status)) return <>{children}</>;

  // Suspended or rejected go back to smart router
  return <Navigate to="/agent" replace />;
};

export default AgentRoute;