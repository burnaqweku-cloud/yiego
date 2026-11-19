import { speedPill, type NetworkSpeed } from "@/hooks/useDeliverySpeed";
import type { LatestDelivery } from "@/lib/latestDelivery";

/* Slow delivery as a range (owner, 19 Nov 2026). When the latest-delivery card is not shown, the shop says how long
   orders are taking as "From … Up to …": how long the last delivered order took (paid to delivered), and the longest
   wait since payment of an order still in progress (delivery_speed_by_network longest_minutes; a single stuck order
   far beyond the rest is left out there). The middle figure is not used. Smaller first: when deliveries restart the
   oldest orders land first, so the last delivered can be the longer one. Whole hours, rounded ("4 to 6 hours");
   under an hour in minutes, in fives. Slow means either figure is over 30 minutes; with neither, nothing is shown.
   No totals, no word about refunds or orders failing. */

export interface DeliveryRange { network: string; from: string; to: string; text: string }

export const SLOW_MINUTES = 30;

interface Part { n: number; unit: "min" | "hr" }
function part(minutes: number): Part {
  const m = Math.max(0, minutes);
  if (m < 57.5) return { n: Math.max(5, Math.round(m / 5) * 5), unit: "min" };
  return { n: Math.max(1, Math.round(m / 60)), unit: "hr" };
}
const say = (p: Part) => (p.unit === "min" ? `${p.n} min` : `${p.n} hour${p.n === 1 ? "" : "s"}`);

/** "4 to 6 hours", "20 min to 6 hours", "about 6 hours" when both round the same. Order of a and b does not matter. */
export function rangeText(a: number, b: number): { from: string; to: string; text: string } {
  const lo = part(Math.min(a, b)), hi = part(Math.max(a, b));
  const from = say(lo), to = say(hi);
  if (lo.unit === hi.unit && lo.n === hi.n) return { from, to, text: `about ${to}` };
  if (lo.unit === hi.unit) return { from, to, text: lo.unit === "hr" ? `${lo.n} to ${hi.n} hours` : `${lo.n} to ${hi.n} min` };
  return { from, to, text: `${from} to ${to}` };
}

/** The range for a network, or null: paused, nothing measured yet, or neither figure over SLOW_MINUTES. With only
    one of the two figures (nobody waiting, or no delivery to read), that one alone ("about 4 hours"). */
export function deliveryRange(network: string, speed: NetworkSpeed | undefined, last: LatestDelivery | undefined): DeliveryRange | null {
  if (!speed || speed.paused || speed.window === "none" || speed.sample === 0) return null;
  const figures: number[] = [];
  if (last) figures.push((last.deliveredAt - last.paidAt) / 60_000);
  const longest = Number(speed.longest_minutes);
  if (Number.isFinite(longest) && longest > 0) figures.push(longest);
  if (!figures.length || Math.max(...figures) <= SLOW_MINUTES) return null;
  return { network, ...rangeText(Math.min(...figures), Math.max(...figures)) };
}

/** The one-line version for the bundle lists and the delivery-times page: the range while slow, otherwise the
    usual speed line (paused, or fast). Same shape as speedPill. */
export function speedLine(network: string, speed: NetworkSpeed | undefined, last: LatestDelivery | undefined): { text: string; slow: boolean; paused?: boolean } | null {
  const pill = speedPill(speed, network);
  if (pill?.paused) return pill;
  const r = deliveryRange(network, speed, last);
  return r ? { text: `${network} orders taking ${r.text}`, slow: true } : pill;
}
