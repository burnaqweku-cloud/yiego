import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth: admin only ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roleRow } = await db.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Admin access required" }, 403);

    // ── Parse scan window ──
    let hoursBack = 48;
    try {
      const body = await req.json();
      if (body?.hours && Number(body.hours) > 0 && Number(body.hours) <= 168) hoursBack = Number(body.hours);
    } catch { /* default 48h */ }

    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    // ── Step 1: Fetch successful payments ──
    const { data: payments, error: payErr } = await db
      .from("paystack_payments")
      .select("id, reference, user_id, amount_ghs, purpose, linked_order_id, linked_wallet_txn_id, checkout_meta, customer_email, processing_fee, status, paid_at, created_at")
      .in("status", ["success", "completed"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (payErr) {
      console.error("[scan] Failed to fetch payments:", payErr);
      return json({ error: "Failed to scan payments" }, 500);
    }

    // ── Step 2: Diagnostics counts ──
    const [totalRes, successRes, ordersRes, agentOrdersRes, subsRes] = await Promise.all([
      db.from("paystack_payments").select("id", { count: "exact", head: true }).gte("created_at", since),
      db.from("paystack_payments").select("id", { count: "exact", head: true }).in("status", ["success", "completed"]).gte("created_at", since),
      db.from("orders").select("id", { count: "exact", head: true }).gte("created_at", since),
      db.from("agent_orders").select("id", { count: "exact", head: true }).gte("created_at", since),
      db.from("agent_subscriptions").select("id", { count: "exact", head: true }).gte("created_at", since),
    ]);

    // Deposits query separately to handle gracefully if table schema differs
    let depositsCount = 0;
    try {
      const depRes = await db.from("wallet_transactions").select("id", { count: "exact", head: true }).eq("type", "deposit").gte("created_at", since);
      depositsCount = depRes.count || 0;
    } catch (e) {
      console.warn("[scan] wallet_transactions count failed:", e);
    }

    const [openRes, reviewRes, resolvedRes, cancelledRes] = await Promise.all([
      db.from("payment_reconciliation_cases").select("id", { count: "exact", head: true }).eq("status", "open"),
      db.from("payment_reconciliation_cases").select("id", { count: "exact", head: true }).eq("status", "in_review"),
      db.from("payment_reconciliation_cases").select("id", { count: "exact", head: true }).eq("status", "resolved"),
      db.from("payment_reconciliation_cases").select("id", { count: "exact", head: true }).eq("status", "cancelled"),
    ]);

    if (!payments || payments.length === 0) {
      return json({
        scanned: 0, successful_payments: 0, new_cases: 0, cases_updated: 0,
        fulfillment_cases_created: 0,
        cases_total_open: openRes.count || 0,
        scan_timestamp: new Date().toISOString(), hours_back: hoursBack,
        recent_refs: [],
        matching_breakdown: { matched_by_reference: 0, matched_by_linked_id: 0, no_match: 0, weak_match_only: 0 },
        purpose_breakdown: {},
        diagnostics: {
          total_payments_in_window: totalRes.count || 0,
          successful_payments_in_window: 0,
          orders_in_window: ordersRes.count || 0,
          agent_orders_in_window: agentOrdersRes.count || 0,
          deposits_in_window: depositsCount,
          subscriptions_in_window: subsRes.count || 0,
          cases_open: openRes.count || 0, cases_in_review: reviewRes.count || 0,
          cases_resolved: resolvedRes.count || 0, cases_cancelled: cancelledRes.count || 0,
          message: (totalRes.count || 0) === 0
            ? "No payments found in window. Webhook may not be receiving events."
            : "Payments exist but none marked success/completed.",
        },
      });
    }

    // ── Step 3: Collect all references for batch matching ──
    const allRefs = payments.map(p => p.reference).filter(Boolean);
    const allLinkedOrderIds = payments.map(p => p.linked_order_id).filter(Boolean);
    const allLinkedWalletIds = payments.map(p => p.linked_wallet_txn_id).filter(Boolean);

    // Batch fetch matching records across all relevant tables
    const [
      matchedOrders,
      matchedAgentOrders,
      matchedDeposits,
      matchedSubs,
      matchedActivations,
    ] = await Promise.all([
      batchQuery(db, "orders", [
        { column: "paystack_reference", values: allRefs },
        { column: "order_id", values: allLinkedOrderIds },
      ]),
      batchQuery(db, "agent_orders", [
        { column: "paystack_reference", values: allRefs },
        { column: "order_id", values: allLinkedOrderIds },
      ]),
      batchQuery(db, "wallet_transactions", [
        { column: "paystack_reference", values: allRefs },
        { column: "reference", values: allRefs },
        { column: "id", values: allLinkedWalletIds },
      ]),
      batchQuery(db, "agent_subscriptions", [
        { column: "paystack_reference", values: allRefs },
      ]),
      batchQuery(db, "agents", [
        { column: "activation_reference", values: allRefs },
      ]),
    ]);

    // Build lookup sets keyed by the value that matched
    const orderRefSet = new Set(matchedOrders.map(o => o.paystack_reference).filter(Boolean));
    const orderIdSet = new Set(matchedOrders.map(o => o.order_id).filter(Boolean));
    const agentOrderRefSet = new Set(matchedAgentOrders.map(o => o.paystack_reference).filter(Boolean));
    const agentOrderIdSet = new Set(matchedAgentOrders.map(o => o.order_id).filter(Boolean));
    const depositRefSet = new Set([
      ...matchedDeposits.filter(d => d.paystack_reference).map(d => d.paystack_reference),
      ...matchedDeposits.filter(d => d.reference).map(d => d.reference),
    ]);
    const depositIdSet = new Set(matchedDeposits.map(d => d.id).filter(Boolean));
    const subRefSet = new Set(matchedSubs.map(s => s.paystack_reference).filter(Boolean));
    const activationRefSet = new Set(matchedActivations.map(a => a.activation_reference).filter(Boolean));

    // ── Step 4: Check each payment and create cases ──
    let newCases = 0;
    let casesUpdated = 0;
    const purposeBreakdown: Record<string, { total: number; matched: number; unmatched: number }> = {};
    const matchingBreakdown = {
      matched_by_reference: 0,
      matched_by_linked_id: 0,
      no_match: 0,
      weak_match_only: 0,
    };

    for (const payment of payments) {
      const purpose = payment.purpose || "unknown";
      if (!purposeBreakdown[purpose]) purposeBreakdown[purpose] = { total: 0, matched: 0, unmatched: 0 };
      purposeBreakdown[purpose].total++;

      let isMatched = false;
      let matchMethod = "none";
      let reasonCode = "unknown_missing_link";

      switch (purpose) {
        case "order": {
          if (payment.linked_order_id && orderIdSet.has(payment.linked_order_id)) {
            isMatched = true; matchMethod = "linked_id";
          } else if (orderRefSet.has(payment.reference)) {
            isMatched = true; matchMethod = "reference";
          }
          reasonCode = "missing_order";
          break;
        }
        case "agent_order": {
          if (payment.linked_order_id && agentOrderIdSet.has(payment.linked_order_id)) {
            isMatched = true; matchMethod = "linked_id";
          } else if (agentOrderRefSet.has(payment.reference)) {
            isMatched = true; matchMethod = "reference";
          }
          reasonCode = "missing_order";
          break;
        }
        case "deposit": {
          if (payment.linked_wallet_txn_id && depositIdSet.has(payment.linked_wallet_txn_id)) {
            isMatched = true; matchMethod = "linked_id";
          } else if (depositRefSet.has(payment.reference)) {
            isMatched = true; matchMethod = "reference";
          }
          reasonCode = "missing_deposit";
          break;
        }
        case "agent_activation": {
          if (activationRefSet.has(payment.reference)) {
            isMatched = true; matchMethod = "reference";
          }
          reasonCode = "missing_subscription";
          break;
        }
        case "agent_subscription": {
          if (subRefSet.has(payment.reference)) {
            isMatched = true; matchMethod = "reference";
          }
          reasonCode = "missing_subscription";
          break;
        }
        default: {
          // Unknown purpose: try ALL tables
          if (orderRefSet.has(payment.reference) || agentOrderRefSet.has(payment.reference)
            || depositRefSet.has(payment.reference) || subRefSet.has(payment.reference)
            || activationRefSet.has(payment.reference)) {
            isMatched = true; matchMethod = "reference";
          }
          reasonCode = "unknown_missing_link";
          break;
        }
      }

      if (isMatched) {
        purposeBreakdown[purpose].matched++;
        if (matchMethod === "reference") matchingBreakdown.matched_by_reference++;
        else if (matchMethod === "linked_id") matchingBreakdown.matched_by_linked_id++;
        continue;
      }

      // Unmatched — create case
      purposeBreakdown[purpose].unmatched++;
      matchingBreakdown.no_match++;

      const paidAt = payment.paid_at || payment.created_at;
      const ageMs = Date.now() - new Date(paidAt).getTime();
      const severity = ageMs > 10 * 60 * 1000 ? "high" : "medium";
      const meta = payment.checkout_meta as Record<string, unknown> | null;

      const { data: upserted, error: upsertErr } = await db
        .from("payment_reconciliation_cases")
        .upsert(
          {
            paystack_reference: payment.reference,
            payment_id: payment.id || null,
            user_id: payment.user_id || null,
            agent_id: (meta?.agent_id as string) || null,
            amount: Number(payment.amount_ghs) || 0,
            currency: "GHS",
            status: "open",
            severity,
            reason: reasonCode,
            metadata: {
              case_type: "payment_missing_record",
              purpose,
              channel: purpose === "agent_order" ? "agent_store" : "normal_user",
              linked_order_id: payment.linked_order_id,
              linked_wallet_txn_id: payment.linked_wallet_txn_id,
              customer_email: payment.customer_email,
              checkout_meta: meta,
              paid_at: payment.paid_at,
              source: `${hoursBack}h_scan`,
              scan_reason: `No matching ${reasonCode.replace("missing_", "")} found for ${purpose} payment`,
            },
          },
          { onConflict: "paystack_reference,reason", ignoreDuplicates: true }
        )
        .select("id")
        .maybeSingle();

      if (upsertErr) {
        if (upsertErr.code === "23505") casesUpdated++;
        else console.error("[scan] Upsert failed for", payment.reference, upsertErr);
      } else if (upserted) {
        newCases++;
      }
    }

    // ── Step 5: Fulfillment failure detection ──
    // Find orders that are paid but have no supplier activity
    let fulfillmentCasesCreated = 0;
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // Check regular orders: paid but no supplier_order_id and no supplier_reference, older than 10 min
    const { data: stuckOrders } = await db
      .from("orders")
      .select("id, order_id, paystack_reference, amount_ghs, network, bundle_size_gb, user_id, status, supplier_order_id, supplier_reference, supplier_status, created_at, recipient_number")
      .in("status", ["Processing", "Paid"])
      .is("supplier_order_id", null)
      .is("supplier_reference", null)
      .lt("created_at", tenMinAgo)
      .gte("created_at", since)
      .limit(200);

    if (stuckOrders && stuckOrders.length > 0) {
      for (const order of stuckOrders) {
        const ref = order.paystack_reference || order.order_id;
        const { data: upserted, error: upsertErr } = await db
          .from("payment_reconciliation_cases")
          .upsert(
            {
              paystack_reference: ref,
              user_id: order.user_id || null,
              amount: Number(order.amount_ghs) || 0,
              currency: "GHS",
              status: "open",
              severity: "high",
              reason: "fulfillment_not_started",
              metadata: {
                case_type: "fulfillment_issue",
                order_id: order.order_id,
                internal_id: order.id,
                network: order.network,
                bundle_size_gb: order.bundle_size_gb,
                recipient: order.recipient_number,
                order_status: order.status,
                supplier_status: order.supplier_status,
                created_at: order.created_at,
                scan_reason: "Order is paid but supplier was never called (no supplier_order_id or supplier_reference)",
              },
            },
            { onConflict: "paystack_reference,reason", ignoreDuplicates: true }
          )
          .select("id")
          .maybeSingle();

        if (!upsertErr && upserted) fulfillmentCasesCreated++;
      }
    }

    // Check agent orders: paid but no supplier call
    const { data: stuckAgentOrders } = await db
      .from("agent_orders")
      .select("id, order_id, paystack_reference, agent_selling_price, network, bundle_size_gb, agent_id, status, supplier_order_id, supplier_reference, supplier_status, created_at, customer_phone")
      .in("status", ["Processing", "pending"])
      .is("supplier_order_id", null)
      .is("supplier_reference", null)
      .eq("payment_status", "paid")
      .lt("created_at", tenMinAgo)
      .gte("created_at", since)
      .limit(200);

    if (stuckAgentOrders && stuckAgentOrders.length > 0) {
      for (const order of stuckAgentOrders) {
        const ref = order.paystack_reference || order.order_id;
        const { data: upserted, error: upsertErr } = await db
          .from("payment_reconciliation_cases")
          .upsert(
            {
              paystack_reference: ref,
              agent_id: order.agent_id || null,
              amount: Number(order.agent_selling_price) || 0,
              currency: "GHS",
              status: "open",
              severity: "high",
              reason: "fulfillment_not_started",
              metadata: {
                case_type: "fulfillment_issue",
                order_id: order.order_id,
                internal_id: order.id,
                network: order.network,
                bundle_size_gb: order.bundle_size_gb,
                recipient: order.customer_phone,
                order_status: order.status,
                supplier_status: order.supplier_status,
                created_at: order.created_at,
                order_type: "agent_order",
                scan_reason: "Agent order is paid but supplier was never called",
              },
            },
            { onConflict: "paystack_reference,reason", ignoreDuplicates: true }
          )
          .select("id")
          .maybeSingle();

        if (!upsertErr && upserted) fulfillmentCasesCreated++;
      }
    }

    // Also check orders where supplier returned error and order is stuck
    const { data: failedSupplierOrders } = await db
      .from("orders")
      .select("id, order_id, paystack_reference, amount_ghs, network, bundle_size_gb, user_id, status, supplier_order_id, supplier_reference, supplier_status, supplier_message, created_at, recipient_number")
      .in("status", ["Processing", "Paid"])
      .in("supplier_status", ["failed", "error", "FAILED", "ERROR"])
      .lt("created_at", tenMinAgo)
      .gte("created_at", since)
      .limit(200);

    if (failedSupplierOrders && failedSupplierOrders.length > 0) {
      for (const order of failedSupplierOrders) {
        const ref = order.paystack_reference || order.order_id;
        const { data: upserted, error: upsertErr } = await db
          .from("payment_reconciliation_cases")
          .upsert(
            {
              paystack_reference: ref,
              user_id: order.user_id || null,
              amount: Number(order.amount_ghs) || 0,
              currency: "GHS",
              status: "open",
              severity: "high",
              reason: "fulfillment_supplier_failed",
              metadata: {
                case_type: "fulfillment_issue",
                order_id: order.order_id,
                internal_id: order.id,
                network: order.network,
                bundle_size_gb: order.bundle_size_gb,
                recipient: order.recipient_number,
                order_status: order.status,
                supplier_status: order.supplier_status,
                supplier_message: order.supplier_message,
                created_at: order.created_at,
                scan_reason: "Supplier call failed and order is stuck without retry",
              },
            },
            { onConflict: "paystack_reference,reason", ignoreDuplicates: true }
          )
          .select("id")
          .maybeSingle();

        if (!upsertErr && upserted) fulfillmentCasesCreated++;
      }
    }

    console.log(`[scan] Scanned ${payments.length} payments, ${newCases} new payment cases, ${fulfillmentCasesCreated} fulfillment cases, ${casesUpdated} existing`);

    // Refresh open count
    const { count: updatedOpenCount } = await db
      .from("payment_reconciliation_cases")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");

    const recentRefs = payments.slice(0, 5).map((p: any) => {
      const ref = p.reference || "";
      return ref.length > 8 ? ref.slice(0, 4) + "****" + ref.slice(-4) : "****";
    });

    return json({
      scanned: payments.length,
      successful_payments: payments.length,
      new_cases: newCases,
      fulfillment_cases_created: fulfillmentCasesCreated,
      cases_updated: casesUpdated,
      cases_total_open: updatedOpenCount || 0,
      scan_timestamp: new Date().toISOString(),
      hours_back: hoursBack,
      recent_refs: recentRefs,
      matching_breakdown: matchingBreakdown,
      purpose_breakdown: purposeBreakdown,
      stuck_orders_found: (stuckOrders?.length || 0) + (stuckAgentOrders?.length || 0),
      failed_supplier_orders_found: failedSupplierOrders?.length || 0,
      diagnostics: {
        total_payments_in_window: totalRes.count || 0,
        successful_payments_in_window: successRes.count || 0,
        orders_in_window: ordersRes.count || 0,
        agent_orders_in_window: agentOrdersRes.count || 0,
        deposits_in_window: depositsCount,
        subscriptions_in_window: subsRes.count || 0,
        cases_open: updatedOpenCount || 0,
        cases_in_review: reviewRes.count || 0,
        cases_resolved: resolvedRes.count || 0,
        cases_cancelled: cancelledRes.count || 0,
        message: "Scan completed successfully.",
      },
    });
  } catch (err) {
    console.error("[scan] Error:", err);
    return json({
      ok: false,
      error: "Internal scan error",
      detail: String(err),
      scanned: 0,
      successful_payments: 0,
      new_cases: 0,
      fulfillment_cases_created: 0,
      cases_updated: 0,
      cases_total_open: 0,
      scan_timestamp: new Date().toISOString(),
      hours_back: 48,
      recent_refs: [],
      matching_breakdown: { matched_by_reference: 0, matched_by_linked_id: 0, no_match: 0, weak_match_only: 0 },
      purpose_breakdown: {},
      diagnostics: {
        total_payments_in_window: 0,
        successful_payments_in_window: 0,
        orders_in_window: 0,
        agent_orders_in_window: 0,
        deposits_in_window: 0,
        subscriptions_in_window: 0,
        cases_open: 0, cases_in_review: 0,
        cases_resolved: 0, cases_cancelled: 0,
        message: `Scan crashed: ${String(err)}`,
      },
    });
  }
});

// ─── Helpers ────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface QuerySpec {
  column: string;
  values: (string | null)[];
}

/**
 * Batch-fetch rows from a table matching any of the given column/value pairs.
 * Returns deduplicated rows.
 */
async function batchQuery(db: any, table: string, queries: QuerySpec[]): Promise<any[]> {
  const results: any[] = [];
  const seenIds = new Set<string>();

  for (const { column, values } of queries) {
    const filtered = values.filter(Boolean) as string[];
    if (filtered.length === 0) continue;

    // Select the columns we need for matching
    const selectCols = queries.map(q => q.column).join(", ") + ", id";

    for (let i = 0; i < filtered.length; i += 100) {
      const chunk = filtered.slice(i, i + 100);
      try {
        const { data } = await db.from(table).select(selectCols).in(column, chunk);
        if (data) {
          for (const row of data) {
            if (!seenIds.has(row.id)) {
              seenIds.add(row.id);
              results.push(row);
            }
          }
        }
      } catch (e) {
        // Table or column may not exist
        console.warn(`[scan] Query ${table}.${column} failed:`, e);
      }
    }
  }

  return results;
}
