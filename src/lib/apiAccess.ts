/* The seller's side of the DataYego API (owner, 21 Nov 2026): apply, keys, today's figures, latest API orders and
   their prices. Everything comes from phase1.my_api_account() for the signed-in account; the plain key is only ever
   returned by my_api_new_key(), once. Wording is plain (owner: "Be using simple words"). */

export const API_BASE_URL = "https://api.datayego.com/v1";

export type ApiStatus = "none" | "pending" | "active" | "suspended";
export type ApiOrderStatus = "queued" | "processing" | "verifying" | "on_hold" | "delivered" | "refunded" | "cancelled";

export interface ApiKeyRow { id: string; mode: "live" | "test"; hint: string; created_at: string; last_used_at: string | null }
export interface ApiOrderRow { reference: string; your_reference: string | null; status: ApiOrderStatus; network: string; size_gb: number; phone: string; price: number; created_at: string }
export interface ApiPriceRow { id: string; network: string; size_gb: number; price: number; available: boolean }
export interface ApiAccount {
  status: ApiStatus;
  name?: string | null;
  applied_at?: string | null;
  approved_at?: string | null;
  keys: ApiKeyRow[];
  today: { orders: number; spent: number; delivered: number };
  orders: ApiOrderRow[];
  prices: ApiPriceRow[];
}

export const EMPTY_ACCOUNT: ApiAccount = { status: "none", keys: [], today: { orders: 0, spent: 0, delivered: 0 }, orders: [], prices: [] };

/** What the seller reads for each order status, and its colour. */
export function orderStatusLabel(s: ApiOrderStatus): { text: string; tone: "good" | "warn" | "wait" | "bad" | "muted" } {
  switch (s) {
    case "delivered": return { text: "Delivered", tone: "good" };
    case "processing": return { text: "Delivering", tone: "wait" };
    case "queued": return { text: "In line", tone: "wait" };
    case "verifying": return { text: "MTN verifying", tone: "warn" };
    case "on_hold": return { text: "Checking", tone: "warn" };
    case "refunded": return { text: "Refunded", tone: "muted" };
    case "cancelled": return { text: "Cancelled", tone: "muted" };
  }
}

/** 0241234567 -> 024****567, the way the rest of the dashboard shows a customer's number. */
export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length >= 10 ? `${d.slice(0, 3)}****${d.slice(-3)}` : phone;
}

/** "2 min ago", "3 hr ago", "yesterday", or a date. */
export function agoLabel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
  if (h < 48) return "yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** The first request to try, ready to paste. */
export function curlExample(key = "YOUR_API_KEY"): string {
  return `curl ${API_BASE_URL}/bundles \\\n  -H "Authorization: Bearer ${key}"`;
}
