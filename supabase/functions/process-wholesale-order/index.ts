// Bulk dispatch queue gate active (Phase 2 activation 2026-04-30)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logSupplierSpend } from "../_shared/supplier-ledger.ts";
import { dispatchToSupplier, parseDispatchResult, shouldQueueOrder } from "../_shared/supplier-dispatch.ts";
import { checkSystemOnline, checkNetworkAvailable } from "../_shared/system-status-guard.ts";
import { checkDuplicateInFlightOrder, checkBulkDuplicates } from "../_shared/duplicate-order-guard.ts";
import { validateNetworkMatch } from "../_shared/network-detect.ts";

/** Log a security event (fire-and-forget) */
async function logSecurityEventLocal(supabase: any, eventType: string, severity: string, details: Record<string, unknown>) {
  try {
    await supabase.from("security_event_logs").insert({
      event_type: eventType, severity,
      user_id: details.user_id || null,
      agent_id: details.agent_id || null,
      order_id: details.order_id || null,
      payment_reference: details.payment_reference || null,
      details,
    });
  } catch (_) { /* non-fatal */ }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateOrderId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `WS-${code}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ─── System status guard ──────────────────────────────────
    const offlineRes = await checkSystemOnline(corsHeaders);
    if (offlineRes) return offlineRes;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await supabaseAnon.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify agent
    const { data: agent } = await supabase
      .from("agents")
      .select("id, status, user_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (!agent) {
      return new Response(JSON.stringify({ error: "Agent not found or not active" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Subscription guard: check effective state via canonical RPC ───
    const { data: stateRows } = await supabase
      .rpc("get_agent_effective_state", { p_agent_id: agent.id });
    const agentState = Array.isArray(stateRows) && stateRows.length > 0 ? stateRows[0] : null;
    if (!agentState || !agentState.can_use_bulk_orders) {
      console.warn(`[wholesale] Bulk order blocked: agent=${agent.id}, state=${agentState?.effective_state || 'unknown'}`);
      await logSecurityEventLocal(supabase, "BULK_ORDER_BLOCKED_EXPIRED", "medium", {
        user_id: userId, agent_id: agent.id,
        details: { effective_state: agentState?.effective_state || 'unknown' },
      });
      return new Response(JSON.stringify({
        error: "Bulk orders are unavailable while your agent subscription is inactive. Renew to continue.",
      }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    // ─── ACTION: place_single ─────────────────────────────────
    if (action === "place_single") {
      const { network, bundle_size_gb, recipient, product_id, agent_note } = body;

      // Security: log if client tried to send an amount (it's ignored, server computes)
      if (body.amount != null || body.price != null) {
        await logSecurityEventLocal(supabase, "INVALID_CLIENT_PRICE_ATTEMPT", "medium", {
          user_id: userId, agent_id: agent.id,
          details: { action: "place_single", client_amount: body.amount, client_price: body.price, product_id },
        });
      }

      if (!network || !bundle_size_gb || !recipient || !product_id) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ─── Network availability guard ───
      const networkAvailRes = await checkNetworkAvailable(network, corsHeaders);
      if (networkAvailRes) return networkAvailRes;

      // ─── Duplicate in-flight order guard ───
      const dupCheck = await checkDuplicateInFlightOrder(supabase, recipient);
      if (dupCheck.blocked) {
        console.log(`[bulk-single] Duplicate blocked: ${recipient} → ${dupCheck.existingOrderId}`);
        return new Response(JSON.stringify({ error: dupCheck.message }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ─── Network mismatch guard ───
      const networkMismatch = validateNetworkMatch(recipient, network);
      if (networkMismatch) {
        return new Response(JSON.stringify({ error: networkMismatch }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get product
      const { data: product } = await supabase
        .from("products")
        .select("*")
        .eq("id", product_id)
        .eq("active", true)
        .maybeSingle();

      if (!product) {
        return new Response(JSON.stringify({ error: "Product not found" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get agent base price from pricing_overrides
      const { data: override } = await supabase
        .from("pricing_overrides")
        .select("*")
        .eq("product_id", product_id)
        .eq("customer_type", "agent")
        .maybeSingle();

      let agentPrice: number;
      if (override?.manual_price && Number(override.manual_price) > 0) {
        agentPrice = Number(override.manual_price);
      } else if (product.agent_price_ghs && Number(product.agent_price_ghs) > 0) {
        agentPrice = Number(product.agent_price_ghs);
      } else {
        agentPrice = Number(product.price_ghs);
      }

      const costPrice = Number(product.cost_price_ghs || agentPrice);

      // Check wallet balance
      const { data: wallet } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (!wallet || Number(wallet.balance_ghs) < agentPrice) {
        return new Response(JSON.stringify({
          error: "Insufficient wallet balance",
          balance: wallet?.balance_ghs || 0,
          required: agentPrice,
        }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Deduct wallet
      const newBalance = Number(wallet.balance_ghs) - agentPrice;
      await supabase.from("wallets").update({ balance_ghs: newBalance }).eq("id", wallet.id);

      const orderId = generateOrderId();

      // Create wallet transaction
      await supabase.from("wallet_transactions").insert({
        user_id: userId,
        type: "debit",
        amount_ghs: agentPrice,
        status: "confirmed",
        reference: `BLK-${orderId}`,
        description: `Bulk order ${orderId} - ${network} ${bundle_size_gb}GB`,
      });

      // Create order
      await supabase.from("orders").insert({
        order_id: orderId,
        user_id: userId,
        recipient_number: recipient,
        network,
        bundle_size_gb: Number(bundle_size_gb),
        amount_ghs: agentPrice,
        cost_price_ghs: costPrice,
        product_id,
        status: "Paid",
        payment_method: "wallet",
        payment_status: "paid",
        order_source: "agent_bulk",
        order_type: "normal",
        is_wholesale: true,
        order_channel: "agent_bulk",
        wholesale_unit_price: agentPrice,
        wholesale_total_price: agentPrice,
        agent_note: agent_note || null,
      });

      // Bulk dispatch queue gate (feature flag OFF by default → no-op)
      if (await shouldQueueOrder(supabase, { order_id: orderId, network }, "orders")) {
        await supabase.from("orders").update({ status: "Pending", queue_state: "queued" }).eq("order_id", orderId);
        return new Response(JSON.stringify({ success: true, queued: true, order_id: orderId }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Dispatch to supplier via routing layer ──
      console.log(`[bulk-single] Dispatching order ${orderId}: network=${network}, product_id=${product_id}`);
      const startTime = Date.now();
      const result = await dispatchToSupplier(supabase, {
        network,
        phone_number: recipient,
        data_amount: String(bundle_size_gb),
      }, product_id, { orderId });
      const responseTimeMs = Date.now() - startTime;
      const rawResponse = JSON.stringify(result.body);

      console.log(`[bulk-single] ${orderId}: supplier=${result.supplierCode}, ok=${result.ok}, ${responseTimeMs}ms`);

      if (result.ok) {
        const p = parseDispatchResult(result);
        await supabase.from("orders").update({
          status: p.newStatus,
          supplier_order_id: p.supplierOrderId,
          supplier_reference: p.supplierReference,
          supplier_status: p.supplierStatus,
          supplier_message: p.supplierMessage,
          supplier_amount: p.supplierAmount,
          supplier_remaining_balance: p.supplierBalance,
          supplier_raw_response: rawResponse,
          supplier_timestamp: new Date().toISOString(),
          supplier_id: p.supplierId,
          supplier_attempts: 1,
        }).eq("order_id", orderId);

        await logSupplierSpend(supabase, orderId, costPrice, {
          network, bundle_size_gb, recipient,
          supplier_order_id: p.supplierOrderId,
          created_by: userId,
        });

        return new Response(JSON.stringify({
          success: true, order_id: orderId, status: p.newStatus,
          supplier_code: p.supplierCode,
          wallet_balance: newBalance,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        // Supplier failed - refund wallet
        const failureReason = result.body.message || result.body.error || `Supplier ${result.supplierCode} HTTP ${result.status}`;
        console.error(`[bulk-single] ${orderId} failed via ${result.supplierCode}: ${failureReason}`);

        const refundBalance = newBalance + agentPrice;
        await supabase.from("wallets").update({ balance_ghs: refundBalance }).eq("id", wallet.id);

        const refundRef = `REF-${orderId}`;
        const { data: existingRefund } = await supabase
          .from("wallet_transactions").select("id").eq("reference", refundRef).eq("type", "refund").maybeSingle();
        if (!existingRefund) {
          await supabase.from("wallet_transactions").insert({
            user_id: userId, type: "refund", amount_ghs: agentPrice, status: "confirmed",
            reference: refundRef,
            description: `Auto-refund for failed order ${orderId}: ${String(failureReason).slice(0, 200)}`,
          });
        }

        await supabase.from("orders").update({
          status: "Failed",
          failure_reason: String(failureReason).slice(0, 500),
          supplier_raw_response: rawResponse,
          supplier_status: "failed",
          supplier_message: String(failureReason).slice(0, 500),
          supplier_timestamp: new Date().toISOString(),
          supplier_id: result.supplierId,
          supplier_attempts: 1,
        }).eq("order_id", orderId);

        return new Response(JSON.stringify({
          success: false, order_id: orderId, status: "Failed",
          reason: String(failureReason).slice(0, 200),
          wallet_refunded: agentPrice,
          wallet_balance: refundBalance,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── ACTION: place_bulk ───────────────────────────────────
    if (action === "place_bulk") {
      const { items, batch_id } = body;

      if (!items || !Array.isArray(items) || items.length === 0 || items.length > 50) {
        return new Response(JSON.stringify({ error: "Invalid items (1-50 required)" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ─── Bulk duplicate in-flight order guard ───
      const bulkPhones = items.map((i: any) => String(i.recipient));
      const bulkDups = await checkBulkDuplicates(supabase, bulkPhones);
      if (bulkDups.size > 0) {
        const conflicting = Array.from(bulkDups.entries()).map(([phone, r]) => ({
          phone,
          existing_order: r.existingOrderId,
          status: r.existingStatus,
        }));
        return new Response(JSON.stringify({
          error: "Some recipient numbers already have active orders. Remove them and retry.",
          conflicting_numbers: conflicting,
        }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Resolve prices for all items
      const productIds = [...new Set(items.map((i: any) => i.product_id))];
      const { data: products } = await supabase
        .from("products")
        .select("*")
        .in("id", productIds)
        .eq("active", true);

      const { data: overrides } = await supabase
        .from("pricing_overrides")
        .select("*")
        .in("product_id", productIds)
        .eq("customer_type", "agent");

      const productMap: Record<string, any> = {};
      (products || []).forEach((p: any) => { productMap[p.id] = p; });
      const overrideMap: Record<string, any> = {};
      (overrides || []).forEach((o: any) => { overrideMap[o.product_id] = o; });

      let totalCost = 0;
      const pricedItems: any[] = [];

      for (const item of items) {
        const product = productMap[item.product_id];
        if (!product) continue;
        const ov = overrideMap[item.product_id];
        let agentPrice: number;
        if (ov?.manual_price && Number(ov.manual_price) > 0) {
          agentPrice = Number(ov.manual_price);
        } else if (product.agent_price_ghs && Number(product.agent_price_ghs) > 0) {
          agentPrice = Number(product.agent_price_ghs);
        } else {
          agentPrice = Number(product.price_ghs);
        }
        const costPrice = Number(product.cost_price_ghs || agentPrice);
        totalCost += agentPrice;
        pricedItems.push({ ...item, agentPrice, costPrice });
      }

      // Check wallet
      const { data: wallet } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (!wallet || Number(wallet.balance_ghs) < totalCost) {
        return new Response(JSON.stringify({
          error: "Insufficient wallet balance",
          balance: wallet?.balance_ghs || 0,
          required: totalCost,
        }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Deduct total from wallet upfront
      let runningBalance = Number(wallet.balance_ghs) - totalCost;
      await supabase.from("wallets").update({ balance_ghs: runningBalance }).eq("id", wallet.id);

      // Create wallet transaction for bulk
      await supabase.from("wallet_transactions").insert({
        user_id: userId,
        type: "debit",
        amount_ghs: totalCost,
        status: "confirmed",
        reference: `BLK-${batch_id || 'BULK'}`,
        description: `Bulk order (${pricedItems.length} items) - GHS ${totalCost.toFixed(2)}`,
      });

      // Update batch status
      if (batch_id) {
        await supabase.from("wholesale_batches").update({ status: "processing" }).eq("id", batch_id);
      }

      // Process items sequentially
      const results: any[] = [];

      for (const item of pricedItems) {
        const orderId = generateOrderId();

        await supabase.from("orders").insert({
          order_id: orderId,
          user_id: userId,
          recipient_number: item.recipient,
          network: item.network,
          bundle_size_gb: Number(item.bundle_size_gb),
          amount_ghs: item.agentPrice,
          cost_price_ghs: item.costPrice,
          product_id: item.product_id,
          status: "Paid",
          payment_method: "wallet",
          payment_status: "paid",
          order_source: "agent_bulk",
          order_type: "normal",
          is_wholesale: true,
          order_channel: "agent_bulk",
          wholesale_unit_price: item.agentPrice,
          wholesale_total_price: item.agentPrice,
          batch_id: batch_id || null,
        });

        // Bulk dispatch queue gate (feature flag OFF by default → no-op)
        if (await shouldQueueOrder(supabase, { order_id: orderId, network: item.network }, "orders")) {
          await supabase.from("orders").update({ status: "Pending", queue_state: "queued" }).eq("order_id", orderId);
          continue;
        }

        // ── Dispatch to supplier via routing layer ──
        console.log(`[bulk] Dispatching ${orderId}: network=${item.network}, product_id=${item.product_id}, recipient=${item.recipient}`);
        const startTime = Date.now();
        const result = await dispatchToSupplier(supabase, {
          network: item.network,
          phone_number: item.recipient,
          data_amount: String(item.bundle_size_gb),
        }, item.product_id, { orderId });
        const responseTimeMs = Date.now() - startTime;
        const rawResponse = JSON.stringify(result.body);

        console.log(`[bulk] ${orderId}: supplier=${result.supplierCode}, ok=${result.ok}, ${responseTimeMs}ms`);

        if (result.ok) {
          const p = parseDispatchResult(result);
          await supabase.from("orders").update({
            status: p.newStatus,
            supplier_order_id: p.supplierOrderId,
            supplier_reference: p.supplierReference,
            supplier_status: p.supplierStatus,
            supplier_message: p.supplierMessage,
            supplier_amount: p.supplierAmount,
            supplier_remaining_balance: p.supplierBalance,
            supplier_raw_response: rawResponse,
            supplier_timestamp: new Date().toISOString(),
            supplier_id: p.supplierId,
            supplier_attempts: 1,
          }).eq("order_id", orderId);

          await logSupplierSpend(supabase, orderId, item.costPrice, {
            network: item.network, bundle_size_gb: item.bundle_size_gb,
            recipient: item.recipient, supplier_order_id: p.supplierOrderId,
            created_by: userId,
          });

          results.push({
            order_id: orderId, status: p.newStatus, success: true,
            supplier_code: p.supplierCode,
          });
        } else {
          const failureReason = result.body.message || result.body.error || `Supplier ${result.supplierCode} HTTP ${result.status}`;
          console.error(`[bulk] ${orderId} failed via ${result.supplierCode}: ${failureReason}`);

          await supabase.from("orders").update({
            status: "Failed",
            failure_reason: String(failureReason).slice(0, 500),
            supplier_raw_response: rawResponse,
            supplier_status: "failed",
            supplier_message: String(failureReason).slice(0, 500),
            supplier_timestamp: new Date().toISOString(),
            supplier_id: result.supplierId,
            supplier_attempts: 1,
          }).eq("order_id", orderId);

          // ── Per-order refund for failed item ──
          runningBalance += item.agentPrice;
          await supabase.from("wallets").update({ balance_ghs: runningBalance }).eq("id", wallet.id);

          const refundRef = `REF-${orderId}`;
          const { data: existingRefund } = await supabase
            .from("wallet_transactions").select("id").eq("reference", refundRef).eq("type", "refund").maybeSingle();
          if (!existingRefund) {
            await supabase.from("wallet_transactions").insert({
              user_id: userId, type: "refund", amount_ghs: item.agentPrice, status: "confirmed",
              reference: refundRef,
              description: `Auto-refund for failed bulk order ${orderId}: ${String(failureReason).slice(0, 200)}`,
            });
          }

          results.push({
            order_id: orderId, status: "Failed", success: false,
            reason: String(failureReason).slice(0, 200),
            refunded: item.agentPrice,
            supplier_code: result.supplierCode,
          });
        }
      }

      // Update batch status
      if (batch_id) {
        await supabase.from("wholesale_batches").update({
          status: "complete",
        }).eq("id", batch_id);
      }

      return new Response(JSON.stringify({
        success: true,
        results,
        total: pricedItems.length,
        succeeded: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        wallet_balance: runningBalance,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: retry_order ─────────────────────────────────
    if (action === "retry_order") {
      const { order_id } = body;
      if (!order_id) {
        return new Response(JSON.stringify({ error: "order_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: order } = await supabase
        .from("orders")
        .select("*")
        .eq("order_id", order_id)
        .eq("user_id", userId)
        .eq("is_wholesale", true)
        .maybeSingle();

      if (!order) {
        return new Response(JSON.stringify({ error: "Order not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (order.status !== "Failed") {
        return new Response(JSON.stringify({ error: "Only failed orders can be retried" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const currentAttempts = Number(order.supplier_attempts || 0);

      // Bulk dispatch queue gate (feature flag OFF by default → no-op)
      if (await shouldQueueOrder(supabase, { order_id, network: order.network }, "orders")) {
        await supabase.from("orders").update({ status: "Pending", queue_state: "queued", failure_reason: null }).eq("order_id", order_id);
        return new Response(JSON.stringify({ success: true, queued: true, order_id }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Dispatch via routing layer ──
      console.log(`[bulk-retry] Dispatching retry for ${order_id}: network=${order.network}, product_id=${order.product_id}`);
      const startTime = Date.now();
      const result = await dispatchToSupplier(supabase, {
        network: order.network,
        phone_number: order.recipient_number,
        data_amount: String(order.bundle_size_gb),
      }, order.product_id);
      const responseTimeMs = Date.now() - startTime;
      const rawResponse = JSON.stringify(result.body);

      console.log(`[bulk-retry] ${order_id}: supplier=${result.supplierCode}, ok=${result.ok}, ${responseTimeMs}ms`);

      if (result.ok) {
        const p = parseDispatchResult(result);
        await supabase.from("orders").update({
          status: p.newStatus,
          supplier_order_id: p.supplierOrderId,
          supplier_reference: p.supplierReference,
          supplier_status: p.supplierStatus,
          supplier_message: p.supplierMessage,
          supplier_amount: p.supplierAmount,
          supplier_remaining_balance: p.supplierBalance,
          supplier_raw_response: rawResponse,
          supplier_timestamp: new Date().toISOString(),
          supplier_id: p.supplierId,
          supplier_attempts: currentAttempts + 1,
          failure_reason: null,
        }).eq("order_id", order_id);

        const costPrice = Number(order.cost_price_ghs || order.amount_ghs || 0);
        await logSupplierSpend(supabase, order_id, costPrice, {
          network: order.network, bundle_size_gb: order.bundle_size_gb,
          recipient: order.recipient_number, supplier_order_id: p.supplierOrderId,
          created_by: userId,
        });

        return new Response(JSON.stringify({
          success: true, order_id, status: p.newStatus,
          supplier_code: p.supplierCode,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        const failureReason = result.body.message || result.body.error || `Supplier ${result.supplierCode} HTTP ${result.status}`;
        await supabase.from("orders").update({
          failure_reason: String(failureReason).slice(0, 500),
          supplier_raw_response: rawResponse,
          supplier_status: "failed",
          supplier_message: String(failureReason).slice(0, 500),
          supplier_timestamp: new Date().toISOString(),
          supplier_id: result.supplierId,
          supplier_attempts: currentAttempts + 1,
        }).eq("order_id", order_id);

        return new Response(JSON.stringify({
          success: false, order_id, status: "Failed",
          reason: String(failureReason).slice(0, 200),
          supplier_code: result.supplierCode,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[bulk] Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
