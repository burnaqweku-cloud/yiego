/**
 * Shared supplier-status-sync engine.
 * One canonical mapping + one sync function used by webhook AND polling.
 */

// ─── Canonical supplier → platform status mapping ───────────
const SUPPLIER_TO_PLATFORM: Record<string, string> = {
  pending: "Pending",
  waiting: "Processing",
  processing: "Processing",
  completed: "Delivered",
  delivered: "Delivered",
  success: "Delivered",
  done: "Delivered",
  failed: "Failed",
  error: "Failed",
  rejected: "Failed",
  cancelled: "Failed",
  refunded: "Failed",
  // DataCart uses 'partial' — treat as Processing with a note
  partial: "Processing",
};

// Webhook event → supplier status (works for all suppliers)
const EVENT_TO_SUPPLIER_STATUS: Record<string, string> = {
  "order.created": "pending",
  "order.processing": "processing",
  "order.completed": "completed",
  "order.delivered": "delivered",
  "order.failed": "failed",
  "order.refunded": "refunded",
  "order.partial": "partial",
  "order.cancelled": "cancelled",
  "webhook.test": "test",
};

const FINAL_STATES = new Set(["Delivered", "Failed"]);

// Supplier B (DataMart) reprocesses some failed orders later. We keep
// failed DataMart orders eligible for status sync for this many hours
// before treating Failed as truly final.
export const DATAMART_FAILED_WATCH_HOURS = 24;

export function mapSupplierStatus(supplierStatus: string): string {
  const lower = String(supplierStatus || "").toLowerCase().trim();
  return SUPPLIER_TO_PLATFORM[lower] || "Processing";
}

export function mapWebhookEvent(event: string): { supplierStatus: string; platformStatus: string } {
  const lower = String(event || "").toLowerCase().trim();
  const supplierStatus = EVENT_TO_SUPPLIER_STATUS[lower] || lower;
  return { supplierStatus, platformStatus: mapSupplierStatus(supplierStatus) };
}

export interface SyncInput {
  supplierReference: string;
  supplierStatus: string;
  supplierUpdatedAt?: string | null;
  source: "webhook" | "poll";
  rawMeta?: Record<string, unknown>;
  supplierMessage?: string | null;
  /**
   * Optional supplier identity. When set to "DATAMART" the sync engine
   * applies the soft-failed watch window (Failed → Delivered transitions
   * are allowed within `DATAMART_FAILED_WATCH_HOURS`). Other suppliers
   * keep the strict final-state behavior.
   */
  supplierKey?: string | null;
}

export interface SyncResult {
  applied: boolean;
  table: string | null;
  orderId: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  reason: string | null;
}

function looksLikeInternalOrderId(reference: string): boolean {
  return /^(DS|AGT|WH|CHK)-[A-Z0-9-]+$/i.test(reference.trim());
}

function buildReferenceCandidates(reference: string): string[] {
  const trimmed = String(reference || "").trim();
  if (!trimmed) return [];

  const candidates = new Set<string>([trimmed]);
  const strippedPrefixedRef = trimmed.replace(/^DS-/i, "");

  if (strippedPrefixedRef !== trimmed && looksLikeInternalOrderId(strippedPrefixedRef)) {
    candidates.add(strippedPrefixedRef);
  }

  return [...candidates];
}

async function findOrderByReference(supabase: any, table: "orders" | "agent_orders", references: string[]) {
  const selectCols = "order_id, status, supplier_timestamp, supplier_failed_at, supplier_status_watch_until";
  for (const reference of references) {
    const { data: supplierMatch } = await supabase
      .from(table)
      .select(selectCols)
      .or(`supplier_reference.eq.${reference},supplier_order_id.eq.${reference}`)
      .maybeSingle();

    if (supplierMatch) {
      return supplierMatch;
    }
  }

  for (const reference of references) {
    if (!looksLikeInternalOrderId(reference)) continue;

    const { data: orderIdMatch } = await supabase
      .from(table)
      .select(selectCols)
      .eq("order_id", reference)
      .maybeSingle();

    if (orderIdMatch) {
      return orderIdMatch;
    }
  }

  return null;
}

/**
 * Core sync engine. Finds order across both tables, applies safe transition.
 */
