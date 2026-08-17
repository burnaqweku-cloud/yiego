import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/* ══════════════════════════════════════════════════════════════
   How fast bundles are landing right now.

   The figure is measured from the supplier's live tracker and
   refreshed server-side on a schedule, so the browser never
   touches the supplier. An admin's typed estimate overrides it.
   Silence is the correct fallback: when nothing is known this
   returns null and the UI shows nothing rather than a guess.
   ══════════════════════════════════════════════════════════════ */

export interface DeliveryStatus {
  estimate: string | null;
  slow: boolean;
  source: "manual" | "measured" | "none";
  measuredMinutes: number | null;
}

export function useDeliveryStatus() {
  const [status, setStatus] = useState<DeliveryStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.functions.invoke<{
        estimate?: string | null; slow?: boolean; source?: DeliveryStatus["source"]; measured_minutes?: number | null;
      }>("supplier-delivery-status", { method: "GET" });
      if (cancelled || error || !data?.estimate) return;
      setStatus({
        estimate: data.estimate,
        slow: Boolean(data.slow),
        source: data.source ?? "none",
        measuredMinutes: data.measured_minutes ?? null,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  return status;
}
