import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { checkOrderStatus, listTransactions } from "../_shared/databundleshub.ts";
import { AWAITING_VERIFICATION, isSilentMtnRefund, markAwaitingVerification } from "../_shared/verification.ts";
import { fulfillOrder } from "../_shared/fulfillment.ts";

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

   A "failed"/"refunded"/etc. read is confirmed before it's written as
   terminal: YG-A7E2EF67D0 (2026-09-16) was marked failed_needs_review
   off a single batch read of "failed", but DBH's own dashboard showed
   it delivered — the transactions list gave a transient, wrong answer
   for that one purchase. A delivered/completed read is trusted at once
   (a false positive there is rare and self-corrects on delivery), but
   a losing read only sticks once a same-day re-check of that specific
   purchase, via /purchase-status, agrees. If it doesn't agree, or the
   supplier can't be reached to ask, the order is left alone rather
   than downgraded on a guess — next run tries again.

   Orders parked by DBH's 10-minute per-number cooldown (see
   fulfillment.ts) are re-sent here first, once their retry time
   has passed — the same fulfillOrder path the webhook uses, so
   there is still exactly one send per order.

   Scales to hundreds of pending orders in a single request.
   Publicly callable but read-and-apply only; scheduled via cron.
   ════════════════════════════════════════════════════════════ */