export async function syncOrderStatusFromSupplier(
  supabase: any,
  input: SyncInput
): Promise<SyncResult> {
  const platformStatus = mapSupplierStatus(input.supplierStatus);
  const references = buildReferenceCandidates(input.supplierReference);
  const ref = references[0] || input.supplierReference;

  // 1) Find order in `orders` table
  let order: any = null;
  let table = "orders";

  order = await findOrderByReference(supabase, "orders", references);

  // 2) If not found, try `agent_orders`
  if (!order) {
    const agentOrder = await findOrderByReference(supabase, "agent_orders", references);
    order = agentOrder;
    if (agentOrder) table = "agent_orders";
  }

  if (!order) {
    await logSync(supabase, {
      ...input,
      mappedStatus: platformStatus,
      localTable: "unknown",
      localOrderId: "unknown",
      previousStatus: null,
      applied: false,
      reason: `No order found for supplier references: ${references.join(", ")}`,
    });
    return { applied: false, table: null, orderId: null, previousStatus: null, newStatus: platformStatus, reason: "no_match" };
  }

  const previousStatus = order.status as string;
  const orderId = order.order_id as string;
  const isDataMart = String(input.supplierKey || "").toUpperCase() === "DATAMART";
  const nowIso = new Date().toISOString();

  // Always record observability fields, even when we don't apply a status change.
  const observabilityUpdate: Record<string, unknown> = {
    last_supplier_sync_at: nowIso,
    last_supplier_status: input.supplierStatus,
  };

  // 3) Final-state protection — with DataMart soft-failed exception
  if (FINAL_STATES.has(previousStatus)) {
    const watchUntilTs = order.supplier_status_watch_until
      ? new Date(order.supplier_status_watch_until).getTime()
      : 0;
    const withinWatchWindow = watchUntilTs > Date.now();
    const isDataMartFailedRecovery =
      isDataMart
      && previousStatus === "Failed"
      && platformStatus === "Delivered"
      && withinWatchWindow;

    if (!isDataMartFailedRecovery) {
      // Always persist the observed supplier status for diagnostics,
      // even when we don't transition the order.
      await supabase.from(table).update(observabilityUpdate).eq("order_id", orderId);

      const reason = previousStatus === "Failed" && isDataMart && !withinWatchWindow
        ? `DataMart watch window expired; treating Failed as final`
        : `Order already in final state: ${previousStatus}`;
      await logSync(supabase, {
        ...input,
        mappedStatus: platformStatus,
        localTable: table,
        localOrderId: orderId,
        previousStatus,
        applied: false,
        reason,
      });
      return { applied: false, table, orderId, previousStatus, newStatus: platformStatus, reason: "final_state_protected" };
    }

    console.log(`[status-sync] DataMart soft-failed recovery: ${orderId} Failed → Delivered (within watch window)`);
  }

  // 3.4) Reprocessed protection: when admin has flagged an order as
  //      Reprocessed (manual recovery in progress), supplier sync may ONLY
  //      promote it to Delivered. Failed/Pending/Processing/anything else
  //      must NOT overwrite Reprocessed — only an admin manual update can.
  if (previousStatus === "Reprocessed" && platformStatus !== "Delivered") {
    await supabase.from(table).update(observabilityUpdate).eq("order_id", orderId);
    await logSync(supabase, {
      ...input,
      mappedStatus: platformStatus,
      localTable: table,
      localOrderId: orderId,
      previousStatus,
      applied: false,
      reason: `Reprocessed protected: supplier status '${platformStatus}' ignored (only Delivered may override)`,
    });
    return { applied: false, table, orderId, previousStatus, newStatus: platformStatus, reason: "reprocessed_protected" };
  }

  // 3.5) Voided protection: only definitive Delivered/Failed callbacks may
  //      override a Voided order. Ambiguous (still Pending/Processing) callbacks
  //      must NOT change a Voided order — admin's null-state stands until the
  //      supplier reports a real outcome.
  if (previousStatus === "Voided" && platformStatus !== "Delivered" && platformStatus !== "Failed") {
    await supabase.from(table).update(observabilityUpdate).eq("order_id", orderId);
    await logSync(supabase, {
      ...input,
      mappedStatus: platformStatus,
      localTable: table,
      localOrderId: orderId,
      previousStatus,
      applied: false,
      reason: `Voided order: ambiguous supplier status '${platformStatus}' ignored`,
    });
    return { applied: false, table, orderId, previousStatus, newStatus: platformStatus, reason: "voided_ambiguous_ignored" };
  }

  // 4) Timestamp staleness check — skip for DataMart Failed→Delivered recovery
  //    because supplier may not refresh updated_at on reprocess.
  const isRecoveryTransition = isDataMart && previousStatus === "Failed" && platformStatus === "Delivered";
  if (!isRecoveryTransition && input.supplierUpdatedAt && order.supplier_timestamp) {
    const incoming = new Date(input.supplierUpdatedAt).getTime();
    const existing = new Date(order.supplier_timestamp).getTime();
    if (incoming <= existing) {
      await supabase.from(table).update(observabilityUpdate).eq("order_id", orderId);
      const reason = `Stale update: incoming ${input.supplierUpdatedAt} <= existing ${order.supplier_timestamp}`;
      await logSync(supabase, {
        ...input,
        mappedStatus: platformStatus,
        localTable: table,
        localOrderId: orderId,
        previousStatus,
        applied: false,
        reason,
      });
      return { applied: false, table, orderId, previousStatus, newStatus: platformStatus, reason: "stale_timestamp" };
    }
  }

  // 5) No-op if status unchanged — refresh metadata + observability
  if (previousStatus === platformStatus) {
    const metaUpdate: Record<string, unknown> = {
      ...observabilityUpdate,
      supplier_status: input.supplierStatus,
      supplier_timestamp: input.supplierUpdatedAt || nowIso,
    };
    if (input.supplierMessage) metaUpdate.supplier_message = String(input.supplierMessage).slice(0, 500);
    await supabase.from(table).update(metaUpdate).eq("order_id", orderId);

    await logSync(supabase, {
      ...input,
      mappedStatus: platformStatus,
      localTable: table,
      localOrderId: orderId,
      previousStatus,
      applied: false,
      reason: "status_unchanged",
    });
    return { applied: false, table, orderId, previousStatus, newStatus: platformStatus, reason: "status_unchanged" };
  }

  // 6) Apply the update
  const update: Record<string, unknown> = {
    ...observabilityUpdate,
    status: platformStatus,
    supplier_status: input.supplierStatus,
    supplier_timestamp: input.supplierUpdatedAt || nowIso,
  };
  if (input.supplierMessage) {
    update.supplier_message = String(input.supplierMessage).slice(0, 500);
  }

  // DataMart soft-failed watch window bookkeeping
  if (isDataMart && platformStatus === "Failed" && previousStatus !== "Failed") {
    // First time entering Failed for this DataMart order — open the watch window.
    update.supplier_failed_at = nowIso;
    update.supplier_status_watch_until = new Date(
      Date.now() + DATAMART_FAILED_WATCH_HOURS * 60 * 60 * 1000
    ).toISOString();
  } else if (platformStatus === "Delivered" && previousStatus === "Failed") {
    // Recovery — close the watch window so we don't keep polling.
    update.supplier_status_watch_until = null;
  }

  if (table === "orders") {
    if (platformStatus === "Delivered") {
      update.delivery_note = input.supplierMessage || "Delivered via supplier sync";
      // Clear any prior failure_reason on recovery so the user-facing
      // status no longer renders the failure copy.
      if (previousStatus === "Failed" || previousStatus === "Reprocessed") {
        update.failure_reason = null;
      }
    } else if (platformStatus === "Failed") {
      update.failure_reason = input.supplierMessage || "Failed via supplier sync";
    }
  }

  await supabase.from(table).update(update).eq("order_id", orderId);

  // 6.5) Voided override: if admin had marked this Voided and the supplier
  //      now reports a definitive outcome (Delivered or Failed), log it.
  //      No customer notification fires here — silent override per spec.
  if (previousStatus === "Voided" && (platformStatus === "Delivered" || platformStatus === "Failed")) {
    try {
      await supabase.from("audit_logs").insert({
        actor_id: null,
        actor_email: "system@supplier-callback",
        action: "order_void_overridden",
        entity_type: table === "agent_orders" ? "agent_order" : "order",
        entity_id: orderId,
        changes: { status: { before: "Voided", after: platformStatus } },
        metadata: {
          from_status: "Voided",
          to_status: platformStatus,
          trigger: "supplier_callback",
          supplier_reference: ref,
          source: input.source,
          callback_payload: input.rawMeta || null,
        },
      });
    } catch (err) {
      console.warn("[status-sync] Failed to write void-override audit log:", err);
    }
  }

  // 7) Agent profit crediting on Delivered (agent_orders only).
  //    creditAgentProfit is idempotent (unique reference + profit_credited flag),
  //    so a Failed→Delivered recovery does NOT double-credit.
  if (table === "agent_orders" && platformStatus === "Delivered") {
    await creditAgentProfit(supabase, orderId);
  }

  await logSync(supabase, {
    ...input,
    mappedStatus: platformStatus,
    localTable: table,
    localOrderId: orderId,
    previousStatus,
    applied: true,
    reason: previousStatus === "Failed" && platformStatus === "Delivered"
      ? "datamart_failed_recovery"
      : null,
  });

  console.log(`[status-sync] ${table} ${orderId}: ${previousStatus} → ${platformStatus} (source: ${input.source}${isDataMart ? ", supplier=DATAMART" : ""})`);

  return {
    applied: true,
    table,
    orderId,
    previousStatus,
    newStatus: platformStatus,
    reason: previousStatus === "Failed" && platformStatus === "Delivered" ? "datamart_failed_recovery" : null,
  };
}

