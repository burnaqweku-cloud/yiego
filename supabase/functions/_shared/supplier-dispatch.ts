/**
 * Multi-supplier dispatch layer.
 * Routes orders to the correct supplier based on routing_rules.
 * Falls back to Supplier A (env vars) if no routing rule exists.
 * Now logs all dispatch attempts to order_dispatch_attempts table.
 * Supports manual dispatch mode — skips supplier API when manual mode active.
 * Supports: SUPPLIER_A, DATAMART, DATACART
 */

import { DATACART_BASE_URL, resolveDataCartProviderMapping, type DataCartResolvedMapping } from "./datacart-catalog.ts";

const MAX_RETRIES = 2;

// ─── Bulk dispatch queue: dispatch mode + feature flag helpers ──────
//
// site_settings.value is a TEXT column that stores a JSON-shaped string.
// supabase-js does NOT auto-parse text columns, so we MUST JSON.parse here.
// On any parse error we fall back to 'auto' (the safe default = ship now).

export type DispatchMode = "auto" | "manual_bulk" | "paused";
const VALID_MODES: ReadonlySet<DispatchMode> = new Set(["auto", "manual_bulk", "paused"]);

function parseSiteSettingValue(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/**
 * Returns the current dispatch mode. Falls back to 'auto' on any error
 * (missing row, malformed JSON, network error). 'auto' = today's behavior.
 *
 * Backward compat: if the stored mode is the legacy literal "manual" it is
 * treated as "manual_bulk".
 */
export async function getDispatchMode(supabase: any): Promise<DispatchMode> {
  try {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "dispatch_mode")
      .maybeSingle();
    const parsed = parseSiteSettingValue(data?.value);
    let mode = parsed?.mode;
    if (mode === "manual") mode = "manual_bulk"; // legacy alias
    if (typeof mode === "string" && VALID_MODES.has(mode as DispatchMode)) {
      return mode as DispatchMode;
    }
    return "auto";
  } catch (err) {
    console.warn("[dispatch] getDispatchMode failed, defaulting to auto:", err);
    return "auto";
  }
}

/**
 * Legacy helper kept for backward compatibility with existing call sites.
 * Returns true when dispatch mode is 'manual_bulk' OR the legacy 'manual'.
 * New code should call getDispatchMode() and shouldQueueOrder().
 */
export async function isManualDispatchMode(supabase: any): Promise<boolean> {
  const mode = await getDispatchMode(supabase);
  return mode === "manual_bulk";
}

/**
 * Validates a dispatch mode value before writing it back to site_settings.
 * Throws if the value is not one of the allowed modes.
 */
export function assertValidDispatchMode(mode: string): asserts mode is DispatchMode {
  if (!VALID_MODES.has(mode as DispatchMode)) {
    throw new Error(`Invalid dispatch mode: ${mode}. Must be one of: ${[...VALID_MODES].join(", ")}`);
  }
}

/**
 * Reads the bulk_dispatch_queue_enabled feature flag from site_settings.
 * Defaults to FALSE on any error so live behavior is never changed by accident.
 */
export async function isBulkDispatchQueueEnabled(supabase: any): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "bulk_dispatch_queue_enabled")
      .maybeSingle();
    const parsed = parseSiteSettingValue(data?.value);
    return parsed?.enabled === true;
  } catch (err) {
    console.warn("[dispatch] isBulkDispatchQueueEnabled failed, defaulting to false:", err);
    return false;
  }
}

/**
 * Decide whether an order should be queued instead of dispatched immediately.
 *
 * GATE 1 (the most important): if the bulk_dispatch_queue_enabled feature flag
 * is off, this ALWAYS returns false → live behavior is identical to today.
 *
 * GATE 2: only when the flag is on, check the dispatch mode. 'manual_bulk'
 * means queue; 'auto' / 'paused' / anything else means do not queue here.
 *
 * When this returns true the caller MUST:
 *   1. Persist the order with its normal status fields.
 *   2. Set queue_state = 'queued' on the correct table.
 *   3. SKIP the dispatchToSupplier call.
 *
 * @param orderTable 'orders' or 'agent_orders' — declares which table the
 *   caller is writing to. Used for logging/observability; the actual queue
 *   row is written by the caller (this helper is decision-only).
 */
export async function shouldQueueOrder(
  supabase: any,
  order: { order_id?: string; network?: string } | null | undefined,
  orderTable: "orders" | "agent_orders",
): Promise<boolean> {
  // GATE 1: feature flag (off by default → identical live behavior)
  const enabled = await isBulkDispatchQueueEnabled(supabase);
  if (!enabled) return false;

  // GATE 2: only queue when mode is manual_bulk
  const mode = await getDispatchMode(supabase);
  if (mode !== "manual_bulk") return false;

  console.log(
    `[queue] Will queue order_id=${order?.order_id ?? "?"} network=${order?.network ?? "?"} table=${orderTable}`,
  );
  return true;
}

export interface DispatchResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
  supplierCode: string;
  supplierId: string | null;
}

// ─── Normalized error code mapping ──────────────────────────
const INSUFFICIENT_FUNDS_PATTERNS = [
  "insufficient wallet balance",
  "insufficient balance",
  "insufficient funds",
];

