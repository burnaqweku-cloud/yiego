/**
 * Global real-time Site Notice context.
 * Subscribes to `site_notices` via Supabase Realtime so all pages
 * see notice changes instantly without refresh.
 *
 * DEV TEST CHECKLIST (not visible to users):
 * - Toggle banner ON  → shows instantly on all pages
 * - Edit message       → updates instantly on all pages
 * - Toggle OFF         → disappears instantly on all pages
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SiteNoticeState {
  id?: string;
  enabled: boolean;
  severity: 'info' | 'warning' | 'outage' | 'success';
  title: string;
  message: string;
  affected_network: string;
  start_time?: string | null;
  end_time?: string | null;
}

const defaultNotice: SiteNoticeState = {
  enabled: false,
  severity: 'info',
  title: '',
  message: '',
  affected_network: 'All',
};

interface SiteNoticeContextValue {
  notice: SiteNoticeState;
  loading: boolean;
}

const SiteNoticeContext = createContext<SiteNoticeContextValue>({
  notice: defaultNotice,
  loading: true,
});

export const useSiteNotice = () => useContext(SiteNoticeContext);

export const SiteNoticeProvider = ({ children }: { children: ReactNode }) => {
  const [notice, setNotice] = useState<SiteNoticeState>(defaultNotice);
  const [loading, setLoading] = useState(true);

  const fetchNotice = useCallback(async () => {
    const { data } = await supabase
      .from('site_notices')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (data) {
      setNotice({
        id: data.id,
        enabled: data.enabled,
        severity: data.severity as SiteNoticeState['severity'],
        title: data.title,
        message: data.message,
        affected_network: data.affected_network,
        start_time: data.start_time,
        end_time: data.end_time,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchNotice();

    // Realtime subscription for instant updates
    const channel = supabase
      .channel('site-notice-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'site_notices' },
        () => { fetchNotice(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchNotice]);

  return (
    <SiteNoticeContext.Provider value={{ notice, loading }}>
      {children}
    </SiteNoticeContext.Provider>
  );
};
