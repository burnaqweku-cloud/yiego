// Bulk dispatch queue gate active (Phase 2 activation 2026-04-30)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dispatchToSupplier, parseDispatchResult, shouldQueueOrder } from "../_shared/supplier-dispatch.ts";
import { logSupplierSpend } from "../_shared/supplier-ledger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const respond = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // 1. Auth: admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const adminId = claims.claims.sub as string;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check admin role (not staff)
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", adminId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return respond({ error: "Forbidden: admin role required" }, 403);
    }

    // 2. Parse input
    const { order_id } = await req.json();
    if (!order_id || typeof order_id !== "string" || order_id.trim().length === 0) {
      return respond({ error: "order_id is required" }, 400);
    }

    const cleanOrderId = order_id.trim();
    console.log(`[retry-dispatch] Admin ${adminId} retrying order ${cleanOrderId}`);

    // 3. Determine order source (regular or agent)
    let order: any = null;
    let isAgentOrder = false;

    // Try regular orders first
    const { data: regularOrder } = await supabase
      .from("orders")
      .select("*")
      .eq("order_id", cleanOrderId)
      .maybeSingle();

    if (regularOrder) {
      order = regularOrder;
    } else {
      // Try agent_orders
      const { data: agentOrder } = await supabase
        .from("agent_orders")
        .select("*")
        .eq("order_id", cleanOrderId)
        .maybeSingle();
      if (agentOrder) {
        order = agentOrder;
        isAgentOrder = true;
      }
    }

    if (!order) {
      return respond({ error: "Order not found" }, 404);
    }

    // 4. Eligibility checks
    const orderStatus = order.status;
    if (orderStatus === "Delivered" || orderStatus === "Completed") {
      return respond({ error: "Order already delivered/completed", eligible: false }, 400);
    }

    // Check payment confirmed
    const paymentOk = isAgentOrder
      ? (order.payment_status === "success" || order.payment_status === "verified" || order.payment_status === "paid")
      : (order.payment_status === "success" || order.payment_status === "verified" || order.payment_status === "paid" || order.status === "Paid" || order.status === "Processing" || order.status === "Failed");

    if (!paymentOk) {
      return respond({ error: "Payment not confirmed for this order", eligible: false }, 400);
    }

    // Check latest dispatch attempt
    const { data: latestAttempt } = await supabase
      .from("order_dispatch_attempts")
      .select("*")
      .eq("order_id", cleanOrderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestAttempt) {
      return respond({
        error: "No dispatch attempt found for this order. Cannot determine if retry is safe.",
        eligible: false,
      }, 400);
    }

    if (latestAttempt.normalized_error_code !== "INSUFFICIENT_FUNDS") {
      return respond({
        error: `Last dispatch error is "${latestAttempt.error_message || latestAttempt.error_code || 'unknown'}", not Insufficient Funds. Retry is only allowed for INSUFFICIENT_FUNDS.`,
        eligible: false,
      }, 400);
    }

    // Check no successful dispatch exists
    const { count: successCount } = await supabase
      .from("order_dispatch_attempts")
      .select("id", { count: "exact", head: true })
      .eq("order_id", cleanOrderId)
      .eq("success", true);

    if ((successCount || 0) > 0) {
      return respond({
        error: "A successful dispatch already exists for this order. Retry blocked to prevent double delivery.",
        eligible: false,
      }, 400);
    }

    // 5. Acquire lock (prevent concurrent retries)
    const { error: lockError } = await supabase
      .from("order_dispatch_locks")
      .insert({ order_id: cleanOrderId, locked_by: adminId });

    if (lockError) {
      if (lockError.code === "23505") {
        return respond({ error: "Retry already in progress for this order" }, 409);
      }
      console.error("[retry-dispatch] Lock error:", lockError);
      return respond({ error: "Failed to acquire lock" }, 500);
    }

    try {
      // 6. Update order to Processing
      const table = isAgentOrder ? "agent_orders" : "orders";
      await supabase
        .from(table)
        .update({ status: "Processing", failure_reason: null })
        .eq("order_id", cleanOrderId);

      // 7. Build supplier payload
      const recipientNumber = isAgentOrder ? order.customer_phone : order.recipient_number;
      const supplierPayload = {
        network: order.network,
        phone_number: recipientNumber,
        data_amount: String(order.bundle_size_gb),
      };

      // Bulk dispatch queue gate (polymorphic; feature flag OFF by default → no-op)
      if (await shouldQueueOrder(supabase, { order_id: cleanOrderId, network: order.network }, table as "orders" | "agent_orders")) {
        await supabase.from(table).update({ status: "Pending", queue_state: "queued" }).eq("order_id", cleanOrderId);
        return respond({ success: true, queued: true, order_id: cleanOrderId });
      }

      // 8. Dispatch (with logging via opts)
      const result = await dispatchToSupplier(supabase, supplierPayload, order.product_id, {
        orderId: cleanOrderId,
        createdBy: `admin:${adminId}`,
        retryOfAttemptId: latestAttempt.id,
      });

      const rawResponse = JSON.stringify(result.body);

      // 9. Get the new attempt ID for audit
      const { data: newAttempt } = await supabase
        .from("order_dispatch_attempts")
        .select("id")
        .eq("order_id", cleanOrderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let auditResult: string;

      if (result.ok) {
        const p = parseDispatchResult(result);

        const updateData: any = {
          status: p.newStatus,
          supplier_order_id: p.supplierOrderId,
          supplier_reference: p.supplierReference,
          supplier_status: p.supplierStatus,
          supplier_message: p.supplierMessage,
          supplier_raw_response: rawResponse,
          supplier_timestamp: new Date().toISOString(),
          supplier_id: p.supplierId,
        };

        if (!isAgentOrder) {
          updateData.supplier_amount = p.supplierAmount;
          updateData.supplier_remaining_balance = p.supplierBalance;
        }

        await supabase.from(table).update(updateData).eq("order_id", cleanOrderId);

        // Log supplier spend
        const costPrice = Number(order.cost_price_ghs || order.amount_ghs || order.agent_cost_price || 0);
        await logSupplierSpend(supabase, cleanOrderId, costPrice, {
          network: order.network,
          bundle_size_gb: order.bundle_size_gb,
          recipient: recipientNumber,
          supplier_order_id: p.supplierOrderId,
          created_by: adminId,
        });

        auditResult = "success";
        console.log(`[retry-dispatch] Order ${cleanOrderId} retry SUCCESS → ${p.newStatus}`);
      } else {
        const failureReason = String(
          result.body.message || result.body.error || `Supplier returned HTTP ${result.status}`
        ).slice(0, 500);

        const failUpdate: any = {
          status: "Failed",
          failure_reason: failureReason,
          supplier_raw_response: rawResponse,
          supplier_status: "failed",
          supplier_message: failureReason,
          supplier_timestamp: new Date().toISOString(),
        };

        await supabase.from(table).update(failUpdate).eq("order_id", cleanOrderId);

        auditResult = "failed";
        console.error(`[retry-dispatch] Order ${cleanOrderId} retry FAILED: ${failureReason}`);
      }

      // 10. Write audit log
      await supabase.from("order_retry_audit_logs").insert({
        order_id: cleanOrderId,
        admin_id: adminId,
        previous_attempt_id: latestAttempt.id,
        new_attempt_id: newAttempt?.id || null,
        result: auditResult,
        reason: "INSUFFICIENT_FUNDS retry",
      });

      return respond({
        success: result.ok,
        order_id: cleanOrderId,
        result: auditResult,
        message: result.ok ? "Retry dispatch succeeded" : "Retry dispatch failed again",
      });
    } finally {
      // 11. Release lock
      await supabase
        .from("order_dispatch_locks")
        .delete()
        .eq("order_id", cleanOrderId);
    }
  } catch (err) {
    console.error("[retry-dispatch] Unexpected error:", err);
    return respond({ error: "Internal server error" }, 500);
  }
});
