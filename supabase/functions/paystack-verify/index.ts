// deno-lint-ignore-file no-explicit-any
// Bulk dispatch queue gate active (Phase 2 activation 2026-04-30)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processReferralQualification } from "../_shared/referral-qualify.ts";
import { handleOrderCreationFailure } from "../_shared/reconciliation.ts";
import { upsertReconciliationCase } from "../_shared/payment-reconciliation.ts";
import { logSupplierSpend } from "../_shared/supplier-ledger.ts";
import { dispatchToSupplier, parseDispatchResult, shouldQueueOrder } from "../_shared/supplier-dispatch.ts";
import { creditAgentProfit, reverseAgentProfit } from "../_shared/agent-profit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Validation helpers ─────────────────────────────────────
const MAX_REFERENCE_LEN = 150;

function sanitizeReference(val: unknown): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim().slice(0, MAX_REFERENCE_LEN);
  // Only allow alphanumeric, dashes, underscores, dots
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(trimmed)) return null;
  return trimmed || null;
}

/** Log a security event (fire-and-forget) */
async function logSecurityEventLocal(supabase: any, eventType: string, severity: string, details: Record<string, unknown>) {
  try {
    await supabase.from("security_event_logs").insert({
      event_type: eventType,
      severity,
      user_id: details.user_id || null,
      agent_id: details.agent_id || null,
      order_id: details.order_id || null,
      payment_reference: details.payment_reference || null,
      details,
    });
  } catch (e) {
    console.error("[security-log] Failed:", e);
  }
}

async function processPayment(supabase: any, reference: string, paystackData: Record<string, unknown>) {
  const { data: payment } = await supabase.from("paystack_payments").select("*").eq("reference", reference).maybeSingle();
  if (!payment) {
    console.error("[processPayment] No payment record for reference:", reference);
    return { processed: false, reason: "Payment record not found" };
  }
  if (payment.status === "success" || payment.status === "completed") {
    console.log("[processPayment] Already processed:", reference);
    if (payment.purpose === "deposit" && payment.user_id) {
      const { data: wallet } = await supabase.from("wallets").select("balance_ghs").eq("user_id", payment.user_id as string).maybeSingle();
      return {
        processed: true, already_done: true, purpose: "deposit",
        amount_credited: Number(payment.amount_ghs),
        new_balance: wallet ? Number(wallet.balance_ghs) : null,
        reference: payment.reference,
        timestamp: payment.verified_at || payment.paid_at || new Date().toISOString(),
      };
    }
    return { processed: true, already_done: true, purpose: payment.purpose, order_id: payment.linked_order_id };
  }

  const txData = paystackData;
  const channel = txData.channel as string || null;
  const customerEmail = (txData.customer as Record<string, unknown>)?.email as string || null;
  const paidAt = txData.paid_at as string || null;
  const totalPaidGhs = (Number(txData.amount) || 0) / 100;

  // ── SECURITY: Verify paid amount matches expected amount ──
  const expectedTotal = Number(payment.total_paid) || (Number(payment.amount_ghs) + Number(payment.processing_fee || 0));
  const amountDiff = Math.abs(totalPaidGhs - expectedTotal);
  if (amountDiff > 0.02) {
    console.error(`[processPayment] PAYMENT_AMOUNT_MISMATCH: ref=${reference} paid=GHS${totalPaidGhs} expected=GHS${expectedTotal} diff=GHS${amountDiff}`);
    await logSecurityEventLocal(supabase, "PAYMENT_AMOUNT_MISMATCH", "critical", {
      payment_reference: reference,
      user_id: payment.user_id,
      purpose: payment.purpose,
      paid_amount: totalPaidGhs,
      expected_amount: expectedTotal,
      difference: amountDiff,
    });
    return { processed: false, reason: "Payment amount does not match expected amount" };
  }

  // amountGhs for deposit crediting = base amount (excluding processing fee)
  const storedProcessingFee = Number(payment.processing_fee) || 0;
  const amountGhs = storedProcessingFee > 0 ? Math.round((totalPaidGhs - storedProcessingFee) * 100) / 100 : totalPaidGhs;

  // ── ATOMIC: Only update if still pending (prevents race with webhook) ──
  const { data: updatedPayment, error: updateErr } = await supabase.from("paystack_payments").update({
    status: "success", channel, customer_email: customerEmail, paid_at: paidAt,
    verified_at: new Date().toISOString(), raw_response: txData,
  }).eq("reference", reference).neq("status", "success").select("id").maybeSingle();

  if (updateErr) {
    console.error("[processPayment] Failed to update payment status:", updateErr);
  }

  // If no row was updated, another process already claimed this payment
  if (!updatedPayment) {
    console.log("[processPayment] Race condition detected — already processed by another path:", reference);
    await logSecurityEventLocal(supabase, "DUPLICATE_PAYMENT_PROCESSING_BLOCKED", "medium", {
      payment_reference: reference, user_id: payment.user_id, purpose: payment.purpose,
    });
    if (payment.purpose === "deposit" && payment.user_id) {
      const { data: wallet } = await supabase.from("wallets").select("balance_ghs").eq("user_id", payment.user_id as string).maybeSingle();
      return {
        processed: true, already_done: true, purpose: "deposit",
        amount_credited: Number(payment.amount_ghs),
        new_balance: wallet ? Number(wallet.balance_ghs) : null,
        reference: payment.reference,
        timestamp: new Date().toISOString(),
      };
    }
    return { processed: true, already_done: true, purpose: payment.purpose, order_id: payment.linked_order_id };
  }

  if (payment.purpose === "deposit") return await processDeposit(supabase, payment, amountGhs);
  if (payment.purpose === "order") return await processOrder(supabase, payment);
  if (payment.purpose === "agent_activation") return await processAgentActivation(supabase, payment, txData);
  if (payment.purpose === "agent_order") return await processAgentOrder(supabase, payment);
  if (payment.purpose === "agent_subscription") return await processAgentSubscription(supabase, payment, txData);

  return { processed: true, purpose: payment.purpose, order_id: payment.linked_order_id };
}

