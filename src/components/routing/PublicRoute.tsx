import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DataSikaLoader from '@/components/ui/DataSikaLoader';

interface PublicRouteProps {
  children: ReactNode;
  /** If true, authenticated users are redirected to dashboard */
  redirectIfAuth?: boolean;
}

/**
 * Wraps public pages. When redirectIfAuth is true, logged-in users
 * are sent to ?next= target, last visited dashboard page, or /dashboard.
 */
const PublicRoute = ({ children, redirectIfAuth = false }: PublicRouteProps) => {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();

  if (loading) {
    return <DataSikaLoader fullScreen label="Loading..." />;
  }

  if (redirectIfAuth && user) {
    // Honour ?next= param (e.g. PWA start_url → /dashboard → redirect to /auth?next=/dashboard → login → back here)
    const next = searchParams.get('next');
    if (next && next.startsWith('/')) {
      return <Navigate to={next} replace />;
    }
    const lastPage = localStorage.getItem('datasika_last_dashboard_page');
    const target = lastPage && lastPage.startsWith('/dashboard') ? lastPage : '/dashboard';
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
};

export default PublicRoute;