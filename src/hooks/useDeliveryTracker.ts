import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type DeliverySeverity = 'healthy' | 'good' | 'moderate' | 'slow' | 'delayed';

export interface DeliveryTrackerData {
  message: string;
  severity: DeliverySeverity;
  scannerActive: boolean;
  waiting: number;
  waitSeconds: number | null;
  lastDelivered: any | null;
  checkingNow: any | null;
  startedAt: string | null;
  stats: any | null;
  fetchedAt: string;
}

interface UseDeliveryTrackerResult {
  data: DeliveryTrackerData | null;
  loading: boolean;
  error: boolean;
}

const REFRESH_INTERVAL = 20_000;

export function useDeliveryTracker(): UseDeliveryTrackerResult {
  const [data, setData] = useState<DeliveryTrackerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCategoryRef = useRef<string | null>(null);

  const fetchEstimate = useCallback(async () => {
    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke(
        'delivery-tracker',
        { method: 'POST', body: {} }
      );

      if (fnErr || !fnData) {
        setError(true);
        return;
      }

      const payload = fnData as DeliveryTrackerData;

      // Always update data so severity, message, and all fields stay in sync
      setData(payload);

      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEstimate();
    intervalRef.current = setInterval(fetchEstimate, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchEstimate]);

  return { data, loading, error };
}
