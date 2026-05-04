import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple in-memory rate limiter (per IP)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5; // max requests per window
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return true;
  }
  return false;
}

// Periodically clean up expired entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, 300_000);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Rate limiting by IP
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip")
      || "unknown";

    if (isRateLimited(clientIp)) {
      console.log("Rate limited IP:", clientIp);
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } }
      );
    }

    const { order_id, phone } = await req.json();

    if (!order_id || typeof order_id !== "string") {
      console.log("Missing or invalid order_id");
      return new Response(
        JSON.stringify({ error: "Order ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate order_id length to prevent abuse
    if (order_id.trim().length > 30) {
      return new Response(
        JSON.stringify({ error: "Invalid Order ID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to bypass RLS and query securely
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let query = supabase
      .from("orders")
      .select(
        "order_id, recipient_number, network, bundle_size_gb, amount_ghs, status, created_at, updated_at"
      )
      .eq("order_id", order_id.trim().toUpperCase());

    // Phone is now optional — if provided, use it as additional filter
    if (phone && typeof phone === "string" && phone.trim().length > 0) {
      const phoneRegex = /^0[235]\d{8}$/;
      if (phoneRegex.test(phone.trim())) {
        query = query.eq("recipient_number", phone.trim());
      }
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("Database query error:", error.message);
      return new Response(
        JSON.stringify({ error: "Failed to look up order" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!data) {
      console.log("Order not found for lookup attempt from IP:", clientIp);
      return new Response(
        JSON.stringify({ data: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Never return supplier/debug fields to public clients
    const safeData = {
      order_id: data.order_id,
      recipient_number: data.recipient_number,
      network: data.network,
      bundle_size_gb: data.bundle_size_gb,
      amount_ghs: data.amount_ghs,
      status: data.status,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    console.log("Order found:", safeData.order_id, "status:", safeData.status);
    return new Response(
      JSON.stringify({ data: safeData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