async function processDeposit(supabase: any, payment: Record<string, unknown>, amountGhs: number) {
  const userId = payment.user_id as string;
  const walletTxnId = payment.linked_wallet_txn_id as string;
  const reference = payment.reference as string;
  
  console.log(`[processDeposit] userId=${userId}, walletTxnId=${walletTxnId}, amount=${amountGhs}, ref=${reference}`);
  
  if (!userId) {
    console.error("[processDeposit] No user_id for deposit");
    return { processed: false, reason: "No user for deposit" };
  }

  if (walletTxnId) {
    const { data: t } = await supabase.from("wallet_transactions").select("status").eq("id", walletTxnId).maybeSingle();
    if (t?.status === "confirmed") {
      console.log("[processDeposit] Already confirmed, returning current balance");
      const { data: wallet } = await supabase.from("wallets").select("balance_ghs").eq("user_id", userId).maybeSingle();
      return {
        processed: true, already_done: true, purpose: "deposit",
        amount_credited: amountGhs,
        new_balance: wallet ? Number(wallet.balance_ghs) : null,
        reference,
        timestamp: new Date().toISOString(),
      };
    }
    const { error: txnErr } = await supabase.from("wallet_transactions").update({ status: "confirmed" }).eq("id", walletTxnId);
    if (txnErr) console.error("[processDeposit] Failed to update wallet_transaction:", txnErr);
    else console.log("[processDeposit] Wallet transaction marked confirmed:", walletTxnId);
  }

  const { data: wallet } = await supabase.from("wallets").select("id, balance_ghs").eq("user_id", userId).maybeSingle();
  let newBalance: number;
  
  if (wallet) {
    newBalance = Number(wallet.balance_ghs) + amountGhs;
    const { error: walletErr } = await supabase.from("wallets").update({ balance_ghs: newBalance }).eq("id", wallet.id);
    if (walletErr) {
      console.error("[processDeposit] CRITICAL: Failed to credit wallet:", walletErr);
      return { processed: false, reason: "Failed to credit wallet" };
    }
    console.log(`[processDeposit] Wallet credited: GHS ${amountGhs} -> new balance: GHS ${newBalance}`);
  } else {
    newBalance = amountGhs;
    const { error: insertErr } = await supabase.from("wallets").insert({ user_id: userId, balance_ghs: amountGhs });
    if (insertErr) {
      console.error("[processDeposit] CRITICAL: Failed to create wallet:", insertErr);
      return { processed: false, reason: "Failed to create wallet" };
    }
    console.log(`[processDeposit] New wallet created with GHS ${amountGhs}`);
  }

  // Update payment_intent: mark deposit fulfilled by verify
  await supabase.from("payment_intents")
    .update({ order_created: true, payment_status: "success", fulfilled_by: "verify", fulfilled_at: new Date().toISOString() })
    .eq("paystack_reference", reference);

  return {
    processed: true,
    purpose: "deposit",
    amount_credited: amountGhs,
    new_balance: newBalance,
    reference,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Process order AFTER payment verification.
 * Creates the order record from checkout_meta if it doesn't exist yet (deferred creation).
 */
async function processOrder(supabase: any, payment: Record<string, unknown>) {
  const orderId = payment.linked_order_id as string;
  if (!orderId) return { processed: false, reason: "No order" };

  // Check if order already exists (idempotency for legacy orders or webhook+verify race)
  let order: Record<string, unknown> | null = null;
  const { data: existingOrder } = await supabase.from("orders").select("*").eq("order_id", orderId).maybeSingle();

  if (existingOrder) {
    order = existingOrder;
    if (["Processing", "Delivered"].includes(existingOrder.status as string)) {
      return {
        processed: true, already_done: true, purpose: "order",
        order_id: orderId, order_status: existingOrder.status,
        network: existingOrder.network, bundle_size_gb: existingOrder.bundle_size_gb,
        recipient_phone: existingOrder.recipient_number, amount_ghs: existingOrder.amount_ghs,
      };
    }
    // Order exists but not yet processed - update status to Paid
    await supabase.from("orders").update({ status: "Paid", payment_status: "paid", payment_method: "paystack" }).eq("order_id", orderId);
  } else {
    // Create the order from checkout_meta (deferred creation after payment)
    const meta = payment.checkout_meta as Record<string, unknown> | null;
    if (!meta) {
      console.error("[processOrder] No checkout_meta and no existing order for:", orderId);
      return { processed: false, reason: "No checkout metadata for order creation" };
    }

    console.log(`[processOrder] Creating order ${orderId} from checkout_meta after payment verification`);

    const { data: newOrder, error: orderErr } = await supabase.from("orders").insert({
      order_id: orderId,
      user_id: meta.user_id || null,
      recipient_number: meta.recipient_phone,
      customer_name: meta.customer_name || null,
      network: meta.network,
      product_id: meta.product_id,
      bundle_size_gb: meta.bundle_size_gb,
      amount_ghs: meta.amount_ghs,
      processing_fee: meta.processing_fee || 0,
      total_paid: meta.total_paid || meta.amount_ghs,
      cost_price_ghs: meta.cost_price_ghs,
      markup_percent: meta.markup_percent,
      profit_ghs: meta.profit_ghs,
      status: "Paid",
      payment_method: "paystack",
      payment_status: "paid",
      paystack_reference: payment.reference as string,
    }).select().maybeSingle();

    if (orderErr) {
      // Could be duplicate from webhook/verify race - try fetching again
      if (orderErr.code === "23505") {
        const { data: raceOrder } = await supabase.from("orders").select("*").eq("order_id", orderId).maybeSingle();
        if (raceOrder) {
          order = raceOrder;
          if (["Processing", "Delivered"].includes(raceOrder.status as string)) {
            return {
              processed: true, already_done: true, purpose: "order",
              order_id: orderId, order_status: raceOrder.status,
              network: raceOrder.network, bundle_size_gb: raceOrder.bundle_size_gb,
              recipient_phone: raceOrder.recipient_number, amount_ghs: raceOrder.amount_ghs,
            };
          }
        }
      } else {
      console.error("[processOrder] Failed to create order:", orderErr);
        // ── Reconciliation: payment succeeded but order creation failed ──
        await handleOrderCreationFailure(supabase, payment, `Order insert failed: ${orderErr.message}`, "normal_user");
        await upsertReconciliationCase(supabase, payment, `Order insert failed: ${orderErr.message}`, "normal_user");
        return { processed: false, reason: "Failed to create order" };
      }
    } else {
      order = newOrder;
    }
  }

  if (!order) {
    const { data: refetchOrder } = await supabase.from("orders").select("*").eq("order_id", orderId).maybeSingle();
    order = refetchOrder;
  }
  if (!order) return { processed: false, reason: "Order not found after creation" };

  // Update payment_intent: mark order as created + fulfilled by verify
  const ref = payment.reference as string;
  if (ref) {
    await supabase.from("payment_intents")
      .update({ order_created: true, order_id: orderId, payment_status: "success", fulfilled_by: "verify", fulfilled_at: new Date().toISOString() })
      .eq("paystack_reference", ref)
      .then(({ error: e }: { error: any }) => { if (e) console.error("[processOrder] intent update failed (non-fatal):", e); });
  }

  console.log(`Order ${orderId} marked Paid, submitting to supplier...`);

  // Bulk dispatch queue gate (master switch = feature flag + manual_bulk mode)
  if (await shouldQueueOrder(supabase, { order_id: orderId as string, network: order.network as string }, "orders")) {
    console.log(`[verify][queue] Order ${orderId} queued (flag+manual_bulk active), staying as Pending`);
    await supabase.from("orders").update({ status: "Pending", queue_state: "queued" }).eq("order_id", orderId);
    return {
      processed: true,
      order_id: orderId,
      status: "Pending",
      dispatch_mode: "manual_queue",
      message: "Order queued for manual bulk dispatch",
    };
  }

  const startTime = Date.now();
  const result = await dispatchToSupplier(supabase, {
    network: order.network as string,
    phone_number: order.recipient_number as string,
    data_amount: String(order.bundle_size_gb),
  }, order.product_id as string | null, { orderId: orderId as string });
  const responseTimeMs = Date.now() - startTime;
  const rawResponse = JSON.stringify(result.body);

  await supabase.from("supplier_api_logs").insert({
    order_id: orderId,
    request_payload: { network: order.network, phone_number: order.recipient_number, data_amount: String(order.bundle_size_gb) },
    response_body: result.body,
    response_status: String(result.status),
    response_time_ms: responseTimeMs,
    success: result.ok,
    error_message: result.ok ? null : String(result.body.message || result.body.error || "Unknown error"),
    supplier_balance: (result.body.remaining_balance ?? result.body.remainingBalance) != null
      ? Number(result.body.remaining_balance ?? result.body.remainingBalance)
      : null,
  });

  // ── Referral Qualification Hook ─────────────────────────────
  const userId = order.user_id as string | null;
  if (userId) {
    await processReferralQualification(supabase, userId, orderId, {
      amount: Number(order.amount_ghs) || undefined,
      network: order.network as string,
      bundle: `${order.bundle_size_gb}GB`,
      order_source: (order.order_source as string) || "paystack_verify",
    });
  }
  // ──────────────────────────────────────────────────────────

  if (result.ok) {
    const p = parseDispatchResult(result);
    await supabase.from("orders").update({
      status: "Processing",
      supplier_order_id: p.supplierOrderId,
      supplier_reference: p.supplierReference,
      supplier_status: p.supplierStatus,
      supplier_message: p.supplierMessage,
      supplier_amount: p.supplierAmount,
      supplier_remaining_balance: p.supplierBalance,
      supplier_timestamp: new Date().toISOString(),
      supplier_raw_response: rawResponse,
      supplier_id: p.supplierId,
    }).eq("order_id", orderId);

    // ── Supplier Shadow Wallet: log spend ──
    const costPrice = Number(order.cost_price_ghs) || Number(order.amount_ghs) || 0;
    await logSupplierSpend(supabase, orderId, costPrice, {
      network: order.network as string, bundle_size_gb: order.bundle_size_gb as number | string,
      recipient: order.recipient_number as string, supplier_order_id: p.supplierOrderId,
    });
    return {
      processed: true, purpose: "order", order_id: orderId, order_status: p.newStatus,
      network: order.network, bundle_size_gb: order.bundle_size_gb,
      recipient_phone: order.recipient_number, amount_ghs: order.amount_ghs,
    };
  } else {
    const reason = result.body.message || result.body.error || `Supplier HTTP ${result.status}`;
    await supabase.from("orders").update({
      status: "Processing",
      failure_reason: String(reason).slice(0, 500),
      supplier_raw_response: rawResponse,
      supplier_status: "failed",
      supplier_message: String(reason).slice(0, 500),
      supplier_timestamp: new Date().toISOString(),
      supplier_id: result.supplierId,
    }).eq("order_id", orderId);
    console.error(`Order ${orderId} supplier ${result.supplierCode} failed, keeping as Processing:`, reason);
    return {
      processed: true, purpose: "order", order_id: orderId, order_status: "Processing",
      network: order.network, bundle_size_gb: order.bundle_size_gb,
      recipient_phone: order.recipient_number, amount_ghs: order.amount_ghs,
    };
  }
}

// processReferralSuccess removed — replaced by shared processReferralQualification in _shared/referral-qualify.ts

async function processAgentActivation(supabase: any, payment: Record<string, unknown>, txData: Record<string, unknown>) {
  const agentId = (txData.metadata as Record<string, unknown>)?.agent_id as string;
  if (!agentId) return { processed: false, reason: "No agent_id" };

  await supabase.from("agents").update({
    status: "active", activation_paid: true,
    activation_paid_at: new Date().toISOString(),
    activation_reference: payment.reference as string,
  }).eq("id", agentId);

  return { processed: true, purpose: "agent_activation" };
}

async function processAgentSubscription(supabase: any, payment: Record<string, unknown>, txData: Record<string, unknown>) {
  const reference = payment.reference as string;
  const meta = txData.metadata as Record<string, unknown> | null;
  const agentId = meta?.agent_id as string;
  const intentId = meta?.intent_id as string;
  // Legacy: support old subscription_id for backward compat
  const legacySubscriptionId = meta?.subscription_id as string;
  const plan = (meta?.plan as string) || "monthly";

  console.log(`[processAgentSubscription] ref=${reference}, agentId=${agentId}, intentId=${intentId}, plan=${plan}`);

  if (!agentId) {
    console.error("[processAgentSubscription] No agent_id in metadata");
    return { processed: false, reason: "No agent_id in metadata" };
  }

  // ── SECURITY: Strict subscription amount verification ──
  // Canonical prices for subscription plans
  const PLAN_PRICES: Record<string, { standard: number; promo: number }> = {
    monthly: { standard: 50, promo: 35 },
    yearly: { standard: 250, promo: 185 },
  };
  const planConfig = PLAN_PRICES[plan];
  if (!planConfig) {
    console.error(`[processAgentSubscription] Unknown plan: ${plan}`);
    await logSecurityEventLocal(supabase, "SUBSCRIPTION_INVALID_PLAN", "high", {
      agent_id: agentId, payment_reference: reference, plan,
    });
    return { processed: false, reason: "Unknown subscription plan" };
  }

  const paidAmountGhs = (Number(txData.amount) || 0) / 100;
  const storedProcessingFee = Number(payment.processing_fee) || 0;
  const baseAmountPaid = storedProcessingFee > 0
    ? Math.round((paidAmountGhs - storedProcessingFee) * 100) / 100
    : paidAmountGhs;

  // Accept either standard or promo price (within tolerance)
  const isStandardMatch = Math.abs(baseAmountPaid - planConfig.standard) <= 0.02;
  const isPromoMatch = Math.abs(baseAmountPaid - planConfig.promo) <= 0.02;

  if (!isStandardMatch && !isPromoMatch) {
    console.error(`[processAgentSubscription] SUBSCRIPTION_AMOUNT_MISMATCH: ref=${reference} paid_base=GHS${baseAmountPaid} expected_standard=GHS${planConfig.standard} expected_promo=GHS${planConfig.promo}`);
    await logSecurityEventLocal(supabase, "SUBSCRIPTION_AMOUNT_MISMATCH", "critical", {
      agent_id: agentId, payment_reference: reference, plan,
      paid_base_amount: baseAmountPaid,
      expected_standard: planConfig.standard,
      expected_promo: planConfig.promo,
      processing_fee: storedProcessingFee,
      total_paid: paidAmountGhs,
    });
    return { processed: false, reason: "Subscription amount mismatch" };
  }

  // ─── Intent-based idempotency check ───
  if (intentId) {
    const { data: existingIntent } = await supabase
      .from("agent_subscription_payment_intents")
      .select("*")
      .eq("id", intentId)
      .maybeSingle();

    if (existingIntent?.status === "success") {
      console.log(`[processAgentSubscription] Intent ${intentId} already processed (idempotent)`);
      // Find the subscription created for this
      const { data: existingSub } = await supabase
        .from("agent_subscriptions")
        .select("expiry_date")
        .eq("paystack_reference", reference)
        .maybeSingle();
      return {
        processed: true,
        already_done: true,
        purpose: "agent_subscription",
        expires_at: existingSub?.expiry_date || null,
      };
    }
  }

  const now = new Date();
  const daysToAdd = plan === "yearly" ? 365 : 30;

  // ─── Determine expiry: extend from existing if still active, else start from now ───
  let newExpiry: Date;
  const { data: currentSub } = await supabase
    .from("agent_subscriptions")
    .select("expiry_date")
    .eq("agent_id", agentId)
    .eq("status", "active")
    .order("expiry_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (currentSub && new Date(currentSub.expiry_date) > now) {
    // Extend from existing expiry
    newExpiry = new Date(new Date(currentSub.expiry_date).getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    console.log(`[processAgentSubscription] Extending from existing expiry ${currentSub.expiry_date} → ${newExpiry.toISOString()}`);
  } else {
    // Start fresh from now
    newExpiry = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    console.log(`[processAgentSubscription] Starting fresh expiry from now → ${newExpiry.toISOString()}`);
  }

  // ─── Handle legacy flow (old subscriptions created at init time) ───
  if (legacySubscriptionId && !intentId) {
    const { error: subErr } = await supabase
      .from("agent_subscriptions")
      .update({
        status: "active",
        paid_at: now.toISOString(),
        expiry_date: newExpiry.toISOString(),
        next_billing_date: newExpiry.toISOString(),
        paystack_reference: reference,
      })
      .eq("id", legacySubscriptionId);
    if (subErr) console.error("[processAgentSubscription] Legacy sub update failed:", subErr);
  } else {
    // ─── New intent-based flow: create subscription record on success ───
    // Derive prices from verified payment result, not metadata (which may be missing)
    const standardPrice = plan === "yearly" ? 250 : 50;
    const baseAmount = isPromoMatch
      ? (plan === "yearly" ? 185 : 35)
      : standardPrice;

    const { error: subInsertErr } = await supabase
      .from("agent_subscriptions")
      .insert({
        agent_id: agentId,
        plan_price_standard: standardPrice,
        plan_price_current: baseAmount,
        currency: "GHS",
        status: "active",
        paystack_reference: reference,
        paid_at: now.toISOString(),
        expiry_date: newExpiry.toISOString(),
        next_billing_date: newExpiry.toISOString(),
      });

    if (subInsertErr) {
      console.error("[processAgentSubscription] Failed to create subscription:", subInsertErr);
    } else {
      console.log(`[processAgentSubscription] Subscription created, expires ${newExpiry.toISOString()}`);
    }
  }

  // ─── Mark intent as success (idempotency key) ───
  if (intentId) {
    await supabase
      .from("agent_subscription_payment_intents")
      .update({ status: "success", updated_at: now.toISOString() })
      .eq("id", intentId);
  }

  // ─── Update agent: activate + set plan ───
  const { error: agentErr } = await supabase
    .from("agents")
    .update({
      status: "active",
      activation_paid: true,
      activation_paid_at: now.toISOString(),
      activation_reference: reference,
      subscription_plan: plan,
    })
    .eq("id", agentId);

  if (agentErr) {
    console.error("[processAgentSubscription] Failed to activate agent:", agentErr);
    return { processed: false, reason: "Failed to activate agent" };
  }

  console.log(`[processAgentSubscription] Agent ${agentId} activated with ${plan} plan, expires ${newExpiry.toISOString()}`);

  return {
    processed: true,
    purpose: "agent_subscription",
    plan,
    expires_at: newExpiry.toISOString(),
  };
}

/**
 * Process agent order AFTER payment verification.
 * Creates the agent_order record from checkout_meta if it doesn't exist yet.
 */
async function processAgentOrder(supabase: any, payment: Record<string, unknown>) {
  const orderId = payment.linked_order_id as string;
  if (!orderId) return { processed: false, reason: "No order_id" };

  // Check if agent order already exists (idempotency)
  let order: Record<string, unknown> | null = null;
  const { data: existingOrder } = await supabase.from("agent_orders").select("*").eq("order_id", orderId).maybeSingle();

  if (existingOrder) {
    order = existingOrder;
    if (["Processing", "Delivered", "Paid"].includes(existingOrder.status as string)) {
      return {
        processed: true, already_done: true, purpose: "agent_order",
        order_id: orderId, order_status: existingOrder.status,
        network: existingOrder.network, bundle_size_gb: existingOrder.bundle_size_gb,
        recipient_phone: existingOrder.customer_phone, amount_ghs: existingOrder.agent_selling_price,
      };
    }
    // Update existing to Paid
    await supabase.from("agent_orders").update({ payment_status: "paid", status: "Paid" }).eq("order_id", orderId);
  } else {
    // Create agent order from checkout_meta
    const meta = payment.checkout_meta as Record<string, unknown> | null;
    if (!meta) {
      console.error("[processAgentOrder] No checkout_meta and no existing agent order for:", orderId);
      return { processed: false, reason: "No checkout metadata for agent order creation" };
    }

    console.log(`[processAgentOrder] Creating agent order ${orderId} from checkout_meta after payment verification`);

    // Store full snapshot fields (matching webhook path)
    const agentSellingPrice = Number(meta.agent_selling_price) || 0;
    const agentBasePrice = Number(meta.agent_cost_price) || 0;
    const supplierCostRaw = meta.supplier_cost_at_purchase;
    const supplierCostAtPurchase: number | null = (supplierCostRaw != null && !isNaN(Number(supplierCostRaw)))
      ? Number(supplierCostRaw) : null;

    let resolvedSupplierCost = supplierCostAtPurchase;
    if (resolvedSupplierCost === null && meta.product_id) {
      const { data: productRow } = await supabase
        .from("products").select("cost_price_ghs").eq("id", meta.product_id as string).maybeSingle();
      if (productRow?.cost_price_ghs != null) {
        resolvedSupplierCost = Number(productRow.cost_price_ghs);
      }
    }

    const agentProfitAtPurchase = Math.max(0, Math.round((agentSellingPrice - agentBasePrice) * 100) / 100);
    const datasikaProfitAtPurchase = (resolvedSupplierCost != null && resolvedSupplierCost > 0)
      ? Math.max(0, Math.round((agentBasePrice - resolvedSupplierCost) * 100) / 100)
      : agentBasePrice > 0 ? Math.max(0, agentBasePrice) : null;

    const { data: newOrder, error: orderErr } = await supabase.from("agent_orders").insert({
      agent_id: meta.agent_id,
      order_id: orderId,
      customer_phone: meta.customer_phone,
      customer_name: meta.customer_name || null,
      customer_email: meta.customer_email || null,
      network: meta.network,
      bundle_size_gb: meta.bundle_size_gb,
      product_id: meta.product_id,
      order_source: "agent_store",
      agent_selling_price: agentSellingPrice,
      agent_cost_price: agentBasePrice,
      profit_ghs: agentProfitAtPurchase,
      agent_store_price_at_purchase: agentSellingPrice,
      agent_base_price_at_purchase: agentBasePrice,
      agent_profit_at_purchase: agentProfitAtPurchase,
      supplier_cost_at_purchase: resolvedSupplierCost,
      datasika_profit_at_purchase: datasikaProfitAtPurchase,
      processing_fee: meta.processing_fee || 0,
      total_paid: meta.total_paid || agentSellingPrice,
      payment_method: "paystack",
      paystack_reference: payment.reference as string,
      payment_status: "paid",
      status: "Paid",
      profit_credited: false,
    }).select().maybeSingle();

    if (orderErr) {
      if (orderErr.code === "23505") {
        const { data: raceOrder } = await supabase.from("agent_orders").select("*").eq("order_id", orderId).maybeSingle();
        if (raceOrder) {
          order = raceOrder;
          if (["Processing", "Delivered", "Paid"].includes(raceOrder.status as string)) {
            return { processed: true, already_done: true, purpose: "agent_order", order_id: orderId, order_status: raceOrder.status };
          }
        }
      } else {
      console.error("[processAgentOrder] Failed to create agent order:", orderErr);
        // ── Reconciliation: payment succeeded but agent order creation failed ──
        await handleOrderCreationFailure(supabase, payment, `Agent order insert failed: ${orderErr.message}`, "agent_store");
        await upsertReconciliationCase(supabase, payment, `Agent order insert failed: ${orderErr.message}`, "agent_store");
        return { processed: false, reason: "Failed to create agent order" };
      }
    } else {
      order = newOrder;
    }
  }

  if (!order) {
    const { data: refetchOrder } = await supabase.from("agent_orders").select("*").eq("order_id", orderId).maybeSingle();
    order = refetchOrder;
  }
  if (!order) return { processed: false, reason: "Agent order not found after creation" };

  console.log(`Agent order ${orderId} marked Paid, submitting to supplier...`);

  // Bulk dispatch queue gate (master switch = feature flag + manual_bulk mode)
  if (await shouldQueueOrder(supabase, { order_id: orderId as string, network: order.network as string }, "agent_orders")) {
    console.log(`[verify][queue] Agent order ${orderId} queued (flag+manual_bulk active), staying as Pending`);
    await supabase.from("agent_orders").update({ status: "Pending", queue_state: "queued" }).eq("order_id", orderId);
    // Profit belongs to the agent at payment success — credit now even though supplier dispatch is deferred.
    const queuedCredit = await creditAgentProfit(supabase, orderId, "paystack_verify_queued");
    console.log(`[verify][queue] Profit credit result for order ${orderId}:`, queuedCredit.action, queuedCredit.reason || "");
    return {
      processed: true, purpose: "agent_order", order_id: orderId, order_status: "Pending",
      dispatch_mode: "manual_queue", message: "Agent order queued for manual bulk dispatch",
    };
  }

  const result = await dispatchToSupplier(supabase, {
    network: order.network as string,
    phone_number: order.customer_phone as string,
    data_amount: String(order.bundle_size_gb),
  }, order.product_id as string | null, { orderId: orderId as string });
  const rawResponse = JSON.stringify(result.body);

  if (result.ok) {
    const p = parseDispatchResult(result);
    await supabase.from("agent_orders").update({
      status: p.newStatus,
      supplier_order_id: p.supplierOrderId,
      supplier_reference: p.supplierReference,
      supplier_status: p.supplierStatus,
      supplier_message: p.supplierMessage,
      supplier_timestamp: new Date().toISOString(),
      supplier_raw_response: rawResponse,
    }).eq("order_id", orderId);

    // ── Supplier Shadow Wallet: log spend ──
    const agentCostPrice = Number(order.supplier_cost_at_purchase) || Number(order.agent_cost_price) || 0;
    await logSupplierSpend(supabase, orderId, agentCostPrice, {
      network: order.network as string, bundle_size_gb: order.bundle_size_gb as number | string,
      recipient: order.customer_phone as string, supplier_order_id: p.supplierOrderId,
    });

    // ── Idempotent profit crediting on supplier success ──
    const creditResultOk = await creditAgentProfit(supabase, orderId, "paystack_verify");
    console.log(`[paystack-verify] Profit credit result for order ${orderId}:`, creditResultOk.action, creditResultOk.reason || "");

    return {
      processed: true, purpose: "agent_order", order_id: orderId, order_status: p.newStatus,
      network: order.network, bundle_size_gb: order.bundle_size_gb,
      recipient_phone: order.customer_phone, amount_ghs: order.agent_selling_price,
      total_paid: order.total_paid, customer_name: order.customer_name,
    };
  } else {
    const reason = result.body.message || result.body.error || `Supplier HTTP ${result.status}`;
    await supabase.from("agent_orders").update({
      status: "Processing",
      supplier_raw_response: rawResponse,
      supplier_status: "failed",
      supplier_message: String(reason).slice(0, 500),
      supplier_timestamp: new Date().toISOString(),
    }).eq("order_id", orderId);
    console.error(`Agent order ${orderId} supplier ${result.supplierCode} failed, keeping as Processing:`, reason);
  }

  // ── Idempotent profit crediting via shared helper ──
  const creditResult = await creditAgentProfit(supabase, orderId, "paystack_verify");
  console.log(`[paystack-verify] Profit credit result for order ${orderId}:`, creditResult.action, creditResult.reason || "");

  const finalStatus = (await supabase.from("agent_orders").select("status").eq("order_id", orderId).maybeSingle()).data?.status || "Processing";
  return {
    processed: true, purpose: "agent_order", order_id: orderId, order_status: finalStatus,
    network: order.network, bundle_size_gb: order.bundle_size_gb,
    recipient_phone: order.customer_phone, amount_ghs: order.agent_selling_price,
    total_paid: order.total_paid, customer_name: order.customer_name,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackKey) return new Response(JSON.stringify({ error: "Not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { reference } = await req.json();
    if (!reference) return new Response(JSON.stringify({ error: "reference required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Validate reference format
    const cleanReference = sanitizeReference(reference);
    if (!cleanReference) {
      return new Response(JSON.stringify({ error: "Invalid reference format" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("[paystack-verify] Verifying:", cleanReference);
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(cleanReference)}`, {
      headers: { Authorization: `Bearer ${paystackKey}` },
    });
    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || !verifyData.status) {
      console.error("[paystack-verify] Paystack API error:", verifyData);
      return new Response(JSON.stringify({ error: verifyData.message || "Verification failed", verified: false }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const txData = verifyData.data;
    if (txData.status !== "success") {
      console.log("[paystack-verify] Payment not successful:", txData.status);
      return new Response(JSON.stringify({ verified: false, paystack_status: txData.status }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const result = await processPayment(supabase, cleanReference, txData);

    console.log("[paystack-verify] Result:", JSON.stringify(result));

    return new Response(JSON.stringify({ verified: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[paystack-verify] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
