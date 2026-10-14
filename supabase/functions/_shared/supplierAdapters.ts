import { callDataMartGH, mapDataMartGHStatusToYieGo } from "./datamartgh.ts";
import * as hub from "./databundleshub.ts";
import * as instant from "./instantdatagh.ts";
import * as edk from "./emmadataking.ts";

/* ══════════════════════════════════════════════════════════════
   One shape for every supplier.

   Each supplier stands alone: its own client, its own status
   vocabulary, its own rules about what it will accept. Adding a
   third is a new entry in ADAPTERS and nothing else — no call
   site changes, no edits to the ones already running.
   ══════════════════════════════════════════════════════════════ */

export type OrderStatus = "processing" | "delivered" | "failed" | "failed_needs_review";

export interface PurchaseContext {
  recipientPhone: string;
  orderReference: string;
  idempotencyKey: string;
  /** From supplier_product_mappings — each supplier's own product identifiers. */
  supplierNetworkCode: string | null;
  supplierCapacity: string | null;
  /** How many purchase calls this supplier already got for this order (0 = first send). Suppliers that key
   *  orders by our reference get a distinct reference per attempt, so a lookup is never ambiguous. */
  attempt?: number;
}

/** EmmaDataKing keys orders by our reference: first send = the order reference, retries = "-R1", "-R2"… */
export function edkRef(orderReference: string, attempt = 0) { return attempt > 0 ? `${orderReference}-R${attempt}` : orderReference; }

export interface PurchaseOutcome {
  ok: boolean;
  httpStatus: number;
  durationMs: number;
  endpoint: string;
  requestPayload: Record<string, unknown>;
  responsePayload: unknown;
  /** Whatever this supplier calls its order handle, normalised. */
  supplierReference: string | null;
  purchaseId: string | null;
  transactionReference: string | null;
  supplierStatus: string | null;
  message: string | null;
}

/** What a supplier says when asked "do you have our order <reference>?" after a timeout. */
export interface ReferenceLookup {
  found: boolean;
  /** found and not refunded/failed: the supplier is holding (or has delivered) the order. */
  held: boolean;
  /** found and the supplier says the money is back (REFUNDED). FAILED is NOT refunded: they may still
   *  re-run it, so it is never handed to another supplier until this is true. */
  refunded: boolean;
  supplierReference: string | null;
  purchaseId: string | null;
  transactionReference: string | null;
  supplierStatus: string | null;
}

export interface SupplierAdapter {
  code: string;
  /** Refuse impossible orders before spending money. */
  preflight(context: PurchaseContext): { ok: true } | { ok: false; reason: string };
  purchase(context: PurchaseContext): Promise<PurchaseOutcome>;
  mapStatus(supplierStatus?: string | null): OrderStatus;
  isConfigured(): boolean;
  /** Optional: look an order up by OUR reference. Used after a timeout, before any fallback, because a
   *  supplier that did not answer may still have taken the order. Throws when the lookup itself fails. */
  findByReference?(orderReference: string, attempt?: number): Promise<ReferenceLookup>;
}

/** A purchase reply that is not a "no": no answer, gateway timeout, server error. The supplier may have the order. */
export function isAmbiguousOutcome(outcome: PurchaseOutcome) {
  return !outcome.ok && (outcome.httpStatus === 0 || outcome.httpStatus === 408 || outcome.httpStatus >= 500);
}

/* ── DataMartGH ─────────────────────────────────────────────── */

interface DataMartPayload {
  status?: string;
  message?: string;
  data?: {
    orderStatus?: string;
    orderReference?: string;
    purchaseId?: string;
    transactionReference?: string;
  };
}

