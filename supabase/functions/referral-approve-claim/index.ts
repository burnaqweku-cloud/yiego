import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logSecurityEvent, extractClientIp } from "../_shared/check-security.ts";
import { dispatchToSupplier, parseDispatchResult, logDispatchAttempt, shouldQueueOrder } from "../_shared/supplier-dispatch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify admin/staff
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "staff"]);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { claim_id, action, rejection_reason } = body;

    // Log admin action to security_events
    const clientIp = extractClientIp(req);
    logSecurityEvent(supabase, `admin_referral_${action}`, {
      userId: user.id, ip: clientIp,
      meta: { claim_id, action },
    });

    if (!claim_id || !action || !["approve", "reject", "retry"].includes(action)) {
      return new Response(JSON.stringify({ error: "claim_id and valid action required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch claim + milestone GB amount
    const { data: claim } = await supabase
      .from("reward_claims")
      .select("*, reward_milestones(gb_amount)")
      .eq("id", claim_id)
      .maybeSingle();

    if (!claim) {
      return new Response(JSON.stringify({ error: "Claim not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── REJECT ────────────────────────────────────────────────────────────────
    if (action === "reject") {
      if (!rejection_reason || rejection_reason.trim().length < 3) {
        return new Response(JSON.stringify({ error: "rejection_reason required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("reward_claims").update({
        status: "rejected",
        rejection_reason: rejection_reason.trim(),
      }).eq("id", claim_id);

      if (claim.linked_order_id) {
        await supabase.from("orders").update({
          status: "Rejected",
          failure_reason: rejection_reason.trim(),
        }).eq("order_id", claim.linked_order_id);
      }

      return new Response(JSON.stringify({ success: true, action: "rejected" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── APPROVE / RETRY ───────────────────────────────────────────────────────
    if (action === "approve" || action === "retry") {
      const orderId = claim.linked_order_id;

      if (!orderId) {
        return new Response(JSON.stringify({ error: "Claim has no linked order" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch the linked order to get delivery details
      const { data: order } = await supabase
        .from("orders")
        .select("order_id, network, recipient_number, bundle_size_gb, status, supplier_reference, product_id")
        .eq("order_id", orderId)
        .maybeSingle();

      if (!order) {
        return new Response(JSON.stringify({ error: "Linked order not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Idempotency: if already delivered, skip
      if (order.status === "Delivered") {
        return new Response(JSON.stringify({ success: true, action: "already_delivered", message: "Order already delivered." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check for existing successful dispatch to prevent double delivery
      const { data: successfulDispatch } = await supabase
        .from("order_dispatch_attempts")
        .select("id")
        .eq("order_id", orderId)
        .eq("success", true)
        .limit(1)
        .maybeSingle();

      if (successfulDispatch && action !== "retry") {
        return new Response(JSON.stringify({ success: true, action: "already_submitted", message: "Supplier already contacted successfully. Use retry to force re-submit." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Re-verify incremental payout before approval ──────────────
      const milestoneTotalGb = (claim.reward_milestones as { gb_amount: number } | null)?.gb_amount ?? 0;
      
      const { data: paidClaims } = await supabase
        .from("reward_claims")
        .select("payout_gb, status, id")
        .eq("user_id", claim.user_id)
        .in("status", ["delivered"])
        .neq("id", claim_id);

      const totalPaidGb = (paidClaims || []).reduce(
        (sum: number, c: { payout_gb: number | null }) => sum + (Number(c.payout_gb) || 0), 0
      );

      const verifiedPayoutGb = Math.max(0, milestoneTotalGb - totalPaidGb);

      if (verifiedPayoutGb <= 0) {
        await supabase.from("reward_claims").update({
          status: "rejected",
          rejection_reason: "Already fully paid for this milestone level.",
        }).eq("id", claim_id);

        return new Response(JSON.stringify({
          success: false,
          error: "User has already been fully paid for this milestone level.",
          action: "auto_rejected",
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update claim payout_gb with verified amount (in case it changed)
      if (verifiedPayoutGb !== Number(claim.payout_gb)) {
        await supabase.from("reward_claims").update({ payout_gb: verifiedPayoutGb }).eq("id", claim_id);
      }

      // Also update order bundle_size_gb to match verified payout
      if (order.bundle_size_gb !== verifiedPayoutGb) {
        await supabase.from("orders").update({
          bundle_size_gb: verifiedPayoutGb,
          delivery_note: `Referral reward. Milestone: ${milestoneTotalGb}GB total, Payout: ${verifiedPayoutGb}GB (incremental, verified at approval).`,
        }).eq("order_id", orderId);
      }

      // Step 1: Mark claim as approved_processing and order as Processing
      const nowIso = new Date().toISOString();
      await Promise.all([
        supabase.from("reward_claims").update({ status: "approved_processing" }).eq("id", claim_id),
        supabase.from("orders").update({
          status: "Processing",
          admin_notes: `Approved by admin at ${nowIso}. Payout: ${verifiedPayoutGb}GB (incremental).`,
        }).eq("order_id", orderId),
      ]);

      console.log(`[referral-approve-claim] Claim ${claim_id} approved → order ${orderId} set to Processing. Payout: ${verifiedPayoutGb}GB. Dispatching via central routing...`);

      // Bulk dispatch queue (feature-flagged; off → no-op, identical behavior)
      if (await shouldQueueOrder(supabase, { order_id: orderId, network: order.network }, "orders")) {
        await supabase.from("orders").update({ status: "Pending", queue_state: "queued" }).eq("order_id", orderId);
        console.log(`[referral-approve-claim] Reward order ${orderId} queued for manual dispatch`);
        return new Response(JSON.stringify({ success: true, order_id: orderId, status: "Pending", dispatch_mode: "manual_queue" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
        });
      }

      // Step 2: Dispatch through the CENTRAL supplier routing pipeline
      const supplierPayload = {
        network: order.network,
        phone_number: order.recipient_number,
        data_amount: String(verifiedPayoutGb),
      };

      const result = await dispatchToSupplier(supabase, supplierPayload, order.product_id, {
        orderId: orderId,
        createdBy: `admin:${user.id}`,
      });

      const parsed = parseDispatchResult(result);
      const rawResponse = JSON.stringify(result.body);

      if (result.ok) {
        await supabase.from("orders").update({
          status: "Processing",
          supplier_order_id: parsed.supplierOrderId,
          supplier_reference: parsed.supplierOrderId,
          supplier_status: parsed.supplierStatus,
          supplier_message: parsed.supplierMessage,
          supplier_amount: parsed.supplierAmount,
          supplier_remaining_balance: parsed.supplierBalance,
          supplier_timestamp: nowIso,
          supplier_raw_response: rawResponse,
          supplier_id: parsed.supplierId,
        }).eq("order_id", orderId);

        console.log(`[referral-approve-claim] Supplier (${parsed.supplierCode}) accepted order ${orderId}. supplier_order_id=${parsed.supplierOrderId}, payout=${verifiedPayoutGb}GB`);

        return new Response(JSON.stringify({
          success: true,
          action: "approved",
          delivery_triggered: true,
          supplier_order_id: parsed.supplierOrderId,
          supplier_status: parsed.supplierStatus,
          payout_gb: verifiedPayoutGb,
          message: `Approved. Delivering ${verifiedPayoutGb}GB (incremental). Order is Processing.`,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      } else {
        const failureReason = String(
          result.body.message || result.body.error || `Supplier returned HTTP ${result.status}`
        ).slice(0, 500);

        await Promise.all([
          supabase.from("orders").update({
            status: "Failed",
            failure_reason: failureReason,
            supplier_raw_response: rawResponse,
            supplier_status: "failed",
            supplier_message: failureReason,
            supplier_timestamp: nowIso,
            supplier_id: parsed.supplierId,
          }).eq("order_id", orderId),
          supabase.from("reward_claims").update({
            status: "failed",
          }).eq("id", claim_id),
        ]);

        console.error(`[referral-approve-claim] Supplier (${parsed.supplierCode}) rejected order ${orderId}: ${failureReason}`);

        return new Response(JSON.stringify({
          success: false,
          action: "approved_but_delivery_failed",
          delivery_triggered: true,
          failure_reason: failureReason,
          message: `Approved but supplier delivery failed: ${failureReason}`,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[referral-approve-claim] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});