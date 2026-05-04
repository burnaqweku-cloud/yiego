/**
 * Legacy supplier webhook (Supplier A / generic).
 * Now routes through the shared sync engine for consistent status mapping.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { syncOrderStatusFromSupplier, mapSupplierStatus } from "../_shared/supplier-status-sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-webhook-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ORDER_ID_LEN = 30;

function sanitizeString(val: unknown, maxLen: number): string | null {
  if (val == null || typeof val !== "string") return null;
  return val.trim().slice(0, maxLen) || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Mandatory webhook authentication
    const webhookSecret = req.headers.get("x-webhook-secret") || req.headers.get("x-api-key");
    const expectedKey = Deno.env.get("SUPPLIER_API_KEY");

    if (!expectedKey) {
      console.error("SUPPLIER_API_KEY not configured - rejecting webhook");
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!webhookSecret || webhookSecret !== expectedKey) {
      console.warn("Webhook authentication failed - missing or invalid secret");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body));

    // Extract fields - flexible to handle different supplier formats
    const rawOrderId = body.order_id || body.orderId || body.reference;
    const status = body.status || body.delivery_status;
    const supplierRef = body.supplier_reference || body.reference_id || body.transaction_id;
    const message = body.message || body.delivery_note || body.reason;

    if (!rawOrderId) {
      console.error("Missing order_id in webhook payload");
      return new Response(JSON.stringify({ error: "order_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orderId = sanitizeString(rawOrderId, MAX_ORDER_ID_LEN);
    if (!orderId) {
      return new Response(JSON.stringify({ error: "Invalid order_id format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Use shared sync engine — the orderId here IS the supplier reference
    const result = await syncOrderStatusFromSupplier(supabase, {
      supplierReference: orderId,
      supplierStatus: String(status || "processing"),
      supplierUpdatedAt: new Date().toISOString(),
      source: "webhook",
      rawMeta: body,
      supplierMessage: message ? String(message).slice(0, 500) : null,
    });

    // Also try with supplierRef if different from orderId
    if (!result.applied && result.reason === "no_match" && supplierRef && supplierRef !== orderId) {
      const result2 = await syncOrderStatusFromSupplier(supabase, {
        supplierReference: String(supplierRef).slice(0, 100),
        supplierStatus: String(status || "processing"),
        supplierUpdatedAt: new Date().toISOString(),
        source: "webhook",
        rawMeta: body,
        supplierMessage: message ? String(message).slice(0, 500) : null,
      });

      console.log(`Order ${orderId} via alt ref ${supplierRef}: applied=${result2.applied}`);

      return new Response(JSON.stringify({
        success: result2.applied,
        order_id: orderId,
        status: result2.newStatus,
        table: result2.table,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Order ${orderId} updated: applied=${result.applied} table=${result.table}`);

    return new Response(JSON.stringify({
      success: result.applied,
      order_id: orderId,
      status: result.newStatus,
      table: result.table,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