const MAX_ORDERS_PER_RUN = 100;
const MAX_TX_PAGES = 3;
const MAX_FALLBACK_CHECKS = 10;
const MAX_RESENDS_PER_RUN = 20;
const LOSING_STATUSES = new Set(["failed", "refunded", "cancelled", "reversed"]);

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
    const denied = await requireCronSecret(req, supabase); if (denied) return denied;
    const { data: supplier } = await supabase
      .from("suppliers").select("id").eq("code", "databundleshub").maybeSingle();
    if (!supplier) return jsonResponse({ error: "supplier_not_found" }, { status: 404 });

    /* ── Re-send orders whose cooldown has passed ─────────────────── */
    const resent: Record<string, unknown>[] = [];
    const { data: due } = await supabase
      .from("orders")
      .select("id, order_reference")
      .eq("supplier_id", supplier.id)
      .eq("payment_status", "succeeded")
      .eq("status", "processing")
      .is("supplier_purchase_id", null)
      .is("supplier_order_reference", null)
      .lte("supplier_retry_after", new Date().toISOString())
      .order("supplier_retry_after", { ascending: true })
      .limit(MAX_RESENDS_PER_RUN);
    for (const row of due ?? []) {
      try {
        const r = await fulfillOrder(supabase, row.id);
        resent.push({ reference: row.order_reference, outcome: r.skipped ? `skipped_${r.reason}` : r.status });
      } catch (error) {
        resent.push({ reference: row.order_reference, outcome: "exception", message: error instanceof Error ? error.message : String(error) });
      }
    }

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
    if (!orders || orders.length === 0) return jsonResponse({ checked: 0, resent, results: [] });

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

    const writeTerminal = async (order: OrderRow, report: SupplierReport, terminal: { nextStatus: string; failureReason: string | null }, source: string) => {
      const errorSuffix = report.errorCode != null && String(report.errorCode) !== "" ? ` (errorCode ${report.errorCode})` : "";
      await supabase.from("orders").update({
        status: terminal.nextStatus,
        supplier_status: report.status,
        failure_reason: terminal.failureReason ? terminal.failureReason + errorSuffix : null,
        updated_at: new Date().toISOString(),
      }).eq("id", order.id);
      await supabase.from("order_events").insert({
        order_id: order.id,
        event_type: "supplier.status_update",
        from_status: order.status,
        to_status: terminal.nextStatus,
        message: `DataBundlesHub reported ${report.status}${errorSuffix} (${source})`,
        metadata: { supplier: "databundleshub", supplierStatus: report.status, errorCode: report.errorCode, source },
      });
      results.push({ reference: order.order_reference, outcome: terminal.nextStatus, supplierStatus: report.status });
    };

    const bumpSupplierStatus = async (order: OrderRow, supplierStatus: string) => {
      if ((order.supplier_status ?? "") !== supplierStatus) {
        await supabase.from("orders").update({ supplier_status: supplierStatus, updated_at: new Date().toISOString() }).eq("id", order.id);
      }
    };

    const apply = async (order: OrderRow, report: SupplierReport, source: string) => {
      const supplierStatus = report.status;

      /* ── Silent MTN refund → verification hold, not a failure ── */
      if (isSilentMtnRefund(order, report)) {
        const held = await markAwaitingVerification(supabase, order, source, { supplierStatus });
        await bumpSupplierStatus(order, supplierStatus);
        results.push({ reference: order.order_reference, outcome: held.changed ? AWAITING_VERIFICATION : "already_awaiting_verification", supplierStatus });
        return;
      }

      const terminal = terminalFor(supplierStatus);
      if (!terminal || (order.status === terminal.nextStatus && (order.supplier_status ?? "") === supplierStatus)) {
        await bumpSupplierStatus(order, supplierStatus);
        results.push({ reference: order.order_reference, outcome: `still_${supplierStatus}` });
        return;
      }

      /* ── A losing read from the batch list is confirmed, not trusted
       *    outright: YG-A7E2EF67D0 was marked failed on a single "failed"
       *    seen in /transactions, but DBH's own records showed it delivered.
       *    Delivered/completed reads still write immediately — a wrong
       *    delivery read is rare and self-corrects. A losing read from the
       *    per-order fallback is already a direct, current answer for this
       *    exact purchase, so it's trusted as-is too. ── */
      if (source === "batch sync" && LOSING_STATUSES.has(supplierStatus) && order.supplier_purchase_id) {
        const confirmation = await checkOrderStatus(order.supplier_purchase_id);
        const confirmedStatus = String(confirmation.payload?.data?.status ?? confirmation.payload?.data?.orderStatus ?? "").toLowerCase();
        await supabase.from("supplier_api_logs").insert({
          supplier_id: supplier.id,
          order_id: order.id,
          action: "check_order_status",
          endpoint: "/api/developer/purchase-status",
          request_payload: { request_id: order.supplier_purchase_id, reason: "confirming batch failure before writing terminal status" },
          response_payload: confirmation.payload ?? {},
          http_status: confirmation.status,
          call_status: confirmation.ok ? "success" : "error",
          duration_ms: confirmation.durationMs,
        });
        if (!confirmation.ok || !confirmedStatus) {
          // Could not confirm — leave the order alone, try again next run.
          results.push({ reference: order.order_reference, outcome: "unconfirmed_failure_left_alone", supplierStatus });
          return;
        }
        if (confirmedStatus !== supplierStatus) {
          // The batch list was wrong. Trust the direct, current re-check.
          const confirmedReport: SupplierReport = { status: confirmedStatus, errorCode: confirmation.payload?.data?.errorCode ?? confirmation.payload?.data?.error_code ?? null };
          if (isSilentMtnRefund(order, confirmedReport)) {
            const held = await markAwaitingVerification(supabase, order, "batch sync (corrected on confirm)", { supplierStatus: confirmedStatus });
            await bumpSupplierStatus(order, confirmedStatus);
            results.push({ reference: order.order_reference, outcome: held.changed ? AWAITING_VERIFICATION : "already_awaiting_verification", supplierStatus: confirmedStatus, corrected: true });
            return;
          }
          const confirmedTerminal = terminalFor(confirmedStatus);
          if (confirmedTerminal) await writeTerminal(order, confirmedReport, confirmedTerminal, "batch sync (corrected on confirm)");
          else await bumpSupplierStatus(order, confirmedStatus);
          results.push({ reference: order.order_reference, outcome: confirmedTerminal?.nextStatus ?? `still_${confirmedStatus}`, corrected: true });
          return;
        }
        // Confirmed — the loss is real.
        await writeTerminal(order, report, terminal, "batch sync (confirmed)");
        return;
      }

      await writeTerminal(order, report, terminal, source);
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

    return jsonResponse({ checked: results.length, resent, batchMatched: results.length - Math.min(unmatched.length, MAX_FALLBACK_CHECKS), results });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
