import { callDataMartGH, mapDataMartGHStatusToYieGo } from "./datamartgh.ts";
import * as hub from "./databundleshub.ts";

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
}

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

export interface SupplierAdapter {
  code: string;
  /** Refuse impossible orders before spending money. */
  preflight(context: PurchaseContext): { ok: true } | { ok: false; reason: string };
  purchase(context: PurchaseContext): Promise<PurchaseOutcome>;
  mapStatus(supplierStatus?: string | null): OrderStatus;
  isConfigured(): boolean;
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
  mapStatus: (supplierStatus) => mapDataMartGHStatusToYieGo(supplierStatus) as OrderStatus,
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
      // Their purchaseId is the handle for every later status check.
      supplierReference: data.transactionReference ?? null,
      purchaseId: data.purchaseId != null ? String(data.purchaseId) : null,
      transactionReference: data.transactionReference ?? null,
      supplierStatus: data.orderStatus ?? data.status ?? null,
      message: result.ok
        ? null
        : result.payload?.message ?? result.payload?.error ?? "DataBundlesHub purchase failed",
    };
  },
  mapStatus: (supplierStatus) => hub.mapStatus(supplierStatus),
};

const ADAPTERS: Record<string, SupplierAdapter> = {
  [dataMartGH.code]: dataMartGH,
  [dataBundlesHub.code]: dataBundlesHub,
};

export function adapterFor(supplierCode: string): SupplierAdapter | null {
  return ADAPTERS[supplierCode] ?? null;
}

export function knownSupplierCodes() {
  return Object.keys(ADAPTERS);
}
