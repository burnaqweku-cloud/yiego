import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { normalizeGhanaPhone } from "../_shared/duplicate-order-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// NOTE: 'Voided' is intentionally NOT in any blocking list. Voided is admin-set
// terminal — the recipient number is unblocked immediately for reorder.
const PAID_ACTIVE_STATUSES = ["Pending Payment", "Pending Approval", "Paid", "Processing", "paid", "processing"];
const PENDING_STATUSES = ["Pending", "pending"];
const PENDING_MAX_AGE_MINUTES = 15;

// Simple rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 300_000);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(clientIp)) {
      return new Response(
        JSON.stringify({ error: "Too many requests" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { phone } = await req.json();
    if (!phone || typeof phone !== "string" || phone.trim().length < 10) {
      return new Response(
        JSON.stringify({ blocked: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const norm = normalizeGhanaPhone(phone.trim());
    const variants = [norm];
    if (norm.startsWith("0")) {
      variants.push("+233" + norm.slice(1));
      variants.push("233" + norm.slice(1));
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cutoff = new Date(Date.now() - PENDING_MAX_AGE_MINUTES * 60 * 1000).toISOString();

    // Check orders table - paid/active statuses
    const { data: paidOrder } = await supabase
      .from("orders")
      .select("order_id, status")
      .in("recipient_number", variants)
      .in("status", PAID_ACTIVE_STATUSES)
      .limit(1)
      .maybeSingle();

    if (paidOrder) {
      return new Response(
        JSON.stringify({
          blocked: true,
          existingOrderId: paidOrder.order_id,
          message: `An order for this number is already being processed (${paidOrder.order_id}). Please wait for it to complete before placing another order.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check orders - recent pending
    const { data: pendingOrder } = await supabase
      .from("orders")
      .select("order_id, status")
      .in("recipient_number", variants)
      .in("status", PENDING_STATUSES)
      .gte("created_at", cutoff)
      .limit(1)
      .maybeSingle();

    if (pendingOrder) {
      return new Response(
        JSON.stringify({
          blocked: true,
          existingOrderId: pendingOrder.order_id,
          message: `An order for this number is already being processed (${pendingOrder.order_id}). Please wait for it to complete before placing another order.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check agent_orders - paid/active
    const { data: agentOrder } = await supabase
      .from("agent_orders")
      .select("order_id, status")
      .in("customer_phone", variants)
      .in("status", PAID_ACTIVE_STATUSES)
      .limit(1)
      .maybeSingle();

    if (agentOrder) {
      return new Response(
        JSON.stringify({
          blocked: true,
          existingOrderId: agentOrder.order_id,
          message: `An order for this number is already being processed (${agentOrder.order_id}). Please wait for it to complete before placing another order.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check agent_orders - recent pending
    const { data: pendingAgentOrder } = await supabase
      .from("agent_orders")
      .select("order_id, status")
      .in("customer_phone", variants)
      .in("status", PENDING_STATUSES)
      .gte("created_at", cutoff)
      .limit(1)
      .maybeSingle();

    if (pendingAgentOrder) {
      return new Response(
        JSON.stringify({
          blocked: true,
          existingOrderId: pendingAgentOrder.order_id,
          message: `An order for this number is already being processed (${pendingAgentOrder.order_id}). Please wait for it to complete before placing another order.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ blocked: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-duplicate-order error:", err);
    // Fail open — don't block users on error
    return new Response(
      JSON.stringify({ blocked: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