// DataCart-specific non-retryable error codes
const DATACART_NON_RETRYABLE = new Set([
  "UNAUTHORIZED",
  "ACCOUNT_SUSPENDED",
  "INSUFFICIENT_BALANCE",
  "PLAN_INACTIVE",
  "MISSING_FIELD",
  "INVALID_JSON",
  "ORDER_FAILED",
  "INVALID_INPUT",
  "INVALID_PROVIDER_MAPPING",
  "MISSING_PROVIDER_MAPPING",
  "MISSING_PROVIDER_NETWORK_MAPPING",
  "MISSING_PROVIDER_PLAN_MAPPING",
  "DATACART_NETWORK_UNAVAILABLE",
]);

function normalizeErrorCode(message: string | undefined | null): string | null {
  if (!message) return null;
  const lower = message.toLowerCase().trim();
  for (const pattern of INSUFFICIENT_FUNDS_PATTERNS) {
    if (lower.includes(pattern)) return "INSUFFICIENT_FUNDS";
  }
  return null;
}

const UUIDISH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidLike(value: unknown): boolean {
  return typeof value === "string" && UUIDISH_RE.test(value.trim());
}

function toReadableText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const text = value
      .map((item) => toReadableText(item))
      .filter(Boolean)
      .join("; ");
    return text || JSON.stringify(value);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return toReadableText(record.message)
      || toReadableText(record.error)
      || toReadableText(record.reason)
      || JSON.stringify(value);
  }
  return String(value);
}

function extractStructuredProviderError(parsed: Record<string, unknown>) {
  const nestedError = parsed.error && typeof parsed.error === "object"
    ? parsed.error as Record<string, unknown>
    : null;

  const code = toReadableText(
    parsed.code
    ?? parsed.error_code
    ?? nestedError?.code
    ?? nestedError?.error_code
    ?? parsed.status_code
  );

  const message = toReadableText(
    parsed.provider_message
    ?? parsed.message
    ?? nestedError?.message
    ?? parsed.details
    ?? parsed.error
  );

  return { code, message };
}

function buildDataCartFailureResult(
  code: string,
  message: string,
  debug: Record<string, unknown> = {}
): { ok: false; status: number; body: Record<string, unknown> } {
  return {
    ok: false,
    status: 400,
    body: {
      error: code,
      code,
      error_code: code,
      message,
      provider_message: message,
      debug: {
        supplier_code: "DATACART",
        error_code: code,
        error_message: message,
        ...debug,
      },
    },
  };
}

function extractDispatchFailure(body: Record<string, unknown>, status: number) {
  const structured = extractStructuredProviderError(body);
  const code = structured.code
    || toReadableText(body.error_code)
    || toReadableText(body.code)
    || `HTTP_${status}`;
  const providerMessage = structured.message
    || toReadableText(body.provider_message)
    || toReadableText(body.error)
    || toReadableText(body.message)
    || null;
  const message = toReadableText(body.message)
    || providerMessage
    || `Supplier returned HTTP ${status}`;

  return {
    code,
    message,
    providerMessage: providerMessage || message,
  };
}

function normalizeDispatchFailureBody(body: Record<string, unknown>, status: number): Record<string, unknown> {
  const failure = extractDispatchFailure(body, status);
  const debug = body.debug && typeof body.debug === "object"
    ? body.debug as Record<string, unknown>
    : {};

  return {
    ...body,
    code: failure.code,
    error_code: failure.code,
    message: failure.message,
    provider_message: failure.providerMessage,
    debug: {
      ...debug,
      error_code: failure.code,
      error_message: failure.message,
      provider_message: failure.providerMessage,
    },
  };
}

// ─── Network code mapping for DataMart ──────────────────────
const DATAMART_NETWORK_MAP: Record<string, string> = {
  MTN: "YELLO",
  Telecel: "TELECEL",
  AirtelTigo: "AT_PREMIUM",
};

// ─── Supplier A adapter (existing) ──────────────────────────
async function sendToSupplierA(
  payload: { network: string; phone_number: string; data_amount: string },
  attempt = 1
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  // Prefer supplier-specific secrets; fall back to legacy SUPPLIER_API_* for backward compatibility
  const baseUrl = Deno.env.get("SUPPLIER_A_API_BASE_URL") || Deno.env.get("SUPPLIER_API_BASE_URL");
  const apiKey = Deno.env.get("SUPPLIER_A_API_KEY") || Deno.env.get("SUPPLIER_API_KEY");
  if (!baseUrl || !apiKey) {
    return { ok: false, status: 0, body: { error: "Supplier A API not configured" } };
  }
  const url = baseUrl.replace(/\/+$/, "") + "/orders";

  const debug: Record<string, unknown> = {
    request_url: url,
    request_method: "POST",
    request_headers: ["Content-Type", "x-api-key"],
    request_body: payload,
  };

  try {
    console.log(`[SupplierA Attempt ${attempt}] ${url}`, JSON.stringify(payload));
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(payload),
    });
    const bodyText = await response.text();
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(bodyText); } catch { parsed = { raw: bodyText }; }

    debug.http_status = response.status;
    debug.response_text = bodyText;

    if (response.ok) return { ok: true, status: response.status, body: { ...parsed, debug } };
    if (response.status >= 500 && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return sendToSupplierA(payload, attempt + 1);
    }
    debug.error_message = parsed.message || parsed.error || `HTTP ${response.status}`;
    return { ok: false, status: response.status, body: { ...parsed, debug } };
  } catch (err) {
    console.error(`[SupplierA Attempt ${attempt}] Network error:`, err);
    debug.http_status = 0;
    debug.error_message = String(err);
    debug.response_text = null;
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return sendToSupplierA(payload, attempt + 1);
    }
    return { ok: false, status: 0, body: { error: String(err), debug } };
  }
}