const dataMartGH: SupplierAdapter = {
  code: "datamartgh",
  isConfigured: () => Boolean(Deno.env.get("DATAMARTGH_API_KEY")),
  // It takes the network explicitly, so there is nothing to guess.
  preflight: () => ({ ok: true }),
  async purchase(context) {
    const requestPayload = {
      phoneNumber: context.recipientPhone,
      network: context.supplierNetworkCode,
      capacity: context.supplierCapacity,
      gateway: "wallet",
      ref: context.orderReference,
    };
    const result = await callDataMartGH("/purchase", {
      method: "POST",
      headers: { "X-Idempotency-Key": context.idempotencyKey },
      body: JSON.stringify(requestPayload),
    });
    const payload = result.payload as DataMartPayload;
    const data = payload?.data ?? {};
    return {
      ok: result.ok,
      httpStatus: result.status,
      durationMs: result.durationMs,
      endpoint: "/purchase",
      requestPayload,
      responsePayload: payload,
      supplierReference: data.orderReference ?? null,
      purchaseId: data.purchaseId ?? null,
      transactionReference: data.transactionReference ?? null,
      supplierStatus: data.orderStatus ?? payload?.status ?? null,
      message: result.ok ? null : payload?.message ?? "DataMartGH purchase failed",
    };
  },
  mapStatus: (supplierStatus) => mapDataMartGHStatusToYieGo(supplierStatus ?? undefined) as OrderStatus,
};

/* ── DataBundlesHub ─────────────────────────────────────────── */

const dataBundlesHub: SupplierAdapter = {
  code: "databundleshub",
  isConfigured: hub.isConfigured,
  /** They read the network off the phone prefix and accept no override, so a
   *  number whose prefix disagrees with the bundle would be delivered to the
   *  wrong network. Refuse it here rather than pay for a wrong delivery. */
  preflight(context) {
    const detected = hub.networkFromPrefix(context.recipientPhone);
    if (!detected) return { ok: false, reason: "unrecognised_number_prefix" };

    const expected = (context.supplierNetworkCode ?? "").toUpperCase();
    if (expected && expected !== detected) {
      return { ok: false, reason: `number_prefix_is_${detected.toLowerCase()}_not_${expected.toLowerCase()}` };
    }
    const gb = Number(context.supplierCapacity);
    if (detected === "TELECEL" && Number.isFinite(gb) && gb < hub.TELECEL_MIN_GB) {
      return { ok: false, reason: "telecel_minimum_is_10gb" };
    }
    return { ok: true };
  },
  async purchase(context) {
    const requestPayload = {
      phoneNumber: context.recipientPhone,
      capacity: String(context.supplierCapacity ?? ""),
    };
    const result = await hub.purchase({
      phoneNumber: context.recipientPhone,
      capacityGb: context.supplierCapacity ?? "",
      idempotencyKey: context.idempotencyKey,
    });
    const data = result.payload?.data ?? {};
    return {
      ok: result.ok,
      httpStatus: result.status,
      durationMs: result.durationMs,
      endpoint: "/api/developer/purchase",
      requestPayload,
      responsePayload: result.payload,
      // Status is polled by requestId, not purchaseId — their documented
      // check_order_status route does not exist on the live API. Keep the
      // requestId as the reference so a later status check has it.
      supplierReference: data.transactionReference ?? null,
      purchaseId: data.requestId != null ? String(data.requestId) : (data.purchaseId != null ? String(data.purchaseId) : null),
      transactionReference: data.transactionReference ?? null,
      supplierStatus: data.orderStatus ?? data.status ?? null,
      message: result.ok
        ? null
        : result.payload?.message ?? result.payload?.error ?? "DataBundlesHub purchase failed",
    };
  },
  mapStatus: (supplierStatus) => hub.mapStatus(supplierStatus),
};

const instantDataGH: SupplierAdapter = {
  code: "instantdatagh",
  isConfigured: instant.isConfigured,
  preflight(context) {
    const detected = hub.networkFromPrefix(context.recipientPhone);
    if (!detected) return { ok: false, reason: "unrecognised_number_prefix" };
    const expected = (context.supplierNetworkCode ?? "").toUpperCase();
    if (expected && expected !== detected) return { ok: false, reason: `number_prefix_is_${detected.toLowerCase()}_not_${expected.toLowerCase()}` };
    return { ok: true };
  },
  async purchase(context) {
    // InstantData wants the network spelled its way: MTN / Telecel / AirtelTigo.
    const network = instant.NETWORK_NAMES[(context.supplierNetworkCode ?? "").toLowerCase()] ?? context.supplierNetworkCode ?? "";
    const requestPayload = { network, phone_number: context.recipientPhone, data_amount: String(context.supplierCapacity ?? "") };
    const result = await instant.purchase({ network, phoneNumber: context.recipientPhone, dataAmount: requestPayload.data_amount });
    const data = result.payload?.data ?? {};
    const orderId = data.order_id != null ? String(data.order_id) : null;
    return {
      ok: result.ok && orderId != null,
      httpStatus: result.status,
      durationMs: result.durationMs,
      endpoint: "/orders",
      requestPayload,
      responsePayload: result.payload,
      supplierReference: orderId,
      purchaseId: orderId,
      transactionReference: null,
      supplierStatus: data.status ?? null,
      message: result.ok && orderId != null ? null : result.payload?.message ?? result.payload?.error ?? "InstantDataGH purchase failed",
    };
  },
  mapStatus: (supplierStatus) => instant.mapStatus(supplierStatus),
};

