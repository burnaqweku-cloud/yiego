import { ReactNode, useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import Maintenance from '@/pages/Maintenance';

/**
 * MaintenanceGuard wraps the entire router tree.
 *
 * - Fetches `site_maintenance_enabled` on mount.
 * - Subscribes to real-time changes on `site_settings` so toggling
 *   maintenance mode in the admin panel takes effect within seconds
 *   for every connected client — no refresh needed.
 *
 * Bypass rules (never see maintenance page):
 *   1. Admin or staff (checked via user_roles)
 *   2. Routes starting with /admin or /maintenance
 *   3. Valid bypass cookie
 *
 * Fail-safe: while the initial fetch is in-flight **and** the user
 * is not yet confirmed as admin/staff, the guard defaults to showing
 * the maintenance page if a previous real-time event already turned
 * maintenance ON. On first load with no prior state the children are
 * rendered (maintenance off is assumed until proven otherwise).
 */

const ALWAYS_ALLOWED_PREFIXES = ['/maintenance', '/admin'];

/* ── bypass cookie helpers ── */
const hasBypassCookie = (): boolean => {
  try {
    return document.cookie.split(';').some((c) => c.trim().startsWith('maintenance_bypass=true'));
  } catch {
    return false;
  }
};

const setBrowserBypassCookie = () => {
  const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toUTCString();
  document.cookie = `maintenance_bypass=true; expires=${expires}; path=/; SameSite=Strict`;
};

interface Props {
  children: ReactNode;
}

const MaintenanceGuard = ({ children }: Props) => {
  const { isAdminOrStaff, loading: authLoading, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Maintenance state
  const [enabled, setEnabled] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [bypassToken, setBypassToken] = useState('');

  // Track whether auth role has settled (useAuth resolves roles async)
  const [roleSettled, setRoleSettled] = useState(false);

  useEffect(() => {
    if (authLoading) {
      setRoleSettled(false);
      return;
    }
    if (!user) {
      setRoleSettled(true);
      return;
    }
    const t = setTimeout(() => setRoleSettled(true), 80);
    return () => clearTimeout(t);
  }, [authLoading, user]);

  /* ── initial fetch ── */
  const fetchSettings = useCallback(async () => {
    const { data } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['site_maintenance_enabled', 'maintenance_bypass_token']);

    if (data) {
      const map = Object.fromEntries(data.map((r) => [r.key, r.value]));
      setEnabled(map['site_maintenance_enabled'] === 'true');
      setBypassToken(map['maintenance_bypass_token'] || '');
    }
    setFetched(true);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  /* ── real-time subscription ── */
  useEffect(() => {
    const channel = supabase
      .channel('maintenance-mode-watch')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'site_settings',
          filter: "key=eq.site_maintenance_enabled",
        },
        (payload: any) => {
          const newValue = payload?.new?.value;
          if (typeof newValue === 'string') {
            setEnabled(newValue === 'true');
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'site_settings',
          filter: "key=eq.maintenance_bypass_token",
        },
        (payload: any) => {
          const newValue = payload?.new?.value;
          if (typeof newValue === 'string') {
            setBypassToken(newValue);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  /* ── bypass query-param handler ── */
  useEffect(() => {
    if (!bypassToken) return;
    const params = new URLSearchParams(location.search);
    const token = params.get('bypass');
    if (token && token === bypassToken) {
      setBrowserBypassCookie();
      params.delete('bypass');
      const newSearch = params.toString();
      navigate(location.pathname + (newSearch ? '?' + newSearch : ''), { replace: true });
    }
  }, [bypassToken, location.search, location.pathname, navigate]);

  /* ── decision logic ── */

  // If maintenance is OFF → always render children
  if (!enabled) return <>{children}</>;

  // Maintenance is ON below this point ─────────────────────────

  // Always-allowed paths (admin panel, maintenance page itself)
  const isAllowedPath = ALWAYS_ALLOWED_PREFIXES.some(
    (p) => location.pathname === p || location.pathname.startsWith(p + '/'),
  );
  if (isAllowedPath) return <>{children}</>;

  // Bypass cookie
  if (hasBypassCookie()) return <>{children}</>;

  // If auth has settled and user is admin/staff → bypass
  if (roleSettled && isAdminOrStaff) return <>{children}</>;

  // If auth is still loading but we know maintenance is on →
  // show maintenance (fail-safe for unauthenticated visitors)
  // Once auth resolves, if they turn out to be admin, this will flip.
  if (!roleSettled) {
    return <Maintenance />;
  }

  // All other cases: maintenance is on, user is not admin/staff
  return <Maintenance />;
};

export default MaintenanceGuard;
