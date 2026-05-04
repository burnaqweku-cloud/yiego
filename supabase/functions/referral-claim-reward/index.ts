import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Verify JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { reward_id } = await req.json();
    if (!reward_id) {
      return new Response(JSON.stringify({ error: "reward_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch the reward
    const { data: reward } = await supabase
      .from("referral_rewards")
      .select("*")
      .eq("id", reward_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!reward) {
      return new Response(JSON.stringify({ error: "Reward not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (reward.status === "claimed") {
      return new Response(JSON.stringify({ success: true, already_claimed: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (reward.status !== "claimable") {
      return new Response(JSON.stringify({ error: `Reward is ${reward.status}, cannot claim` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as claimed
    const { error: claimErr } = await supabase
      .from("referral_rewards")
      .update({ status: "claimed", claimed_at: new Date().toISOString() })
      .eq("id", reward_id)
      .eq("user_id", user.id)
      .eq("status", "claimable"); // Idempotency guard

    if (claimErr) {
      console.error("[referral-claim-reward] Failed to claim:", claimErr);
      return new Response(JSON.stringify({ error: "Failed to claim reward" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[referral-claim-reward] User ${user.id} claimed reward ${reward_id}`);

    return new Response(JSON.stringify({ success: true, reward_type: reward.type }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[referral-claim-reward] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
