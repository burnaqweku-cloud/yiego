import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Compute ISO week key for a given date (Ghana time = UTC+0)
 */
function getWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

const REWARD_MAP: Record<number, number> = {
  1: 2048,  // 2GB
  2: 1024,  // 1GB
  3: 500,   // 500MB
};

const REWARD_GB_MAP: Record<number, number> = {
  1: 2,
  2: 1,
  3: 0.5,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Determine which week to process
    // By default, process the previous week (run on Monday 00:00+)
    const body = await req.json().catch(() => ({}));
    let weekKey = body.week_key as string | undefined;

    if (!weekKey) {
      // Previous week: subtract 1 day from today (Monday) to get Sunday = previous week
      const now = new Date();
      const yesterday = new Date(now.getTime() - 86400000);
      weekKey = getWeekKey(yesterday);
    }

    console.log(`[weekly-leaderboard] Processing week: ${weekKey}`);

    // Check if already processed
    const { data: existing } = await supabase
      .from("weekly_leaderboard_rewards")
      .select("id")
      .eq("week_key", weekKey)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`[weekly-leaderboard] Week ${weekKey} already processed`);
      return new Response(
        JSON.stringify({ success: true, message: "Already processed", week_key: weekKey }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get top 3 for this week
    const { data: top3, error: lbErr } = await supabase.rpc("get_weekly_leaderboard", {
      p_week_key: weekKey,
    });

    if (lbErr) {
      console.error("[weekly-leaderboard] Leaderboard query error:", lbErr);
      return new Response(
        JSON.stringify({ success: false, error: lbErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const winners = (top3 || []).filter((e: any) => Number(e.rank) <= 3 && Number(e.qualified_count) > 0);
    console.log(`[weekly-leaderboard] ${winners.length} winners for ${weekKey}`);

    const results: any[] = [];

    for (const winner of winners) {
      const rank = Number(winner.rank);
      const userId = winner.user_id;
      const rewardMb = REWARD_MAP[rank];
      const rewardGb = REWARD_GB_MAP[rank];

      if (!rewardMb) continue;

      // Insert reward record
      const { error: rewardErr } = await supabase
        .from("weekly_leaderboard_rewards")
        .insert({
          week_key: weekKey,
          user_id: userId,
          rank,
          reward_mb: rewardMb,
          status: "pending",
          meta: {
            username: winner.username,
            qualified_count: Number(winner.qualified_count),
          },
        });

      if (rewardErr) {
        if (rewardErr.code === "23505") {
          console.log(`[weekly-leaderboard] Duplicate for rank ${rank}, skipping`);
          continue;
        }
        console.error(`[weekly-leaderboard] Failed to insert reward for rank ${rank}:`, rewardErr);
        results.push({ rank, user_id: userId, status: "failed", error: rewardErr.message });
        continue;
      }

      // Create a bonus order as "Pending Approval" for admin review
      const orderId = `LB-${weekKey}-R${rank}-${userId.slice(0, 8)}`;

      const { error: orderErr } = await supabase.from("orders").insert({
        order_id: orderId,
        user_id: userId,
        recipient_number: "0000000000", // placeholder — admin will set actual number
        network: "MTN", // default — admin can change
        bundle_size_gb: rewardGb,
        amount_ghs: 0,
        status: "Pending Approval",
        payment_method: "leaderboard_bonus",
        payment_status: "not_applicable",
        order_type: "reward",
        order_source: "leaderboard_bonus",
        customer_name: `Leaderboard Bonus - ${weekKey} #${rank}`,
        admin_notes: `Weekly Leaderboard Bonus: Rank #${rank} for week ${weekKey}. Username: @${winner.username || "unknown"}. Qualified referrals: ${winner.qualified_count}. Reward: ${rewardMb}MB.`,
      });

      if (orderErr) {
        console.error(`[weekly-leaderboard] Failed to create bonus order for rank ${rank}:`, orderErr);
        // Update reward status to failed
        await supabase
          .from("weekly_leaderboard_rewards")
          .update({ status: "failed", meta: { error: orderErr.message } })
          .eq("week_key", weekKey)
          .eq("rank", rank);
        results.push({ rank, user_id: userId, status: "failed", error: orderErr.message });
        continue;
      }

      // Update reward status to processed
      await supabase
        .from("weekly_leaderboard_rewards")
        .update({
          status: "processed",
          processed_at: new Date().toISOString(),
          meta: {
            username: winner.username,
            qualified_count: Number(winner.qualified_count),
            order_id: orderId,
          },
        })
        .eq("week_key", weekKey)
        .eq("rank", rank);

      results.push({ rank, user_id: userId, status: "processed", order_id: orderId, reward_mb: rewardMb });
      console.log(`[weekly-leaderboard] Rank #${rank}: @${winner.username} → ${rewardMb}MB bonus order ${orderId}`);
    }

    // Create notification for winners
    for (const r of results.filter((r) => r.status === "processed")) {
      await supabase.from("notifications").insert({
        user_id: r.user_id,
        title: `🏆 Weekly Leaderboard - Rank #${r.rank}!`,
        message: `Congratulations! You placed #${r.rank} on this week's referral leaderboard and earned a ${r.reward_mb >= 1024 ? `${r.reward_mb / 1024}GB` : `${r.reward_mb}MB`} bonus reward!`,
        type: "reward",
        link: "/dashboard/referral",
      });
    }

    return new Response(
      JSON.stringify({ success: true, week_key: weekKey, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[weekly-leaderboard] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
