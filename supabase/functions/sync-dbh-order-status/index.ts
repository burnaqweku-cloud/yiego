import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { checkOrderStatus, listTransactions } from "../_shared/databundleshub.ts";
import { AWAITING_VERIFICATION, isSilentMtnRefund, markAwaitingVerification } from "../_shared/verification.ts";

/* ════════════════════════════════════════════════════════════
   DataBundlesHub order-status sync — batch edition.

   One /transactions request covers every pending order at once:
   the list's _id is the purchaseId from each purchase receipt we
   already logged, so matching is exact. Orders the list doesn't
   cover fall back to per-order /purchase-status checks. The
   transactions list also reflects supplier-side refunds sooner
   than /purchase-status does, so terminal states land faster.

   Silent MTN refunds (status refunded, errorCode null, MTN/YELLO
   number) are NOT failures: MTN is verifying a first-time number.
   Those are held as admin_resolution_status = awaiting_verification
   — customer sees a calm message, admin gets a resubmit queue —
   instead of dropping into the refund queue. First case:
   YG-C62E960906 (2026-09-12).

   Scales to hundreds of pending orders in a single request.
   Publicly callable but read-and-apply only; scheduled via cron.
   ════════════════════════════════════════════════════════════ */

const MAX_ORDERS_PER_RUN = 100;
const MAX_TX_PAGES = 3;
const MAX_FALLBACK_CHECKS = 10;

type OrderRow = {
  id: string;
  order_reference: string;
  recipient_phone: string;
  status: string;
  supplier_status: string | null;
  supplier_purchase_id: string | null;
  admin_resolution_status: string | null;
  networks: { name: string | null; code: string | null } | null;
};

type SupplierReport = { status: string; errorCode: string | number | null };

