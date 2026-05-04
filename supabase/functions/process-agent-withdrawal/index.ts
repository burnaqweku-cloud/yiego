// deno-lint-ignore-file no-explicit-any
// Admin-triggered: initiates a Paystack Transfer for an approved agent withdrawal.
// JWT-verified, admin-only, idempotent, server-side only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAYSTACK_BASE = "https://api.paystack.co";

type SupabaseClient = any;

// Map Ghanaian network → Paystack mobile-money bank code
function mapNetworkToPaystackCode(network: string | null): string | null {
  switch ((network || "").toUpperCase()) {
    case "MTN":
      return "MTN";
    case "TELECEL":
    case "VODAFONE":
      return "VOD"; // Paystack still uses VOD for Telecel/Vodafone Cash
    case "AIRTELTIGO":
    case "AIRTEL":
    case "TIGO":
      return "ATL";
    default:
      return null;
  }
}

function normalizeGhanaPhone(raw: string): string {
  const cleaned = (raw || "").replace(/[^0-9]/g, "");
  if (cleaned.length === 12 && cleaned.startsWith("233")) return "0" + cleaned.slice(3);
  return cleaned;
}

async function logAudit(
  supabase: SupabaseClient,
  withdrawalId: string,
  actorId: string | null,
  action: string,
  details: Record<string, unknown> | null = null,
) {
  try {
    await supabase.from("withdrawal_audit_logs").insert({
      withdrawal_id: withdrawalId,
      actor_id: actorId,
      action,
      details,
    });
  } catch (e) {
    console.error("[process-agent-withdrawal] audit log failed (non-fatal):", e);
  }
}

