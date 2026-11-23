/* Agents' sales page (owner, 23 Nov 2026): wording and small sums for a parent agent's view of their sub-agents'
   sales. Times are Ghana time (Africa/Accra, UTC+0 all year). */

export type SalesPeriod = "today" | "7d" | "30d" | "all";
export const PERIODS: Array<{ id: SalesPeriod; label: string }> = [
  { id: "today", label: "Today" }, { id: "7d", label: "7 days" }, { id: "30d", label: "30 days" }, { id: "all", label: "All time" },
];

/** "today", "in the last 7 days", … for sentences. */
export function periodPhrase(p: SalesPeriod) {
  return p === "today" ? "today" : p === "7d" ? "in the last 7 days" : p === "30d" ? "in the last 30 days" : "since they joined";
}

const TZ = "Africa/Accra";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const time = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(d).replace(/\s/g, " ").toLowerCase();

/** How fresh an agent's last sale is: drives the dot beside it. */
export function saleFreshness(iso: string | null | undefined, now: Date = new Date()): "today" | "week" | "older" | "never" {
  if (!iso) return "never";
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return "today";
  return now.getTime() - d.getTime() <= 7 * 86400000 ? "week" : "older";
}

/** "Today, 10:42 am" · "Yesterday, 3:10 pm" · "Mon 17 Nov" (this week) · "2 Oct" · "2 Oct 2025" · "No sales yet". */
export function lastSaleLabel(iso: string | null | undefined, now: Date = new Date()) {
  if (!iso) return "No sales yet";
  const d = new Date(iso);
  const yesterday = new Date(now.getTime() - 86400000);
  if (dayKey(d) === dayKey(now)) return `Today, ${time(d)}`;
  if (dayKey(d) === dayKey(yesterday)) return `Yesterday, ${time(d)}`;
  const opts: Intl.DateTimeFormatOptions = now.getTime() - d.getTime() < 7 * 86400000 ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short" };
  if (dayKey(d).slice(0, 4) !== dayKey(now).slice(0, 4)) opts.year = "numeric";
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: TZ }).format(d).replace(",", "");
}

/** Width of an agent's bar: their share of the period's sales, at least a sliver when they sold anything. */
export function barPercent(sales: number, total: number) {
  if (!(sales > 0) || !(total > 0)) return 0;
  return Math.max(4, Math.min(100, Math.round((sales / total) * 100)));
}

/** Short day label for the chart: "Mon", or "17" for 30 days. */
export function dayLabel(day: string, long: boolean) {
  const d = new Date(`${day}T12:00:00Z`);
  return long ? String(d.getUTCDate()) : new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(d);
}