// ─── Agent profit credit (same logic from supplier-webhook) ──
async function creditAgentProfit(supabase: any, orderId: string) {
  const { data: agentOrder } = await supabase
    .from("agent_orders")
    .select("id, agent_id, profit_ghs, agent_profit_at_purchase, profit_credited, order_id")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!agentOrder) return;

  const profitToCredit = Number(agentOrder.agent_profit_at_purchase ?? agentOrder.profit_ghs) || 0;
  const alreadyCredited = Boolean(agentOrder.profit_credited);

  if (profitToCredit <= 0 || alreadyCredited) return;

  console.log(`[status-sync] Crediting agent ${agentOrder.agent_id} profit GHS ${profitToCredit} for order ${orderId}`);

  const { error: txnErr } = await supabase.from("agent_wallet_transactions").insert({
    agent_id: agentOrder.agent_id,
    type: "profit_credit",
    amount_ghs: profitToCredit,
    description: `Profit from agent store order ${orderId}`,
    order_id: orderId,
    reference: `commission-${orderId}`,
    status: "completed",
  });

  if (txnErr && txnErr.code === "23505") {
    console.log(`[status-sync] Profit already credited (duplicate) for order ${orderId}`);
  } else if (txnErr) {
    console.error(`[status-sync] Failed to insert profit transaction:`, txnErr);
  } else {
    const { data: wallet } = await supabase
      .from("agent_wallets")
      .select("*")
      .eq("agent_id", agentOrder.agent_id)
      .maybeSingle();
    if (wallet) {
      await supabase.from("agent_wallets").update({
        available_balance: Number(wallet.available_balance) + profitToCredit,
        total_earned: Number(wallet.total_earned) + profitToCredit,
      }).eq("id", wallet.id);
    }

    await supabase.from("agent_orders").update({
      profit_credited: true,
      profit_credited_at: new Date().toISOString(),
    }).eq("order_id", orderId);
  }
}

// ─── Sync log helper ─────────────────────────────────────────
async function logSync(
  supabase: any,
  params: {
    supplierReference: string;
    supplierStatus: string;
    source: string;
    rawMeta?: Record<string, unknown>;
    mappedStatus: string;
    localTable: string;
    localOrderId: string;
    previousStatus: string | null;
    applied: boolean;
    reason: string | null;
  }
) {
  try {
    await supabase.from("supplier_status_sync_logs").insert({
      source: params.source,
      local_order_table: params.localTable,
      local_order_id: params.localOrderId,
      supplier_reference: params.supplierReference,
      supplier_status: params.supplierStatus,
      mapped_platform_status: params.mappedStatus,
      previous_local_status: params.previousStatus,
      applied: params.applied,
      reason: params.reason,
      raw_meta: params.rawMeta ? JSON.stringify(params.rawMeta).slice(0, 5000) : null,
    });
  } catch (err) {
    console.warn("[status-sync] Failed to log sync:", err);
  }
}
