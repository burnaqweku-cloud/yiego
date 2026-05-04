import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkSecurityAccess, logSecurityEvent, extractClientIp, blockedResponse } from "../_shared/check-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ─── Helpers ───────────────────────────────────────────────────── */

function generateOrderId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "RWD-";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function isGhanaPhone(phone: string): boolean {
  const cleaned = phone.replace(/\s+/g, "").replace(/^\+233/, "0");
  return /^0[235][0-9]{8}$/.test(cleaned);
}

function normalisePhone(phone: string): string {
  return phone.replace(/\s+/g, "").replace(/^\+233/, "0");
}

const VALID_NETWORKS = ["MTN", "Telecel", "AirtelTigo"];

/* ─── Structured error response ─────────────────────────────────── */
function errorResponse(code: string, message: string, status = 400) {
  return new Response(
    JSON.stringify({ success: false, error: message, error_code: code }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/* ─── Main handler ──────────────────────────────────────────────── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Auth ────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return errorResponse("UNAUTHORIZED", "Unauthorized — no auth header", 401);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) return errorResponse("UNAUTHORIZED", "Unauthorized — invalid session", 401);

    // ── Parse body ──────────────────────────────────────────────────
    const body = await req.json();
    const { milestone_id, network, phone } = body;
    console.log("[referral-submit-claim] user=", user.id, "milestone=", milestone_id, "network=", network);

    // ── Input validation ────────────────────────────────────────────
    if (!milestone_id || typeof milestone_id !== "string") {
      return errorResponse("INVALID_INPUT", "milestone_id required");
    }
    if (!network || !VALID_NETWORKS.includes(network)) {
      return errorResponse("INVALID_NETWORK", "Invalid network. Choose MTN, Telecel, or AirtelTigo.");
    }
    if (!phone || !isGhanaPhone(phone)) {
      return errorResponse("INVALID_PHONE", "Enter a valid Ghana phone number (e.g. 0551234567).");
    }

    const normalisedPhone = normalisePhone(phone);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Security access check ───────────────────────────────────────
    const clientIp = extractClientIp(req);
    const deviceHash = body.device_hash || null;
    const secCheck = await checkSecurityAccess({
      supabase, userId: user.id, ip: clientIp, deviceHash,
    });
    if (!secCheck.allowed) {
      logSecurityEvent(supabase, "referral_claim_blocked", {
        userId: user.id, ip: clientIp, deviceHash,
        meta: { milestone_id, block_type: secCheck.block_type },
      });
      return blockedResponse(secCheck.message || "Access restricted.", corsHeaders);
    }

    // ── Fetch profile + check frozen ────────────────────────────────
    const { data: profile } = await supabase
      .from("profiles")
      .select("referral_success_count, full_name, referral_frozen, referral_frozen_reason, suspended")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) return errorResponse("USER_NOT_FOUND", "User profile not found.", 404);

    if (profile.suspended) {
      return errorResponse("ACCOUNT_SUSPENDED", "Your account is suspended. Contact support.");
    }

    if (profile.referral_frozen) {
      return errorResponse(
        "REWARDS_FROZEN",
        profile.referral_frozen_reason || "Your referral rewards are currently under review. Contact support if you need help."
      );
    }

    // ── Fetch milestone ─────────────────────────────────────────────
    const { data: milestone, error: milestoneErr } = await supabase
      .from("reward_milestones")
      .select("*")
      .eq("id", milestone_id)
      .maybeSingle();

    if (milestoneErr || !milestone) {
      return errorResponse("MILESTONE_NOT_FOUND", "Milestone not found.", 404);
    }

    // ── Verify milestone reached (cumulative model) ─────────────────
    const { data: allMilestones } = await supabase
      .from("reward_milestones")
      .select("id, required_referrals, sort_order, gb_amount")
      .order("sort_order");

    if (!allMilestones) {
      return errorResponse("SERVER_ERROR", "Could not load milestones.", 500);
    }

    const milestoneIdx = allMilestones.findIndex((m) => m.id === milestone_id);
    if (milestoneIdx === -1) {
      return errorResponse("MILESTONE_NOT_FOUND", "Milestone not found in ordered list.", 404);
    }

    const cumulativeRequired = allMilestones
      .slice(0, milestoneIdx + 1)
      .reduce((sum, m) => sum + m.required_referrals, 0);

    if (profile.referral_success_count < cumulativeRequired) {
      const remaining = cumulativeRequired - profile.referral_success_count;
      return errorResponse(
        "TIER_NOT_REACHED",
        `You need ${remaining} more qualified referral${remaining !== 1 ? "s" : ""} to reach this tier.`
      );
    }

    // ── Idempotency: check existing active claim for this milestone ─
    const { data: existingClaim } = await supabase
      .from("reward_claims")
      .select("id, status, linked_order_id, network, phone, payout_gb")
      .eq("user_id", user.id)
      .eq("milestone_id", milestone_id)
      .not("status", "eq", "rejected")
      .not("status", "eq", "failed")
      .maybeSingle();

    if (existingClaim) {
      console.log("[referral-submit-claim] Idempotent hit: existing claim", existingClaim.id, "status=", existingClaim.status);
      return new Response(JSON.stringify({
        success: true,
        already_claimed: true,
        claim_id: existingClaim.id,
        status: existingClaim.status,
        linked_order_id: existingClaim.linked_order_id,
        network: existingClaim.network,
        phone: existingClaim.phone,
        gb_amount: milestone.gb_amount,
        payout_gb: existingClaim.payout_gb,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Compute incremental payout ──────────────────────────────────
    // total_paid_gb = sum of payout_gb from all delivered/approved/pending claims
    const { data: paidClaims } = await supabase
      .from("reward_claims")
      .select("payout_gb, status")
      .eq("user_id", user.id)
      .in("status", ["delivered", "approved_processing", "pending_admin"]);

    const totalPaidGb = (paidClaims || []).reduce(
      (sum, c) => sum + (Number(c.payout_gb) || 0), 0
    );

    const payoutGb = Math.max(0, milestone.gb_amount - totalPaidGb);

    if (payoutGb <= 0) {
      return errorResponse(
        "ALREADY_PAID",
        "You have already received the full reward for this milestone level. No additional payout is available."
      );
    }

    console.log(`[referral-submit-claim] Incremental payout: milestone_total=${milestone.gb_amount}GB, total_paid=${totalPaidGb}GB, payout=${payoutGb}GB`);

    // ── Create order + claim ────────────────────────────────────────
    const orderId = generateOrderId();
    console.log("[referral-submit-claim] Creating reward order:", orderId, "for", payoutGb, "GB (incremental)");

    const orderInsert = {
      order_id: orderId,
      user_id: user.id,
      network,
      recipient_number: normalisedPhone,
      bundle_size_gb: payoutGb, // INCREMENTAL payout, not milestone total
      amount_ghs: 0,
      payment_method: "reward",
      payment_status: "reward",
      order_source: "reward",
      order_type: "reward",
      status: "Pending Approval",
      customer_name: profile.full_name || null,
      delivery_note: `Referral reward claim. Milestone: ${milestone.gb_amount}GB total, Payout: ${payoutGb}GB (incremental). Awaiting admin approval.`,
    };

    const { data: newOrder, error: orderErr } = await supabase
      .from("orders")
      .insert(orderInsert)
      .select("id, order_id")
      .single();

    if (orderErr || !newOrder) {
      console.error("[referral-submit-claim] Order creation failed:", JSON.stringify(orderErr));
      return errorResponse("SERVER_ERROR", "Failed to create reward order. Please try again.", 500);
    }

    const { data: newClaim, error: claimErr } = await supabase
      .from("reward_claims")
      .insert({
        user_id: user.id,
        milestone_id,
        network,
        phone: normalisedPhone,
        linked_order_id: orderId,
        status: "pending_admin",
        payout_gb: payoutGb,
      })
      .select("id")
      .single();

    if (claimErr || !newClaim) {
      console.error("[referral-submit-claim] Claim creation failed:", JSON.stringify(claimErr));
      // Rollback order
      await supabase.from("orders").delete().eq("id", newOrder.id);
      return errorResponse("SERVER_ERROR", "Failed to create reward claim. Please try again.", 500);
    }

    // Link claim ID back to order
    await supabase
      .from("orders")
      .update({ reward_claim_id: newClaim.id })
      .eq("id", newOrder.id);

    // ── Audit log ───────────────────────────────────────────────────
    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      actor_email: user.email,
      action: "reward_claim_submitted",
      entity_type: "reward_claim",
      entity_id: newClaim.id,
      metadata: {
        milestone_id,
        milestone_total_gb: milestone.gb_amount,
        payout_gb: payoutGb,
        total_paid_gb: totalPaidGb,
        network,
        phone: normalisedPhone.replace(/\d{4}$/, "****"),
        order_id: orderId,
        referral_success_count: profile.referral_success_count,
      },
    }).then(() => {}, () => {}); // non-blocking

    console.log(`[referral-submit-claim] Success: user=${user.id} milestone=${milestone_id} (${milestone.gb_amount}GB total, ${payoutGb}GB payout) → order=${orderId} claim=${newClaim.id}`);

    return new Response(JSON.stringify({
      success: true,
      already_claimed: false,
      order_id: orderId,
      claim_id: newClaim.id,
      gb_amount: milestone.gb_amount,
      payout_gb: payoutGb,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[referral-submit-claim] Unhandled error:", err);
    return errorResponse("SERVER_ERROR", "Internal server error. Please try again.", 500);
  }
});
