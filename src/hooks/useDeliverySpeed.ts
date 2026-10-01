import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/* Per-network delivery speed for the catalogue: median of the last 2 hours when there are
   at least 3 deliveries, otherwise the most recent delivered order (within 12 hours). */
export interface NetworkSpeed { window: "2h" | "last" | "stale"; sample: number; median_minutes: number; last_at?: string }
export function useDeliverySpeed() {
  const [speeds, setSpeeds] = useState<Record<string, NetworkSpeed>>({});
  useEffect(() => {
    let cancelled = false;
    void (supabase as unknown as { schema: (s: string) => { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: Record<string, NetworkSpeed> | null }> } })
      .schema("phase1").rpc("delivery_speed_by_network", {}).then(({ data }) => { if (!cancelled && data) setSpeeds(data); });
    return () => { cancelled = true; };
  }, []);
  return speeds;
}
export function speedLabel(s: NetworkSpeed | undefined): string | null {
  if (!s) return null;
  const m = Math.round(s.median_minutes);
  if (m < 1) return "under a minute";
  if (m < 60) return `~${m} min`;
  const h = Math.round(m / 60 * 10) / 10;
  return `~${h} hr`;
}
