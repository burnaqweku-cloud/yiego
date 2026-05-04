/**
 * Polling fallback: checks open orders with supplier references against
 * DataMart GET /order-status/:reference API.
 * Invoked by pg_cron every 2 minutes.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { syncOrderStatusFromSupplier } from "../_shared/supplier-status-sync.ts";
import { getDataCartOrderStatus } from "../_shared/supplier-dispatch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Larger batches so we can fully drain the open-order backlog every cron tick.
// At previous BATCH_SIZE=30 with `order by created_at desc`, the newest orders
// hogged every poll cycle and older Pending orders were never re-checked,
// leaving them stuck on Pending even though the supplier had moved on.
const BATCH_SIZE_ORDERS = 120;
const BATCH_SIZE_AGENT_ORDERS = 80;
const BATCH_SIZE_WATCHED = 60;
const DATAMART_BASE = "https://api.datamartgh.shop/api/developer";

function hasDataCartTrace(rawResponse: string | null | undefined): boolean {
  if (!rawResponse) return false;

  try {
    const parsed = JSON.parse(rawResponse);
    const debug = parsed?.debug;
    return debug?.supplier_code === "DATACART"
      || String(debug?.request_url || "").includes("/functions/v1/api-gateway")
      || String(parsed?.client_reference || "").startsWith("DS-");
  } catch {
    return rawResponse.includes("/functions/v1/api-gateway");
  }
}

/**
 * DataCart's status endpoint requires the UUID (data.order_id), not the human
 * reference (data.reference / "ORD-YYYYMMDD-XXXXXX"). Some historical orders
 * stored the human reference in `supplier_order_id`. This helper digs into
 * supplier_raw_response and returns the canonical UUID when available.
 */
function extractDataCartUuid(rawResponse: string | null | undefined): string | null {
  if (!rawResponse) return null;
  try {
    const parsed = JSON.parse(rawResponse);
    const data = parsed?.data || parsed;
    const candidate = data?.order_id || data?.id || parsed?.order_id;
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      // UUID v4-ish: 8-4-4-4-12 hex
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
        return trimmed;
      }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Pick the best identifier for DataCart status polling:
 * 1) Real UUID extracted from raw_response (most reliable)
 * 2) supplier_order_id if it looks like a UUID
 * 3) supplier_reference (human ORD-...) — last resort
 */
