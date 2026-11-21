/* Admin -> API (owner, 21 Nov 2026): who uses our API, approving and pausing them, and what they pay.
   Everything comes from phase1.admin_api_clients() / admin_api_prices(); changes go through the master-only
   admin_api_set_status / admin_api_set_price / admin_api_set_client_price / admin_api_set_enabled. */

export type ApiClientStatus = "pending" | "active" | "suspended";

export interface AdminApiClient {
  id: string; name: string; status: ApiClientStatus;
  phone: string | null; website: string | null; note: string | null;
  created_at: string; approved_at: string | null;
  email: string | null; account_name: string | null;
  agent: { store: string; slug: string; sub: boolean; status: string } | null;
  balance: number;
  keys: { mode: "live" | "test"; hint: string; created_at: string; last_used_at: string | null }[];
  orders: number; orders_today: number; delivered: number; waiting: number;
  sales: number; sales_today: number; last_order_at: string | null;
  requests_today: number; special_prices: number;
}

export interface AdminApiBundle {
  product_id: string; id: string; network: string; size_gb: number;
  cost: number | null; supplier: string | null;
  customer_price: number | null; agent_price: number | null;
  api_price: number | null; special_price: number | null;
  available: boolean;
}

export const STATUS_TEXT: Record<ApiClientStatus, { text: string; tone: "warn" | "good" | "bad" }> = {
  pending: { text: "Waiting", tone: "warn" },
  active: { text: "Active", tone: "good" },
  suspended: { text: "Paused", tone: "bad" },
};

export type ClientFilter = "pending" | "active" | "suspended" | "all";
export function filterClients(list: AdminApiClient[], f: ClientFilter): AdminApiClient[] {
  return f === "all" ? list : list.filter((c) => c.status === f);
}

/** The price a seller actually pays for a bundle: their own if set, else the standard API price, else not offered. */
export function priceFor(b: AdminApiBundle): number | null {
  return b.special_price ?? b.api_price ?? null;
}

/** What we keep on one bundle at a price: price minus what the supplier charges us. */
export function marginOf(price: number | null, cost: number | null): number | null {
  if (price == null || cost == null) return null;
  return Math.round((price - cost) * 100) / 100;
}

/** A price typed in a box: a number above zero with at most 2 decimals, or "" to clear. */
export function readPrice(text: string): number | null | "bad" {
  const t = text.trim();
  if (t === "") return null;
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return "bad";
  const n = Number(t);
  return n > 0 ? n : "bad";
}

/** Database refusals in plain words. */
export function apiAdminError(message: string): string {
  const below = message.match(/below_cost:([\d.]+)/);
  if (below) return `That is below what the supplier charges us (GH₵${Number(below[1]).toFixed(2)}).`;
  if (message.includes("admin_required")) return "Only the master admin, signed in with the two-step check, can change this.";
  if (message.includes("only_pending")) return "Only an application that is still waiting can be turned down.";
  if (message.includes("bad_price")) return "Enter a price above zero.";
  if (message.includes("not_found")) return "Not found. Refresh the page.";
  return "Could not save. Try again.";
}

export const NETWORK_ORDER = ["MTN", "Telecel", "AirtelTigo"];
export function byNetwork<T extends { network: string }>(list: T[]): [string, T[]][] {
  return NETWORK_ORDER.map((n) => [n, list.filter((b) => b.network === n)] as [string, T[]]).filter(([, l]) => l.length > 0);
}
