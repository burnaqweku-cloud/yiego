import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { mode, device_hash } = body;

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (mode === "precheck") {
      // No auth needed — check IP + device only
      const { data } = await supabase.rpc("check_security_access", {
        p_user_id: null,
        p_ip: clientIp,
        p_device_hash: device_hash || null,
        p_phone: null,
        p_email: null,
      });

      return new Response(JSON.stringify(data || { allowed: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "session") {
      // Auth required
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ allowed: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims?.sub) {
        return new Response(
          JSON.stringify({ allowed: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const userId = claimsData.claims.sub as string;

      // Get user's phone and email for block checks
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone_e164, email")
        .eq("id", userId)
        .maybeSingle();

      const { data } = await supabase.rpc("check_security_access", {
        p_user_id: userId,
        p_ip: clientIp,
        p_device_hash: device_hash || null,
        p_phone: profile?.phone_e164 || null,
        p_email: profile?.email || null,
      });

      // Log the session check as a security event
      await supabase.from("security_events").insert({
        user_id: userId,
        event_type: "session_check",
        ip: clientIp,
        device_hash: device_hash || null,
        user_agent: req.headers.get("user-agent"),
        meta: { allowed: data?.allowed ?? true, block_type: data?.block_type ?? null },
      }).then(() => {}, () => {});

      return new Response(JSON.stringify(data || { allowed: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Invalid mode. Use 'precheck' or 'session'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[security-check] Error:", err);
    // Fail open — don't block users due to security check errors
    return new Response(
      JSON.stringify({ allowed: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
