import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/* Per-network delivery speed for the catalogue: median of the last 2 hours when there are
   at least 3 deliveries, otherwise the most recent delivered order (within 12 hours). */
export interface NetworkSpeed { window: "2h" | "last" | "stale"; sample: number; median_minutes: number; at_least?: boolean; last_at?: string }
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
  const core = m < 1 ? "under a minute" : m < 60 ? `${m} min` : `${Math.round(m / 60 * 10) / 10} hr`;
  return s.at_least ? `over ${core}` : m < 1 ? core : `~${core}`;
}
/** Wording + tone for the pill. Slow (over 30 min) shows amber so delays are visible, not hidden in a number. */
export function speedPill(s: NetworkSpeed | undefined, network = "MTN"): { text: string; slow: boolean } | null {
  const label = speedLabel(s); if (!s || !label) return null;
  const slow = s.median_minutes > 30;
  if (s.window === "stale") {
    const ago = s.last_at ? Math.round((Date.now() - new Date(s.last_at).getTime()) / 3_600_000) : null;
    return { text: `Last ${network} order took ${label}${ago ? ` · ${ago} hr ago` : ""}`, slow: false };
  }
  return { text: slow ? `${network} delays: orders taking ${label}` : `${network} delivering in ${label}`, slow };
}
