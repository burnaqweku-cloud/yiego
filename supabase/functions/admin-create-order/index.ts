// Bulk dispatch queue gate active (Phase 2 activation 2026-04-30)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dispatchToSupplier, parseDispatchResult, shouldQueueOrder } from "../_shared/supplier-dispatch.ts";
import { logSupplierSpend } from "../_shared/supplier-ledger.ts";
import { checkDuplicateInFlightOrder } from "../_shared/duplicate-order-guard.ts";
import { validateNetworkMatch } from "../_shared/network-detect.ts";
import { creditAgentProfit } from "../_shared/agent-profit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateOrderId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "YG-ADM-";
  for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify admin
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const adminId = userData.user.id;
    const adminEmail = userData.user.email || "";

    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", adminId).eq("role", "admin");
    if (!roleData || roleData.length === 0) return json({ error: "Admin role required" }, 403);

    const body = await req.json();
    const { order_type, agent_id, user_id, product_id, network, bundle_size_gb, recipient_number } = body;

    // Validate inputs
    if (!order_type || !["agent", "user"].includes(order_type)) return json({ error: "Invalid order_type" }, 400);
    if (!product_id || !network || !bundle_size_gb || !recipient_number) return json({ error: "Missing required fields" }, 400);
    if (order_type === "agent" && !agent_id) return json({ error: "agent_id required for agent orders" }, 400);
    if (order_type === "user" && !user_id) return json({ error: "user_id required for user orders" }, 400);

    // Sanitize phone
    const phone = recipient_number.trim().replace(/\s+/g, "");

    // ─── Duplicate in-flight order guard ───
    const dupCheck = await checkDuplicateInFlightOrder(supabase, phone);
    if (dupCheck.blocked) {
      console.log(`[admin-create-order] Duplicate blocked: ${phone} → ${dupCheck.existingOrderId}`);
      return json({ error: dupCheck.message }, 409);
    }

    // ─── Network mismatch guard ───
    const networkMismatch = validateNetworkMatch(phone, network);
    if (networkMismatch) return json({ error: networkMismatch }, 400);
    if (phone.length < 10) return json({ error: "Invalid phone number" }, 400);

    // Fetch product from DB (server-side price source of truth)
    const { data: product, error: productErr } = await supabase
      .from("products").select("*").eq("id", product_id).eq("active", true).single();
    if (productErr || !product) return json({ error: "Product not found or inactive" }, 404);

    const orderId = generateOrderId();

    if (order_type === "agent") {
      // Verify agent exists
      const { data: agent } = await supabase.from("agents").select("id, store_name, status").eq("id", agent_id).single();
      if (!agent) return json({ error: "Agent not found" }, 404);

      // Get agent pricing
      const { data: agentPricingRow } = await supabase
        .from("agent_pricing").select("custom_price").eq("agent_id", agent_id).eq("product_id", product_id).maybeSingle();

      const agentBasePrice = Number(product.agent_price_ghs ?? product.price_ghs);
      const agentSellingPrice = agentPricingRow?.custom_price != null ? Number(agentPricingRow.custom_price) : agentBasePrice;
      const supplierCost = Number(product.cost_price_ghs ?? product.price_ghs);
      const agentProfit = Math.max(0, agentSellingPrice - agentBasePrice);
      const datasikaProfit = Math.max(0, agentBasePrice - supplierCost);

      // Duplicate check
      // No paystack reference for admin-created orders, check by order_id only (generated fresh)
      
      const { error: insertErr } = await supabase.from("agent_orders").insert({
        agent_id,
        order_id: orderId,
        customer_phone: phone,
        network: product.network,
        bundle_size_gb: product.bundle_size_gb,
        product_id: product.id,
        agent_selling_price: agentSellingPrice,
        agent_cost_price: agentBasePrice,
        profit_ghs: agentProfit,
        supplier_cost_at_purchase: supplierCost,
        agent_base_price_at_purchase: agentBasePrice,
        agent_store_price_at_purchase: agentSellingPrice,
        agent_profit_at_purchase: agentProfit,
        datasika_profit_at_purchase: datasikaProfit,
        payment_method: "admin_manual",
        payment_status: "paid",
        status: "Paid",
        order_source: "admin_manual",
      });

      if (insertErr) return json({ error: `Order creation failed: ${insertErr.message}` }, 500);

      // Bulk dispatch queue (feature-flagged; off → no-op, identical behavior)
      if (await shouldQueueOrder(supabase, { order_id: orderId, network: product.network }, "agent_orders")) {
        await supabase.from("agent_orders").update({ status: "Pending", queue_state: "queued" }).eq("order_id", orderId);
        return json({ success: true, order_id: orderId, status: "Pending", dispatch_mode: "manual_queue" });
      }

      // Dispatch to supplier (same pipeline)
      const result = await dispatchToSupplier(supabase, {
        network: product.network,
        phone_number: phone,
        data_amount: String(product.bundle_size_gb),
      }, product.id, { orderId, createdBy: `admin:${adminId}` });
      const rawResponse = JSON.stringify(result.body);

      // Log supplier call
      await supabase.from("supplier_api_logs").insert({
        order_id: orderId,
        request_payload: { network: product.network, phone_number: phone, data_amount: String(product.bundle_size_gb) },
        response_body: result.body,
        response_status: String(result.status),
        success: result.ok,
        error_message: result.ok ? null : String(result.body.message || result.body.error || "Unknown"),
        supplier_balance: result.body.remaining_balance != null ? Number(result.body.remaining_balance) : null,
      });

      if (result.ok) {
        const p = parseDispatchResult(result);
        await supabase.from("agent_orders").update({
          status: "Processing",
          supplier_order_id: p.supplierOrderId,
          supplier_reference: p.supplierReference,
          supplier_status: p.supplierStatus,
          supplier_message: p.supplierMessage,
          supplier_raw_response: rawResponse,
        }).eq("order_id", orderId);

        await logSupplierSpend(supabase, orderId, supplierCost, {
          network: product.network, bundle_size_gb: product.bundle_size_gb,
          recipient: phone, supplier_order_id: p.supplierOrderId,
        });
      } else {
        const reason = result.body.message || result.body.error || `Supplier HTTP ${result.status}`;
        await supabase.from("agent_orders").update({
          status: "Processing",
          supplier_raw_response: rawResponse,
          supplier_status: "failed",
          supplier_message: String(reason).slice(0, 500),
        }).eq("order_id", orderId);
      }

      // Credit agent profit (same engine as normal orders)
      let profitCreditResult = { action: "skipped" as string, reason: "dispatch_failed" };
      if (result.ok) {
        profitCreditResult = await creditAgentProfit(supabase, orderId, "admin_manual");
        console.log(`[admin-create-order] Profit credit result for ${orderId}:`, profitCreditResult);
      }

      // Audit log
      await supabase.from("audit_logs").insert({
        actor_id: adminId,
        actor_email: adminEmail,
        action: "admin_create_agent_order",
        entity_type: "agent_orders",
        entity_id: orderId,
        metadata: {
          agent_id, network: product.network, bundle_size_gb: product.bundle_size_gb,
          recipient: phone, supplier_success: result.ok,
          profit_credit: profitCreditResult.action,
          agent_selling_price: agentSellingPrice, agent_base_price: agentBasePrice,
          agent_profit: agentProfit,
        },
      });

      return json({
        success: true, order_id: orderId, supplier_success: result.ok,
        profit_credited: profitCreditResult.action === "credited" || profitCreditResult.action === "already_credited",
        profit_amount: agentProfit,
        agent_selling_price: agentSellingPrice,
        agent_base_price: agentBasePrice,
      });

    } else {
      // User order
      const { data: profile } = await supabase.from("profiles").select("id, full_name").eq("id", user_id).single();
      if (!profile) return json({ error: "User not found" }, 404);

      const amountGhs = Number(product.price_ghs);
      const costPrice = Number(product.cost_price_ghs ?? product.price_ghs);

      const { error: insertErr } = await supabase.from("orders").insert({
        order_id: orderId,
        user_id,
        recipient_number: phone,
        network: product.network,
        product_id: product.id,
        bundle_size_gb: product.bundle_size_gb,
        amount_ghs: amountGhs,
        cost_price_ghs: costPrice,
        status: "Paid",
        payment_method: "admin_manual",
        payment_status: "paid",
        order_source: "admin_manual",
      });

      if (insertErr) return json({ error: `Order creation failed: ${insertErr.message}` }, 500);

      // Bulk dispatch queue (feature-flagged; off → no-op, identical behavior)
      if (await shouldQueueOrder(supabase, { order_id: orderId, network: product.network }, "orders")) {
        await supabase.from("orders").update({ status: "Pending", queue_state: "queued" }).eq("order_id", orderId);
        return json({ success: true, order_id: orderId, status: "Pending", dispatch_mode: "manual_queue" });
      }

      // Dispatch to supplier
      const result = await dispatchToSupplier(supabase, {
        network: product.network,
        phone_number: phone,
        data_amount: String(product.bundle_size_gb),
      }, product.id, { orderId, createdBy: `admin:${adminId}` });
      const rawResponse = JSON.stringify(result.body);

      await supabase.from("supplier_api_logs").insert({
        order_id: orderId,
        request_payload: { network: product.network, phone_number: phone, data_amount: String(product.bundle_size_gb) },
        response_body: result.body,
        response_status: String(result.status),
        success: result.ok,
        error_message: result.ok ? null : String(result.body.message || result.body.error || "Unknown"),
        supplier_balance: result.body.remaining_balance != null ? Number(result.body.remaining_balance) : null,
      });

      if (result.ok) {
        const p = parseDispatchResult(result);
        await supabase.from("orders").update({
          status: "Processing",
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

        await logSupplierSpend(supabase, orderId, costPrice, {
          network: product.network, bundle_size_gb: product.bundle_size_gb,
          recipient: phone, supplier_order_id: p.supplierOrderId,
        });
      } else {
        const reason = result.body.message || result.body.error || `Supplier HTTP ${result.status}`;
        await supabase.from("orders").update({
          status: "Processing",
          failure_reason: String(reason).slice(0, 500),
          supplier_raw_response: rawResponse,
          supplier_status: "failed",
          supplier_message: String(reason).slice(0, 500),
          supplier_timestamp: new Date().toISOString(),
        }).eq("order_id", orderId);
      }

      // Audit log
      await supabase.from("audit_logs").insert({
        actor_id: adminId,
        actor_email: adminEmail,
        action: "admin_create_user_order",
        entity_type: "orders",
        entity_id: orderId,
        metadata: {
          user_id, network: product.network, bundle_size_gb: product.bundle_size_gb,
          recipient: phone, supplier_success: result.ok,
          display_amount: amountGhs, cost_price: costPrice,
        },
      });

      return json({ success: true, order_id: orderId, supplier_success: result.ok, display_amount: amountGhs });
    }
  } catch (err) {
    console.error("[admin-create-order] Error:", err);
    return json({ error: String(err) }, 500);
  }
});
