import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Supplier call helper ──────────────────────────────────────────────
const MAX_RETRIES = 2;

async function sendToSupplier(
  payload: { network: string; phone_number: string; data_amount: string },
  attempt = 1
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const baseUrl = Deno.env.get("SUPPLIER_API_BASE_URL");
  const apiKey = Deno.env.get("SUPPLIER_API_KEY");

  if (!baseUrl || !apiKey) {
    return { ok: false, status: 0, body: { error: "Supplier API not configured" } };
  }

  const url = baseUrl.replace(/\/+$/, "") + "/orders";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(payload),
    });

    const bodyText = await response.text();
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(bodyText); } catch { parsed = { raw: bodyText }; }

    if (response.ok) return { ok: true, status: response.status, body: parsed };
    if (response.status >= 500 && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return sendToSupplier(payload, attempt + 1);
    }
    return { ok: false, status: response.status, body: parsed };
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return sendToSupplier(payload, attempt + 1);
    }
    return { ok: false, status: 0, body: { error: String(err) } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth: admin/staff only ──────────────────────────────────────
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
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = userData.user.id;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .in("role", ["admin", "staff"]);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse request body ─────────────────────────────────────────
    const body = await req.json();
    const testPhone = body.test_phone?.trim();
    const testBundleId = body.test_bundle_id || null;
    const testBundleName = body.test_bundle_name || "1GB";
    const network = body.network || "MTN";

    if (!testPhone) {
      return new Response(JSON.stringify({ error: "test_phone is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Check: no running checkpoint already ───────────────────────
    const { data: existing } = await supabase
      .from("delivery_checkpoints")
      .select("id")
      .eq("status", "PENDING")
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({
        error: "A checkpoint is already running",
        checkpoint_id: existing[0].id,
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 1: Create test checkpoint order ───────────────────────
    const orderId = `CHK-${Date.now()}`;
    let testBundleSizeGb = 1;
    if (testBundleId) {
      const { data: prod } = await supabase
        .from("products")
        .select("bundle_size_gb")
        .eq("id", testBundleId)
        .single();
      if (prod) testBundleSizeGb = prod.bundle_size_gb;
    }

    const { error: orderErr } = await supabase.from("orders").insert({
      order_id: orderId,
      user_id: null,
      recipient_number: testPhone,
      network,
      bundle_size_gb: testBundleSizeGb,
      amount_ghs: 0,
      status: "Processing",
      payment_method: "checkpoint",
      payment_status: "paid",
      is_checkpoint: true,
      customer_name: "SYSTEM CHECKPOINT",
      product_id: testBundleId,
    });
    if (orderErr) throw orderErr;

    // ── Step 2: Send test order to supplier ─────────────────────────
    const testResult = await sendToSupplier({
      network,
      phone_number: testPhone,
      data_amount: String(testBundleSizeGb),
    });
    const testSupplierOrderId = testResult.ok && testResult.body.order_id
      ? String(testResult.body.order_id)
      : null;

    // Update test order with supplier response
    await supabase.from("orders").update({
      supplier_order_id: testSupplierOrderId,
      supplier_reference: testSupplierOrderId,
      supplier_status: testResult.ok ? String(testResult.body.status || "sent") : "failed",
      supplier_message: String(testResult.body.message || testResult.body.error || ""),
      supplier_raw_response: JSON.stringify(testResult.body),
      supplier_timestamp: new Date().toISOString(),
    }).eq("order_id", orderId);

    // ── Step 3: Fetch eligible paid orders & send to supplier ──────
    const { data: eligibleOrders, error: eligErr } = await supabase
      .from("orders")
      .select("id, order_id, recipient_number, network, bundle_size_gb, status")
      .eq("network", network)
      .eq("payment_status", "paid")
      .in("status", ["Pending", "Paid"])
      .eq("is_checkpoint", false)
      .order("created_at", { ascending: true });

    if (eligErr) {
      console.error("Failed to fetch eligible orders:", eligErr);
    }

    const orders = eligibleOrders || [];
    let sentCount = 0;
    let failedCount = 0;
    const orderResults: Array<{ order_id: string; success: boolean; supplier_order_id?: string; error?: string }> = [];

    for (const order of orders) {
      const result = await sendToSupplier({
        network: order.network,
        phone_number: order.recipient_number,
        data_amount: String(order.bundle_size_gb),
      });

      const supplierOrderId = result.ok && result.body.order_id ? String(result.body.order_id) : null;

      if (result.ok) {
        await supabase.from("orders").update({
          status: "Processing",
          supplier_order_id: supplierOrderId,
          supplier_reference: supplierOrderId,
          supplier_status: String(result.body.status || "sent"),
          supplier_message: String(result.body.message || ""),
          supplier_raw_response: JSON.stringify(result.body),
          supplier_timestamp: new Date().toISOString(),
        }).eq("id", order.id);
        sentCount++;
        orderResults.push({ order_id: order.order_id, success: true, supplier_order_id: supplierOrderId || undefined });
      } else {
        const reason = String(result.body.message || result.body.error || `HTTP ${result.status}`);
        await supabase.from("orders").update({
          status: "Failed",
          failure_reason: reason.slice(0, 500),
          supplier_raw_response: JSON.stringify(result.body),
          supplier_status: "failed",
          supplier_message: reason.slice(0, 500),
          supplier_timestamp: new Date().toISOString(),
        }).eq("id", order.id);
        failedCount++;
        orderResults.push({ order_id: order.order_id, success: false, error: reason.slice(0, 200) });
      }
    }

    // ── Step 4: Create checkpoint record ───────────────────────────
    const { data: cpData, error: cpErr } = await supabase
      .from("delivery_checkpoints")
      .insert({
        status: "PENDING",
        test_phone: testPhone,
        network,
        bundle_id: testBundleId,
        bundle_name: testBundleName,
        internal_order_id: orderId,
        supplier_order_id: testSupplierOrderId,
        created_by_admin_id: callerId,
      })
      .select("id")
      .single();

    if (cpErr) throw cpErr;

    // ── Step 5: Log the event ──────────────────────────────────────
    await supabase.from("audit_logs").insert({
      action: "checkpoint.started",
      entity_type: "delivery_checkpoint",
      entity_id: cpData.id,
      actor_id: callerId,
      metadata: {
        test_phone: testPhone,
        network,
        test_order_id: orderId,
        test_supplier_ok: testResult.ok,
        eligible_orders: orders.length,
        sent_to_supplier: sentCount,
        failed: failedCount,
      },
    });

    console.log(`[checkpoint-start] Created checkpoint ${cpData.id}: ${sentCount} sent, ${failedCount} failed out of ${orders.length} eligible`);

    return new Response(JSON.stringify({
      success: true,
      checkpoint_id: cpData.id,
      test_order_id: orderId,
      test_supplier_ok: testResult.ok,
      test_supplier_order_id: testSupplierOrderId,
      eligible_orders: orders.length,
      sent_to_supplier: sentCount,
      failed: failedCount,
      order_results: orderResults,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("checkpoint-start error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
