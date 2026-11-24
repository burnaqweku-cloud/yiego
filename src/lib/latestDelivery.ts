import { supabase } from "@/integrations/supabase/client";
import { cached } from "@/lib/requestCache";
import { speedPhrase, speedPill, type NetworkSpeed } from "@/hooks/useDeliverySpeed";

/* The latest order that arrived, per network, shown to every visitor above the bundles: when it was paid, when it
   landed, and how long that took. It is one real order read from the records (phase1.public_latest_delivery), with the
   number's middle hidden the way a MoMo message shows it. Nothing here is typed in by hand.
   It is shown only while it is good news that is also true of right now: the order arrived within MAX_MINUTES, not
   long ago, and the network is not running slow at this moment. When deliveries are slow the card steps aside and the
   speed line in the catalogue, which is always on, says how long orders are taking.
   The owner can switch that last part off (Admin → Operations → Status, "Latest delivery card": `always`): then the
   latest real delivery is shown however long it took. It still needs a delivery in the last FRESH_HOURS and a network
   that is not paused, since there is nothing true to show without one and nobody can buy while it is paused. */

export interface LatestDelivery { network: string; gb: number; phone: string; paidAt: number; deliveredAt: number; ageSeconds: number }

/** Slower than this is not a delivery to show off: it is the same line the speed pill turns amber at. */
export const MAX_MINUTES = 30;
/** Older than this and "latest" no longer says anything about today. */
export const FRESH_HOURS = 6;

interface RpcClient { rpc<T>(name: string, args?: Record<string, unknown>): PromiseLike<{ data: T | null; error: { message: string } | null }> }
const db = () => (supabase as unknown as { schema(name: string): RpcClient }).schema("phase1");

/** Only rows we can stand behind, by network name. Keys starting with "_" are settings, never a network. */
export function readLatest(raw: unknown): Record<string, LatestDelivery> {
  const out: Record<string, LatestDelivery> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [network, value] of Object.entries(raw as Record<string, unknown>)) {
    if (network.startsWith("_") || !value || typeof value !== "object") continue;
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

/** What the server sends: the deliveries, and the owner's switches. Anything unclear means the card switch is off;
    the speed switch is on unless the server plainly says it is off (older copies of the server send no "_speed" key,
    and they still showed the speed). */
export interface LatestFeed { all: Record<string, LatestDelivery>; always: boolean; speedOn: boolean }
export function readFeed(raw: unknown): LatestFeed {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const rule = obj?._rule;
  const speed = obj?._speed;
  return {
    all: readLatest(raw),
    always: !!rule && typeof rule === "object" && (rule as Record<string, unknown>).always === true,
    speedOn: !(!!speed && typeof speed === "object" && (speed as Record<string, unknown>).enabled === false),
  };
}

/** Shared for 30 seconds, so the shop band and the bundle list ask once between them. */
export async function loadLatest(): Promise<LatestFeed> {
  try {
    return await cached("public:latest-delivery", 30_000, async () => {
      const { data, error } = await db().rpc<unknown>("public_latest_delivery");
      return { ok: !error, feed: error ? readFeed(null) : readFeed(data) };
    }, { keep: (v) => v.ok }).then((v) => v.feed);
  } catch { return readFeed(null); }
}

/** The delivery to show for a network right now, or none. `speed` is that network's live reading; until it has
    arrived nothing is shown, so the card never appears and then takes itself back. `always` is the owner's switch:
    on, a slow delivery or a slow network no longer hides it. */
export function deliveryToShow(all: Record<string, LatestDelivery>, network: string, speed: NetworkSpeed | undefined, always = false): LatestDelivery | null {
  const d = all[network];
  const pill = speedPill(speed, network);
  if (!d || !pill || pill.paused) return null;
  if (d.ageSeconds > FRESH_HOURS * 3600) return null;
  if (always) return d;
  if (pill.slow || d.deliveredAt - d.paidAt > MAX_MINUTES * 60_000) return null;
  return d;
}

/** One key per order: give it to the board, so the journey line draws again when a newer delivery takes its place. */
export const boardKey = (d: Pick<LatestDelivery, "network" | "deliveredAt">) => `${d.network}-${d.deliveredAt}`;

/** "17 minutes", the way a person says it; an hour or more in hours and minutes ("9 hr 45 min", owner 18 Nov 2026:
    "585 minutes" was hard to read). Under half a minute of rounding never becomes "0 minutes". */
export function tookLabel(d: Pick<LatestDelivery, "paidAt" | "deliveredAt">): string {
  const minutes = Math.round((d.deliveredAt - d.paidAt) / 60_000);
  if (minutes < 1) return "Under a minute";
  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
  return `${h} hr ${m} min`;
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

/** What the network is doing at this moment, in the same words as the speed line in the catalogue. While the latest
    delivery is on show, that delivery is the answer (owner, 21 Nov 2026: "every counting should be using it"). */
export function rightNow(speed: NetworkSpeed | undefined, shown?: LatestDelivery | null): string {
  return speedPhrase(shown ? speedOfDelivery(speed, shown) : speed) ?? "delivering fast";
}

/** A network's speed read from one delivery: how long it took, paid to delivered. */
export function speedOfDelivery(base: NetworkSpeed | undefined, d: Pick<LatestDelivery, "paidAt" | "deliveredAt">): NetworkSpeed {
  return { window: "1h", sample: Math.max(1, base?.sample ?? 1), median_minutes: Math.max(0, (d.deliveredAt - d.paidAt) / 60_000), at_least: false, paused: base?.paused };
}

/** Every network's speed, with the latest delivery standing in wherever its card is on show (owner, 21 Nov 2026: one
    card said "3 minutes" and the line under it "about 4 minutes"; "since the latest MTN delivery mode is active every
    counting should be using it"). So the speed pills, the bundle lists, stores, the delivery-times page and agents'
    order notes all say what the card says. A network whose card is not shown keeps its measured speed, so a slow
    network is never made to look quick: the card itself decides (deliveryToShow), with the owner's switch. */
export function withLatest(speeds: Record<string, NetworkSpeed>, feed: LatestFeed): Record<string, NetworkSpeed> {
  const out: Record<string, NetworkSpeed> = { ...speeds };
  for (const [network, speed] of Object.entries(speeds)) {
    const d = deliveryToShow(feed.all, network, speed, feed.always);
    if (d) out[network] = speedOfDelivery(speed, d);
  }
  return out;
}

/** The short mark on the order row: people know their network by its colour before its name. */
export function networkMark(network: string): { text: string; tone: "mtn" | "telecel" | "at" | "other" } {
  const n = network.toLowerCase();
  if (n.includes("mtn")) return { text: "MTN", tone: "mtn" };
  if (n.includes("telecel") || n.includes("vodafone")) return { text: "TEL", tone: "telecel" };
  if (n.includes("airtel") || n.includes("tigo") || n === "at") return { text: "AT", tone: "at" };
  return { text: network.slice(0, 3).toUpperCase(), tone: "other" };
}
