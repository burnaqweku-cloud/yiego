import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SystemStatusState {
  online: boolean;
  message: string;
  statusText: string;
  updatedAt: string;
}

interface SystemStatusContextValue {
  status: SystemStatusState;
  loading: boolean;
  refresh: () => Promise<void>;
}

const defaultStatus: SystemStatusState = {
  online: true,
  message: 'Orders are processing normally.',
  statusText: 'System Online',
  updatedAt: new Date().toISOString(),
};

const SystemStatusContext = createContext<SystemStatusContextValue>({
  status: defaultStatus,
  loading: true,
  refresh: async () => {},
});

export const useGlobalSystemStatus = () => useContext(SystemStatusContext);

const FALLBACK_POLL_INTERVAL = 120_000; // 2 min fallback only

export const SystemStatusProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<SystemStatusState>(defaultStatus);
  const [loading, setLoading] = useState(true);
  const statusRef = useRef(status);
  statusRef.current = status;

  const applyRows = useCallback((rows: Array<{ key: string; value: string; updated_at: string }>) => {
    const map: Record<string, { value: string; updated_at: string }> = {};
    rows.forEach((r) => { map[r.key] = { value: r.value, updated_at: r.updated_at }; });

    const next: SystemStatusState = {
      online: map.system_online?.value !== 'false',
      message: map.system_status_message?.value || 'Orders are processing normally.',
      statusText: map.status_text?.value || 'System Online',
      updatedAt: map.system_online?.updated_at || new Date().toISOString(),
    };
    setStatus(next);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('site_settings')
      .select('key, value, updated_at')
      .in('key', ['system_online', 'system_status_message', 'status_text']);

    if (data && data.length > 0) {
      applyRows(data as any);
    } else {
      setLoading(false);
    }
  }, [applyRows]);

  useEffect(() => {
    // Initial fetch
    refresh();

    // Realtime subscription for instant updates
    const channel = supabase
      .channel('system-status-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'site_settings',
        },
        () => {
          // Re-fetch all keys on any change to site_settings
          refresh();
        }
      )
      .subscribe();

    // Fallback poll in case realtime disconnects
    const interval = setInterval(refresh, FALLBACK_POLL_INTERVAL);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return (
    <SystemStatusContext.Provider value={{ status, loading, refresh }}>
      {children}
    </SystemStatusContext.Provider>
  );
};
