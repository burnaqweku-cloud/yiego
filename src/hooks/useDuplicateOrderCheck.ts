import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DuplicateCheckResult {
  blocked: boolean;
  existingOrderId?: string;
  message?: string;
}

/**
 * Debounced real-time duplicate order check for a phone number.
 * Only fires when the phone is a valid 10-digit Ghana number.
 * Fails open (non-blocking) on network errors.
 */
export function useDuplicateOrderCheck(phone: string, debounceMs = 600) {
  const [result, setResult] = useState<DuplicateCheckResult>({ blocked: false });
  const [checking, setChecking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController>();

  useEffect(() => {
    // Clear previous timer
    if (timerRef.current) clearTimeout(timerRef.current);

    // Only check valid 10-digit Ghana numbers
    const cleaned = phone.replace(/[^0-9]/g, '');
    if (!/^0[2-5][0-9]{8}$/.test(cleaned)) {
      setResult({ blocked: false });
      setChecking(false);
      return;
    }

    setChecking(true);

    timerRef.current = setTimeout(async () => {
      // Abort previous in-flight request
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const { data, error } = await supabase.functions.invoke('check-duplicate-order', {
          body: { phone: cleaned },
        });

        if (controller.signal.aborted) return;

        if (error || !data) {
          // Fail open
          setResult({ blocked: false });
        } else {
          setResult({
            blocked: !!data.blocked,
            existingOrderId: data.existingOrderId,
            message: data.message,
          });
        }
      } catch {
        // Fail open
        if (!controller.signal.aborted) {
          setResult({ blocked: false });
        }
      } finally {
        if (!controller.signal.aborted) {
          setChecking(false);
        }
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phone, debounceMs]);

  return { ...result, checking };
}
