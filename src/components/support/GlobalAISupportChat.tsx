import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import AISupportChat from './AISupportChat';

/**
 * Global wrapper that renders AISupportChat on all non-admin pages.
 * Mounted once in App.tsx — no duplicates in Layout/DashboardLayout/AgentLayout.
 */
const GlobalAISupportChat = () => {
  const { pathname } = useLocation();
  const { user, profile, userRole } = useAuth();

  // Hide on all admin routes
  if (pathname.startsWith('/admin')) return null;

  // Hide on Telegram Mini App routes — clean canvas, no site chrome
  if (pathname === '/tg' || pathname.startsWith('/tg/')) return null;

  // Hide on agent store buy-data pages (e.g. /store/slug)
  if (pathname.match(/^\/store\/[^/]+$/)) return null;

  // Hide on sensitive flow screens — auth, checkout entry, order detail views
  if (
    pathname === '/auth' ||
    pathname === '/reset-password' ||
    pathname === '/checkout' ||
    pathname === '/order-confirmation' ||
    /^\/dashboard\/orders\/[^/]+$/.test(pathname) ||
    /^\/agent\/(?:wholesale|bulk-purchase)\/orders\/[^/]+$/.test(pathname)
  ) {
    return null;
  }

  const userType = user
      ? 'user'
      : 'guest';

  return (
    <AISupportChat
      context={{
        page: pathname,
        userType,
        username: profile?.username || undefined,
        email: profile?.email || user?.email || undefined,
      }}
    />
  );
};

export default GlobalAISupportChat;
