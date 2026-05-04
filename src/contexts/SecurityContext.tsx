import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { generateDeviceFingerprint } from '@/lib/device-fingerprint';

interface SecurityContextType {
  isBlocked: boolean;
  blockType: string | null;
  checking: boolean;
}

const SecurityContext = createContext<SecurityContextType>({
  isBlocked: false,
  blockType: null,
  checking: true,
});

export const useSecurityGate = () => useContext(SecurityContext);

const HEARTBEAT_INTERVAL = 60_000; // 60 seconds
const BANNED_PATH = '/banned';

// Paths that should NOT be checked (avoid infinite redirect loop)
const EXEMPT_PATHS = ['/banned', '/maintenance'];

export const SecurityGateProvider = ({ children }: { children: ReactNode }) => {
  const { user, session, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockType, setBlockType] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deviceHashRef = useRef<string | null>(null);
  const hasCheckedRef = useRef(false);

  // Get device hash once
  useEffect(() => {
    const stored = localStorage.getItem('yiego_device_hash');
    if (stored) {
      deviceHashRef.current = stored;
    } else {
      generateDeviceFingerprint().then(hash => {
        deviceHashRef.current = hash;
        localStorage.setItem('yiego_device_hash', hash);
      });
    }
  }, []);

  const runCheck = useCallback(async (mode: 'precheck' | 'session') => {
    try {
      const body: Record<string, unknown> = {
        mode,
        device_hash: deviceHashRef.current,
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      };

      if (mode === 'session' && session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/security-check`,
        { method: 'POST', headers, body: JSON.stringify(body) }
      );

      if (!res.ok) return { allowed: true }; // fail open
      return await res.json();
    } catch {
      return { allowed: true }; // fail open on network errors
    }
  }, [session]);

  const handleBlockResult = useCallback(async (result: any) => {
    if (!result.allowed) {
      setIsBlocked(true);
      setBlockType(result.block_type);

      if (result.block_type === 'user_banned' && user) {
        await signOut();
      }

      if (location.pathname !== BANNED_PATH) {
        navigate(BANNED_PATH, { replace: true });
      }
      return true;
    }
    setIsBlocked(false);
    setBlockType(null);
    return false;
  }, [user, signOut, navigate, location.pathname]);

  // Initial precheck (runs once on mount, before auth loads)
  useEffect(() => {
    if (hasCheckedRef.current) return;
    if (EXEMPT_PATHS.includes(location.pathname)) {
      setChecking(false);
      return;
    }

    const doPrecheck = async () => {
      // Wait for device hash
      let attempts = 0;
      while (!deviceHashRef.current && attempts < 10) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }

      const result = await runCheck('precheck');
      await handleBlockResult(result);
      hasCheckedRef.current = true;
      setChecking(false);
    };

    doPrecheck();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Session check when user logs in
  useEffect(() => {
    if (authLoading || !user || EXEMPT_PATHS.includes(location.pathname)) return;

    const doSessionCheck = async () => {
      const result = await runCheck('session');
      await handleBlockResult(result);
    };

    doSessionCheck();
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Heartbeat for logged-in users
  useEffect(() => {
    if (!user || EXEMPT_PATHS.includes(location.pathname)) {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      return;
    }

    heartbeatRef.current = setInterval(async () => {
      const result = await runCheck('session');
      await handleBlockResult(result);
    }, HEARTBEAT_INTERVAL);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [user, runCheck, handleBlockResult, location.pathname]);

  // If on /banned but not blocked, redirect away
  useEffect(() => {
    if (location.pathname === BANNED_PATH && !isBlocked && !checking) {
      navigate('/', { replace: true });
    }
  }, [location.pathname, isBlocked, checking, navigate]);

  return (
    <SecurityContext.Provider value={{ isBlocked, blockType, checking }}>
      {children}
    </SecurityContext.Provider>
  );
};
