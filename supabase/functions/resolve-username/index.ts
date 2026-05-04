import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Rate limiting (in-memory, rolling window) ───────────────
const rateLimitStore = new Map<string, number[]>();

function checkRateLimit(ip: string, maxPerMinute: number): boolean {
  const key = `resolve-username:${ip}`;
  const now = Date.now();
  const windowMs = 60_000;
  const windowStart = now - windowMs;

  const timestamps: number[] = (rateLimitStore.get(key) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= maxPerMinute) {
    return false;
  }

  timestamps.push(now);
  rateLimitStore.set(key, timestamps);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── Rate limit: 5 lookups per IP per minute ─────────────────
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const allowed = checkRateLimit(clientIp, 5);
  if (!allowed) {
    // Return a generic error — indistinguishable from not-found to prevent enumeration
    return new Response(
      JSON.stringify({ error: "Invalid credentials. Please check and try again." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { username } = body;

    if (!username || typeof username !== "string" || username.length < 3 || username.length > 20) {
      // Generic error — don't reveal validation details
      return new Response(
        JSON.stringify({ error: "Invalid credentials. Please check and try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase.rpc("resolve_username_login", {
      p_username: username.trim(),
    });

    if (error) {
      console.error("[resolve-username] RPC error:", error.message);
      return new Response(
        JSON.stringify({ error: "Invalid credentials. Please check and try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resolved = data?.[0];

    return new Response(
      JSON.stringify({
        email: resolved?.email ?? null,
        is_suspended: resolved?.is_suspended ?? false,
        suspended_reason: resolved?.suspended_reason ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[resolve-username] error:", err);
    return new Response(
      JSON.stringify({ error: "Invalid credentials. Please check and try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