function pickDataCartPollRef(order: any): { ref: string | null; isUuid: boolean } {
  const uuidFromRaw = extractDataCartUuid(order.supplier_raw_response);
  if (uuidFromRaw) return { ref: uuidFromRaw, isUuid: true };

  const supplierId = String(order.supplier_order_id || "").trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supplierId)) {
    return { ref: supplierId, isUuid: true };
  }
  if (supplierId) return { ref: supplierId, isUuid: false };

  const fallback = String(order.supplier_reference || "").trim();
  return { ref: fallback || null, isUuid: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const apiKey = Deno.env.get("DATAMART_API_KEY");
  if (!apiKey) {
    console.error("[poll-status] DATAMART_API_KEY not configured");
    return new Response(JSON.stringify({ error: "Not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Fetch open orders from BOTH tables that have a supplier reference.
    // Includes:
    //   - Pending / Processing orders created in the last 48h (normal flow)
    //   - DataMart Failed orders still inside their soft-failed watch window
    //     (supplier_status_watch_until > now). DataMart sometimes reprocesses
    //     a failed order and later marks it delivered — we need to keep
    //     polling for up to ~24h so we can recover the order.
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    const [openOrdersRes, watchedFailedOrdersRes] = await Promise.all([
      supabase
        .from("orders")
        .select("order_id, supplier_reference, supplier_order_id, status, supplier_id, supplier_raw_response, supplier_status_watch_until, last_supplier_sync_at, created_at")
        .in("status", ["Pending", "Processing"])
        .not("supplier_reference", "is", null)
        .gte("created_at", cutoff)
        // Oldest-sync first so backlogged orders get re-polled instead of the
        // newest 30 hogging every cycle.
        .order("last_supplier_sync_at", { ascending: true, nullsFirst: true })
        .limit(BATCH_SIZE_ORDERS),
      supabase
        .from("orders")
        .select("order_id, supplier_reference, supplier_order_id, status, supplier_id, supplier_raw_response, supplier_status_watch_until, last_supplier_sync_at, created_at")
        .eq("status", "Failed")
        .not("supplier_reference", "is", null)
        .not("supplier_status_watch_until", "is", null)
        .gt("supplier_status_watch_until", nowIso)
        .order("last_supplier_sync_at", { ascending: true, nullsFirst: true })
        .limit(BATCH_SIZE_WATCHED),
    ]);

    const openOrders = openOrdersRes.data;
    const watchedFailedOrders = watchedFailedOrdersRes.data;

    const [openAgentOrdersRes, watchedFailedAgentOrdersRes] = await Promise.all([
      supabase
        .from("agent_orders")
        .select("order_id, supplier_reference, supplier_order_id, status, supplier_raw_response, supplier_status_watch_until, last_supplier_sync_at, created_at")
        .in("status", ["Pending", "Processing", "pending", "processing", "Paid", "paid"])
        .not("supplier_reference", "is", null)
        .gte("created_at", cutoff)
        .order("last_supplier_sync_at", { ascending: true, nullsFirst: true })
        .limit(BATCH_SIZE_AGENT_ORDERS),
      supabase
        .from("agent_orders")
        .select("order_id, supplier_reference, supplier_order_id, status, supplier_raw_response, supplier_status_watch_until, last_supplier_sync_at, created_at")
        .eq("status", "Failed")
        .not("supplier_reference", "is", null)
        .not("supplier_status_watch_until", "is", null)
        .gt("supplier_status_watch_until", nowIso)
        .order("last_supplier_sync_at", { ascending: true, nullsFirst: true })
        .limit(BATCH_SIZE_WATCHED),
    ]);

    const openAgentOrders = openAgentOrdersRes.data;
    const watchedFailedAgentOrders = watchedFailedAgentOrdersRes.data;

    // Look up DataCart supplier ID for routing
    const { data: datacartSupplier } = await supabase
      .from("suppliers")
      .select("id")
      .eq("code", "DATACART")
      .maybeSingle();
    const datacartSupplierId = datacartSupplier?.id || null;

    // De-dupe across the two queries (an order shouldn't appear in both,
    // but guard against it just in case).
    const seen = new Set<string>();
    const dedupe = (rows: any[] | null | undefined, table: string) => {
      const out: any[] = [];
      for (const o of rows || []) {
        const key = `${table}:${o.order_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...o, _table: table });
      }
      return out;
    };

    const allOpen = [
      ...dedupe(openOrders, "orders"),
      ...dedupe(watchedFailedOrders, "orders"),
      ...dedupe(openAgentOrders, "agent_orders"),
      ...dedupe(watchedFailedAgentOrders, "agent_orders"),
    ];

    // Log oldest pending sync timestamp for visibility into backlog drainage
    const oldestSync = allOpen
      .map((o) => o.last_supplier_sync_at)
      .filter(Boolean)
      .sort()[0] || null;
    console.log(
      `[poll-status] Found ${allOpen.length} open orders to poll (oldest last_supplier_sync_at=${oldestSync || "never"})`
    );

    let applied = 0;
    let checked = 0;
    let errors = 0;

    let rateLimited = false;

    for (const order of allOpen) {
      // Determine which supplier API to poll based on supplier_id
      const isDataCart = Boolean(
        (order._table === "orders" && datacartSupplierId && order.supplier_id === datacartSupplierId)
        || hasDataCartTrace(order.supplier_raw_response)
      );

      // Skip remaining DataCart polls once rate-limited; let the next cron run pick them up
      if (isDataCart && rateLimited) continue;

      // Pick the best identifier for the supplier
      let ref: string | null;
      let isUuid = false;
      if (isDataCart) {
        const picked = pickDataCartPollRef(order);
        ref = picked.ref;
        isUuid = picked.isUuid;
      } else {
        ref = order.supplier_reference || order.supplier_order_id || null;
      }
      if (!ref) continue;

      checked++;
      try {
        let supplierStatus: string | null = null;
        let updatedAt: string | null = null;
        let pollMessage: string | null = null;

        if (isDataCart) {
          // Poll DataCart API — UUID is strongly preferred
          const dcResult = await getDataCartOrderStatus(ref);
          if (!dcResult.ok) {
            const errMsg = String(dcResult.error || "");
            const isRateLimit = errMsg.toLowerCase().includes("rate limit") || errMsg.toLowerCase().includes("ratelimit");
            if (isRateLimit) {
              rateLimited = true;
              console.warn(`[poll-status] DataCart rate-limited at ${ref}; deferring remaining DataCart orders to next run`);
            } else {
              console.warn(`[poll-status] DataCart API error for ${ref} (uuid=${isUuid}): ${errMsg}`);
            }
            try {
              await supabase.from("supplier_status_sync_logs").insert({
                source: "poll",
                local_order_table: order._table,
                local_order_id: order.order_id,
                supplier_reference: ref,
                supplier_status: null,
                mapped_platform_status: null,
                previous_local_status: order.status,
                applied: false,
                reason: `DataCart API error: ${errMsg}${isUuid ? " (uuid)" : " (ref)"}`,
              });
            } catch { /* non-fatal */ }
            errors++;
            continue;
          }
          supplierStatus = dcResult.status;
          updatedAt = (dcResult.data as any)?.updated_at || null;
          pollMessage = (dcResult.data as any)?.message || null;
        } else {
          // Poll DataMart API (default)
          const response = await fetch(`${DATAMART_BASE}/order-status/${encodeURIComponent(ref)}`, {
            headers: { "X-API-Key": apiKey },
          });

          if (!response.ok) {
            console.warn(`[poll-status] API error for ${ref}: HTTP ${response.status}`);
            try {
              await supabase.from("supplier_status_sync_logs").insert({
                source: "poll",
                local_order_table: order._table,
                local_order_id: order.order_id,
                supplier_reference: ref,
                supplier_status: null,
                mapped_platform_status: null,
                previous_local_status: order.status,
                applied: false,
                reason: `API error: HTTP ${response.status}`,
              });
            } catch { /* non-fatal */ }
            errors++;
            continue;
          }

          const data = await response.json();
          const orderPayload = data.data || {};
          supplierStatus = orderPayload.orderStatus || orderPayload.status || orderPayload.order_status;
          updatedAt = data.updatedAt || data.updated_at || null;
          pollMessage = data.message || null;
        }

        if (!supplierStatus) {
          console.warn(`[poll-status] No order status in response for ${ref}`);
          continue;
        }

        // Match the local order using BOTH the polled UUID and the human reference,
        // so the sync engine still finds the row even if only one identifier is stored.
        const matchRef = isDataCart && order.supplier_reference && order.supplier_reference !== ref
          ? String(order.supplier_reference)
          : ref;

        const result = await syncOrderStatusFromSupplier(supabase, {
          supplierReference: matchRef,
          supplierStatus: String(supplierStatus),
          supplierUpdatedAt: updatedAt,
          source: "poll",
          rawMeta: { polled_ref: ref, polled_uuid: isUuid, is_datacart: !!isDataCart },
          supplierMessage: pollMessage,
          // Tag the supplier so the sync engine can apply the DataMart
          // soft-failed watch window. Anything that isn't DataCart and
          // isn't explicitly tagged is treated as DataMart by the poller.
          supplierKey: isDataCart ? "DATACART" : "DATAMART",
        });

        if (result.applied) {
          applied++;
          // Wallet refund on transition INTO Failed (regular orders only).
          // handleWalletRefund is idempotent (REF-<orderId> uniqueness).
          if (result.table === "orders" && result.newStatus === "Failed") {
            await handleWalletRefund(supabase, result.orderId!);
          }
          // DataMart soft-failed RECOVERY: previously refunded → now delivered.
          // Reverse the refund so the customer isn't double-credited.
          if (
            !isDataCart
            && result.table === "orders"
            && result.previousStatus === "Failed"
            && result.newStatus === "Delivered"
          ) {
            await reverseWalletRefund(supabase, result.orderId!);
          }
        }
      } catch (err) {
        console.error(`[poll-status] Error polling ${ref}:`, err);
        errors++;
      }

      // Throttle DataCart calls more aggressively (rate limits); DataMart GETs are cheap.
      await new Promise((r) => setTimeout(r, isDataCart ? 600 : 150));
    }

    const summary = { checked, applied, errors, total_open: allOpen.length };
    console.log("[poll-status] Complete:", JSON.stringify(summary));

    return new Response(JSON.stringify({ success: true, ...summary }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[poll-status] Fatal error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Same wallet refund helper
async function handleWalletRefund(supabase: any, orderId: string) {
  const { data: order } = await supabase
    .from("orders")
    .select("order_id, payment_method, user_id, amount_ghs")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!order || order.payment_method !== "wallet" || !order.user_id) return;

  const amount = Number(order.amount_ghs) || 0;
  if (amount <= 0) return;

  const refundRef = `REF-${orderId}`;
  const { data: existing } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("reference", refundRef)
    .eq("type", "refund")
    .maybeSingle();

  if (existing) return;

  const { data: wallet } = await supabase
    .from("wallets")
    .select("id, balance_ghs")
    .eq("user_id", order.user_id)
    .maybeSingle();

  if (wallet) {
    await supabase.from("wallets").update({
      balance_ghs: Number(wallet.balance_ghs) + amount,
    }).eq("id", wallet.id);

    await supabase.from("wallet_transactions").insert({
      user_id: order.user_id,
      type: "refund",
      amount_ghs: amount,
      status: "confirmed",
      reference: refundRef,
      description: `Auto-refund for failed order ${orderId} (poll sync)`,
    });
  }
}

/**
 * DataMart soft-failed RECOVERY helper.
 * If the order was previously refunded to the user's wallet because it failed,
 * but DataMart later delivered it inside the watch window, we need to claw the
 * refund back so the customer doesn't get the bundle for free.
 *
 * Idempotent via a unique reverse-refund reference (REVREF-<orderId>).
 */
async function reverseWalletRefund(supabase: any, orderId: string) {
  const { data: order } = await supabase
    .from("orders")
    .select("order_id, payment_method, user_id, amount_ghs")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!order || order.payment_method !== "wallet" || !order.user_id) return;

  // Only reverse if a refund was actually credited earlier.
  const refundRef = `REF-${orderId}`;
  const { data: refund } = await supabase
    .from("wallet_transactions")
    .select("id, amount_ghs")
    .eq("reference", refundRef)
    .eq("type", "refund")
    .maybeSingle();
  if (!refund) return;

  const reverseRef = `REVREF-${orderId}`;
  const { data: alreadyReversed } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("reference", reverseRef)
    .maybeSingle();
  if (alreadyReversed) return;

  const amount = Number(refund.amount_ghs) || Number(order.amount_ghs) || 0;
  if (amount <= 0) return;

  const { data: wallet } = await supabase
    .from("wallets")
    .select("id, balance_ghs")
    .eq("user_id", order.user_id)
    .maybeSingle();

  if (!wallet) return;

  await supabase.from("wallets").update({
    balance_ghs: Math.max(0, Number(wallet.balance_ghs) - amount),
  }).eq("id", wallet.id);

  await supabase.from("wallet_transactions").insert({
    user_id: order.user_id,
    type: "refund_reversal",
    amount_ghs: -amount,
    status: "confirmed",
    reference: reverseRef,
    description: `Reverse auto-refund — DataMart later delivered order ${orderId}`,
  });

  console.log(`[poll-status] Reversed wallet refund for ${orderId} (DataMart soft-failed recovery)`);
}
