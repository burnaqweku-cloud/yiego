/* EmmaDataKing — https://emmadataking.com/api/v1  (header X-API-Key)
   MTN only for us, on their normal "YELLO" list (EXPRESS_YELLO is dearer, same bundle, faster queue).
   Purchase is synchronous-ish: the reply carries status COMPLETED/PROCESSING/FAILED straight away.
   Our order reference goes in as `ref`, and /order-status/:ref reads it back by that same reference.
   Money is in GHS major units (3.8 = GH₵3.80). */

const DEFAULT_BASE_URL = "https://emmadataking.com";

export interface EdkResult<T = EdkPayload> { ok: boolean; status: number; payload: T | null; durationMs: number }
export interface EdkPayload {
  status?: string; message?: string; error?: string;
  data?: {
    id?: string; type?: string; status?: string; transaction_code?: string; reference?: string; network?: string; recipient?: string;
    capacity?: string; amount?: number; created_at?: string; delivered_at?: string | null; remaining_balance?: number;
    // /balance
    balance?: number; currency?: string; account_name?: string;
    // /verify-number
    phoneNumber?: string; state?: string; verified?: boolean; registration_required?: boolean; title?: string; source?: string;
  };
}

function config() {
  const apiKey = Deno.env.get("EMMADATAKING_API_KEY");
  if (!apiKey) throw new Error("EMMADATAKING_API_KEY is not configured");
  return { apiKey, baseUrl: (Deno.env.get("EMMADATAKING_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/$/, "") };
}

async function call(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<EdkResult> {
  const { apiKey, baseUrl } = config();
  const started = Date.now();
  const { timeoutMs = 30_000, ...rest } = init;
  const response = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: { "X-API-Key": apiKey, Accept: "application/json", ...(rest.body ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = (await response.json().catch(() => null)) as EdkPayload | null;
  const ok = response.ok && (payload?.status ?? "success") !== "error";
  return { ok, status: response.status, payload, durationMs: Date.now() - started };
}

/** Their network codes → ours. Both MTN lists are MTN. */
export const NETWORK_OF_CODE: Record<string, string> = { YELLO: "MTN", EXPRESS_YELLO: "MTN", TELECEL: "TELECEL", EXPRESS_TELECEL: "TELECEL", at: "AIRTELTIGO", AT_PREMIUM: "AIRTELTIGO", EXPRESS_AT: "AIRTELTIGO" };

export function purchase(input: { network: string; capacity: string; phoneNumber: string; ref: string }) {
  return call("/api/v1/purchase", { method: "POST", body: JSON.stringify({ network: input.network, capacity: String(input.capacity), phoneNumber: input.phoneNumber, ref: input.ref }) });
}
export function checkOrderStatus(reference: string) {
  return call(`/api/v1/order-status/${encodeURIComponent(reference)}`, { method: "GET", timeoutMs: 15_000 });
}
export function getBalance() { return call("/api/v1/balance", { method: "GET", timeoutMs: 15_000 }); }
export function verifyNumber(phoneNumber: string, network = "YELLO") {
  return call("/api/v1/verify-number", { method: "POST", body: JSON.stringify({ phoneNumber, network }), timeoutMs: 20_000 });
}

/** COMPLETED → delivered; FAILED / REJECTED / REFUNDED / CANCELLED → failed_needs_review; anything else is still running. */
export function mapStatus(status?: string | null) {
  switch ((status ?? "").toUpperCase()) {
    case "COMPLETED": case "DELIVERED": case "SUCCESS": return "delivered" as const;
    case "FAILED": case "REJECTED": case "REFUNDED": case "CANCELLED": case "CANCELED": return "failed_needs_review" as const;
    default: return "processing" as const; // PENDING, PROCESSING, QUEUED
  }
}
export function isConfigured() { return Boolean(Deno.env.get("EMMADATAKING_API_KEY")); }
