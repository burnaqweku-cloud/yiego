import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapWebhookEvent, syncOrderStatusFromSupplier } from "../_shared/supplier-status-sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-datacart-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return computed === signature.toLowerCase();
  } catch {
    return false;
  }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function toReadableText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const joined = value.map((item) => toReadableText(item)).filter(Boolean).join("; ");
    return joined || JSON.stringify(value);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return toReadableText(record.message)
      || toReadableText(record.error)
      || toReadableText(record.reason)
      || JSON.stringify(value);
  }
  return String(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    console.log("DataCart webhook received:", rawBody.slice(0, 500));

    // Signature verification
    const signature = req.headers.get("x-datacart-signature") || req.headers.get("x-webhook-secret");
    const webhookSecret = Deno.env.get("DATACART_WEBHOOK_SECRET");

    if (webhookSecret && signature) {
      const valid = await verifySignature(rawBody, signature, webhookSecret);
      if (!valid) {
        console.warn("DataCart webhook signature verification failed");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (webhookSecret && !signature) {
      console.warn("DataCart webhook missing signature header");
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = JSON.parse(rawBody);
    const event = String(body.event || body.type || body.event_type || "").trim();

    // Handle test webhook
    if (event === "webhook.test") {
      console.log("DataCart test webhook received successfully");
      return new Response(JSON.stringify({ success: true, message: "Test webhook received" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract order data from payload
    const orderData = toRecord(body.data) || toRecord(body.order) || body;
    const nestedOrder = toRecord(orderData.order);
    const { supplierStatus: eventStatus } = mapWebhookEvent(event);
    const reference = String(
      orderData.client_reference
      || orderData.clientReference
      || nestedOrder?.client_reference
      || nestedOrder?.clientReference
      || orderData.reference
      || nestedOrder?.reference
      || orderData.order_reference
      || nestedOrder?.order_reference
      || orderData.order_id
      || nestedOrder?.order_id
      || ""
    ).trim();
    const status = String(
      orderData.status
      || orderData.order_status
      || nestedOrder?.status
      || nestedOrder?.order_status
      || eventStatus
      || ""
    ).trim();
    const message = toReadableText(
      orderData.message
      ?? orderData.note
      ?? orderData.reason
      ?? nestedOrder?.message
      ?? nestedOrder?.note
      ?? body.message
      ?? body.reason
      ?? body.error
    ) || "";
    const supplierUpdatedAt = String(
      orderData.updated_at
      || orderData.updatedAt
      || nestedOrder?.updated_at
      || nestedOrder?.updatedAt
      || body.updated_at
      || body.updatedAt
      || new Date().toISOString()
    );

    if (!reference) {
      console.error("DataCart webhook missing reference in payload");
      return new Response(JSON.stringify({ error: "Missing reference" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Log webhook event
    await supabase.from("webhook_events").insert({
      provider: "datacart",
      event_type: event || "status_update",
      payload: body,
      reference: String(reference).slice(0, 100),
    }).then(({ error }) => {
      if (error) console.warn("Failed to log webhook event:", error.message);
    });

    // Use shared sync engine
    const result = await syncOrderStatusFromSupplier(supabase, {
      supplierReference: String(reference).slice(0, 100),
      supplierStatus: String(status || eventStatus || "processing"),
      supplierUpdatedAt: supplierUpdatedAt,
      source: "webhook",
      rawMeta: body,
      supplierMessage: message ? String(message).slice(0, 500) : null,
      // DataCart keeps strict final-state behavior (no soft-failed window).
      supplierKey: "DATACART",
    });

    console.log(`DataCart webhook for ${reference}: applied=${result.applied} table=${result.table} status=${result.newStatus}`);

    return new Response(JSON.stringify({
      success: result.applied,
      reference,
      status: result.newStatus,
      table: result.table,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("DataCart webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
