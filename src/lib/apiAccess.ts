/* The seller's side of the DataYego API (owner, 21 Nov 2026): apply, keys, today's figures, latest API orders and
   their prices. Everything comes from phase1.my_api_account() for the signed-in account; the plain key is only ever
   returned by my_api_new_key(), once. Wording is plain (owner: "Be using simple words"). */

export const API_BASE_URL = "https://api.datayego.com/v1";

export type ApiStatus = "none" | "pending" | "active" | "suspended";
export type ApiOrderStatus = "queued" | "processing" | "verifying" | "on_hold" | "delivered" | "refunded" | "cancelled";

export interface ApiKeyRow { id: string; mode: "live" | "test"; hint: string; created_at: string; last_used_at: string | null }
export interface ApiOrderRow { reference: string; your_reference: string | null; status: ApiOrderStatus; network: string; size_gb: number; phone: string; price: number; created_at: string }
export interface ApiPriceRow { id: string; network: string; size_gb: number; price: number; available: boolean }
export interface ApiWebhookDelivery { id: number; event: string; test: boolean; status: "pending" | "delivered" | "failed"; attempts: number; last_status: number | null; last_error: string | null; created_at: string; delivered_at: string | null; next_attempt_at: string | null; reference: string | null }
export interface ApiWebhook { url: string | null; secret_hint: string | null; deliveries: ApiWebhookDelivery[] }
export interface ApiAccount {
  status: ApiStatus;
  name?: string | null;
  applied_at?: string | null;
  approved_at?: string | null;
  keys: ApiKeyRow[];
  today: { orders: number; spent: number; delivered: number };
  orders: ApiOrderRow[];
  prices: ApiPriceRow[];
  webhook?: ApiWebhook | null;
  allowed_ips?: string[] | null;
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

/** How one webhook delivery went, in plain words. */
export function deliveryLabel(d: ApiWebhookDelivery, now = Date.now()): { text: string; tone: "good" | "warn" | "bad" | "wait" } {
  if (d.status === "delivered") return { text: `Delivered${d.last_status ? ` (${d.last_status})` : ""}`, tone: "good" };
  if (d.status === "failed") return { text: "Gave up", tone: "bad" };
  if (d.attempts === 0) return { text: d.next_attempt_at && Date.parse(d.next_attempt_at) > now + 5000 ? "Sends soon" : "Sending", tone: "wait" };
  const mins = d.next_attempt_at ? Math.max(1, Math.round((Date.parse(d.next_attempt_at) - now) / 60000)) : 0;
  return { text: `Retry ${d.attempts + 1}${mins ? ` in ${mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} hr`}` : ""}`, tone: "warn" };
}

/** The IP list a seller types: one per line or separated by commas or spaces. */
export function parseIpList(text: string): string[] {
  return text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
}

export function apiSellerError(message: string): string {
  const url = message.match(/bad_url:(.+)$/);
  if (url) return url[1].trim();
  const ip = message.match(/bad_ip:(.+)$/);
  if (ip) return `"${ip[1].trim()}" is not an IP address.`;
  if (message.includes("too_many_ips")) return "Up to 10 IP addresses.";
  if (message.includes("too_many_tests")) return "That's enough test events for this hour.";
  if (message.includes("no_webhook")) return "Save your webhook address first.";
  if (message.includes("not_active")) return "Your API access is not active.";
  return "Could not save. Try again.";
}
