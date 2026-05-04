import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

/** Generate or retrieve a persistent session ID */
function getSessionId(): string {
  const key = 'ds_session_id';
  let sid = sessionStorage.getItem(key);
  if (!sid) {
    sid = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(key, sid);
  }
  return sid;
}

/** Parse a simplified device type from User-Agent */
function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/Mobi|Android/i.test(ua)) return 'mobile';
  if (/Tablet|iPad/i.test(ua)) return 'tablet';
  return 'desktop';
}

/** Parse browser name from User-Agent */
function getBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
  return 'Other';
}

/**
 * Tracks page views in the background.
 * Fires on every route change, with a 2s debounce to avoid rapid-fire.
 * Does NOT block rendering or throw errors on failure.
 */
export function usePageTracker() {
  const location = useLocation();
  const lastTracked = useRef<string>('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const path = location.pathname;

    // Skip admin pages to avoid polluting analytics
    if (path.startsWith('/admin')) return;

    // Skip if we just tracked this exact path
    if (lastTracked.current === path) return;

    // Debounce: wait 2s before recording to handle rapid navigation
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      lastTracked.current = path;

      const sessionId = getSessionId();

      supabase
        .from('page_views')
        .insert({
          session_id: sessionId,
          page_path: path,
          referrer: document.referrer || null,
          user_agent: navigator.userAgent,
          device_type: getDeviceType(),
          browser: getBrowser(),
        })
        .then(({ error }) => {
          if (error) console.warn('[PageTracker] insert failed:', error.message);
        });
    }, 2000);

    return () => clearTimeout(debounceTimer.current);
  }, [location.pathname]);
}
