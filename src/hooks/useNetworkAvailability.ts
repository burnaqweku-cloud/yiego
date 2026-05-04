import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Network } from '@/data/bundles';

export interface NetworkAvailability {
  MTN: { available: boolean; message: string };
  Telecel: { available: boolean; message: string };
  AirtelTigo: { available: boolean; message: string };
}

const defaultAvailability: NetworkAvailability = {
  MTN: { available: true, message: '' },
  Telecel: { available: true, message: '' },
  AirtelTigo: { available: true, message: '' },
};

const NETWORKS_LIST: Network[] = ['MTN', 'Telecel', 'AirtelTigo'];

export function useNetworkAvailability() {
  const [availability, setAvailability] = useState<NetworkAvailability>(defaultAvailability);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const keys = NETWORKS_LIST.flatMap(n => [`network_available_${n}`, `network_message_${n}`]);
    const { data } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', keys);

    if (data && data.length > 0) {
      const map: Record<string, string> = {};
      data.forEach((r: any) => { map[r.key] = r.value; });

      const next = { ...defaultAvailability };
      for (const n of NETWORKS_LIST) {
        next[n] = {
          available: map[`network_available_${n}`] !== 'false',
          message: map[`network_message_${n}`] || '',
        };
      }
      setAvailability(next);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();

    const channel = supabase
      .channel('network-availability-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'site_settings' },
        () => { refresh(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  const isNetworkAvailable = useCallback((network: Network): boolean => {
    return availability[network]?.available ?? true;
  }, [availability]);

  const getNetworkMessage = useCallback((network: Network): string => {
    return availability[network]?.message || `${network} orders are temporarily unavailable. Please try again later.`;
  }, [availability]);

  return { availability, loading, refresh, isNetworkAvailable, getNetworkMessage };
}
