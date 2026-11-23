/* The last delivered order at the top of Admin → Orders (owner, 23 Nov 2026), from phase1.admin_last_delivered():
   one per network, the same choice of order as the public latest-delivery card, with the admin's details. */

export interface LastDelivered { network: string; id: string; reference: string; gb: number; phone: string; paidAt: number; deliveredAt: number; supplier: string | null; store: string | null; api: boolean; amount: number }

export const NETWORK_ORDER = ["MTN", "Telecel", "AirtelTigo"];

export function readLastDelivered(raw: unknown): Record<string, LastDelivered> {
  const out: Record<string, LastDelivered> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [network, v] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
    if (!v || typeof v !== "object") continue;
    const paidAt = Date.parse(String(v.paid_at)), deliveredAt = Date.parse(String(v.delivered_at));
    if (!Number.isFinite(paidAt) || !Number.isFinite(deliveredAt) || typeof v.reference !== "string") continue;
    out[network] = { network, id: String(v.id ?? ""), reference: v.reference, gb: Number(v.gb) || 0, phone: String(v.phone ?? ""), paidAt, deliveredAt,
      supplier: typeof v.supplier === "string" ? v.supplier : null, store: typeof v.store === "string" ? v.store : null, api: v.api === true, amount: Number(v.amount) || 0 };
  }
  return out;
}

/** Slower than the 30 minutes the public card allows. */
export const tookSlow = (d: Pick<LastDelivered, "paidAt" | "deliveredAt">) => d.deliveredAt - d.paidAt > 30 * 60_000;

/** "just now", "4 min ago", "1 hr 5 min ago", "Yesterday 9:12 pm" (Ghana time). */
export function deliveredAgo(at: number, now: number = Date.now()) {
  const min = Math.max(0, Math.floor((now - at) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) { const h = Math.floor(min / 60), m = min % 60; return m ? `${h} hr ${m} min ago` : `${h} hr ago`; }
  const d = new Date(at);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Accra" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Accra" }).format(d).replace(/\s/g, " ").toLowerCase();
  return `${day}, ${time}`;
}

/** Where it was bought: "Our site", the store's name, or "API". */
export const boughtOn = (d: Pick<LastDelivered, "store" | "api">) => (d.api ? "API" : d.store ?? "Our site");
