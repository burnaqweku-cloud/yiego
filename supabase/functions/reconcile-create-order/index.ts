import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dispatchToSupplier, parseDispatchResult, shouldQueueOrder } from "../_shared/supplier-dispatch.ts";
import { checkDuplicateInFlightOrder } from "../_shared/duplicate-order-guard.ts";
import { validateNetworkMatch } from "../_shared/network-detect.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};




function generateOrderId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "YG-";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth: require admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const adminId = userData.user.id;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", adminId).in("role", ["admin"]);
    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { case_id, action } = body;

    if (!case_id) {
      return new Response(JSON.stringify({ error: "case_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the case
    const { data: reconCase, error: caseErr } = await supabase
      .from("reconciliation_cases").select("*, payment_events(*)").eq("id", case_id).single();
    if (caseErr || !reconCase) {
      return new Response(JSON.stringify({ error: "Case not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (reconCase.state === "resolved" || reconCase.state === "cancelled") {
      return new Response(JSON.stringify({ error: "Case already resolved/cancelled" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: CREATE ORDER ──
    if (action === "create_order") {
      const { network, bundle_size_gb, recipient_phone, product_id, amount_ghs, channel } = body;

      if (!network || !bundle_size_gb || !recipient_phone) {
        return new Response(JSON.stringify({ error: "network, bundle_size_gb, recipient_phone required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ─── Duplicate in-flight order guard ───
      const dupCheck = await checkDuplicateInFlightOrder(supabase, recipient_phone);
      if (dupCheck.blocked) {
        console.log(`[reconcile] Duplicate blocked: ${recipient_phone} → ${dupCheck.existingOrderId}`);
        return new Response(JSON.stringify({ error: dupCheck.message }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ─── Network mismatch guard ───
      const networkMismatch = validateNetworkMatch(recipient_phone, network);
      if (networkMismatch) {
        return new Response(JSON.stringify({ error: networkMismatch }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Idempotency: check if already linked to an order
      if (reconCase.linked_order_id) {
        return new Response(JSON.stringify({
          error: "already_linked",
          message: `Already linked to order ${reconCase.linked_order_id}`,
          linked_order_id: reconCase.linked_order_id,
        }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check if any order exists with same paystack reference
      const paymentRef = reconCase.payment_events?.provider_reference;
      if (paymentRef) {
        const { data: existingOrder } = await supabase
          .from("orders").select("order_id, status").eq("paystack_reference", paymentRef).maybeSingle();
        if (existingOrder) {
          return new Response(JSON.stringify({
            error: "already_linked",
            message: `Order ${existingOrder.order_id} already exists with this payment reference`,
            linked_order_id: existingOrder.order_id,
          }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // Log attempt
      await supabase.from("reconciliation_actions").insert({
        case_id, admin_id: adminId, action_type: "create_order_attempt",
        action_payload_json: { network, bundle_size_gb, recipient_phone, product_id, amount_ghs, channel },
      });

      const isAgentStore = (channel || reconCase.intended_channel) === "agent_store";
      const orderId = generateOrderId();
      const orderAmount = amount_ghs || reconCase.expected_order_amount || Number(reconCase.payment_events?.amount) || 0;

      let orderCreateError: string | null = null;

      if (isAgentStore && reconCase.intended_agent_id) {
        // Create agent_order — status starts as Processing
        const { error: agentOrderErr } = await supabase.from("agent_orders").insert({
          agent_id: reconCase.intended_agent_id,
          order_id: orderId,
          customer_phone: recipient_phone,
          customer_name: body.customer_name || null,
          network,
          bundle_size_gb,
          product_id: product_id || null,
          agent_selling_price: orderAmount,
          agent_cost_price: orderAmount,
          profit_ghs: 0,
          payment_method: "paystack",
          paystack_reference: paymentRef || null,
          payment_status: "paid",
          status: "Processing",
          order_source: "agent_store",
        });
        if (agentOrderErr) orderCreateError = agentOrderErr.message;
      } else {
        // Create normal order — status starts as Processing
        const { error: orderErr } = await supabase.from("orders").insert({
          order_id: orderId,
          user_id: reconCase.intended_user_id || null,
          recipient_number: recipient_phone,
          customer_name: body.customer_name || null,
          network,
          product_id: product_id || null,
          bundle_size_gb,
          amount_ghs: orderAmount,
          status: "Processing",
          payment_method: "paystack",
          payment_status: "paid",
          paystack_reference: paymentRef || null,
          order_source: "reconciliation",
        });
        if (orderErr) orderCreateError = orderErr.message;
      }

      if (orderCreateError) {
        await supabase.from("reconciliation_actions").insert({
          case_id, admin_id: adminId, action_type: "create_order_failed",
          error_message: orderCreateError,
        });
        return new Response(JSON.stringify({ success: false, error: "Order creation failed", detail: orderCreateError }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Bulk dispatch queue (feature-flagged; off → no-op, identical behavior)
      const reconTable: "orders" | "agent_orders" = isAgentStore ? "agent_orders" : "orders";
      if (await shouldQueueOrder(supabase, { order_id: orderId, network }, reconTable)) {
        await supabase.from(reconTable).update({ status: "Pending", queue_state: "queued" }).eq("order_id", orderId);
        return new Response(JSON.stringify({ success: true, order_id: orderId, status: "Pending", dispatch_mode: "manual_queue" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Send to supplier via main dispatch layer (routing + logging)
      const supplierResult = await dispatchToSupplier(supabase, {
        network, phone_number: recipient_phone, data_amount: String(bundle_size_gb),
      }, product_id || null, { orderId, createdBy: adminId });

      const rawResponse = JSON.stringify(supplierResult.body);

      if (supplierResult.ok) {
        const p = parseDispatchResult(supplierResult);
        if (isAgentStore) {
          // agent_orders lacks supplier_id, supplier_amount, supplier_remaining_balance
          await supabase.from("agent_orders").update({
            status: p.newStatus,
            supplier_order_id: p.supplierOrderId,
            supplier_reference: p.supplierReference,
            supplier_status: p.supplierStatus,
            supplier_message: p.supplierMessage,
            supplier_raw_response: rawResponse,
            supplier_timestamp: new Date().toISOString(),
          }).eq("order_id", orderId);
        } else {
          await supabase.from("orders").update({
            status: p.newStatus,
            supplier_order_id: p.supplierOrderId,
            supplier_reference: p.supplierReference,
            supplier_status: p.supplierStatus,
            supplier_message: p.supplierMessage,
            supplier_raw_response: rawResponse,
            supplier_id: p.supplierId,
            supplier_amount: p.supplierAmount,
            supplier_remaining_balance: p.supplierBalance,
            supplier_timestamp: new Date().toISOString(),
          }).eq("order_id", orderId);
        }
      } else {
        const reason = supplierResult.body.message || supplierResult.body.error || `Supplier HTTP ${supplierResult.status}`;
        if (isAgentStore) {
          await supabase.from("agent_orders").update({
            status: "Failed",
            supplier_raw_response: rawResponse,
            supplier_status: "failed",
            supplier_message: String(reason).slice(0, 500),
            supplier_timestamp: new Date().toISOString(),
          }).eq("order_id", orderId);
        } else {
          await supabase.from("orders").update({
            status: "Failed",
            failure_reason: String(reason).slice(0, 500),
            supplier_raw_response: rawResponse,
            supplier_status: "failed",
            supplier_message: String(reason).slice(0, 500),
            supplier_timestamp: new Date().toISOString(),
          }).eq("order_id", orderId);
        }
      }

      // Link case and mark resolved
      const markResolved = body.mark_resolved !== false;
      await supabase.from("reconciliation_cases").update({
        linked_order_id: orderId,
        ...(markResolved ? {
          state: "resolved",
          resolution_type: "created_order",
          resolved_by_admin_id: adminId,
          resolved_at: new Date().toISOString(),
        } : {}),
      }).eq("id", case_id);

      await supabase.from("reconciliation_actions").insert({
        case_id, admin_id: adminId, action_type: "create_order_success",
        action_payload_json: {
          order_id: orderId,
          supplier_success: supplierResult.ok,
          channel: isAgentStore ? "agent_store" : "normal_user",
        },
      });

      return new Response(JSON.stringify({
        success: true, order_id: orderId,
        supplier_success: supplierResult.ok,
        resolved: markResolved,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: REFUND WALLET ──
    if (action === "refund_wallet") {
      if (!reconCase.intended_user_id) {
        return new Response(JSON.stringify({ error: "No user to refund" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Idempotency
      if (reconCase.resolution_type === "refunded_wallet") {
        return new Response(JSON.stringify({ error: "Already refunded" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const refundAmount = reconCase.expected_order_amount || Number(reconCase.payment_events?.amount) || 0;
      if (refundAmount <= 0) {
        return new Response(JSON.stringify({ error: "Invalid refund amount" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("reconciliation_actions").insert({
        case_id, admin_id: adminId, action_type: "refund_wallet_attempt",
        action_payload_json: { amount: refundAmount, user_id: reconCase.intended_user_id },
      });

      // Credit wallet
      const { data: wallet } = await supabase
        .from("wallets").select("id, balance_ghs").eq("user_id", reconCase.intended_user_id).maybeSingle();

      if (wallet) {
        const newBalance = Number(wallet.balance_ghs) + refundAmount;
        await supabase.from("wallets").update({ balance_ghs: newBalance }).eq("id", wallet.id);
      } else {
        await supabase.from("wallets").insert({ user_id: reconCase.intended_user_id, balance_ghs: refundAmount });
      }

      // Log wallet transaction
      await supabase.from("wallet_transactions").insert({
        user_id: reconCase.intended_user_id,
        type: "refund",
        amount_ghs: refundAmount,
        status: "confirmed",
        reference: `RECON-REFUND-${case_id.slice(0, 8)}`,
        description: `Reconciliation refund for payment ${reconCase.payment_events?.provider_reference || "unknown"}`,
      });

      // Mark resolved
      await supabase.from("reconciliation_cases").update({
        state: "resolved",
        resolution_type: "refunded_wallet",
        resolved_by_admin_id: adminId,
        resolved_at: new Date().toISOString(),
      }).eq("id", case_id);

      await supabase.from("reconciliation_actions").insert({
        case_id, admin_id: adminId, action_type: "refund_wallet_success",
        action_payload_json: { amount: refundAmount },
      });

      return new Response(JSON.stringify({ success: true, refunded: refundAmount }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: MARK MANUAL REFUND ──
    if (action === "mark_manual_refund") {
      if (reconCase.resolution_type === "refunded_manual") {
        return new Response(JSON.stringify({ error: "Already marked" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("reconciliation_cases").update({
        state: "resolved",
        resolution_type: "refunded_manual",
        resolved_by_admin_id: adminId,
        resolved_at: new Date().toISOString(),
      }).eq("id", case_id);

      await supabase.from("reconciliation_actions").insert({
        case_id, admin_id: adminId, action_type: "mark_resolved",
        action_payload_json: { resolution_type: "refunded_manual", note: body.note || null },
      });

      if (body.note) {
        await supabase.from("reconciliation_notes").insert({
          case_id, admin_id: adminId, note_text: body.note,
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: RESOLVE / CANCEL / IN_REVIEW ──
    if (action === "update_state") {
      const { new_state, note } = body;
      if (!["in_review", "resolved", "cancelled"].includes(new_state)) {
        return new Response(JSON.stringify({ error: "Invalid state" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updates: Record<string, unknown> = { state: new_state };
      if (new_state === "resolved" || new_state === "cancelled") {
        updates.resolved_by_admin_id = adminId;
        updates.resolved_at = new Date().toISOString();
        if (new_state === "resolved") updates.resolution_type = "marked_no_action";
      }

      await supabase.from("reconciliation_cases").update(updates).eq("id", case_id);

      await supabase.from("reconciliation_actions").insert({
        case_id, admin_id: adminId,
        action_type: new_state === "resolved" ? "mark_resolved" : new_state === "cancelled" ? "mark_cancelled" : "assign_case",
        action_payload_json: { new_state, note: note || null },
      });

      if (note) {
        await supabase.from("reconciliation_notes").insert({ case_id, admin_id: adminId, note_text: note });
      }

      return new Response(JSON.stringify({ success: true, state: new_state }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: BULK STATE UPDATE ──
    if (action === "bulk_update_state") {
      const { case_ids, new_state } = body;
      if (!Array.isArray(case_ids) || case_ids.length === 0) {
        return new Response(JSON.stringify({ error: "case_ids array required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!["in_review", "resolved", "cancelled"].includes(new_state)) {
        return new Response(JSON.stringify({ error: "Invalid state" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updates: Record<string, unknown> = { state: new_state };
      if (new_state === "resolved" || new_state === "cancelled") {
        updates.resolved_by_admin_id = adminId;
        updates.resolved_at = new Date().toISOString();
        if (new_state === "resolved") updates.resolution_type = "marked_no_action";
      }

      const { error: bulkErr, count } = await supabase
        .from("reconciliation_cases")
        .update(updates)
        .in("id", case_ids)
        .in("state", ["open", "in_review"]);

      if (bulkErr) {
        return new Response(JSON.stringify({ error: "Bulk update failed", detail: bulkErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log bulk actions
      const actionRows = case_ids.map((cid: string) => ({
        case_id: cid, admin_id: adminId,
        action_type: new_state === "resolved" ? "mark_resolved" : new_state === "cancelled" ? "mark_cancelled" : "assign_case",
        action_payload_json: { new_state, bulk: true },
      }));
      await supabase.from("reconciliation_actions").insert(actionRows);

      return new Response(JSON.stringify({ success: true, updated: count || case_ids.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: ADD NOTE ──
    if (action === "add_note") {
      if (!body.note) {
        return new Response(JSON.stringify({ error: "note required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("reconciliation_notes").insert({
        case_id, admin_id: adminId, note_text: body.note,
      });

      await supabase.from("reconciliation_actions").insert({
        case_id, admin_id: adminId, action_type: "add_note",
        action_payload_json: { note: body.note.slice(0, 500) },
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[reconcile-create-order] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
