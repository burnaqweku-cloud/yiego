/* InstantDataGH — https://instantdatagh.com/api.php
   Header x-api-key. Money comes back as "GH₵45.30" strings plus *_raw numbers. */

const DEFAULT_BASE_URL = "https://instantdatagh.com/api.php";

export interface InstantResult<T = InstantPayload> { ok: boolean; status: number; payload: T | null; durationMs: number }
export interface InstantPayload {
  status?: string; message?: string; error?: string;
  data?: { order_id?: string | number; network?: string; phone_number?: string; data_amount?: string; amount?: string; status?: string; remaining_balance?: string; created_date?: string };
  // /order-status returns the fields at top level
  order_id?: string | number; network?: string; phone_number?: string; data_amount?: string; amount?: string; created_date?: string;
  // /balance
  balance?: string; balance_raw?: number; user_id?: string | number; username?: string;
}

function config() {
  const apiKey = Deno.env.get("INSTANTDATAGH_API_KEY");
  if (!apiKey) throw new Error("INSTANTDATAGH_API_KEY is not configured");
  return { apiKey, baseUrl: (Deno.env.get("INSTANTDATAGH_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/$/, "") };
}

async function call(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<InstantResult> {
  const { apiKey, baseUrl } = config();
  const started = Date.now();
  const { timeoutMs = 30_000, ...rest } = init;
  const response = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: { "x-api-key": apiKey, Accept: "application/json", ...(rest.body ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = (await response.json().catch(() => null)) as InstantPayload | null;
  const ok = response.ok && (payload?.status ?? "success") !== "error";
  return { ok, status: response.status, payload, durationMs: Date.now() - started };
}

/** "GH₵45.30" → 45.3 */
export function parseMoney(value: unknown): number | null {
  if (typeof value === "number") return value;
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && String(value ?? "").trim() !== "" ? n : null;
}

export const NETWORK_NAMES: Record<string, string> = { mtn: "MTN", telecel: "Telecel", airteltigo: "AirtelTigo" };

export function purchase(input: { network: string; phoneNumber: string; dataAmount: string }) {
  return call("/orders", { method: "POST", body: JSON.stringify({ network: input.network, phone_number: input.phoneNumber, data_amount: input.dataAmount }) });
}
export function checkOrderStatus(orderId: string | number) {
  return call(`/order-status?order_id=${encodeURIComponent(String(orderId))}`, { method: "GET", timeoutMs: 15_000 });
}
export function getBalance() { return call("/balance", { method: "GET", timeoutMs: 15_000 }); }

export function mapStatus(status?: string | null) {
  switch ((status ?? "").toLowerCase()) {
    case "completed": return "delivered" as const;
    case "failed": case "refunded": return "failed_needs_review" as const;
    default: return "processing" as const; // processing, awaiting_delivery
  }
}
export function isConfigured() { return Boolean(Deno.env.get("INSTANTDATAGH_API_KEY")); }
