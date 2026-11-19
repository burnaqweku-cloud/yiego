import { speedPill, type NetworkSpeed } from "@/hooks/useDeliverySpeed";
import type { LatestDelivery } from "@/lib/latestDelivery";

/* Slow delivery as a range (owner, 19 Nov 2026). When the latest-delivery card is not shown, the shop says how long
   orders are taking as "From … Up to …": how long the last delivered order took (paid to delivered), and the longest
   wait since payment of an order still in progress (delivery_speed_by_network longest_minutes; a single stuck order
   far beyond the rest is left out there). The middle figure is not used. Smaller first: when deliveries restart the
   oldest orders land first, so the last delivered can be the longer one. Hours and minutes to the minute ("11 hr 18 min
   to 11 hr 36 min", owner 19 Nov 2026 20:22: "11.3 hours" read as 11 hours 30, but it is 11 hours 18; this replaced
   the one-decimal hours of earlier that day); whole hours "4 hours"; under an hour in minutes. Slow means either figure is over 30 minutes; with neither, nothing is shown.
   No totals, no word about refunds or orders failing. */

export interface DeliveryRange { network: string; from: string; to: string; text: string }

export const SLOW_MINUTES = 30;

/** "40 min", "4 hours", "1 hour", "11 hr 18 min": to the minute, never a decimal. */
export function durationLabel(minutes: number): string {
  const m = Math.max(1, Math.round(Math.max(0, minutes)));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (r === 0) return h === 1 ? "1 hour" : `${h} hours`;
  return `${h} hr ${r} min`;
}

/** "4 hr 20 min to 6 hr 27 min", "20 min to 6 hr 20 min". When both fall in the same hour, only the higher one, as
    "about 11 hr 36 min" (owner, 19 Nov 2026 20:25: "11 hr 18 min to 11 hr 36 min" says nothing more than "about 11 hr
    36 min"; the two figures come back once the lower one is in another hour). Order of a and b does not matter. */
export function rangeText(a: number, b: number): { from: string; to: string; text: string } {
  const lo = Math.max(1, Math.round(Math.min(a, b))), hi = Math.max(1, Math.round(Math.max(a, b)));
  const to = durationLabel(hi);
  if (Math.floor(lo / 60) === Math.floor(hi / 60)) return { from: to, to, text: `about ${to}` };
  const from = durationLabel(lo);
  return { from, to, text: `${from} to ${to}` };
}

/** The range for a network, or null: paused, nothing measured yet, or neither figure over SLOW_MINUTES. With only
    one of the two figures (nobody waiting, or no delivery to read), that one alone ("about 4 hr 10 min"). */
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
