import { supabase } from "@/integrations/supabase/client";
import { speedPhrase, speedPill, type NetworkSpeed } from "@/hooks/useDeliverySpeed";

/* The latest order that arrived, per network, shown to every visitor above the bundles: when it was paid, when it
   landed, and how long that took. It is one real order read from the records (phase1.public_latest_delivery), with the
   number's middle hidden the way a MoMo message shows it. Nothing here is typed in by hand.
   It is shown only while it is good news that is also true of right now: the order arrived within MAX_MINUTES, not
   long ago, and the network is not running slow at this moment. When deliveries are slow the card steps aside and the
   speed line in the catalogue, which is always on, says how long orders are taking. */

export interface LatestDelivery { network: string; gb: number; phone: string; paidAt: number; deliveredAt: number; ageSeconds: number }

/** Slower than this is not a delivery to show off: it is the same line the speed pill turns amber at. */
export const MAX_MINUTES = 30;
/** Older than this and "latest" no longer says anything about today. */
export const FRESH_HOURS = 6;

interface RpcClient { rpc<T>(name: string, args?: Record<string, unknown>): PromiseLike<{ data: T | null; error: { message: string } | null }> }
const db = () => (supabase as unknown as { schema(name: string): RpcClient }).schema("phase1");

/** Only rows we can stand behind, by network name. */
export function readLatest(raw: unknown): Record<string, LatestDelivery> {
  const out: Record<string, LatestDelivery> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [network, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const d = value as Record<string, unknown>;
    const phone = typeof d.phone === "string" ? d.phone.trim() : "";
    const gb = Number(d.gb); const ageSeconds = Number(d.age_seconds);
    const paidAt = typeof d.paid_at === "string" ? Date.parse(d.paid_at) : NaN;
    const deliveredAt = typeof d.delivered_at === "string" ? Date.parse(d.delivered_at) : NaN;
    if (!network.trim() || !/^0\d{2}\*+\d{2}$/.test(phone)) continue;
    if (!Number.isFinite(gb) || gb <= 0 || !Number.isFinite(ageSeconds) || ageSeconds < 0) continue;
    if (!Number.isFinite(paidAt) || !Number.isFinite(deliveredAt) || deliveredAt < paidAt) continue;
    out[network] = { network, gb, phone, paidAt, deliveredAt, ageSeconds };
  }
  return out;
}

export async function loadLatest(): Promise<Record<string, LatestDelivery>> {
  try { const { data, error } = await db().rpc<unknown>("public_latest_delivery"); return error ? {} : readLatest(data); } catch { return {}; }
}

/** The delivery to show for a network right now, or none. `speed` is that network's live reading; until it has
    arrived nothing is shown, so the card never appears and then takes itself back. */
export function deliveryToShow(all: Record<string, LatestDelivery>, network: string, speed: NetworkSpeed | undefined): LatestDelivery | null {
  const d = all[network];
  const pill = speedPill(speed, network);
  if (!d || !pill || pill.paused || pill.slow) return null;
  if (d.ageSeconds > FRESH_HOURS * 3600) return null;
  if (d.deliveredAt - d.paidAt > MAX_MINUTES * 60_000) return null;
  return d;
}

/** "17 minutes", the way a person says it. Under half a minute of rounding never becomes "0 minutes". */
export function tookLabel(d: Pick<LatestDelivery, "paidAt" | "deliveredAt">): string {
  const minutes = Math.round((d.deliveredAt - d.paidAt) / 60_000);
  if (minutes < 1) return "Under a minute";
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
/** "1:03" and "PM" apart, so the page can set the hour large and the period small. In the visitor's own time. */
export function clockParts(at: number): { time: string; period: string } {
  const parts = clock.formatToParts(new Date(at));
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { time: `${pick("hour")}:${pick("minute")}`, period: pick("dayPeriod").toUpperCase() };
}

/** "Today" or "Yesterday", judged against the server's clock (delivery time + its age), not the phone's. */
export function dayLabel(d: Pick<LatestDelivery, "deliveredAt" | "ageSeconds">): string {
  const day = (at: number) => { const x = new Date(at); return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
  const apart = Math.round((day(d.deliveredAt + d.ageSeconds * 1000) - day(d.deliveredAt)) / 86_400_000);
  return apart <= 0 ? "Today" : apart === 1 ? "Yesterday" : "";
}

/** What the network is doing at this moment, in the same words as the speed line in the catalogue. */
export function rightNow(speed: NetworkSpeed | undefined): string {
  return speedPhrase(speed) ?? "delivering fast";
}

/** The short mark on the order row: people know their network by its colour before its name. */
export function networkMark(network: string): { text: string; tone: "mtn" | "telecel" | "at" | "other" } {
  const n = network.toLowerCase();
  if (n.includes("mtn")) return { text: "MTN", tone: "mtn" };
  if (n.includes("telecel") || n.includes("vodafone")) return { text: "TEL", tone: "telecel" };
  if (n.includes("airtel") || n.includes("tigo") || n === "at") return { text: "AT", tone: "at" };
  return { text: network.slice(0, 3).toUpperCase(), tone: "other" };
}
