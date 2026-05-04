// notify-subscription-reminders — scheduled daily.
// Sends 7-day, 3-day, 1-day reminders + an "expired" notification for active agents
// whose subscription expiry falls within those windows. Uses idempotency keys so
// multiple cron runs in the same day do NOT spam.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key",
};

async function fireEvent(payload: Record<string, unknown>) {
  const fnUrl = Deno.env.get("SUPABASE_URL")! + "/functions/v1/notify-event";
  // Prefer dedicated trigger secret; fall back to service role for backward compat
  const key =
    Deno.env.get("NOTIFY_TRIGGER_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  await fetch(fnUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-key": key },
    body: JSON.stringify(payload),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Pull all active agent subscriptions expiring within next 8 days OR expired in last 24h
  const now = Date.now();
  const in8days = new Date(now + 8 * 24 * 60 * 60 * 1000).toISOString();
  const ago24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const { data: subs, error } = await supabase
    .from("agent_subscriptions")
    .select("id, agent_id, expiry_date")
    .gte("expiry_date", ago24h)
    .lte("expiry_date", in8days);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const buckets: Record<string, number[]> = { sent: [], skipped: [] };
  let sent7 = 0, sent3 = 0, sent1 = 0, sentExpired = 0, skipped = 0;

  for (const sub of subs || []) {
    const expiry = new Date(sub.expiry_date as string).getTime();
    const msLeft = expiry - now;
    const daysLeft = Math.floor(msLeft / (24 * 60 * 60 * 1000));

    let event: string | null = null;
    let days: number | null = null;
    let suffix = "";

    if (daysLeft <= -1 && daysLeft >= -1) {
      event = "subscription_expired";
      suffix = "expired";
    } else if (daysLeft === 1) {
      event = "subscription_expiring";
      days = 1;
      suffix = "1d";
    } else if (daysLeft === 3) {
      event = "subscription_expiring";
      days = 3;
      suffix = "3d";
    } else if (daysLeft === 7) {
      event = "subscription_expiring";
      days = 7;
      suffix = "7d";
    }

    if (!event) {
      skipped++;
      continue;
    }

    await fireEvent({
      event,
      agent_id: sub.agent_id,
      data: {
        days_remaining: days,
        subscription_id: sub.id,
        suffix,
      },
      idempotencyKey: `${event}:${sub.id}:${suffix}`,
    });

    if (suffix === "7d") sent7++;
    else if (suffix === "3d") sent3++;
    else if (suffix === "1d") sent1++;
    else if (suffix === "expired") sentExpired++;
  }

  return new Response(JSON.stringify({
    success: true,
    total_subs_checked: subs?.length || 0,
    sent_7d: sent7,
    sent_3d: sent3,
    sent_1d: sent1,
    sent_expired: sentExpired,
    skipped,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
