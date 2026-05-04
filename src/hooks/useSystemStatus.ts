import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SystemStatus {
  online: boolean;
  message: string;
  statusText: string;
  updatedAt: string;
}

export function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus>({
    online: true,
    message: 'Orders are processing normally.',
    statusText: 'System Online',
    updatedAt: new Date().toISOString(),
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('site_settings')
      .select('key, value, updated_at')
      .in('key', ['system_online', 'system_status_message', 'status_text']);

    if (data && data.length > 0) {
      const map: Record<string, { value: string; updated_at: string }> = {};
      data.forEach((r: any) => { map[r.key] = { value: r.value, updated_at: r.updated_at }; });
      
      setStatus({
        online: map.system_online?.value !== 'false',
        message: map.system_status_message?.value || 'Orders are processing normally.',
        statusText: map.status_text?.value || 'System Online',
        updatedAt: map.system_online?.updated_at || new Date().toISOString(),
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const updateStatus = useCallback(async (online: boolean, message: string, statusText?: string) => {
    await supabase.from('site_settings').update({ value: String(online) }).eq('key', 'system_online');
    await supabase.from('site_settings').update({ value: message }).eq('key', 'system_status_message');
    if (statusText !== undefined) {
      await supabase.from('site_settings').update({ value: statusText }).eq('key', 'status_text');
    }
    await refresh();
  }, [refresh]);

  return { status, loading, refresh, updateStatus };
}
