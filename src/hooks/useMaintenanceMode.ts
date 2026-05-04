import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  eta: string;
  bypassToken: string;
  loading: boolean;
}

const DEFAULT_STATE: MaintenanceState = {
  enabled: false,
  message: "We're improving DataSika for a better experience.",
  eta: '',
  bypassToken: '',
  loading: true,
};

export const useMaintenanceMode = () => {
  const [state, setState] = useState<MaintenanceState>(DEFAULT_STATE);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', [
        'site_maintenance_enabled',
        'maintenance_message',
        'maintenance_eta',
        'maintenance_bypass_token',
      ]);

    if (data) {
      const map = Object.fromEntries(data.map((r) => [r.key, r.value]));
      setState({
        enabled: map['site_maintenance_enabled'] === 'true',
        message:
          map['maintenance_message'] ||
          "We're improving DataSika for a better experience.",
        eta: map['maintenance_eta'] || '',
        bypassToken: map['maintenance_bypass_token'] || '',
        loading: false,
      });
    } else {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetchSettings();

    // Subscribe to real-time changes on maintenance-related settings
    const channel = supabase
      .channel('maintenance-settings-watch')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'site_settings',
          filter: "key=in.(site_maintenance_enabled,maintenance_message,maintenance_eta,maintenance_bypass_token)",
        },
        (payload: any) => {
          const { key, value } = payload?.new || {};
          if (!key) return;
          setState((prev) => {
            const next = { ...prev };
            if (key === 'site_maintenance_enabled') next.enabled = value === 'true';
            else if (key === 'maintenance_message') next.message = value || prev.message;
            else if (key === 'maintenance_eta') next.eta = value || '';
            else if (key === 'maintenance_bypass_token') next.bypassToken = value || '';
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSettings]);

  return { ...state, refetch: fetchSettings };
};