// ─── AfroHubGH adapter (Supplier D) ───────────────────────────
// Endpoints confirmed from AfroHubGH docs:
//   POST {BASE}/v1/orders            { network_id, plan_id, phone_numbers[], client_reference, notes }
//   GET  {BASE}/v1/account/balance   → { success, data: { balance, currency, wallet_status } }
//   GET  {BASE}/v1/orders/:reference → full order details
//   GET  {BASE}/v1/orders/:reference/status → quick status
// Auth: Authorization: Bearer ahg_live_xxxx
// Requires per-product mapping (network_id + plan_id UUIDs) in supplier_plan_mappings
// before any live dispatch. If mapping is missing, fail-fast with MAPPING_REQUIRED.
async function sendToAfroHubGH(
  payload: { network: string; phone_number: string; data_amount: string; network_id?: string; plan_id?: string },
  clientReference?: string,
  attempt = 1,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const baseUrl = Deno.env.get("AFROHUBGH_API_BASE_URL");
  const apiKey = Deno.env.get("AFROHUBGH_API_KEY");

  const debug: Record<string, unknown> = {
    supplier_code: "AFROHUBGH",
    request_body: payload,
  };

  if (!baseUrl || !apiKey) {
    return {
      ok: false, status: 0,
      body: {
        error: "SETUP_REQUIRED", code: "SETUP_REQUIRED", error_code: "SETUP_REQUIRED",
        message: "AfroHubGH supplier is not configured. Add AFROHUBGH_API_BASE_URL and AFROHUBGH_API_KEY secrets.",
        debug: { ...debug, setup_required: true },
      },
    };
  }

  if (!payload.network_id || !payload.plan_id) {
    return {
      ok: false, status: 0,
      body: {
        error: "MAPPING_REQUIRED", code: "MAPPING_REQUIRED", error_code: "MAPPING_REQUIRED",
        message: "AfroHubGH requires network_id + plan_id mapping for this product. Configure in Admin → Routing.",
        debug: { ...debug, mapping_required: true },
      },
    };
  }

  const url = baseUrl.replace(/\/+$/, "") + "/v1/orders";
  const body = {
    network_id: payload.network_id,
    plan_id: payload.plan_id,
    phone_numbers: [payload.phone_number.replace(/\s/g, "")],
    client_reference: clientReference || `YG-${Date.now()}`,
    notes: "YieGo",
  };
  debug.request_url = url;
  debug.request_body = body;

  try {
    console.log(`[AfroHubGH Attempt ${attempt}] ${url}`);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    const bodyText = await response.text();
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(bodyText); } catch { parsed = { raw: bodyText }; }
    debug.http_status = response.status;
    debug.response_text = bodyText;

    // AfroHubGH success shape: { success: true, data: { order_id, reference, status, ... } }
    if (response.ok && (parsed as any)?.success !== false) {
      return { ok: true, status: response.status, body: { ...parsed, debug } };
    }
    if (response.status >= 500 && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return sendToAfroHubGH(payload, clientReference, attempt + 1);
    }
    const errObj: any = (parsed as any)?.error;
    debug.error_message = errObj?.message || errObj?.code || (parsed as any)?.message || `HTTP ${response.status}`;
    return { ok: false, status: response.status, body: { ...parsed, debug } };
  } catch (err) {
    console.error(`[AfroHubGH Attempt ${attempt}] Network error:`, err);
    debug.http_status = 0;
    debug.error_message = String(err);
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return sendToAfroHubGH(payload, clientReference, attempt + 1);
    }
    return { ok: false, status: 0, body: { error: String(err), debug } };
  }
}

export async function getAfroHubGHBalance(): Promise<{ ok: boolean; balance: number | null; error?: string }> {
  const baseUrl = Deno.env.get("AFROHUBGH_API_BASE_URL");
  const apiKey = Deno.env.get("AFROHUBGH_API_KEY");
  if (!baseUrl || !apiKey) return { ok: false, balance: null, error: "AfroHubGH not configured (SETUP_REQUIRED)" };
  try {
    const url = baseUrl.replace(/\/+$/, "") + "/v1/account/balance";
    const response = await fetch(url, { headers: { "Authorization": `Bearer ${apiKey}` } });
    const data: any = await response.json().catch(() => ({}));
    if (response.ok && data?.success !== false) {
      const balance = Number(data?.data?.balance ?? data?.balance ?? 0);
      return { ok: true, balance };
    }
    return { ok: false, balance: null, error: data?.error?.message || data?.message || `HTTP ${response.status}` };
  } catch (err) {
    return { ok: false, balance: null, error: String(err) };
  }
}

