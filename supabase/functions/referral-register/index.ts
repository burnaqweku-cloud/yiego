import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { referee_id, referral_code, device_hash } = await req.json();

    if (!referee_id || !referral_code) {
      return new Response(JSON.stringify({ error: "referee_id and referral_code required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                     req.headers.get("cf-connecting-ip") || "unknown";

    const code = String(referral_code).trim().slice(0, 20).toUpperCase();
    const sanitizedDeviceHash = device_hash ? String(device_hash).slice(0, 128) : null;

    // Resolve referral code to referrer
    const { data: referrers } = await supabase.rpc("resolve_referral_code", { p_code: code });
    if (!referrers || referrers.length === 0) {
      return new Response(JSON.stringify({ success: false, reason: "Invalid referral code" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const referrer_id = referrers[0].user_id;

    if (referrer_id === referee_id) {
      return new Response(JSON.stringify({ success: false, reason: "Cannot refer yourself" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("referred_by, referral_code, phone, device_hash")
      .eq("id", referee_id)
      .maybeSingle();

    if (!existingProfile) {
      return new Response(JSON.stringify({ success: false, reason: "User not found" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existingProfile.referred_by) {
      return new Response(JSON.stringify({ success: true, already_registered: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingActivity } = await supabase
      .from("referral_activity")
      .select("id")
      .eq("referee_id", referee_id)
      .maybeSingle();

    if (existingActivity) {
      return new Response(JSON.stringify({ success: true, already_registered: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: referrerProfile } = await supabase
      .from("profiles")
      .select("referral_signup_count, device_hash, phone")
      .eq("id", referrer_id)
      .maybeSingle();

    // --- ANTI-ABUSE FLAGS (no auto-freeze) ---
    let flagged = false;
    let flagType: string | null = null;

    // 1. Device fingerprint match — FLAG only
    if (sanitizedDeviceHash && referrerProfile?.device_hash &&
        sanitizedDeviceHash === referrerProfile.device_hash) {
      flagged = true;
      flagType = "same_device";
      await supabase.from("referral_flags").insert({
        user_id: referrer_id,
        flag_type: "same_device",
        severity_level: "high",
        details: { referee_id, device_hash: sanitizedDeviceHash },
      });
    }

    // 2. Phone number duplicate — FLAG only
    if (existingProfile.phone) {
      const { data: phoneDup } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone", existingProfile.phone)
        .neq("id", referee_id)
        .limit(1);

      if (phoneDup && phoneDup.length > 0) {
        flagged = true;
        flagType = flagType || "duplicate_phone";
        await supabase.from("referral_flags").insert({
          user_id: referrer_id,
          flag_type: "duplicate_phone",
          severity_level: "medium",
          details: { referee_id, phone: existingProfile.phone },
        });
      }
    }

    // 3. IP cluster detection — FLAG only, no freeze
    if (clientIp && clientIp !== "unknown") {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("referral_activity")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", referrer_id)
        .eq("referee_registration_ip", clientIp)
        .gte("created_at", twentyFourHoursAgo);

      if ((count ?? 0) >= 5) {
        flagged = true;
        flagType = flagType || "ip_cluster";
        await supabase.from("referral_flags").insert({
          user_id: referrer_id,
          flag_type: "ip_cluster",
          severity_level: "high",
          details: { ip: clientIp, count: (count ?? 0) + 1 },
        });
      }
    }

    // 4. HV_SIGNUP: >= 10 signups in rolling 10-minute window — FLAG only, no freeze
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count: signupVelocity } = await supabase
      .from("referral_activity")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", referrer_id)
      .gte("created_at", tenMinAgo);

    if ((signupVelocity ?? 0) >= 9) {
      // Will be 10+ after current insert
      flagged = true;
      flagType = flagType || "HV_SIGNUP";

      // Check for existing open HV_SIGNUP flag to avoid duplicates
      const { data: existingHvFlag } = await supabase
        .from("referral_flags")
        .select("id, details")
        .eq("user_id", referrer_id)
        .eq("flag_type", "HV_SIGNUP")
        .eq("reviewed_by_admin", false)
        .gte("created_at", tenMinAgo)
        .maybeSingle();

      if (existingHvFlag) {
        // Increment trigger_count on existing flag
        const currentCount = (existingHvFlag.details as any)?.trigger_count ?? 1;
        await supabase.from("referral_flags").update({
          details: {
            ...(existingHvFlag.details as any),
            trigger_count: currentCount + 1,
            last_triggered_at: new Date().toISOString(),
            snapshot_counts: (signupVelocity ?? 0) + 1,
          },
        } as any).eq("id", existingHvFlag.id);
      } else {
        await supabase.from("referral_flags").insert({
          user_id: referrer_id,
          flag_type: "HV_SIGNUP",
          severity_level: "high",
          details: {
            rule_type: "HV_SIGNUP",
            window_minutes: 10,
            threshold: 10,
            trigger_count: 1,
            first_triggered_at: new Date().toISOString(),
            last_triggered_at: new Date().toISOString(),
            snapshot_counts: (signupVelocity ?? 0) + 1,
          },
        });
      }
    }

    // Save device hash and IP on referee profile
    const profileUpdate: Record<string, unknown> = { referred_by: referrer_id };
    if (sanitizedDeviceHash) profileUpdate.device_hash = sanitizedDeviceHash;
    if (clientIp !== "unknown") profileUpdate.registration_ip = clientIp;

    await supabase.from("profiles").update(profileUpdate).eq("id", referee_id);

    // Increment referrer signup count
    await supabase
      .from("profiles")
      .update({ referral_signup_count: (Number(referrerProfile?.referral_signup_count) || 0) + 1 })
      .eq("id", referrer_id);

    // Create referral_activity record
    await supabase.from("referral_activity").insert({
      referrer_id,
      referee_id,
      status: "registered",
      referee_device_hash: sanitizedDeviceHash,
      referee_registration_ip: clientIp !== "unknown" ? clientIp : null,
      referee_phone: existingProfile.phone || null,
      flagged,
      flag_type: flagType,
    });

    console.log(`[referral-register] Referee ${referee_id} registered under referrer ${referrer_id}${flagged ? ` [FLAGGED: ${flagType}]` : ''}`);

    return new Response(JSON.stringify({ success: true, flagged }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[referral-register] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
