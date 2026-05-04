import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Fire-and-forget SMS helper ────────────────────────────
async function fireSMS(params: Record<string, unknown>) {
  try {
    const url = Deno.env.get("SUPABASE_URL")! + "/functions/v1/send-sms";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(params),
    });
  } catch (e) {
    console.error("[sms-reminders] SMS fire failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const results = {
      discount_reminders: 0,
      subscription_3day: 0,
      subscription_1day: 0,
      subscription_today: 0,
      subscription_expired: 0,
    };

    // ═══════════════════════════════════════════════════════
    // A) DISCOUNT EXPIRY REMINDERS
    // Send once, ~2 hours before the 24-hour discount window expires
    // ═══════════════════════════════════════════════════════
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    const { data: discountAgents } = await supabase
      .from("agents")
      .select("id, user_id, activation_discount_expires_at, store_name")
      .eq("status", "approved")
      .eq("activation_paid", false)
      .not("activation_discount_expires_at", "is", null)
      .lte("activation_discount_expires_at", twoHoursFromNow)
      .gt("activation_discount_expires_at", now.toISOString());

    if (discountAgents && discountAgents.length > 0) {
      for (const agent of discountAgents) {
        // Idempotency: use agent_id + event as reference
        const ref = `discount-reminder-${agent.id}`;

        // Check sms_logs for already sent
        const { data: alreadySent } = await supabase
          .from("sms_logs")
          .select("id")
          .eq("event_type", "agent_discount_expiring")
          .eq("reference", ref)
          .eq("status", "sent")
          .limit(1);

        if (alreadySent && alreadySent.length > 0) continue;

        const { data: profile } = await supabase
          .from("profiles")
          .select("phone")
          .eq("id", agent.user_id)
          .maybeSingle();

        if (profile?.phone) {
          const expiresAt = new Date(agent.activation_discount_expires_at!);
          const hoursLeft = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / (60 * 60 * 1000)));

          await fireSMS({
            to: profile.phone,
            event_type: "agent_discount_expiring",
            agent_id: agent.id,
            reference: ref,
            template_vars: { hours_left: String(hoursLeft) },
          });
          results.discount_reminders++;
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // B) SUBSCRIPTION EXPIRY REMINDERS
    // 3 days, 1 day, and expiry day
    // ═══════════════════════════════════════════════════════
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    // Get all active agent subscriptions
    const { data: subscriptions } = await supabase
      .from("agent_subscriptions")
      .select("id, agent_id, expiry_date")
      .eq("status", "active")
      .lte("expiry_date", threeDaysFromNow.toISOString())
      .order("expiry_date", { ascending: true });

    if (subscriptions) {
      for (const sub of subscriptions) {
        const expiry = new Date(sub.expiry_date);
        const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

        let eventType: string | null = null;
        let refSuffix: string | null = null;

        if (daysLeft <= 0) {
          // Expired today or already expired
          eventType = "subscription_expired";
          refSuffix = "expired";
        } else if (daysLeft <= 1) {
          // Expires today/tomorrow
          eventType = "subscription_expires_today";
          refSuffix = "today";
        } else if (daysLeft <= 3) {
          // 2-3 days left
          eventType = "subscription_expiring_soon";
          refSuffix = "3day";
        }

        if (!eventType || !refSuffix) continue;

        const ref = `sub-${refSuffix}-${sub.id}`;

        // Check if already sent
        const { data: alreadySent } = await supabase
          .from("sms_logs")
          .select("id")
          .eq("event_type", eventType)
          .eq("reference", ref)
          .eq("status", "sent")
          .limit(1);

        if (alreadySent && alreadySent.length > 0) continue;

        // Also check sms_queue
        const { data: alreadyQueued } = await supabase
          .from("sms_queue")
          .select("id")
          .eq("event_type", eventType)
          .eq("reference", ref)
          .in("status", ["queued", "sending", "sent"])
          .limit(1);

        if (alreadyQueued && alreadyQueued.length > 0) continue;

        // Get agent phone
        const { data: agent } = await supabase
          .from("agents")
          .select("user_id, store_name")
          .eq("id", sub.agent_id)
          .eq("status", "active")
          .maybeSingle();

        if (!agent) continue;

        const { data: profile } = await supabase
          .from("profiles")
          .select("phone")
          .eq("id", agent.user_id)
          .maybeSingle();

        if (!profile?.phone) continue;

        const templateVars: Record<string, string> = {};
        if (eventType === "subscription_expiring_soon") {
          templateVars.days_left = String(daysLeft);
        }

        await fireSMS({
          to: profile.phone,
          event_type: eventType,
          agent_id: sub.agent_id,
          reference: ref,
          template_vars: templateVars,
        });

        if (refSuffix === "3day") results.subscription_3day++;
        else if (refSuffix === "today") results.subscription_1day++;
        else if (refSuffix === "expired") results.subscription_expired++;
      }
    }

    console.log("[sms-reminders] Done:", JSON.stringify(results));

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[sms-reminders] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