// ─── DataMart adapter ───────────────────────────────────────
async function sendToDataMart(
  payload: { network: string; phone_number: string; data_amount: string },
  attempt = 1
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const apiKey = Deno.env.get("DATAMART_API_KEY");
  if (!apiKey) {
    return { ok: false, status: 0, body: { error: "DataMart API key not configured" } };
  }
  const baseUrl = "https://api.datamartgh.shop/api/developer";
  const url = baseUrl + "/purchase";

  const mappedNetwork = DATAMART_NETWORK_MAP[payload.network] || payload.network;
  const cleanPhone = payload.phone_number.replace(/\s/g, "");
  const capacityStr = String(payload.data_amount);

  const body = {
    phoneNumber: cleanPhone,
    network: mappedNetwork,
    capacity: capacityStr,
    gateway: "wallet",
  };

  console.log(`[DataMart] Final JSON body: ${JSON.stringify(body)}`);

  const debug: Record<string, unknown> = {
    request_url: url,
    request_method: "POST",
    request_headers: ["Content-Type", "X-API-Key"],
    request_body: body,
  };

  try {
    console.log(`[DataMart Attempt ${attempt}] URL: ${url}`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(body),
    });
    const bodyText = await response.text();
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(bodyText); } catch { parsed = { raw: bodyText }; }

    debug.http_status = response.status;
    debug.response_text = bodyText;

    console.log(`[DataMart Attempt ${attempt}] Response: HTTP ${response.status}`, bodyText);

    if (response.ok) {
      // DataMart nests actual order data inside `data` object
      const d = (typeof parsed.data === "object" && parsed.data)
        ? (parsed.data as Record<string, unknown>)
        : {};
      return {
        ok: true,
        status: response.status,
        body: {
          // Use orderReference (what webhooks send) as the primary ID
          order_id: d.orderReference || d.transactionReference || parsed.order_id || null,
          transactionReference: d.transactionReference || null,
          status: parsed.status || "success",
          message: parsed.message || "Success",
          remaining_balance: d.remainingBalance ?? d.remaining_balance ?? parsed.remainingBalance ?? null,
          amount: d.price ?? parsed.amount ?? null,
          debug,
          ...parsed,
        },
      };
    }

    if (response.status === 401 || response.status === 403) {
      const authMsg = "Unauthorized: check X-API-Key header or DATAMART_API_KEY secret.";
      debug.error_message = authMsg;
      return { ok: false, status: response.status, body: { ...parsed, message: authMsg, debug } };
    }

    if (response.status >= 500 && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return sendToDataMart(payload, attempt + 1);
    }
    debug.error_message = parsed.message || parsed.error || `HTTP ${response.status}`;
    return { ok: false, status: response.status, body: { ...parsed, debug } };
  } catch (err) {
    console.error(`[DataMart Attempt ${attempt}] Network error:`, err);
    debug.http_status = 0;
    debug.error_message = String(err);
    debug.response_text = null;
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return sendToDataMart(payload, attempt + 1);
    }
    return { ok: false, status: 0, body: { error: String(err), debug } };
  }
}

