export const DATAMARTGH_BASE_URL =
  Deno.env.get("DATAMARTGH_BASE_URL") ?? "https://api.datamartgh.shop/api/developer";

export type DataMartGHAction =
  | "get_packages"
  | "verify_number"
  | "purchase"
  | "check_order_status"
  | "get_balance";

export function getDataMartGHHeaders(extraHeaders?: HeadersInit) {
  const apiKey = Deno.env.get("DATAMARTGH_API_KEY");
  const apiSecret = Deno.env.get("DATAMARTGH_API_SECRET");

  if (!apiKey) {
    throw new Error("DATAMARTGH_API_KEY is not configured");
  }

  const headers = new Headers(extraHeaders);
  headers.set("X-API-Key", apiKey);
  headers.set("Content-Type", "application/json");

  if (apiSecret) {
    headers.set("X-API-Secret", apiSecret);
  }

  return headers;
}

export async function callDataMartGH(
  path: string,
  init: RequestInit = {},
) {
  const startedAt = Date.now();
  const response = await fetch(`${DATAMARTGH_BASE_URL}${path}`, {
    ...init,
    headers: getDataMartGHHeaders(init.headers),
  });

  const text = await response.text();
  let payload: unknown = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
    durationMs: Date.now() - startedAt,
  };
}

export function mapDataMartGHStatusToYieGo(status: string | undefined) {
  switch ((status ?? "").toLowerCase()) {
    case "completed":
      return "delivered";
    case "failed":
      return "failed_needs_review";
    case "refunded":
      return "refunded";
    case "pending":
    case "waiting":
    case "processing":
      return "pending_supplier";
    default:
      return "processing";
  }
}

export function requireInternalSecret(req: Request) {
  const expected = Deno.env.get("YIEGO_INTERNAL_FUNCTION_SECRET");

  if (!expected) {
    throw new Error("YIEGO_INTERNAL_FUNCTION_SECRET is not configured");
  }

  if (req.headers.get("X-YieGo-Internal-Secret") !== expected) {
    return false;
  }

  return true;
}

export async function verifyDataMartGHSignature(rawBody: string, signature: string | null) {
  const secret = Deno.env.get("DATAMARTGH_WEBHOOK_SECRET");

  if (!secret || !signature) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expected = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return result === 0;
}
