import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/* Per-network delivery speed for the catalogue. Middle value of: orders still waiting (time waited so far)
   + orders delivered that were paid in the last hour (time taken). Nothing to measure -> "delivering normally". */
export interface NetworkSpeed { window: "1h" | "none"; sample: number; median_minutes: number; at_least?: boolean; paused?: boolean }
export function useDeliverySpeed() {
  const [speeds, setSpeeds] = useState<Record<string, NetworkSpeed>>({});
  useEffect(() => {
    let cancelled = false;
    const p1 = (supabase as unknown as { schema: (s: string) => { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: Record<string, NetworkSpeed> | null }>; from: (t: string) => { select: (c: string) => Promise<{ data: Array<{ name: string; is_paused: boolean }> | null }> } } }).schema("phase1");
    void Promise.all([p1.rpc("delivery_speed_by_network", {}), p1.from("networks").select("name, is_paused")]).then(([{ data }, nets]) => {
      if (cancelled) return;
      const next: Record<string, NetworkSpeed> = { ...(data ?? {}) };
      for (const n of nets.data ?? []) {
        if (!next[n.name]) next[n.name] = { window: "none", sample: 0, median_minutes: 0 };   // nothing to measure
        if (n.is_paused) next[n.name] = { ...next[n.name], paused: true };
      }
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
/** "about 20 minutes" / "over 5 hours" from a measurement, or null when nothing is measured. */
export function speedPhrase(s: NetworkSpeed | undefined): string | null {
  if (!s || s.paused || s.window === "none" || s.sample === 0) return null;
  const m = Math.round(s.median_minutes);
  const core = m < 1 ? "under a minute" : m < 60 ? `${m} minute${m === 1 ? "" : "s"}` : m < 120 ? "about an hour" : `${Math.round(m / 60)} hours`;
  if (s.at_least) return `over ${core.replace(/^about /, "")}`;
  return m < 1 || core.startsWith("about") ? core : `about ${core}`;
}
/** Wording + tone for the pill. Slow (over 30 min) shows amber so delays are visible, not hidden in a number. */
export function speedPill(s: NetworkSpeed | undefined, network = "MTN"): { text: string; slow: boolean; paused?: boolean } | null {
  if (!s) return null;
  if (s.paused) return { text: `${network} not taking orders right now · check back later`, slow: false, paused: true };
  if (s.window === "none" || s.sample === 0) return { text: `${network} delivering normally`, slow: false };
  const label = speedLabel(s); if (!label) return null;
  const slow = s.median_minutes > 30;
  return { text: `${network} delivering in ${label}`, slow };
}
