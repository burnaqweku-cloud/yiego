// AfroHubGH (Supplier D) webhook scaffold.
// Returns 503 SETUP_REQUIRED until AFROHUBGH_WEBHOOK_SECRET is configured
// and the real signature header / payload shape are confirmed in the
// AfroHubGH API docs. Once configured the handler verifies the signature
// and forwards to the canonical supplier-status-sync engine.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapWebhookEvent, syncOrderStatusFromSupplier } from "../_shared/supplier-status-sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-afrohubgh-signature",
};

async function verifyHmac(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    return computed === signature.toLowerCase();
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("AFROHUBGH_WEBHOOK_SECRET");
  if (!secret) {
    // Setup-required: do not accept webhooks until configured (admin-only signal).
    return new Response(
      JSON.stringify({ error: "SETUP_REQUIRED", message: "AfroHubGH webhook not configured" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-afrohubgh-signature") || req.headers.get("x-webhook-secret") || "";
    const valid = await verifyHmac(rawBody, signature, secret);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let payload: any;
    try { payload = JSON.parse(rawBody); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TODO(afrohubgh): adjust field names once AfroHubGH callback shape is confirmed.
    const reference = String(
      payload?.reference ?? payload?.order_reference ?? payload?.client_reference ?? payload?.data?.reference ?? "",
    ).trim();
    const event = String(payload?.event ?? payload?.type ?? "").trim();
    const supplierStatus = String(payload?.status ?? payload?.data?.status ?? "").trim();

    if (!reference) {
      return new Response(JSON.stringify({ error: "Missing reference" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mapped = supplierStatus
      ? { supplierStatus: supplierStatus.toLowerCase(), platformStatus: "" }
      : mapWebhookEvent(event);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const result = await syncOrderStatusFromSupplier(supabase, {
      supplierReference: reference,
      supplierStatus: mapped.supplierStatus,
      source: "webhook",
      supplierKey: "AFROHUBGH",
      rawMeta: { event, payload },
      supplierMessage: payload?.message ?? null,
    });

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[afrohubgh-webhook] error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
