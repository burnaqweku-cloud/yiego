import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import YieGoLoader from '@/components/ui/YieGoLoader';

interface AdminRouteProps {
  children: ReactNode;
}

/**
 * Protects admin routes. Only users with admin or staff role can access.
 * Unauthenticated users are redirected to /auth.
 * Authenticated non-admin/non-staff users are redirected to /dashboard.
 */
const AdminRoute = ({ children }: AdminRouteProps) => {
  const { user, loading, isAdmin, isStaff } = useAuth();

  if (loading) {
    return <YieGoLoader fullScreen label="Verifying access..." />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin && !isStaff) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
