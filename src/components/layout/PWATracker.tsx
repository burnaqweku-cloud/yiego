import { useAuth } from '@/hooks/useAuth';
import { usePWATracking } from '@/hooks/usePWATracking';

/**
 * Mounts inside AuthProvider so it can access the current user.
 * Renders nothing — purely a tracking side-effect component.
 */
const PWATracker = () => {
  const { user } = useAuth();
  usePWATracking(user?.id ?? null);
  return null;
};

export default PWATracker;
