// AfroHubGH (Supplier D) webhook handler.
// Spec (from AfroHubGH docs):
//   Header: X-AHG-Signature: sha256=<hex>
//   Header: X-AHG-Event: order.status (or similar)
//   Signing: HMAC-SHA256(rawBody, AFROHUBGH_WEBHOOK_SECRET) → hex
//   Payload: { event, data: { reference, status, ... } }
// Behavior: verify signature, normalize status, forward to canonical sync engine.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapWebhookEvent, syncOrderStatusFromSupplier } from "../_shared/supplier-status-sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ahg-signature, x-ahg-event",
};

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("AFROHUBGH_WEBHOOK_SECRET");
  if (!secret) {
    return new Response(
      JSON.stringify({ error: "SETUP_REQUIRED", message: "AfroHubGH webhook not configured" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const rawBody = await req.text();
    const sigHeader = req.headers.get("x-ahg-signature") || "";
    // Strip "sha256=" prefix per AfroHubGH docs
    const provided = sigHeader.replace(/^sha256=/i, "").trim().toLowerCase();
    const expected = (await hmacHex(rawBody, secret)).toLowerCase();

    if (!provided || !timingSafeEqualHex(provided, expected)) {
      console.warn("[afrohubgh-webhook] Invalid signature");
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

    const event = String(payload?.event ?? req.headers.get("x-ahg-event") ?? "").trim();
    const data = payload?.data ?? {};
    const reference = String(
      data?.reference ?? data?.client_reference ?? payload?.reference ?? "",
    ).trim();
    const supplierStatus = String(data?.status ?? "").trim();

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
      supplierMessage: data?.message ?? payload?.message ?? null,
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