// ─── DataCart adapter ───────────────────────────────────────
async function sendToDataCart(
  payload: { network: string; phone_number: string; data_amount: string },
  clientReference?: string,
  providerIds?: DataCartResolvedMapping | null,
  attempt = 1
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const apiKey = Deno.env.get("DATACART_API_KEY");
  if (!apiKey) {
    return { ok: false, status: 0, body: { error: "DataCart API key not configured" } };
  }

  // CRITICAL: Require provider-specific UUIDs — never send internal names
  if (!providerIds?.networkId || !providerIds?.planId) {
    const missingParts: string[] = [];
    if (!providerIds?.networkId) missingParts.push("network_id");
    if (!providerIds?.planId) missingParts.push("plan_id");
    const errorMsg = `Missing DataCart provider mapping for ${payload.network} ${payload.data_amount}GB (${missingParts.join(", ")})`;
    console.error(`[DataCart] ${errorMsg}`);
    return buildDataCartFailureResult("MISSING_PROVIDER_MAPPING", errorMsg);
  }

  if (!isUuidLike(providerIds.networkId) || !isUuidLike(providerIds.planId)) {
    const errorMsg = `Invalid DataCart provider mapping for ${payload.network} ${payload.data_amount}GB. network_id=${providerIds.networkId}, plan_id=${providerIds.planId}`;
    console.error(`[DataCart] ${errorMsg}`);
    return buildDataCartFailureResult("INVALID_PROVIDER_MAPPING", errorMsg, {
      mapping: {
        provider_network_id: providerIds.networkId,
        provider_plan_id: providerIds.planId,
        source: providerIds.source,
      },
    });
  }

  const baseUrl = DATACART_BASE_URL;
  const url = baseUrl + "/v1/orders";

  const cleanPhone = payload.phone_number.replace(/\s/g, "");
  const requestedSizeGb = Number.parseFloat(payload.data_amount);

  const orderBody: Record<string, unknown> = {
    network_id: providerIds.networkId,
    plan_id: providerIds.planId,
    phone_number: cleanPhone,
    client_reference: clientReference || `YG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  };

  const debug: Record<string, unknown> = {
    request_url: url,
    request_method: "POST",
    request_headers: ["Content-Type", "Authorization"],
    request_body: orderBody,
    mapping: {
      internal_network: payload.network,
      requested_size_gb: Number.isFinite(requestedSizeGb) ? requestedSizeGb : payload.data_amount,
      provider_network_id: providerIds.networkId,
      provider_network_name: providerIds.providerNetworkName,
      provider_plan_id: providerIds.planId,
      provider_plan_name: providerIds.providerPlanName,
      provider_price: providerIds.providerPrice,
      source: providerIds.source,
    },
  };

  try {
    console.log(`[DataCart Attempt ${attempt}] URL: ${url}`, JSON.stringify(orderBody));
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(orderBody),
    });
    const bodyText = await response.text();
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(bodyText); } catch { parsed = { raw: bodyText }; }

    debug.http_status = response.status;
    debug.response_text = bodyText;

    console.log(`[DataCart Attempt ${attempt}] Response: HTTP ${response.status}`, bodyText);

    if (response.ok) {
      const d = (typeof parsed.data === "object" && parsed.data)
        ? (parsed.data as Record<string, unknown>)
        : {};
      // CRITICAL FIX (Supplier C / DataCart):
      //  - `data.order_id` is a UUID — DataCart's canonical batch ID used by GET /v1/orders/{id}/status.
      //  - `data.reference` is a human ORD-YYYYMMDD-XXXXXX string — useful for admin/customer display
      //    AND the value DataCart echoes back in webhook payloads as `reference`/`order_reference`.
      //  Previously we stored the human reference as our supplier_order_id, which made the status
      //  endpoint return 404 ("Order not found") for every poll. Now we keep BOTH:
      //    - providerOrderId  -> UUID  -> stored in supplier_order_id  (used for polling)
      //    - providerReference -> ORD- -> stored in supplier_reference (used for webhook + display)
      const providerOrderId = toReadableText(
        d.order_id
        ?? d.id
        ?? parsed.order_id
        ?? parsed.id
      );
      const providerReference = toReadableText(
        d.reference
        ?? d.order_reference
        ?? parsed.reference
        ?? parsed.order_reference
      ) || providerOrderId;
      const providerStatus = toReadableText(d.status ?? d.order_status ?? parsed.status ?? parsed.order_status) || "pending";
      const providerMessage = toReadableText(d.message ?? parsed.message) || "Order created";
      return {
        ok: true,
        status: response.status,
        body: {
          ...parsed,
          order_id: providerOrderId || providerReference,
          provider_reference: providerReference,
          status: providerStatus,
          message: providerMessage,
          remaining_balance: d.balance ?? d.remaining_balance ?? parsed.balance ?? null,
          amount: d.amount ?? d.price ?? parsed.amount ?? null,
          client_reference: toReadableText(d.client_reference ?? parsed.client_reference ?? orderBody.client_reference),
          debug,
        },
      };
    }

    // Check for non-retryable DataCart errors
    const providerError = extractStructuredProviderError(parsed);
    const errorCode = providerError.code || `HTTP_${response.status}`;
    const errorMessage = providerError.message || `HTTP ${response.status}`;
    debug.error_code = errorCode;
    debug.error_message = errorMessage;
    debug.provider_message = errorMessage;

    if (DATACART_NON_RETRYABLE.has(String(errorCode))) {
      return {
        ok: false,
        status: response.status,
        body: {
          ...parsed,
          code: errorCode,
          error_code: errorCode,
          error: errorCode,
          message: errorMessage,
          provider_message: errorMessage,
          debug,
        },
      };
    }

    if (response.status === 401 || response.status === 403) {
      debug.error_code = "UNAUTHORIZED";
      debug.error_message = "Unauthorized: check DATACART_API_KEY secret.";
      return {
        ok: false,
        status: response.status,
        body: {
          ...parsed,
          code: "UNAUTHORIZED",
          error_code: "UNAUTHORIZED",
          error: "UNAUTHORIZED",
          message: debug.error_message,
          provider_message: debug.error_message,
          debug,
        },
      };
    }

    if (response.status >= 500 && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return sendToDataCart(payload, clientReference, providerIds, attempt + 1);
    }
    return {
      ok: false,
      status: response.status,
      body: {
        ...parsed,
        code: errorCode,
        error_code: errorCode,
        error: errorCode,
        message: errorMessage,
        provider_message: errorMessage,
        debug,
      },
    };
  } catch (err) {
    console.error(`[DataCart Attempt ${attempt}] Network error:`, err);
    debug.http_status = 0;
    debug.error_code = "NETWORK_ERROR";
    debug.error_message = String(err);
    debug.response_text = null;
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return sendToDataCart(payload, clientReference, providerIds, attempt + 1);
    }
    return {
      ok: false,
      status: 0,
      body: {
        error: "NETWORK_ERROR",
        code: "NETWORK_ERROR",
        error_code: "NETWORK_ERROR",
        message: String(err),
        provider_message: String(err),
        debug,
      },
    };
  }
}

// ─── DataMart Balance Check ─────────────────────────────────
export async function getDataMartBalance(): Promise<{ ok: boolean; balance: number | null; error?: string }> {
  const apiKey = Deno.env.get("DATAMART_API_KEY");
  if (!apiKey) return { ok: false, balance: null, error: "DataMart API key not configured" };

  try {
    const response = await fetch("https://api.datamartgh.shop/api/developer/balance", {
      headers: { "X-API-Key": apiKey },
    });
    const data = await response.json();
    if (response.ok) {
      return { ok: true, balance: Number(data.balance ?? data.wallet_balance ?? 0) };
    }
    return { ok: false, balance: null, error: data.message || `HTTP ${response.status}` };
  } catch (err) {
    return { ok: false, balance: null, error: String(err) };
  }
}

// ─── Supplier A Balance Check ───────────────────────────────
export async function getSupplierABalance(): Promise<{ ok: boolean; balance: number | null; error?: string }> {
  const baseUrl = Deno.env.get("SUPPLIER_A_API_BASE_URL") || Deno.env.get("SUPPLIER_API_BASE_URL");
  const apiKey = Deno.env.get("SUPPLIER_A_API_KEY") || Deno.env.get("SUPPLIER_API_KEY");
  if (!baseUrl || !apiKey) return { ok: false, balance: null, error: "Supplier A not configured" };

  try {
    const url = baseUrl.replace(/\/+$/, "") + "/balance";
    const response = await fetch(url, {
      headers: { "x-api-key": apiKey },
    });
    const data = await response.json();
    if (response.ok) {
      return { ok: true, balance: Number(data.balance ?? data.remaining_balance ?? 0) };
    }
    return { ok: false, balance: null, error: data.message || `HTTP ${response.status}` };
  } catch (err) {
    return { ok: false, balance: null, error: String(err) };
  }
}

// ─── DataCart Balance Check ─────────────────────────────────
export async function getDataCartBalance(): Promise<{ ok: boolean; balance: number | null; error?: string }> {
  const apiKey = Deno.env.get("DATACART_API_KEY");
  if (!apiKey) return { ok: false, balance: null, error: "DataCart API key not configured" };

  try {
    const response = await fetch(`${DATACART_BASE_URL}/v1/account/balance`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    const data = await response.json();
    if (response.ok) {
      const d = (typeof data.data === "object" && data.data) ? data.data as Record<string, unknown> : data;
      return { ok: true, balance: Number(d.balance ?? d.available_balance ?? 0) };
    }
    return { ok: false, balance: null, error: data.message || `HTTP ${response.status}` };
  } catch (err) {
    return { ok: false, balance: null, error: String(err) };
  }
}

// ─── DataCart Status Check ──────────────────────────────────
// Tries the canonical UUID-based path first, then falls back to a query
// lookup by human reference and finally by client_reference. This makes
// status polling resilient regardless of which identifier we have stored.
async function tryDataCartStatusEndpoint(
  apiKey: string,
  path: string
): Promise<{ ok: boolean; status: string | null; data: Record<string, unknown> | null; httpStatus: number; error?: string }> {
  try {
    const response = await fetch(`${DATACART_BASE_URL}${path}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    let responseData: any = null;
    try { responseData = await response.json(); } catch { responseData = null; }

    if (response.ok && responseData) {
      const d = (typeof responseData.data === "object" && responseData.data)
        ? responseData.data as Record<string, unknown>
        : responseData;
      const nestedOrder = typeof d.order === "object" && d.order
        ? d.order as Record<string, unknown>
        : null;
      const status = String(d.status || d.order_status || nestedOrder?.status || responseData.status || "");
      return {
        ok: true,
        httpStatus: response.status,
        status,
        data: {
          ...d,
          message: toReadableText(d.message ?? nestedOrder?.message ?? responseData.message),
        },
      };
    }
    return {
      ok: false,
      httpStatus: response.status,
      status: null,
      data: null,
      error: toReadableText(responseData?.message ?? responseData?.error) || `HTTP ${response.status}`,
    };
  } catch (err) {
    return { ok: false, httpStatus: 0, status: null, data: null, error: String(err) };
  }
}