/* ── EmmaDataKing ───────────────────────────────────────────── */

const emmaDataKing: SupplierAdapter = {
  code: "emmadataking",
  isConfigured: edk.isConfigured,
  /** Their list code says the network (YELLO = MTN). Same prefix guard as the others; a confirmed
   *  ported number is waived by fulfillment.ts, not here. */
  preflight(context) {
    const detected = hub.networkFromPrefix(context.recipientPhone);
    if (!detected) return { ok: false, reason: "unrecognised_number_prefix" };
    const expected = edk.NETWORK_OF_CODE[context.supplierNetworkCode ?? ""] ?? (context.supplierNetworkCode ?? "").toUpperCase();
    if (expected && expected !== detected) return { ok: false, reason: `number_prefix_is_${detected.toLowerCase()}_not_${expected.toLowerCase()}` };
    return { ok: true };
  },
  async purchase(context) {
    const requestPayload = { network: context.supplierNetworkCode ?? "YELLO", capacity: String(context.supplierCapacity ?? ""), phoneNumber: context.recipientPhone, ref: edkRef(context.orderReference, context.attempt ?? 0) };
    const result = await edk.purchase(requestPayload);
    const data = result.payload?.data ?? {};
    // Their id (EDK-…) is the receipt; our own reference is what /order-status reads, so keep both.
    const accepted = result.ok && Boolean(data.id || data.reference);
    return {
      ok: accepted,
      httpStatus: result.status,
      durationMs: result.durationMs,
      endpoint: "/api/v1/purchase",
      requestPayload,
      responsePayload: result.payload,
      supplierReference: data.id ?? null,
      purchaseId: data.reference ?? requestPayload.ref,
      transactionReference: data.transaction_code ?? null,
      supplierStatus: data.status ?? null,
      message: accepted ? null : result.payload?.message ?? result.payload?.error ?? "EmmaDataKing purchase failed",
    };
  },
  mapStatus: (supplierStatus) => edk.mapStatus(supplierStatus),
  async findByReference(orderReference, attempt = 0) {
    const ref = edkRef(orderReference, attempt);
    const r = await edk.checkOrderStatus(ref);
    const data = r.payload?.data ?? {};
    if (r.status === 404 || (r.ok && !data.id && !data.reference)) return { found: false, held: false, refunded: false, supplierReference: null, purchaseId: null, transactionReference: null, supplierStatus: null };
    if (!r.ok) throw new Error(`EmmaDataKing lookup failed (${r.status})`);
    const status = String(data.status ?? "").toUpperCase();
    return { found: true, held: edk.mapStatus(status) !== "failed_needs_review", refunded: status === "REFUNDED", supplierReference: data.id ?? null, purchaseId: data.reference ?? ref, transactionReference: data.transaction_code ?? null, supplierStatus: status || null };
  },
};

const ADAPTERS: Record<string, SupplierAdapter> = {
  [dataMartGH.code]: dataMartGH,
  [dataBundlesHub.code]: dataBundlesHub,
  [instantDataGH.code]: instantDataGH,
  [emmaDataKing.code]: emmaDataKing,
};

export function adapterFor(supplierCode: string): SupplierAdapter | null {
  return ADAPTERS[supplierCode] ?? null;
}

export function knownSupplierCodes() {
  return Object.keys(ADAPTERS);
}
