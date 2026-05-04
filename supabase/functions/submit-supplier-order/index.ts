// Bulk dispatch queue gate active (Phase 2 activation 2026-04-30)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logSupplierSpend } from "../_shared/supplier-ledger.ts";
import { dispatchToSupplier, parseDispatchResult, shouldQueueOrder } from "../_shared/supplier-dispatch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Validation helpers ─────────────────────────────────────
const MAX_ORDER_ID_LEN = 30;

function isValidOrderId(val: unknown): boolean {
  if (typeof val !== "string") return false;
  const trimmed = val.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_ORDER_ID_LEN;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Authentication: verify the caller is a logged-in user ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      console.error("Auth error:", claimsErr);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claims.claims.sub as string;

    // --- Authorization: only admin or staff can submit supplier orders ---
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .in("role", ["admin", "staff"]);

    if (roleError || !roleData || roleData.length === 0) {
      console.warn(`Forbidden: user ${callerId} has no admin/staff role`);
      return new Response(JSON.stringify({ error: "Forbidden: admin or staff role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Authorized caller: ${callerId} (role: ${roleData[0].role})`);

    // --- Process the order ---
    const { order_id } = await req.json();
    if (!order_id) {
      return new Response(JSON.stringify({ error: "order_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate order_id format
    if (!isValidOrderId(order_id)) {
      return new Response(JSON.stringify({ error: "Invalid order_id format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanOrderId = String(order_id).trim();
    console.log(`Processing supplier order for: ${cleanOrderId}`);

    // Fetch the order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("order_id", cleanOrderId)
      .maybeSingle();

    if (orderError || !order) {
      console.error("Order not found:", cleanOrderId, orderError);
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency check: don't resend if already processing/delivered
    if (order.status === "Processing" || order.status === "Delivered") {
      console.log(`Order ${cleanOrderId} already ${order.status}, skipping`);
      return new Response(JSON.stringify({
        message: `Order already ${order.status}`,
        order_id: cleanOrderId,
        status: order.status,
        supplier_order_id: order.supplier_order_id,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build supplier payload
    const supplierPayload = {
      network: order.network,
      phone_number: order.recipient_number,
      data_amount: String(order.bundle_size_gb),
    };

    // Bulk dispatch queue gate (feature flag OFF by default → no-op)
    if (await shouldQueueOrder(supabase, { order_id: cleanOrderId, network: order.network }, "orders")) {
      await supabase.from("orders").update({ status: "Pending", queue_state: "queued" }).eq("order_id", cleanOrderId);
      return new Response(JSON.stringify({ success: true, queued: true, order_id: cleanOrderId }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send to supplier (routed) — with dispatch attempt logging
    const result = await dispatchToSupplier(supabase, supplierPayload, order.product_id, {
      orderId: cleanOrderId,
      createdBy: `admin:${callerId}`,
    });
    const rawResponse = JSON.stringify(result.body);

    if (result.ok) {
      const p = parseDispatchResult(result);

      await supabase
        .from("orders")
        .update({
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
        })
        .eq("order_id", cleanOrderId);

      console.log(`Order ${cleanOrderId} updated to ${p.newStatus}, supplier: ${p.supplierCode}, ref: ${p.supplierOrderId}`);

      const costPrice = Number(order.cost_price_ghs || order.amount_ghs || 0);
      await logSupplierSpend(supabase, cleanOrderId, costPrice, {
        network: order.network,
        bundle_size_gb: order.bundle_size_gb,
        recipient: order.recipient_number,
        supplier_order_id: p.supplierOrderId,
        created_by: callerId,
      });

      return new Response(JSON.stringify({
        success: true,
        order_id: cleanOrderId,
        status: p.newStatus,
        supplier_order_id: p.supplierOrderId,
        supplier_status: p.supplierStatus,
        supplier_message: p.supplierMessage,
        supplier_code: p.supplierCode,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      const failureReason = result.body.message
        || result.body.error
        || `Supplier returned HTTP ${result.status}`;

      await supabase
        .from("orders")
        .update({
          status: "Failed",
          failure_reason: String(failureReason).slice(0, 500),
          supplier_raw_response: rawResponse,
          supplier_status: "failed",
          supplier_message: String(failureReason).slice(0, 500),
          supplier_timestamp: new Date().toISOString(),
        })
        .eq("order_id", cleanOrderId);

      console.error(`Order ${cleanOrderId} failed:`, failureReason);

      return new Response(JSON.stringify({
        success: false,
        order_id: cleanOrderId,
        status: "Failed",
        reason: String(failureReason).slice(0, 200),
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