export async function getDataCartOrderStatus(reference: string): Promise<{
  ok: boolean;
  status: string | null;
  data: Record<string, unknown> | null;
  error?: string;
}> {
  const apiKey = Deno.env.get("DATACART_API_KEY");
  if (!apiKey) return { ok: false, status: null, data: null, error: "DataCart API key not configured" };

  const ref = String(reference || "").trim();
  if (!ref) return { ok: false, status: null, data: null, error: "Empty reference" };

  // Endpoint 1: canonical UUID path /v1/orders/{id}/status
  const primary = await tryDataCartStatusEndpoint(apiKey, `/v1/orders/${encodeURIComponent(ref)}/status`);
  if (primary.ok) return { ok: true, status: primary.status, data: primary.data };

  // Only attempt fallbacks for "not found" (404). Other errors (auth, 5xx) are
  // returned immediately so we don't mask real failures.
  if (primary.httpStatus !== 404) {
    return { ok: false, status: null, data: null, error: primary.error };
  }

  // Endpoint 2: human reference lookup ?reference=ORD-...
  const byReference = await tryDataCartStatusEndpoint(apiKey, `/v1/orders/status?reference=${encodeURIComponent(ref)}`);
  if (byReference.ok) return { ok: true, status: byReference.status, data: byReference.data };

  // Endpoint 3: client_reference lookup (our DS- internal id)
  const byClient = await tryDataCartStatusEndpoint(apiKey, `/v1/orders/status?client_reference=${encodeURIComponent(ref)}`);
  if (byClient.ok) return { ok: true, status: byClient.status, data: byClient.data };

  return { ok: false, status: null, data: null, error: primary.error || "Order not found" };
}

/**
 * Log a dispatch attempt to order_dispatch_attempts table.
 * Fire-and-forget (non-blocking).
 */
