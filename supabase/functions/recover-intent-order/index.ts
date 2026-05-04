// Bulk dispatch queue gate active (Phase 2 activation 2026-04-30)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dispatchToSupplier, parseDispatchResult, shouldQueueOrder } from "../_shared/supplier-dispatch.ts";
import { creditAgentProfit } from "../_shared/agent-profit.ts";
import { checkDuplicateInFlightOrder } from "../_shared/duplicate-order-guard.ts";
import { validateNetworkMatch } from "../_shared/network-detect.ts";
import { logSupplierSpend } from "../_shared/supplier-ledger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateOrderId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "YG-";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    // Auth: require admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ success: false, error: "Unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData?.user) return json({ success: false, error: "Unauthorized" });
    const adminId = userData.user.id;
    const adminEmail = userData.user.email || "";

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", adminId).eq("role", "admin");
    if (!roleData || roleData.length === 0) return json({ success: false, error: "Admin role required" });

    const body = await req.json();
    const { intent_id } = body;

    if (!intent_id) return json({ success: false, error: "intent_id required" });

    // Fetch the intent
    const { data: intent, error: intentErr } = await supabase
      .from("payment_intents")
      .select("*")
      .eq("id", intent_id)
      .single();

    if (intentErr || !intent) return json({ success: false, error: "Payment intent not found" });

    // Safety: check if order already exists on the intent itself
    if (intent.order_created && intent.order_id) {
      await supabase.from("paystack_transactions").update({
        linked_order_id: intent.order_id,
        reconciliation_status: "resolved",
        reconciliation_reason: null,
        last_checked_at: new Date().toISOString(),
      }).eq("reference", intent.paystack_reference);

      return json({
        success: false,
        error: "already_exists",
        message: `Order ${intent.order_id} already exists for this payment.`,
        order_id: intent.order_id,
      });
    }

    // Check payment status — intent itself OR verified paystack record
    if (intent.payment_status !== "success") {
      const { data: psTx } = await supabase
        .from("paystack_transactions")
        .select("status")
        .eq("reference", intent.paystack_reference)
        .eq("status", "success")
        .maybeSingle();

      const { data: psPay } = await supabase
        .from("paystack_payments")
        .select("status")
        .eq("reference", intent.paystack_reference)
        .eq("status", "success")
        .maybeSingle();

      if (!psTx && !psPay) {
        return json({ success: false, error: "Payment not confirmed as successful" });
      }

      await supabase.from("payment_intents")
        .update({ payment_status: "success", updated_at: new Date().toISOString() })
        .eq("id", intent_id);
      console.log(`[recover-intent] Fixed stale intent ${intent_id} payment_status pending→success`);
    }

    // Check by paystack_reference if any order already linked
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("order_id, status")
      .eq("paystack_reference", intent.paystack_reference)
      .maybeSingle();

    if (existingOrder) {
      await supabase.from("payment_intents").update({
        order_created: true,
        order_id: existingOrder.order_id,
      }).eq("id", intent_id);

      await supabase.from("paystack_transactions").update({
        linked_order_id: existingOrder.order_id,
        reconciliation_status: "resolved",
        reconciliation_reason: null,
        last_checked_at: new Date().toISOString(),
      }).eq("reference", intent.paystack_reference);

      return json({
        success: false,
        error: "already_exists",
        message: `Order ${existingOrder.order_id} already exists for this payment.`,
        order_id: existingOrder.order_id,
      });
    }

    // Also check agent_orders
    const { data: existingAgentOrder } = await supabase
      .from("agent_orders")
      .select("order_id, status")
      .eq("paystack_reference", intent.paystack_reference)
      .maybeSingle();

    if (existingAgentOrder) {
      await supabase.from("payment_intents").update({
        order_created: true,
        order_id: existingAgentOrder.order_id,
      }).eq("id", intent_id);

      await supabase.from("paystack_transactions").update({
        linked_order_id: existingAgentOrder.order_id,
        reconciliation_status: "resolved",
        reconciliation_reason: null,
        last_checked_at: new Date().toISOString(),
      }).eq("reference", intent.paystack_reference);

      return json({
        success: false,
        error: "already_exists",
        message: `Order ${existingAgentOrder.order_id} already exists for this payment.`,
        order_id: existingAgentOrder.order_id,
      });
    }

    // Duplicate in-flight order guard
    const dupCheck = await checkDuplicateInFlightOrder(supabase, intent.recipient_number);
    if (dupCheck.blocked) {
      console.log(`[recover-intent] Duplicate blocked: ${intent.recipient_number} → ${dupCheck.existingOrderId}`);
      return json({ success: false, error: "duplicate_active", message: dupCheck.message });
    }

    // Network mismatch guard
    const networkMismatch = validateNetworkMatch(intent.recipient_number, intent.network);
    if (networkMismatch) {
      return json({ success: false, error: "network_mismatch", message: networkMismatch });
    }

    // Create the order — status starts as "Processing" (not "Paid")
    const orderId = generateOrderId();
    const isAgentOrder = intent.order_type === "agent" && intent.agent_id;

    let orderCreateError: string | null = null;

    if (isAgentOrder) {
      // Resolve correct agent pricing from checkout_meta
      const { data: paymentRecord } = await supabase
        .from("paystack_payments")
        .select("checkout_meta")
        .eq("reference", intent.paystack_reference)
        .maybeSingle();

      const meta = paymentRecord?.checkout_meta as Record<string, unknown> | null;

      let agentStorePrice: number;
      let agentBasePrice: number;
      let supplierCostAtPurchase: number | null;
      let agentProfitAtPurchase: number;
      let datasikaProfitAtPurchase: number | null;

      if (meta && meta.agent_selling_price != null && meta.agent_cost_price != null) {
        agentStorePrice = Number(meta.agent_selling_price) || 0;
        agentBasePrice = Number(meta.agent_cost_price) || 0;
        agentProfitAtPurchase = Number(meta.profit_ghs) || Math.max(0, Math.round((agentStorePrice - agentBasePrice) * 100) / 100);
        const rawSupplierCost = meta.supplier_cost_at_purchase;
        supplierCostAtPurchase = (rawSupplierCost != null && !isNaN(Number(rawSupplierCost))) ? Number(rawSupplierCost) : null;
        datasikaProfitAtPurchase = (meta.datasika_profit_at_purchase != null) ? Number(meta.datasika_profit_at_purchase) : (
          (supplierCostAtPurchase != null && supplierCostAtPurchase > 0)
            ? Math.max(0, Math.round((agentBasePrice - supplierCostAtPurchase) * 100) / 100)
            : agentBasePrice > 0 ? Math.max(0, agentBasePrice) : null
        );
        console.log(`[recover-intent] Agent pricing from checkout_meta: store=${agentStorePrice}, base=${agentBasePrice}, profit=${agentProfitAtPurchase}`);
      } else {
        agentStorePrice = Number(intent.expected_amount) || 0;
        agentBasePrice = agentStorePrice;
        supplierCostAtPurchase = null;

        if (intent.bundle_id) {
          const { data: productRow } = await supabase
            .from("products")
            .select("agent_price_ghs, cost_price_ghs")
            .eq("id", intent.bundle_id)
            .maybeSingle();

          if (productRow) {
            agentBasePrice = Number(productRow.agent_price_ghs) || agentStorePrice;
            supplierCostAtPurchase = productRow.cost_price_ghs != null ? Number(productRow.cost_price_ghs) : null;
          }
        }

        agentProfitAtPurchase = Math.max(0, Math.round((agentStorePrice - agentBasePrice) * 100) / 100);
        datasikaProfitAtPurchase = (supplierCostAtPurchase != null && supplierCostAtPurchase > 0)
          ? Math.max(0, Math.round((agentBasePrice - supplierCostAtPurchase) * 100) / 100)
          : agentBasePrice > 0 ? Math.max(0, agentBasePrice) : null;
        console.log(`[recover-intent] Agent pricing from products fallback: store=${agentStorePrice}, base=${agentBasePrice}, profit=${agentProfitAtPurchase}`);
      }

      const { error: agentOrderErr } = await supabase.from("agent_orders").insert({
        agent_id: intent.agent_id,
        order_id: orderId,
        customer_phone: intent.recipient_number,
        network: intent.network,
        bundle_size_gb: intent.bundle_size_gb,
        product_id: intent.bundle_id || null,
        agent_selling_price: agentStorePrice,
        agent_cost_price: agentBasePrice,
        profit_ghs: agentProfitAtPurchase,
        agent_store_price_at_purchase: agentStorePrice,
        agent_base_price_at_purchase: agentBasePrice,
        agent_profit_at_purchase: agentProfitAtPurchase,
        supplier_cost_at_purchase: supplierCostAtPurchase,
        datasika_profit_at_purchase: datasikaProfitAtPurchase,
        payment_method: "paystack",
        paystack_reference: intent.paystack_reference,
        payment_status: "paid",
        status: "Processing",
        order_source: "intent_recovery",
        profit_credited: false,
      });
      if (agentOrderErr) orderCreateError = agentOrderErr.message;
    } else {
      const { error: orderErr } = await supabase.from("orders").insert({
        order_id: orderId,
        user_id: intent.user_id || null,
        recipient_number: intent.recipient_number,
        network: intent.network,
        product_id: intent.bundle_id || null,
        bundle_size_gb: intent.bundle_size_gb,
        amount_ghs: intent.expected_amount,
        status: "Processing",
        payment_method: "paystack",
        payment_status: "paid",
        paystack_reference: intent.paystack_reference,
        order_source: "intent_recovery",
      });
      if (orderErr) orderCreateError = orderErr.message;
    }

    if (orderCreateError) {
      console.error("[recover-intent] Order creation failed:", orderCreateError);
      return json({ success: false, error: "Order creation failed", detail: orderCreateError });
    }

    // Bulk dispatch queue gate (feature flag OFF by default → no-op)
    const recoverTable: "orders" | "agent_orders" = isAgentOrder ? "agent_orders" : "orders";
    if (await shouldQueueOrder(supabase, { order_id: orderId, network: intent.network }, recoverTable)) {
      await supabase.from(recoverTable).update({ status: "Pending", queue_state: "queued" }).eq("order_id", orderId);
      return json({ success: true, queued: true, order_id: orderId });
    }

    // Dispatch to supplier
    const supplierResult = await dispatchToSupplier(supabase, {
      network: intent.network,
      phone_number: intent.recipient_number,
      data_amount: String(intent.bundle_size_gb),
    }, intent.bundle_id || null, { orderId });

    const rawResponse = JSON.stringify(supplierResult.body);
    const isAgent = !!isAgentOrder;

    // Log supplier attempt (non-fatal if table missing)
    try {
      await supabase.from("supplier_api_logs").insert({
        order_id: orderId,
        request_payload: { network: intent.network, phone_number: intent.recipient_number, data_amount: String(intent.bundle_size_gb) },
        response_body: supplierResult.body,
        response_status: String(supplierResult.status),
        success: supplierResult.ok,
        error_message: supplierResult.ok ? null : String(supplierResult.body.message || supplierResult.body.error || "Unknown"),
        supplier_balance: supplierResult.body.remaining_balance != null ? Number(supplierResult.body.remaining_balance) : null,
      });
    } catch (logErr) {
      console.warn("[recover-intent] supplier_api_logs insert failed (non-fatal):", logErr);
    }

    if (supplierResult.ok) {
      const p = parseDispatchResult(supplierResult);

      if (isAgent) {
        // agent_orders lacks supplier_id, supplier_amount, supplier_remaining_balance
        await supabase.from("agent_orders").update({
          status: p.newStatus,
          supplier_order_id: p.supplierOrderId,
          supplier_reference: p.supplierReference,
          supplier_status: p.supplierStatus,
          supplier_message: p.supplierMessage,
          supplier_timestamp: new Date().toISOString(),
          supplier_raw_response: rawResponse,
        }).eq("order_id", orderId);
      } else {
        await supabase.from("orders").update({
          status: p.newStatus,
          supplier_order_id: p.supplierOrderId,
          supplier_reference: p.supplierReference,
          supplier_status: p.supplierStatus,
          supplier_message: p.supplierMessage,
          supplier_amount: p.supplierAmount,
          supplier_remaining_balance: p.supplierBalance,
          supplier_timestamp: new Date().toISOString(),
          supplier_raw_response: rawResponse,
          supplier_id: p.supplierId,
        }).eq("order_id", orderId);
      }

      // Log supplier spend
      const costPrice = Number(intent.expected_amount) || 0;
      await logSupplierSpend(supabase, orderId, costPrice, {
        network: intent.network, bundle_size_gb: intent.bundle_size_gb,
        recipient: intent.recipient_number, supplier_order_id: p.supplierOrderId,
      });
    } else {
      const reason = supplierResult.body.message || supplierResult.body.error || `Supplier HTTP ${supplierResult.status}`;

      if (isAgent) {
        await supabase.from("agent_orders").update({
          status: "Failed",
          supplier_raw_response: rawResponse,
          supplier_status: "failed",
          supplier_message: String(reason).slice(0, 500),
          supplier_timestamp: new Date().toISOString(),
        }).eq("order_id", orderId);
      } else {
        await supabase.from("orders").update({
          status: "Failed",
          failure_reason: String(reason).slice(0, 500),
          supplier_raw_response: rawResponse,
          supplier_status: "failed",
          supplier_message: String(reason).slice(0, 500),
          supplier_timestamp: new Date().toISOString(),
        }).eq("order_id", orderId);
      }
    }

    // Agent profit crediting
    if (isAgentOrder) {
      const creditResult = await creditAgentProfit(supabase, orderId, "intent_recovery");
      console.log(`[recover-intent] Agent profit credit for ${orderId}: ${creditResult.action}`, creditResult.reason || "");
    }

    await supabase.from("payment_intents").update({
      order_created: true,
      order_id: orderId,
    }).eq("id", intent_id);

    // Resolve transaction reconciliation
    await supabase.from("paystack_transactions").update({
      linked_order_id: orderId,
      reconciliation_status: "resolved",
      reconciliation_reason: null,
      last_checked_at: new Date().toISOString(),
    }).eq("reference", intent.paystack_reference);

    // Audit log
    await supabase.from("audit_logs").insert({
      actor_id: adminId,
      actor_email: adminEmail,
      action: "intent_recovery_create_order",
      entity_type: "payment_intents",
      entity_id: intent_id,
      metadata: {
        order_id: orderId,
        intent_id,
        paystack_reference: intent.paystack_reference,
        supplier_success: supplierResult.ok,
        order_type: intent.order_type,
      },
    });

    console.log(`[recover-intent] Order ${orderId} created from intent ${intent_id}, supplier_ok=${supplierResult.ok}`);

    return json({
      success: true,
      order_id: orderId,
      supplier_success: supplierResult.ok,
    });
  } catch (err) {
    console.error("[recover-intent] Error:", err);
    return json({ success: false, error: String(err) });
  }
});
