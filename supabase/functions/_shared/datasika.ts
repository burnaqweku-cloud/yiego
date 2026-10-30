/* DataSika — https://nrsfvhztpzwkadwciizp.supabase.co/functions/v1  (Authorization: Bearer dsk_live_…)
   Data bundles are bought by THEIR product_id (from /api-catalog), not by network + GB, so the purchase
   looks the product up live by network + bundle size. Every buy carries an Idempotency-Key: re-sending the
   same key returns the original order instead of charging twice (that is how a no-answer resend stays safe).
   Delivery is asynchronous: poll /api-order-status?order_id=… (their API-… id). Money is GHS major units. */

const DEFAULT_BASE_URL = "https://nrsfvhztpzwkadwciizp.supabase.co/functions/v1";

export interface DsResult<T = Record<string, any>> { ok: boolean; status: number; payload: T | null; durationMs: number }

function config() {
  const apiKey = Deno.env.get("DATASIKA_API_KEY");
  if (!apiKey) throw new Error("DATASIKA_API_KEY is not configured");
  return { apiKey, baseUrl: (Deno.env.get("DATASIKA_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/$/, "") };
}

async function call(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<DsResult> {
  const { apiKey, baseUrl } = config();
  const started = Date.now();
  const { timeoutMs = 30_000, ...rest } = init;
  const response = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", ...(rest.body ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, any> | null;
  return { ok: response.ok && !payload?.error, status: response.status, payload, durationMs: Date.now() - started };
}

/** Our network codes / names → theirs. */
export function networkName(code?: string | null) {
  const c = (code ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  if (c === "MTN" || c === "YELLO") return "MTN";
  if (c === "TELECEL" || c === "VODAFONE") return "Telecel";
  if (c === "AIRTELTIGO" || c === "AT") return "AirtelTigo";
  return code ?? "";
}

export function getCatalog() { return call("/api-catalog", { method: "GET", timeoutMs: 15_000 }); }

/** Their product_id for a network + bundle size, read from the live catalog. */
export async function findProductId(network: string, gb: string | number) {
  const r = await getCatalog();
  if (!r.ok) return { productId: null, price: null, catalog: r };
  const items: any[] = r.payload?.services?.data_bundles?.items ?? [];
  const want = networkName(network).toLowerCase();
  const hit = r.payload?.services?.data_bundles?.available === false ? undefined : items.find((i) => String(i.network ?? "").toLowerCase() === want && Number(i.bundle_gb) === Number(gb) && Number(gb) > 0 && Number.isFinite(Number(i.price)) && Number(i.price) > 0 && (!i.currency || i.currency === "GHS"));
  return { productId: hit?.product_id ?? null, price: hit?.price ?? null, catalog: r };
}

export function buyData(input: { productId: string; recipient: string; idempotencyKey: string; correlationId?: string }) {
  return call("/api-buy-data", {
    method: "POST",
    headers: { "Idempotency-Key": input.idempotencyKey, ...(input.correlationId ? { "X-Correlation-Id": input.correlationId } : {}) },
    body: JSON.stringify({ product_id: input.productId, recipient: input.recipient }),
  });
}
export function checkOrderStatus(orderId: string) {
  return call(`/api-order-status?order_id=${encodeURIComponent(orderId)}`, { method: "GET", timeoutMs: 15_000 });
}
export function getWallet() { return call("/api-wallet", { method: "GET", timeoutMs: 15_000 }); }

/** Their numbers are 10 digits starting with 0; ours are stored +233… */
export function localPhone(phone: string) {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (d.startsWith("233") && d.length === 12) return `0${d.slice(3)}`;
  if (d.length === 9) return `0${d}`;
  return d;
}

/** delivered → delivered; refunded (money back) and failed/refund_processing → failed_needs_review; else running. */
export function mapStatus(status?: string | null) {
  switch ((status ?? "").toLowerCase()) {
    case "delivered": case "completed": case "success": return "delivered" as const;
    case "failed": case "refunded": case "refund_processing": case "cancelled": case "canceled": return "failed_needs_review" as const;
    default: return "processing" as const; // pending, processing, held for review
  }
}
/** A paid supplier failure is not safe to resend until the supplier confirms the credit. */
export function deliveryState(status?: string | null) {
  const mapped = mapStatus(status);
  return mapped === "failed_needs_review" && status?.toLowerCase() !== "refunded" ? "processing" as const : mapped;
}

/** 409 request_in_progress is an uncertain purchase, not a refusal: keep the same key. */
export function purchaseHttpStatus(status: number, payload: Record<string, any>, accepted: boolean) {
  if (payload.error === "request_in_progress") return 408;
  if (!accepted && status >= 200 && status < 300) return 502;
  return status;
}
export function isConfigured() { return Boolean(Deno.env.get("DATASIKA_API_KEY")); }