export async function logDispatchAttempt(
  supabase: any,
  params: {
    orderId: string;
    attemptNo?: number;
    supplierKey: string;
    requestPayload: Record<string, unknown>;
    httpStatus: number | null;
    responseText: string | null;
    success: boolean;
    errorCode?: string | null;
    errorMessage?: string | null;
    createdBy?: string;
    retryOfAttemptId?: string | null;
  }
): Promise<string | null> {
  const normalizedErrorCode = normalizeErrorCode(params.errorMessage);
  
  try {
    // Get current attempt count
    let attemptNo = params.attemptNo;
    if (!attemptNo) {
      const { count } = await supabase
        .from("order_dispatch_attempts")
        .select("id", { count: "exact", head: true })
        .eq("order_id", params.orderId);
      attemptNo = (count || 0) + 1;
    }

    const { data, error } = await supabase
      .from("order_dispatch_attempts")
      .insert({
        order_id: params.orderId,
        attempt_no: attemptNo,
        supplier_key: params.supplierKey,
        request_payload: params.requestPayload,
        http_status: params.httpStatus,
        response_text: params.responseText,
        success: params.success,
        error_code: params.errorCode || null,
        error_message: params.errorMessage || null,
        normalized_error_code: normalizedErrorCode,
        created_by: params.createdBy || "system",
        retry_of_attempt_id: params.retryOfAttemptId || null,
      })
      .select("id")
      .single();

    if (error) {
      console.warn("[dispatch-log] Failed to log attempt:", error.message);
      return null;
    }
    return data?.id || null;
  } catch (err) {
    console.warn("[dispatch-log] Unexpected error:", err);
    return null;
  }
}

/**
 * Main dispatch function. Routes to the correct supplier based on routing_rules.
 * Falls back to Supplier A if no routing rule exists for the product.
 * Now logs dispatch attempts automatically.
 */
export async function dispatchToSupplier(
  supabase: any,
  payload: { network: string; phone_number: string; data_amount: string },
  productId?: string | null,
  opts?: { orderId?: string; createdBy?: string; retryOfAttemptId?: string | null; forceSupplierCode?: string }
): Promise<DispatchResult> {
  let supplierCode = "SUPPLIER_A";
  let supplierId: string | null = null;

  // Force-supplier override (used by admin bulk-create flow). Skips routing
  // lookup entirely so we never mutate or read routing_rules for this call.
  if (opts?.forceSupplierCode) {
    supplierCode = opts.forceSupplierCode;
    console.log(`[dispatch] FORCED supplier=${supplierCode} (productId=${productId ?? "n/a"})`);
  } else if (productId) {
    try {
      const { data: rule } = await supabase
        .from("routing_rules")
        .select("supplier_id, suppliers!inner(code, id, is_active)")
        .eq("product_id", productId)
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (rule?.suppliers?.is_active && rule.suppliers.code) {
        supplierCode = rule.suppliers.code;
        supplierId = rule.suppliers.id || rule.supplier_id;
        console.log(`[dispatch] Routed product ${productId} → ${supplierCode}`);
      }
    } catch (err) {
      console.warn("[dispatch] Routing lookup failed, defaulting to Supplier A:", err);
    }
  }

  // If no supplierId yet, resolve it from the code
  if (!supplierId) {
    try {
      const { data: supplier } = await supabase
        .from("suppliers")
        .select("id")
        .eq("code", supplierCode)
        .maybeSingle();
      supplierId = supplier?.id || null;
    } catch { /* non-fatal */ }
  }

  let result: { ok: boolean; status: number; body: Record<string, unknown> };

  if (supplierCode === "DATACART") {
    const clientRef = opts?.orderId ? String(opts.orderId).trim() : undefined;

    let providerIds: DataCartResolvedMapping | null = null;
    let mappingErrorCode = "MISSING_PROVIDER_MAPPING";
    let mappingErrorMessage = `Missing DataCart provider mapping for ${payload.network} ${payload.data_amount}GB`;

    try {
      const sizeGb = Number.parseFloat(payload.data_amount);
      const resolved = await resolveDataCartProviderMapping(supabase, {
        network: payload.network,
        sizeGb,
        productId: productId || null,
      });

      if (resolved.ok && resolved.mapping) {
        providerIds = resolved.mapping;
        console.log(
          `[dispatch] DataCart mapping resolved (${providerIds.source}): ${payload.network} ${sizeGb}GB → network=${providerIds.networkId}, plan=${providerIds.planId}`
        );
      } else {
        mappingErrorCode = resolved.code || mappingErrorCode;
        mappingErrorMessage = resolved.error || mappingErrorMessage;
        console.error(`[dispatch] ${mappingErrorMessage}`);
      }
    } catch (err) {
      mappingErrorCode = "DATACART_MAPPING_LOOKUP_FAILED";
      mappingErrorMessage = `DataCart mapping lookup failed: ${String(err)}`;
      console.error("[dispatch] DataCart mapping lookup failed:", err);
    }

    result = providerIds
      ? await sendToDataCart(payload, clientRef, providerIds)
      : buildDataCartFailureResult(mappingErrorCode, mappingErrorMessage);
  } else if (supplierCode === "DATAMART") {
    result = await sendToDataMart(payload);
  } else if (supplierCode === "AFROHUBGH") {
    result = await sendToAfroHubGH(payload, opts?.orderId);
  } else {
    result = await sendToSupplierA(payload);
  }

  if (!result.ok) {
    result = {
      ...result,
      body: normalizeDispatchFailureBody(result.body, result.status || 400),
    };
  }

  // Inject supplier code into debug for admin trace
  if (result.body.debug && typeof result.body.debug === "object") {
    (result.body.debug as Record<string, unknown>).supplier_code = supplierCode;
  }

  // Log dispatch attempt (fire-and-forget but await for retry safety)
  if (opts?.orderId) {
    const debug = result.body.debug as Record<string, unknown> | undefined;
    const errorMsg = result.ok ? null : String(result.body.message || result.body.provider_message || result.body.error || debug?.error_message || "");
    const requestPayload = (debug?.request_body && typeof debug.request_body === "object")
      ? debug.request_body as Record<string, unknown>
      : payload;
    const errorCode = result.ok
      ? null
      : String(result.body.code || result.body.error_code || result.body.error || `HTTP_${result.status}`);
    
    await logDispatchAttempt(supabase, {
      orderId: opts.orderId,
      supplierKey: supplierCode,
      requestPayload,
      httpStatus: result.status || (debug?.http_status as number) || null,
      responseText: debug?.response_text as string || JSON.stringify(result.body),
      success: result.ok,
      errorCode,
      errorMessage: errorMsg,
      createdBy: opts.createdBy || "system",
      retryOfAttemptId: opts.retryOfAttemptId || null,
    });
  }

  // Update supplier balance if returned
  const remainingBalance = result.body.remaining_balance ?? result.body.remainingBalance;
  if (result.ok && remainingBalance != null && supplierId) {
    try {
      await supabase.from("suppliers").update({
        last_balance: Number(remainingBalance),
        last_balance_updated_at: new Date().toISOString(),
      }).eq("id", supplierId);

      await supabase.from("supplier_balance_snapshots").insert({
        supplier_id: supplierId,
        balance: Number(remainingBalance),
        source: "ORDER_RESPONSE",
      });
    } catch (err) {
      console.warn("[dispatch] Balance update failed (non-fatal):", err);
    }
  }

  return { ...result, supplierCode, supplierId };
}

