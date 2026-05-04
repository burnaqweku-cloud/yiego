import { Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { AGENT_FEATURE_ENABLED } from '@/config/features';
import { useAuth } from '@/hooks/useAuth';

/**
 * Wraps any /agent or /become-an-agent route. When the agent feature is
 * disabled, normal users are quietly redirected to their dashboard (or auth).
 * Admin/staff retain access so they can still inspect agent flows.
 *
 * The underlying agent code, tables, and routes are preserved for future use.
 */
const AgentFeatureGate = ({ children }: { children: ReactNode }) => {
  const { user, loading, isAdmin, isStaff } = useAuth();

  if (AGENT_FEATURE_ENABLED) return <>{children}</>;
  if (loading) return null;
  if (isAdmin || isStaff) return <>{children}</>;
  return <Navigate to={user ? '/dashboard' : '/'} replace />;
};

export default AgentFeatureGate;