async function paystackFetch(path: string, secret: string, init: RequestInit) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  console.log("[process-agent-withdrawal] ─── INCOMING ───", new Date().toISOString(), "method=", req.method);
  try {
    // ── 1. Auth: must be authenticated admin/staff ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[process-agent-withdrawal] missing/invalid Authorization header");
      return new Response(JSON.stringify({ success: false, error: "UNAUTHORIZED", message: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");

    if (!paystackSecret) {
      console.error("[process-agent-withdrawal] PAYSTACK_SECRET_KEY missing");
      return new Response(JSON.stringify({ success: false, error: "PAYSTACK_NOT_CONFIGURED", message: "Paystack secret is not configured on the server" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth client for identity, service client for writes
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabase = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "").trim();

    // Resolve caller identity. Try getClaims (fast, asymmetric-keys path) first;
    // fall back to getUser (network call to auth) if claim extraction fails for
    // any reason — this avoids opaque 401s that block agent auto-payouts.
    let callerUserId: string | null = null;
    let authPath = "getClaims";
    try {
      const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token);
      if (!claimsErr && claimsData?.claims?.sub) {
        callerUserId = claimsData.claims.sub as string;
      } else if (claimsErr) {
        console.warn("[process-agent-withdrawal] getClaims failed, will fall back to getUser:", claimsErr.message || claimsErr);
      }
    } catch (e) {
      console.warn("[process-agent-withdrawal] getClaims threw, will fall back to getUser:", e instanceof Error ? e.message : String(e));
    }

    if (!callerUserId) {
      authPath = "getUser";
      const { data: userData, error: userErr } = await authClient.auth.getUser(token);
      if (userErr || !userData?.user?.id) {
        console.error("[process-agent-withdrawal] auth resolution failed via both getClaims and getUser:", userErr?.message);
        return new Response(JSON.stringify({
          success: false,
          error: "UNAUTHORIZED",
          message: userErr?.message || "Could not validate your session. Please sign out and sign back in.",
        }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      callerUserId = userData.user.id;
    }
    console.log(`[process-agent-withdrawal] auth resolved via ${authPath} userId=${callerUserId}`);

    // Determine caller role: admin/staff OR the agent who owns the withdrawal
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUserId);
    const roles = (roleRows || []).map((r: { role: string }) => r.role);
    const isAdminOrStaff = roles.includes("admin") || roles.includes("staff");

    // Look up agent record for this user (may be null if not an agent)
    const { data: agentRow } = await supabase
      .from("agents")
      .select("id, status")
      .eq("user_id", callerUserId)
      .maybeSingle();
    const callerAgentId = (agentRow as { id?: string } | null)?.id ?? null;
    const callerAgentActive = (agentRow as { status?: string } | null)?.status === "active";

    if (!isAdminOrStaff && !callerAgentId) {
      console.error(`[process-agent-withdrawal] FORBIDDEN userId=${callerUserId} roles=${JSON.stringify(roles)} agent=null`);
      return new Response(JSON.stringify({ success: false, error: "FORBIDDEN", message: "Caller is not an admin, staff, or agent" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const adminUserId = callerUserId; // kept name for downstream audit log calls

    // ── 2a. Mode guard: refuse if Paystack withdrawals are disabled (manual mode) ──
    const { data: modeRow } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "withdrawals_paystack_enabled")
      .maybeSingle();
    const paystackModeEnabled = (modeRow as { value?: string } | null)?.value === "true";
    if (!paystackModeEnabled) {
      return new Response(JSON.stringify({
        success: false,
        error: "PAYSTACK_DISABLED",
        message: "Paystack payouts are disabled. Use 'Mark as Paid' for manual payouts.",
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Helper to stamp automation attempt + error onto the withdrawal row (best-effort)
    const stampAutomation = async (
      wid: string,
      error: string | null,
      extra: Record<string, unknown> = {},
    ) => {
      try {
        await supabase
          .from("agent_withdrawals")
          .update({
            automation_attempted: true,
            automation_attempted_at: new Date().toISOString(),
            automation_error: error,
            ...extra,
          })
          .eq("id", wid);
      } catch (e) {
        console.error("[process-agent-withdrawal] stampAutomation failed:", e);
      }
    };

    // ── 2b. Parse input ──
    const body = await req.json().catch(() => null);
    const withdrawalId: string | undefined = body?.withdrawal_id;
    if (!withdrawalId || typeof withdrawalId !== "string") {
      console.error("[process-agent-withdrawal] INVALID_INPUT body=", body);
      return new Response(JSON.stringify({ success: false, error: "INVALID_INPUT", message: "withdrawal_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[process-agent-withdrawal] processing withdrawalId=${withdrawalId}`);

    // ── 3. Load withdrawal + agent + payout profile ──
    const { data: withdrawalRaw, error: wErr } = await supabase
      .from("agent_withdrawals")
      .select("*")
      .eq("id", withdrawalId)
      .maybeSingle();

    if (wErr || !withdrawalRaw) {
      console.error(`[process-agent-withdrawal] WITHDRAWAL_NOT_FOUND id=${withdrawalId}`, wErr?.message);
      return new Response(JSON.stringify({ success: false, error: "WITHDRAWAL_NOT_FOUND", message: wErr?.message || "Withdrawal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const withdrawal = withdrawalRaw as Record<string, any>;
    console.log(`[process-agent-withdrawal] loaded withdrawal id=${withdrawalId} status=${withdrawal.status} mode=${withdrawal.payout_mode} agent=${withdrawal.agent_id}`);

    // Ownership guard — agent self-trigger may only touch their OWN withdrawal
    if (!isAdminOrStaff) {
      if (!callerAgentActive || withdrawal.agent_id !== callerAgentId) {
        console.error(`[process-agent-withdrawal] FORBIDDEN ownership callerAgent=${callerAgentId} active=${callerAgentActive} rowAgent=${withdrawal.agent_id}`);
        return new Response(JSON.stringify({ success: false, error: "FORBIDDEN", message: "You can only trigger payout for your own withdrawal" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Status guard — only pending / pending_review / approved can be paid out
    const allowedStatuses = ["pending", "pending_review", "approved"];
    if (!allowedStatuses.includes(withdrawal.status)) {
      return new Response(JSON.stringify({
        success: false,
        error: "INVALID_STATUS",
        message: `Withdrawal is already ${withdrawal.status}`,
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Per-row mode guard: refuse manual-mode rows even if global toggle flipped on
    if ((withdrawal.payout_mode as string | null) === "manual") {
      return new Response(JSON.stringify({
        success: false,
        error: "ROW_IS_MANUAL_MODE",
        message: "This withdrawal was created in manual mode and cannot be auto-paid.",
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Already-initiated guard
    if (withdrawal.paystack_transfer_reference) {
      return new Response(JSON.stringify({
        success: false,
        error: "ALREADY_INITIATED",
        message: "A Paystack transfer is already attached to this withdrawal.",
        transfer_reference: withdrawal.paystack_transfer_reference,
        transfer_status: withdrawal.paystack_transfer_status,
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // amount_ghs = receivable (sent to Paystack); fee stays with platform
    const amount = Number(withdrawal.amount_ghs);
    const fee = Number(withdrawal.withdrawal_fee_ghs ?? 0);
    const totalDeducted = amount + fee;
    if (!Number.isFinite(amount) || amount <= 0) {
      return new Response(JSON.stringify({ success: false, error: "INVALID_AMOUNT" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve account name + phone + network from saved payout profile if linked,
    // otherwise from the withdrawal row itself.
    let accountName = withdrawal.payout_momo_name as string | null;
    let accountNumber = withdrawal.momo_number as string;
    let network = (withdrawal.payout_network || withdrawal.momo_network) as string;
    let payoutProfileId = withdrawal.payout_profile_id as string | null;
    let cachedRecipientCode: string | null = null;

    if (payoutProfileId) {
      const { data: profileRaw } = await supabase
        .from("agent_payout_profiles")
        .select("*")
        .eq("id", payoutProfileId)
        .maybeSingle();
      const profile = profileRaw as Record<string, any> | null;
      if (profile) {
        accountName = profile.momo_name || accountName;
        accountNumber = profile.momo_number || accountNumber;
        network = profile.network || network;
        cachedRecipientCode = (profile.paystack_recipient_code as string) || null;
      }
    }

    if (!accountName || !accountNumber || !network) {
      return new Response(JSON.stringify({
        success: false,
        error: "PAYOUT_PROFILE_INCOMPLETE",
        message: "Account name, MoMo number, and network are required.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const psBankCode = mapNetworkToPaystackCode(network);
    if (!psBankCode) {
      return new Response(JSON.stringify({
        success: false,
        error: "UNSUPPORTED_NETWORK",
        message: `Network ${network} is not supported for automatic payouts.`,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    accountNumber = normalizeGhanaPhone(accountNumber);

    await logAudit(supabase, withdrawalId, adminUserId, "AUTO_PAYOUT_INITIATED", {
      amount,
      network,
      account_number_last4: accountNumber.slice(-4),
    });

    // ── 4. Resolve / create Paystack transfer recipient ──
    let recipientCode = cachedRecipientCode;

    if (!recipientCode) {
      const recipientPayload = {
        type: "mobile_money",
        name: accountName,
        account_number: accountNumber,
        bank_code: psBankCode,
        currency: "GHS",
      };

      const recipRes = await paystackFetch("/transferrecipient", paystackSecret, {
        method: "POST",
        body: JSON.stringify(recipientPayload),
      });

      if (!recipRes.ok || !recipRes.body?.status) {
        const errMsg = recipRes.body?.message || "Failed to create transfer recipient";
        console.error("[process-agent-withdrawal] recipient create failed:", recipRes.status, recipRes.body);
        await logAudit(supabase, withdrawalId, adminUserId, "AUTO_PAYOUT_RECIPIENT_FAILED", {
          status: recipRes.status,
          paystack_message: errMsg,
        });
        // Stamp automation_attempted + error on the row so admin sees why it didn't auto-pay.
        // Status remains 'pending' so admin can resolve (no fee was charged in manual mode;
        // in Paystack mode the fee was charged but the row never got a transfer reference,
        // so admin can choose to refund via Reject or pay manually).
        await stampAutomation(withdrawalId, `RECIPIENT_CREATE_FAILED: ${errMsg.slice(0, 240)}`, {
          paystack_raw_response: recipRes.body || { http_status: recipRes.status },
        });
        return new Response(JSON.stringify({
          success: false,
          error: "RECIPIENT_CREATE_FAILED",
          message: errMsg,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      recipientCode = recipRes.body.data?.recipient_code as string;

      // Cache it on the payout profile (best effort)
      if (recipientCode && payoutProfileId) {
        await supabase
          .from("agent_payout_profiles")
          .update({
            paystack_recipient_code: recipientCode,
            paystack_recipient_created_at: new Date().toISOString(),
          })
          .eq("id", payoutProfileId);
      }
    }

    if (!recipientCode) {
      return new Response(JSON.stringify({ success: false, error: "RECIPIENT_RESOLUTION_FAILED" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 5. Atomic lock: claim this withdrawal by writing a unique reference ──
    const transferReference = `AWD-${withdrawalId.slice(0, 8)}-${Date.now()}`;

    const { data: lockedRow, error: lockErr } = await supabase
      .from("agent_withdrawals")
      .update({
        paystack_transfer_reference: transferReference,
        paystack_recipient_code: recipientCode,
        status: "payout_processing",
        paystack_transfer_status: "initiated",
        payout_initiated_at: new Date().toISOString(),
      })
      .eq("id", withdrawalId)
      .in("status", allowedStatuses)
      .is("paystack_transfer_reference", null)
      .select("id")
      .maybeSingle();

    if (lockErr) {
      console.error("[process-agent-withdrawal] lock error:", lockErr);
      return new Response(JSON.stringify({ success: false, error: "LOCK_FAILED", message: lockErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!lockedRow) {
      // Someone else grabbed it (double-click race) — refuse cleanly
      return new Response(JSON.stringify({
        success: false,
        error: "ALREADY_PROCESSING",
        message: "Another payout attempt is already in progress for this withdrawal.",
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 6. Initiate Paystack transfer ──
    const transferPayload = {
      source: "balance",
      amount: Math.round(amount * 100), // pesewas
      recipient: recipientCode,
      reason: `DataSika agent withdrawal ${withdrawalId.slice(0, 8)}`,
      reference: transferReference,
      currency: "GHS",
    };

    const txRes = await paystackFetch("/transfer", paystackSecret, {
      method: "POST",
      body: JSON.stringify(transferPayload),
    });

    // Persist raw response for audit
    const rawResponse = txRes.body || { http_status: txRes.status };

    if (!txRes.ok || !txRes.body?.status) {
      const errMsg = txRes.body?.message || "Paystack transfer initiation failed";
      console.error("[process-agent-withdrawal] transfer failed:", txRes.status, txRes.body);

      await supabase
        .from("agent_withdrawals")
        .update({
          status: "payout_failed",
          paystack_transfer_status: "failed",
          payout_failure_reason: errMsg,
          paystack_raw_response: rawResponse,
          automation_attempted: true,
          automation_attempted_at: new Date().toISOString(),
          automation_error: `TRANSFER_FAILED: ${errMsg.slice(0, 240)}`,
        })
        .eq("id", withdrawalId);

      // Auto-refund: credit FULL deduction (amount + fee) back, idempotent
      try {
        const { data: existingRefund } = await supabase
          .from("agent_wallet_transactions")
          .select("id")
          .eq("reference", `auto-refund-${withdrawalId}`)
          .maybeSingle();

        if (!existingRefund) {
          const { data: walletRaw } = await supabase
            .from("agent_wallets")
            .select("id, available_balance")
            .eq("agent_id", withdrawal.agent_id)
            .maybeSingle();
          const wallet = walletRaw as Record<string, any> | null;
          if (wallet) {
            await supabase
              .from("agent_wallets")
              .update({ available_balance: Number(wallet.available_balance) + totalDeducted })
              .eq("id", wallet.id);

            await supabase.from("agent_wallet_transactions").insert({
              agent_id: withdrawal.agent_id,
              type: "withdrawal_reversed",
              amount_ghs: totalDeducted,
              description: `Withdrawal payout failed — GHS ${totalDeducted.toFixed(2)} restored (incl. GHS ${fee.toFixed(2)} fee). Reason: ${errMsg.slice(0, 160)}`,
              reference: `auto-refund-${withdrawalId}`,
              status: "completed",
            });
          }
        }
      } catch (refundErr) {
        console.error("[process-agent-withdrawal] auto-refund failed:", refundErr);
      }

      await logAudit(supabase, withdrawalId, adminUserId, "AUTO_PAYOUT_FAILED", {
        paystack_message: errMsg,
        http_status: txRes.status,
      });

      return new Response(JSON.stringify({
        success: false,
        error: "TRANSFER_FAILED",
        message: errMsg,
        auto_refunded: true,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Success path — record transfer details, status remains payout_processing
    // until webhook delivers transfer.success
    const transferData = txRes.body.data || {};
    const transferCode = transferData.transfer_code as string | null;
    const transferId = transferData.id ? Number(transferData.id) : null;
    const psStatus = (transferData.status as string) || "pending";

    // Map Paystack status → our internal status
    let internalStatus = "payout_processing";
    let payoutCompletedAt: string | null = null;
    if (psStatus === "success") {
      internalStatus = "paid";
      payoutCompletedAt = new Date().toISOString();
    } else if (psStatus === "failed" || psStatus === "reversed") {
      internalStatus = "payout_failed";
    }

    await supabase
      .from("agent_withdrawals")
      .update({
        status: internalStatus,
        paystack_transfer_code: transferCode,
        paystack_transfer_id: transferId,
        paystack_transfer_status: psStatus,
        paystack_raw_response: rawResponse,
        payout_completed_at: payoutCompletedAt,
        automation_attempted: true,
        automation_attempted_at: new Date().toISOString(),
        automation_error: null,
      })
      .eq("id", withdrawalId);

    await logAudit(supabase, withdrawalId, adminUserId, "AUTO_PAYOUT_SUBMITTED", {
      transfer_code: transferCode,
      transfer_id: transferId,
      paystack_status: psStatus,
      internal_status: internalStatus,
    });

    return new Response(JSON.stringify({
      success: true,
      withdrawal_id: withdrawalId,
      transfer_reference: transferReference,
      transfer_code: transferCode,
      transfer_status: psStatus,
      internal_status: internalStatus,
      message: psStatus === "success"
        ? "Payout completed."
        : "Payout submitted. Awaiting Paystack confirmation.",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[process-agent-withdrawal] uncaught:", err);
    return new Response(JSON.stringify({
      success: false,
      error: "SERVER_ERROR",
      message: err instanceof Error ? err.message : String(err),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