/**
 * Parse standardized supplier result (works for all suppliers).
 * For DataCart: supplierOrderId = UUID (used for status polling),
 *              supplierReference = ORD-... human reference (used by webhook + display).
 * For other suppliers: both fields hold the same supplier-issued ID.
 */
/**
 * Parse standardized supplier result (works for all suppliers).
 * For DataCart: supplierOrderId = UUID (used for status polling),
 *              supplierReference = ORD-... human reference (used by webhook + display).
 * For other suppliers: both fields hold the same supplier-issued ID.
 *
 * IMPORTANT: For DataCart we MUST always pull the UUID from the nested
 * `data.order_id` (or top-level `data.id`). Past callers occasionally
 * spread the parsed body in a way that overwrote the top-level `order_id`
 * with the human reference, leaving the polling job unable to look up the
 * order. Reading from the nested `data` block is the canonical source.
 */
export function parseDispatchResult(result: DispatchResult) {
  const isDataCart = result.supplierCode === "DATACART";
  const dataBlock = (result.body && typeof (result.body as any).data === "object" && (result.body as any).data)
    ? (result.body as any).data as Record<string, unknown>
    : null;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const looksLikeUuid = (val: unknown): val is string =>
    typeof val === "string" && uuidRegex.test(val.trim());

  let supplierOrderId: string | null = null;
  if (isDataCart) {
    // DataCart: prefer nested UUID, then top-level if it's actually a UUID
    const nestedUuid = dataBlock?.order_id ?? dataBlock?.id;
    if (looksLikeUuid(nestedUuid)) {
      supplierOrderId = String(nestedUuid).trim();
    } else if (looksLikeUuid(result.body.order_id)) {
      supplierOrderId = String(result.body.order_id).trim();
    } else {
      // Last resort: store whatever we got (human ref); polling will fall back.
      supplierOrderId = result.body.order_id ? String(result.body.order_id) : null;
    }
  } else {
    supplierOrderId = result.body.order_id
      ? String(result.body.order_id)
      : result.body.transactionReference
        ? String(result.body.transactionReference)
        : result.body.client_reference
          ? String(result.body.client_reference)
          : null;
  }

  // For DataCart, the human ORD-... reference comes from data.reference.
  // For other suppliers, both fields hold the same ID.
  let supplierReference: string | null = null;
  if (isDataCart) {
    const nestedRef = dataBlock?.reference ?? dataBlock?.order_reference;
    if (typeof nestedRef === "string" && nestedRef.trim()) {
      supplierReference = nestedRef.trim();
    } else if (result.body.provider_reference) {
      supplierReference = String(result.body.provider_reference);
    } else if (typeof result.body.order_id === "string" && !looksLikeUuid(result.body.order_id)) {
      supplierReference = String(result.body.order_id);
    } else {
      supplierReference = supplierOrderId;
    }
  } else {
    supplierReference = result.body.provider_reference
      ? String(result.body.provider_reference)
      : supplierOrderId;
  }

  // Safely stringify values — prevent [object Object] in DB
  const safeString = (val: unknown): string | null => {
    if (val == null) return null;
    if (typeof val === "string") return val;
    if (typeof val === "object") {
      try { return JSON.stringify(val); } catch { return String(val); }
    }
    return String(val);
  };

  const supplierStatus = safeString(result.body.status);
  const supplierMessage = safeString(result.body.message);
  const supplierAmount = result.body.amount != null ? Number(result.body.amount) : null;
  const supplierBalance = (result.body.remaining_balance ?? result.body.remainingBalance) != null
    ? Number(result.body.remaining_balance ?? result.body.remainingBalance)
    : null;

  return {
    supplierOrderId,
    supplierReference,
    supplierStatus,
    supplierMessage,
    supplierAmount,
    supplierBalance,
    supplierCode: result.supplierCode,
    supplierId: result.supplierId,
    newStatus: "Processing" as const,
  };
}
