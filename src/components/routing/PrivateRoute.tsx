import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ReactNode, useEffect } from 'react';
import DataSikaLoader from '@/components/ui/DataSikaLoader';

interface PrivateRouteProps {
  children: ReactNode;
}

/**
 * Wraps dashboard pages. Redirects unauthenticated users to /auth?next=<current_path>.
 * Tracks the current path so returning users land where they left off.
 */
const PrivateRoute = ({ children }: PrivateRouteProps) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Track last visited dashboard page
  useEffect(() => {
    if (user && location.pathname.startsWith('/dashboard')) {
      localStorage.setItem('datasika_last_dashboard_page', location.pathname);
    }
  }, [user, location.pathname]);

  if (loading) {
    return <DataSikaLoader fullScreen label="Loading dashboard..." />;
  }

  if (!user) {
    // Encode the intended destination so Auth can redirect back after login
    const next = location.pathname + location.search;
    return <Navigate to={`/auth?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children}</>;
};

export default PrivateRoute;