// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Compute ISO week key (Monday-based) for a given date.
 * Africa/Accra = UTC+0, so we use UTC dates directly.
 */
function getWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Idempotent referral qualification handler.
 * Called server-side after any successful paid order.
 * 
 * Logic:
 * 1. Check if buyer was referred (profiles.referred_by)
 * 2. Check if already qualified (referral_qualified = true)
 * 3. If not yet qualified → insert referral_qualifications, update profile, increment referrer count
 * 4. Uses unique constraints for idempotency
 */
export async function processReferralQualification(
  supabase: any,
  userId: string,
  orderId: string,
  orderMeta?: { amount?: number; network?: string; bundle?: string; order_source?: string }
): Promise<void> {
  try {
    // 1. Load buyer profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("referred_by, referral_qualified, first_order_qualified_at, reward_activated")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.referred_by) return; // Not referred
    if (profile.referral_qualified || profile.first_order_qualified_at) {
      console.log(`[referral-qualify] User ${userId} already qualified, skipping`);
      return; // Already qualified
    }

    const referrerId = profile.referred_by as string;

    // 2. Insert into referral_qualifications (idempotent via unique constraints)
    const { error: insertErr } = await supabase.from("referral_qualifications").insert({
      referrer_id: referrerId,
      referee_id: userId,
      first_order_id: orderId,
      amount: orderMeta?.amount ?? null,
      network: orderMeta?.network ?? null,
      bundle: orderMeta?.bundle ?? null,
      order_source: orderMeta?.order_source ?? null,
    });

    if (insertErr) {
      if (insertErr.code === "23505") {
        // Duplicate — already qualified, ensure profile flag is set
        console.log(`[referral-qualify] Duplicate qualification for ${userId}, ensuring flags`);
        await supabase.from("profiles").update({
          referral_qualified: true,
          reward_activated: true,
        }).eq("id", userId).eq("referral_qualified", false);
        return;
      }
      console.error("[referral-qualify] Insert error:", insertErr);
      return;
    }

    // 3. Update buyer profile
    const now = new Date().toISOString();
    await supabase.from("profiles").update({
      referral_qualified: true,
      first_order_qualified_at: now,
      qualified_first_order_id: orderId,
      reward_activated: true,
    }).eq("id", userId);

    console.log(`[referral-qualify] User ${userId} qualified via order ${orderId}`);

    // 4. Update referral_activity to "successful" if exists
    const { data: activity } = await supabase
      .from("referral_activity")
      .select("id, status")
      .eq("referee_id", userId)
      .maybeSingle();

    if (activity && activity.status !== "successful") {
      await supabase.from("referral_activity")
        .update({ status: "successful", first_success_order_id: orderId })
        .eq("id", activity.id);
    }

    // 5. Increment referrer's success count
    const { data: referrer } = await supabase
      .from("profiles")
      .select("referral_success_count")
      .eq("id", referrerId)
      .maybeSingle();

    const newCount = (Number(referrer?.referral_success_count) || 0) + 1;
    await supabase.from("profiles")
      .update({ referral_success_count: newCount })
      .eq("id", referrerId);

    console.log(`[referral-qualify] Referrer ${referrerId} now has ${newCount} successful referrals`);

    // 5b. HV_QUALIFIED check: >= 5 qualified in rolling 15 min — FLAG only, no freeze
    try {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count: qualVelocity } = await supabase
        .from("referral_qualifications")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", referrerId)
        .gte("qualified_at", fifteenMinAgo);

      if ((qualVelocity ?? 0) >= 5) {
        // Check for existing open HV_QUALIFIED flag to avoid duplicates
        const { data: existingHvQFlag } = await supabase
          .from("referral_flags")
          .select("id, details")
          .eq("user_id", referrerId)
          .eq("flag_type", "HV_QUALIFIED")
          .eq("reviewed_by_admin", false)
          .gte("created_at", fifteenMinAgo)
          .maybeSingle();

        if (existingHvQFlag) {
          const currentCount = (existingHvQFlag.details as any)?.trigger_count ?? 1;
          await supabase.from("referral_flags").update({
            details: {
              ...(existingHvQFlag.details as any),
              trigger_count: currentCount + 1,
              last_triggered_at: new Date().toISOString(),
              snapshot_counts: qualVelocity ?? 0,
            },
          } as any).eq("id", existingHvQFlag.id);
        } else {
          await supabase.from("referral_flags").insert({
            user_id: referrerId,
            flag_type: "HV_QUALIFIED",
            severity_level: "high",
            details: {
              rule_type: "HV_QUALIFIED",
              window_minutes: 15,
              threshold: 5,
              trigger_count: 1,
              first_triggered_at: new Date().toISOString(),
              last_triggered_at: new Date().toISOString(),
              snapshot_counts: qualVelocity ?? 0,
            },
          });
        }
        console.log(`[referral-qualify] HV_QUALIFIED flag created/updated for referrer ${referrerId}`);
      }
    } catch (hvErr) {
      console.error("[referral-qualify] HV_QUALIFIED check error:", hvErr);
    }

    // 6. Check milestone rewards
    if (newCount % 5 === 0) {
      const { error: rewardErr } = await supabase.from("referral_rewards").insert({
        user_id: referrerId,
        type: "1GB_voucher",
        status: "claimable",
      });
      if (!rewardErr) {
        console.log(`[referral-qualify] 🎁 Reward created for referrer ${referrerId} at ${newCount} referrals`);
      }
    }

    // 7. Create referral_qualified_event for weekly leaderboard
    const weekKey = getWeekKey(new Date());
    const { error: rqeErr } = await supabase.from("referral_qualified_events").insert({
      referrer_user_id: referrerId,
      referred_user_id: userId,
      first_order_id: orderId,
      week_key: weekKey,
    });
    if (rqeErr && rqeErr.code !== "23505") {
      console.error("[referral-qualify] Failed to create qualification event:", rqeErr);
    } else {
      console.log(`[referral-qualify] Qualification event created for week ${weekKey}`);
    }

    // 8. Log security event
    await supabase.from("security_events").insert({
      event_type: "referral_qualified",
      user_id: userId,
      meta: {
        referee_id: userId,
        referrer_id: referrerId,
        order_id: orderId,
        order_source: orderMeta?.order_source,
        referrer_new_count: newCount,
        week_key: weekKey,
      },
    });
  } catch (err) {
    // Non-blocking — referral logic must never break order flow
    console.error("[referral-qualify] Error:", err);
  }
}
