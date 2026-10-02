import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/* Per-network delivery speed for the catalogue: median of the last 2 hours when there are
   at least 3 deliveries, otherwise the most recent delivered order (within 12 hours). */
export interface NetworkSpeed { window: "2h" | "last" | "stale"; sample: number; median_minutes: number; at_least?: boolean; last_at?: string; paused?: boolean }
export function useDeliverySpeed() {
  const [speeds, setSpeeds] = useState<Record<string, NetworkSpeed>>({});
  useEffect(() => {
    let cancelled = false;
    const p1 = (supabase as unknown as { schema: (s: string) => { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: Record<string, NetworkSpeed> | null }>; from: (t: string) => { select: (c: string) => Promise<{ data: Array<{ name: string; is_paused: boolean }> | null }> } } }).schema("phase1");
    void Promise.all([p1.rpc("delivery_speed_by_network", {}), p1.from("networks").select("name, is_paused")]).then(([{ data }, nets]) => {
      if (cancelled) return;
      const next: Record<string, NetworkSpeed> = { ...(data ?? {}) };
      for (const n of nets.data ?? []) if (n.is_paused) next[n.name] = { ...(next[n.name] ?? { window: "stale", sample: 0, median_minutes: 0 }), paused: true };
      setSpeeds(next);
    });
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
export function speedPill(s: NetworkSpeed | undefined, network = "MTN"): { text: string; slow: boolean; paused?: boolean } | null {
  if (s?.paused) return { text: `${network} not taking orders right now · check back later`, slow: false, paused: true };
  const label = speedLabel(s); if (!s || !label) return null;
  const slow = s.median_minutes > 30;
  if (s.window === "stale") {
    const ago = s.last_at ? Math.round((Date.now() - new Date(s.last_at).getTime()) / 3_600_000) : null;
    return { text: `Last ${network} order took ${label}${ago ? ` · ${ago} hr ago` : ""}`, slow: false };
  }
  return { text: slow ? `${network} delays: orders taking ${label}` : `${network} delivering in ${label}`, slow };
}