function terminalFor(supplierStatus: string): { nextStatus: string; failureReason: string | null } | null {
  if (["delivered", "completed"].includes(supplierStatus)) return { nextStatus: "delivered", failureReason: null };
  if (["failed", "refunded", "cancelled", "reversed"].includes(supplierStatus)) {
    return {
      nextStatus: "failed_needs_review",
      failureReason: `Supplier ${supplierStatus} — supplier returned our money; the customer has not been refunded or delivered. Retry or refund.`,
    };
  }
  return null;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data: supplier } = await supabase
      .from("suppliers").select("id").eq("code", "databundleshub").maybeSingle();
    if (!supplier) return jsonResponse({ error: "supplier_not_found" }, { status: 404 });

    // Orders already held for verification are excluded: their DBH status is
    // "refunded" and will stay so until the admin resubmits by hand. Polling
    // them again would only try to fail them.
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, order_reference, recipient_phone, status, supplier_status, supplier_purchase_id, admin_resolution_status, networks(name, code)")
      .eq("supplier_id", supplier.id)
      .in("status", ["processing", "pending_supplier"])
      .not("supplier_purchase_id", "is", null)
      .or(`admin_resolution_status.is.null,admin_resolution_status.neq.${AWAITING_VERIFICATION}`)
      .order("updated_at", { ascending: true })
      .limit(MAX_ORDERS_PER_RUN);
    if (ordersError) return jsonResponse({ error: ordersError.message }, { status: 500 });
    if (!orders || orders.length === 0) return jsonResponse({ checked: 0, results: [] });

    /* ── purchaseId per order, from the purchase receipts we logged ── */
    const orderIds = orders.map((o: OrderRow) => o.id);
    const { data: receipts } = await supabase
      .from("supplier_api_logs")
      .select("order_id, created_at, response_payload")
      .eq("action", "purchase")
      .eq("call_status", "success")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });
    const purchaseIdByOrder = new Map<string, string>();
    for (const receipt of receipts ?? []) {
      if (purchaseIdByOrder.has(receipt.order_id)) continue; // newest first
      const pid = receipt.response_payload?.data?.purchaseId;
      if (pid != null) purchaseIdByOrder.set(receipt.order_id, String(pid));
    }

    /* ── One request for the whole batch ─────────────────────── */
    const reportByPurchaseId = new Map<string, SupplierReport>();
    let page = 1;
    while (page <= MAX_TX_PAGES) {
      const tx = await listTransactions(100, page);
      const list = tx.payload?.data?.transactions ?? [];
      if (!tx.ok || list.length === 0) break;
      for (const item of list) {
        if (item.type === "purchase" && item._id != null && item.status) {
          reportByPurchaseId.set(String(item._id), {
            status: String(item.status).toLowerCase(),
            errorCode: item.errorCode ?? item.error_code ?? null,
          });
        }
      }
      const hasNext = Boolean(tx.payload?.data?.pagination?.hasNextPage);
      const allMatched = orders.every((o: OrderRow) => {
        const pid = purchaseIdByOrder.get(o.id);
        return pid ? reportByPurchaseId.has(pid) : false;
      });
      if (!hasNext || allMatched) break;
      page += 1;
    }

    const results: Record<string, unknown>[] = [];
    const unmatched: OrderRow[] = [];

    const apply = async (order: OrderRow, report: SupplierReport, source: string) => {
      const supplierStatus = report.status;

      /* ── Silent MTN refund → verification hold, not a failure ── */
      if (isSilentMtnRefund(order, report)) {
        const held = await markAwaitingVerification(supabase, order, source, { supplierStatus });
        if ((order.supplier_status ?? "") !== supplierStatus) {
          await supabase.from("orders").update({ supplier_status: supplierStatus, updated_at: new Date().toISOString() }).eq("id", order.id);
        }
        results.push({ reference: order.order_reference, outcome: held.changed ? AWAITING_VERIFICATION : "already_awaiting_verification", supplierStatus });
        return;
      }

      const terminal = terminalFor(supplierStatus);
      if (!terminal || (order.status === terminal.nextStatus && (order.supplier_status ?? "") === supplierStatus)) {
        if ((order.supplier_status ?? "") !== supplierStatus) {
          await supabase.from("orders").update({ supplier_status: supplierStatus, updated_at: new Date().toISOString() }).eq("id", order.id);
        }
        results.push({ reference: order.order_reference, outcome: `still_${supplierStatus}` });
        return;
      }
      const errorSuffix = report.errorCode != null && String(report.errorCode) !== "" ? ` (errorCode ${report.errorCode})` : "";
      await supabase.from("orders").update({
        status: terminal.nextStatus,
        supplier_status: supplierStatus,
        failure_reason: terminal.failureReason ? terminal.failureReason + errorSuffix : null,
        updated_at: new Date().toISOString(),
      }).eq("id", order.id);
      await supabase.from("order_events").insert({
        order_id: order.id,
        event_type: "supplier.status_update",
        from_status: order.status,
        to_status: terminal.nextStatus,
        message: `DataBundlesHub reported ${supplierStatus}${errorSuffix} (${source})`,
        metadata: { supplier: "databundleshub", supplierStatus, errorCode: report.errorCode, source },
      });
      results.push({ reference: order.order_reference, outcome: terminal.nextStatus, supplierStatus });
    };

    for (const order of orders as OrderRow[]) {
      const pid = purchaseIdByOrder.get(order.id);
      const report = pid ? reportByPurchaseId.get(pid) : undefined;
      if (report) await apply(order, report, "batch sync");
      else unmatched.push(order);
    }

    /* ── Fallback: per-order checks for anything the list missed ──── */
    for (const order of unmatched.slice(0, MAX_FALLBACK_CHECKS)) {
      try {
        const result = await checkOrderStatus(order.supplier_purchase_id!);
        const data = result.payload?.data ?? {};
        const supplierStatus = String(data.status ?? data.orderStatus ?? "").toLowerCase();
        await supabase.from("supplier_api_logs").insert({
          supplier_id: supplier.id,
          order_id: order.id,
          action: "check_order_status",
          endpoint: "/api/developer/purchase-status",
          request_payload: { request_id: order.supplier_purchase_id },
          response_payload: result.payload ?? {},
          http_status: result.status,
          call_status: result.ok ? "success" : "error",
          duration_ms: result.durationMs,
        });
        if (result.ok && supplierStatus) {
          await apply(order, { status: supplierStatus, errorCode: data.errorCode ?? data.error_code ?? null }, "status sync");
        } else {
          results.push({ reference: order.order_reference, outcome: "status_unavailable" });
        }
      } catch (error) {
        results.push({ reference: order.order_reference, outcome: "exception", message: error instanceof Error ? error.message : String(error) });
      }
    }

    return jsonResponse({ checked: results.length, batchMatched: results.length - Math.min(unmatched.length, MAX_FALLBACK_CHECKS), results });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
