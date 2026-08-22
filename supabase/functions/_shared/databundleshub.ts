/* ══════════════════════════════════════════════════════════════
   DataBundlesHub client.

   Differs from DataMartGH in three ways that matter:
     • the network is inferred from the phone prefix and cannot be
       overridden, so a ported number is a real failure mode;
     • there are no webhooks, so delivery is confirmed by polling
       /purchase-status with the requestId. Their documentation
       names /check_order_status with an order_id instead; that
       route returns "could not be found" on the live API, so the
       reply's own requestId is what we keep;
     • the wallet balance is not exposed, so an empty float shows
       up only as an INSUFFICIENT_BALANCE error on a live order.
   ══════════════════════════════════════════════════════════════ */

const DEFAULT_BASE_URL = "https://www.databundleshub.com";

export interface DataBundlesHubResult {
  ok: boolean;
  status: number;
  payload: DataBundlesHubPayload | null;
  durationMs: number;
}

export interface DataBundlesHubPayload {
  success?: boolean;
  message?: string;
  error?: string;
  code?: string;
  error_code?: string;
  data?: {
    requestId?: number;
    purchaseId?: number;
    /** Their own queue state; delivery to the customer is orderStatus. */
    processingStatus?: string;
    transactionReference?: string;
    network?: string;
    capacity?: string | number;
    price?: number;
    remainingBalance?: number;
    orderStatus?: string;
    /* purchase-status */
    order_id?: number;
    status?: string;
    status_description?: string;
    is_completed?: boolean;
  };
}

function config() {
  const apiKey = Deno.env.get("DATABUNDLESHUB_API_KEY");
  if (!apiKey) throw new Error("DATABUNDLESHUB_API_KEY is not configured");
  const baseUrl = (Deno.env.get("DATABUNDLESHUB_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  return { apiKey, baseUrl };
}

async function call(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<DataBundlesHubResult> {
  const { apiKey, baseUrl } = config();
  const started = Date.now();
  const { timeoutMs = 30_000, ...rest } = init;

  const response = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(rest.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = (await response.json().catch(() => null)) as DataBundlesHubPayload | null;
  // Their transport can return 200 with success:false, so both are checked.
  const ok = response.ok && payload?.success !== false;
  return { ok, status: response.status, payload, durationMs: Date.now() - started };
}

/** Ghana prefixes, exactly as their documentation lists them. We check this
 *  ourselves before ordering: they infer the network from the number and give
 *  no way to override it, so a mismatch would silently deliver to the wrong
 *  network rather than fail. */
const PREFIXES: Record<string, string[]> = {
  MTN: ["024", "025", "053", "054", "055", "059"],
  TELECEL: ["020", "050"],
  AIRTELTIGO: ["026", "027", "056", "057"],
};

export function networkFromPrefix(phone: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  const local = digits.startsWith("233") ? `0${digits.slice(3)}` : digits;
  const prefix = local.slice(0, 3);
  for (const [network, list] of Object.entries(PREFIXES)) {
    if (list.includes(prefix)) return network;
  }
  return null;
}

/** Their smallest Telecel order is 10GB. */
export const TELECEL_MIN_GB = 10;

export interface PurchaseInput {
  phoneNumber: string;
  capacityGb: number | string;
  idempotencyKey: string;
}

export function purchase(input: PurchaseInput) {
  return call("/api/developer/purchase", {
    method: "POST",
    headers: { "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      phoneNumber: input.phoneNumber,
      capacity: String(input.capacityGb),
      idempotency_key: input.idempotencyKey,
    }),
  });
}

/** Polled with the requestId from the purchase reply. Auth travels in the
 *  Bearer header, as it does everywhere else. */
export function checkOrderStatus(requestId: number | string) {
  const query = `?request_id=${encodeURIComponent(String(requestId))}`;
  return call(`/api/developer/purchase-status${query}`, { method: "GET", timeoutMs: 15_000 });
}

/** Their statuses → ours. `verified` means accepted upstream but not yet with
 *  the customer, so it stays "processing" — only delivered/completed finish. */
export function mapStatus(status?: string | null) {
  switch ((status ?? "").toLowerCase()) {
    case "delivered":
    case "completed":
      return "delivered" as const;
    case "failed":
      return "failed_needs_review" as const;
    case "pending":
    case "verified":
    default:
      return "processing" as const;
  }
}

export function isConfigured() {
  return Boolean(Deno.env.get("DATABUNDLESHUB_API_KEY"));
}
