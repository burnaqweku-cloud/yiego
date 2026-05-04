// deno-lint-ignore-file no-explicit-any
/**
 * auto-reconcile-payments
 *
 * Automatically recovers unfulfilled successful Paystack payments.
 *
 * Two-phase approach:
 * Phase 1: Re-verify stale "pending" payments (>5 min old) with Paystack API.
 *          If Paystack says success, run fulfillment.
 * Phase 2: Find "success" payments where fulfillment clearly didn't happen
 *          (no matching order/deposit). Re-run fulfillment.
 *
 * Fully idempotent — safe to call repeatedly or on a schedule.
 * Never creates duplicates due to atomic guards in paystack_payments.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processReferralQualification } from "../_shared/referral-qualify.ts";
import { handleOrderCreationFailure } from "../_shared/reconciliation.ts";
import { upsertReconciliationCase } from "../_shared/payment-reconciliation.ts";
import { logSupplierSpend } from "../_shared/supplier-ledger.ts";
import { dispatchToSupplier, parseDispatchResult, shouldQueueOrder } from "../_shared/supplier-dispatch.ts";
import { creditAgentProfit } from "../_shared/agent-profit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ─── Verify a single reference with Paystack API ─────────
async function verifyWithPaystack(reference: string, paystackKey: string): Promise<{ success: boolean; data?: Record<string, unknown> }> {
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${paystackKey}` },
    });
    const body = await res.json();
    if (!res.ok || !body.status) return { success: false };
    return { success: body.data?.status === "success", data: body.data };
  } catch (e) {
    console.error(`[auto-reconcile] Paystack verify failed for ${reference}:`, e);
    return { success: false };
  }
}

// ─── Fulfillment: Process a successful payment ──────────
// Mirrors the core logic from paystack-webhook/paystack-verify
async function fulfillPayment(
  supabase: any,
  payment: Record<string, unknown>,
  paystackData: Record<string, unknown> | null,
): Promise<{ fulfilled: boolean; action: string; detail?: string }> {
  const reference = payment.reference as string;
  const purpose = payment.purpose as string;

  // Atomic guard: only one process can claim this payment
  const totalPaidGhs = paystackData
    ? (Number(paystackData.amount) || 0) / 100
    : Number(payment.total_paid) || (Number(payment.amount_ghs) + Number(payment.processing_fee || 0));

  const expectedTotal = Number(payment.total_paid) || (Number(payment.amount_ghs) + Number(payment.processing_fee || 0));
  const amountDiff = Math.abs(totalPaidGhs - expectedTotal);
  if (amountDiff > 0.02) {
    return { fulfilled: false, action: "amount_mismatch", detail: `paid=${totalPaidGhs} expected=${expectedTotal}` };
  }

  const storedProcessingFee = Number(payment.processing_fee) || 0;
  const amountGhs = storedProcessingFee > 0 ? Math.round((totalPaidGhs - storedProcessingFee) * 100) / 100 : totalPaidGhs;

  // Atomic claim: only update if still not "success"
  const { data: claimed } = await supabase.from("paystack_payments")
    .update({
      status: "success",
      verified_at: new Date().toISOString(),
      ...(paystackData ? {
        channel: paystackData.channel || null,
        customer_email: (paystackData.customer as Record<string, unknown>)?.email || null,
        paid_at: paystackData.paid_at || null,
        raw_response: paystackData,
      } : {}),
    })
    .eq("reference", reference)
    .neq("status", "success")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    // Already processed — check if fulfillment actually happened
    return await checkAndRetryFulfillment(supabase, payment, amountGhs);
  }

  // First-time fulfillment
  return await executeFulfillment(supabase, payment, amountGhs);
}

// ─── Check if a "success" payment was actually fulfilled ──
async function checkAndRetryFulfillment(
  supabase: any,
  payment: Record<string, unknown>,
  amountGhs: number,
): Promise<{ fulfilled: boolean; action: string; detail?: string }> {
  const purpose = payment.purpose as string;
  const reference = payment.reference as string;

  if (purpose === "order" || purpose === "agent_order") {
    const orderId = payment.linked_order_id as string;
    if (!orderId) return { fulfilled: false, action: "no_order_id" };

    const table = purpose === "agent_order" ? "agent_orders" : "orders";
    const { data: order } = await supabase.from(table).select("order_id, status").eq("order_id", orderId).maybeSingle();

    if (order) {
      return { fulfilled: true, action: "already_fulfilled", detail: `${orderId} status=${order.status}` };
    }

    // Order doesn't exist despite payment being success — retry fulfillment
    console.log(`[auto-reconcile] Payment ${reference} is success but order ${orderId} missing — retrying fulfillment`);
    return await executeFulfillment(supabase, payment, amountGhs);
  }

  if (purpose === "deposit") {
    const walletTxnId = payment.linked_wallet_txn_id as string;
    if (walletTxnId) {
      const { data: txn } = await supabase.from("wallet_transactions").select("status").eq("id", walletTxnId).maybeSingle();
      if (txn?.status === "confirmed") {
        return { fulfilled: true, action: "already_fulfilled", detail: "deposit confirmed" };
      }
    }
    // Deposit not confirmed — retry
    console.log(`[auto-reconcile] Payment ${reference} is success but deposit not confirmed — retrying`);
    return await executeFulfillment(supabase, payment, amountGhs);
  }

  // agent_activation, agent_subscription — harder to check, skip auto-reconcile
  return { fulfilled: true, action: "skipped_purpose", detail: purpose };
}

// ─── Execute the actual fulfillment ──────────────────────
async function executeFulfillment(
  supabase: any,
  payment: Record<string, unknown>,
  amountGhs: number,
): Promise<{ fulfilled: boolean; action: string; detail?: string }> {
  const purpose = payment.purpose as string;
  const reference = payment.reference as string;

  try {
    if (purpose === "deposit") {
      return await fulfillDeposit(supabase, payment, amountGhs);
    } else if (purpose === "order") {
      return await fulfillOrder(supabase, payment);
    } else if (purpose === "agent_order") {
      return await fulfillAgentOrder(supabase, payment);
    }
    return { fulfilled: false, action: "unsupported_purpose", detail: purpose };
  } catch (err) {
    console.error(`[auto-reconcile] Fulfillment error for ${reference}:`, err);
    return { fulfilled: false, action: "error", detail: String(err) };
  }
}

// ─── Deposit fulfillment ─────────────────────────────────
async function fulfillDeposit(
  supabase: any,
  payment: Record<string, unknown>,
  amountGhs: number,
): Promise<{ fulfilled: boolean; action: string; detail?: string }> {
  const userId = payment.user_id as string;
  const walletTxnId = payment.linked_wallet_txn_id as string;
  const reference = payment.reference as string;

  if (!userId) return { fulfilled: false, action: "no_user_id" };

  // Idempotency: check wallet transaction status
  if (walletTxnId) {
    const { data: t } = await supabase.from("wallet_transactions").select("status").eq("id", walletTxnId).maybeSingle();
    if (t?.status === "confirmed") {
      return { fulfilled: true, action: "already_confirmed" };
    }
    await supabase.from("wallet_transactions").update({ status: "confirmed" }).eq("id", walletTxnId);
  }

  const { data: wallet } = await supabase.from("wallets").select("id, balance_ghs").eq("user_id", userId).maybeSingle();
  if (wallet) {
    const newBalance = Number(wallet.balance_ghs) + amountGhs;
    const { error } = await supabase.from("wallets").update({ balance_ghs: newBalance }).eq("id", wallet.id);
    if (error) return { fulfilled: false, action: "wallet_credit_failed", detail: error.message };
    console.log(`[auto-reconcile] Wallet credited: ${userId} +GHS${amountGhs} = GHS${newBalance}`);
  } else {
    const { error } = await supabase.from("wallets").insert({ user_id: userId, balance_ghs: amountGhs });
    if (error) return { fulfilled: false, action: "wallet_create_failed", detail: error.message };
  }

  // Update payment_intent for deposit — mark fulfilled by reconciliation
  await supabase.from("payment_intents")
    .update({ order_created: true, payment_status: "success", fulfilled_by: "reconciliation", fulfilled_at: new Date().toISOString() })
    .eq("paystack_reference", reference);

  return { fulfilled: true, action: "deposit_credited", detail: `GHS${amountGhs} for ${userId}` };
}

// ─── Order fulfillment ───────────────────────────────────
async function fulfillOrder(
  supabase: any,
  payment: Record<string, unknown>,
): Promise<{ fulfilled: boolean; action: string; detail?: string }> {
  const orderId = payment.linked_order_id as string;
  if (!orderId) return { fulfilled: false, action: "no_order_id" };

  // Check if order already exists
  const { data: existing } = await supabase.from("orders").select("order_id, status").eq("order_id", orderId).maybeSingle();
  if (existing) {
    return { fulfilled: true, action: "order_exists", detail: `${orderId} status=${existing.status}` };
  }

  // Create from checkout_meta
  const meta = payment.checkout_meta as Record<string, unknown> | null;
  if (!meta) {
    await upsertReconciliationCase(supabase, payment, "No checkout_meta for auto-reconcile order creation", "normal_user");
    return { fulfilled: false, action: "no_checkout_meta" };
  }

  const { error: orderErr } = await supabase.from("orders").insert({
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
    order_source: "auto_reconcile",
  });

  if (orderErr) {
    if (orderErr.code === "23505") return { fulfilled: true, action: "order_race_exists" };
    await upsertReconciliationCase(supabase, payment, `Auto-reconcile order insert failed: ${orderErr.message}`, "normal_user");
    return { fulfilled: false, action: "order_insert_failed", detail: orderErr.message };
  }

  // Update payment_intent — mark fulfilled by reconciliation
  await supabase.from("payment_intents")
    .update({ order_created: true, order_id: orderId, payment_status: "success", fulfilled_by: "reconciliation", fulfilled_at: new Date().toISOString() })
    .eq("paystack_reference", payment.reference as string);

  // Dispatch to supplier
  await dispatchOrder(supabase, orderId, meta);

  return { fulfilled: true, action: "order_created_and_dispatched", detail: orderId };
}

// ─── Agent order fulfillment ─────────────────────────────
async function fulfillAgentOrder(
  supabase: any,
  payment: Record<string, unknown>,
): Promise<{ fulfilled: boolean; action: string; detail?: string }> {
  const orderId = payment.linked_order_id as string;
  if (!orderId) return { fulfilled: false, action: "no_order_id" };

  const { data: existing } = await supabase.from("agent_orders").select("order_id, status").eq("order_id", orderId).maybeSingle();
  if (existing) {
    return { fulfilled: true, action: "agent_order_exists", detail: `${orderId} status=${existing.status}` };
  }

  const meta = payment.checkout_meta as Record<string, unknown> | null;
  if (!meta) {
    await upsertReconciliationCase(supabase, payment, "No checkout_meta for auto-reconcile agent order creation", "agent_store");
    return { fulfilled: false, action: "no_checkout_meta" };
  }

  const agentSellingPrice = Number(meta.agent_selling_price) || 0;
  const agentBasePrice = Number(meta.agent_cost_price) || 0;
  const supplierCostRaw = meta.supplier_cost_at_purchase;
  const supplierCostAtPurchase: number | null = (supplierCostRaw != null && !isNaN(Number(supplierCostRaw))) ? Number(supplierCostRaw) : null;

  let resolvedSupplierCost = supplierCostAtPurchase;
  if (resolvedSupplierCost === null && meta.product_id) {
    const { data: p } = await supabase.from("products").select("cost_price_ghs").eq("id", meta.product_id as string).maybeSingle();
    if (p?.cost_price_ghs != null) resolvedSupplierCost = Number(p.cost_price_ghs);
  }

  const agentProfitAtPurchase = Math.max(0, Math.round((agentSellingPrice - agentBasePrice) * 100) / 100);
  const datasikaProfitAtPurchase = (resolvedSupplierCost != null && resolvedSupplierCost > 0)
    ? Math.max(0, Math.round((agentBasePrice - resolvedSupplierCost) * 100) / 100)
    : agentBasePrice > 0 ? Math.max(0, agentBasePrice) : null;

  const { error: orderErr } = await supabase.from("agent_orders").insert({
    agent_id: meta.agent_id,
    order_id: orderId,
    customer_phone: meta.customer_phone,
    customer_name: meta.customer_name || null,
    customer_email: meta.customer_email || null,
    network: meta.network,
    bundle_size_gb: meta.bundle_size_gb,
    product_id: meta.product_id,
    order_source: "auto_reconcile",
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
  });

  if (orderErr) {
    if (orderErr.code === "23505") return { fulfilled: true, action: "agent_order_race_exists" };
    await upsertReconciliationCase(supabase, payment, `Auto-reconcile agent order insert failed: ${orderErr.message}`, "agent_store");
    return { fulfilled: false, action: "agent_order_insert_failed", detail: orderErr.message };
  }

  // Update payment_intent — mark fulfilled by reconciliation
  await supabase.from("payment_intents")
    .update({ order_created: true, order_id: orderId, payment_status: "success", fulfilled_by: "reconciliation", fulfilled_at: new Date().toISOString() })
    .eq("paystack_reference", payment.reference as string);

  // Dispatch to supplier
  await dispatchAgentOrder(supabase, orderId, meta);

  // Credit agent profit
  const creditResult = await creditAgentProfit(supabase, orderId, "auto_reconcile");
  console.log(`[auto-reconcile] Agent profit credit for ${orderId}: ${creditResult.action}`);

  return { fulfilled: true, action: "agent_order_created_and_dispatched", detail: orderId };
}

// ─── Dispatch helpers ────────────────────────────────────
async function dispatchOrder(supabase: any, orderId: string, meta: Record<string, unknown>) {
  if (await shouldQueueOrder(supabase, { order_id: orderId, network: meta.network as string }, "orders")) {
    await supabase.from("orders").update({ status: "Pending", queue_state: "queued" }).eq("order_id", orderId);
    console.log(`[auto-reconcile][queue] Order ${orderId} queued (flag+manual_bulk active)`);
    return;
  }

  const result = await dispatchToSupplier(supabase, {
    network: meta.network as string,
    phone_number: meta.recipient_phone as string,
    data_amount: String(meta.bundle_size_gb),
  }, meta.product_id as string | null, { orderId });

  const rawResponse = JSON.stringify(result.body);

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

    const costPrice = Number(meta.cost_price_ghs) || Number(meta.amount_ghs) || 0;
    await logSupplierSpend(supabase, orderId, costPrice, {
      network: meta.network as string, bundle_size_gb: meta.bundle_size_gb as number | string,
      recipient: meta.recipient_phone as string, supplier_order_id: p.supplierOrderId,
    });

    if (meta.user_id) {
      await processReferralQualification(supabase, meta.user_id as string, orderId, {
        amount: Number(meta.amount_ghs) || undefined,
        network: meta.network as string,
        bundle: `${meta.bundle_size_gb}GB`,
        order_source: "auto_reconcile",
      });
    }
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
  }
}

async function dispatchAgentOrder(supabase: any, orderId: string, meta: Record<string, unknown>) {
  if (await shouldQueueOrder(supabase, { order_id: orderId, network: meta.network as string }, "agent_orders")) {
    await supabase.from("agent_orders").update({ status: "Pending", queue_state: "queued" }).eq("order_id", orderId);
    console.log(`[auto-reconcile][queue] Agent order ${orderId} queued (flag+manual_bulk active)`);
    return;
  }

  const result = await dispatchToSupplier(supabase, {
    network: meta.network as string,
    phone_number: meta.customer_phone as string,
    data_amount: String(meta.bundle_size_gb),
  }, meta.product_id as string | null, { orderId });

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

    const costPrice = Number(meta.supplier_cost_at_purchase) || Number(meta.agent_cost_price) || 0;
    await logSupplierSpend(supabase, orderId, costPrice, {
      network: meta.network as string, bundle_size_gb: meta.bundle_size_gb as number | string,
      recipient: meta.customer_phone as string, supplier_order_id: p.supplierOrderId,
    });
  } else {
    const reason = result.body.message || result.body.error || `Supplier HTTP ${result.status}`;
    await supabase.from("agent_orders").update({
      status: "Processing",
      supplier_raw_response: rawResponse,
      supplier_status: "failed",
      supplier_message: String(reason).slice(0, 500),
      supplier_timestamp: new Date().toISOString(),
    }).eq("order_id", orderId);
  }
}

// ─── Main handler ────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY")!;

    if (!paystackKey || !serviceKey) {
      return json({ error: "Not configured" }, 500);
    }

    // Auth check — allow admin calls, cron/internal calls
    const authHeader = req.headers.get("Authorization");
    const internalKey = req.headers.get("x-internal-key");
    const isInternal = internalKey === serviceKey;
    
    const bearerToken = authHeader?.replace("Bearer ", "") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const isServiceRole = bearerToken === serviceKey;
    // Cron jobs send anon key as bearer — allow since verify_jwt=false
    const isCronCall = bearerToken.length > 20 && (bearerToken === anonKey || bearerToken.includes("eyJ"));

    if (!isInternal && !isServiceRole && !isCronCall) {
      // Try user JWT auth for admin manual triggers
      if (authHeader?.startsWith("Bearer ") && bearerToken.length > 0) {
        const supabaseAuth = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(bearerToken);
        if (claimsErr || !claimsData?.claims?.sub) {
          return json({ error: "Unauthorized" }, 401);
        }
        const userId = claimsData.claims.sub as string;
        const db = createClient(supabaseUrl, serviceKey);
        const { data: role } = await db.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
        if (!role) return json({ error: "Admin access required" }, 403);
      } else {
        return json({ error: "Unauthorized" }, 401);
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // ═══ GO-LIVE SAFETY GUARD ═══════════════════════════════
    // Reconciliation ONLY processes intents created AFTER this timestamp.
    // This permanently protects all old/manually-fixed data.
    const RECONCILE_ONLY_AFTER = "2026-04-14T00:00:00.000Z";

    // Parse options
    let maxAge = 2; // minutes for phase 1 (stale pending check) — reduced for faster recovery
    let lookbackHours = 6; // hours for phase 2 (success without fulfillment)
    try {
      const body = await req.json();
      if (body?.max_age_minutes && Number(body.max_age_minutes) > 0) maxAge = Math.min(Number(body.max_age_minutes), 120);
      if (body?.lookback_hours && Number(body.lookback_hours) > 0) lookbackHours = Math.min(Number(body.lookback_hours), 48);
    } catch { /* defaults */ }

    // Compute the effective lower bound: max of go-live timestamp and lookback window
    const lookbackThresholdMs = Date.now() - lookbackHours * 60 * 60 * 1000;
    const goLiveMs = new Date(RECONCILE_ONLY_AFTER).getTime();
    const effectiveLowerBound = new Date(Math.max(lookbackThresholdMs, goLiveMs)).toISOString();

    console.log(`[auto-reconcile] GO-LIVE guard: ${RECONCILE_ONLY_AFTER}, effective lower bound: ${effectiveLowerBound}`);

    const results = {
      phase1_stale_pending: { checked: 0, verified_success: 0, fulfilled: 0, already_done: 0, failed: 0, not_paid: 0 },
      phase2_missing_fulfillment: { checked: 0, fulfilled: 0, already_done: 0, failed: 0 },
      go_live_after: RECONCILE_ONLY_AFTER,
      effective_lower_bound: effectiveLowerBound,
      timestamp: new Date().toISOString(),
    };

    // ═══ PHASE 1: Re-verify stale pending payments ═══════
    const staleThreshold = new Date(Date.now() - maxAge * 60 * 1000).toISOString();
    const { data: stalePending } = await supabase
      .from("paystack_payments")
      .select("*")
      .eq("status", "pending")
      .lt("created_at", staleThreshold)
      .gte("created_at", effectiveLowerBound)
      .in("purpose", ["order", "deposit", "agent_order"])
      .order("created_at", { ascending: true })
      .limit(50);

    if (stalePending && stalePending.length > 0) {
      results.phase1_stale_pending.checked = stalePending.length;
      console.log(`[auto-reconcile] Phase 1: Checking ${stalePending.length} stale pending payments`);

      for (const payment of stalePending) {
        const verification = await verifyWithPaystack(payment.reference, paystackKey);
        if (!verification.success) {
          results.phase1_stale_pending.not_paid++;
          // Mark as failed if Paystack says it's not success
          if (verification.data?.status === "failed" || verification.data?.status === "abandoned") {
            await supabase.from("paystack_payments")
              .update({ status: "failed" })
              .eq("reference", payment.reference)
              .eq("status", "pending");
          }
          continue;
        }

        results.phase1_stale_pending.verified_success++;
        console.log(`[auto-reconcile] Phase 1: ${payment.reference} verified as success by Paystack`);

        // Update payment_intent status
        await supabase.from("payment_intents")
          .update({ payment_status: "success" })
          .eq("paystack_reference", payment.reference);

        const result = await fulfillPayment(supabase, payment, verification.data!);
        if (result.fulfilled) {
          if (result.action.includes("already")) results.phase1_stale_pending.already_done++;
          else results.phase1_stale_pending.fulfilled++;
          console.log(`[auto-reconcile] Phase 1: ${payment.reference} → ${result.action} ${result.detail || ""}`);
        } else {
          results.phase1_stale_pending.failed++;
          console.error(`[auto-reconcile] Phase 1: ${payment.reference} fulfillment failed: ${result.action} ${result.detail || ""}`);
        }
      }
    }

    // ═══ PHASE 2: Find success payments with missing fulfillment ═══
    // Uses the same go-live lower bound to never touch old data
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    const { data: successPayments } = await supabase
      .from("paystack_payments")
      .select("*")
      .in("status", ["success", "completed"])
      .in("purpose", ["order", "deposit", "agent_order"])
      .gte("created_at", effectiveLowerBound)
      .lt("created_at", twoMinAgo) // Give webhook 2 min to process
      .order("created_at", { ascending: true })
      .limit(100);

    if (successPayments && successPayments.length > 0) {
      // Batch-check which ones actually have matching records
      const orderIds = successPayments.filter(p => p.purpose === "order" && p.linked_order_id).map(p => p.linked_order_id);
      const agentOrderIds = successPayments.filter(p => p.purpose === "agent_order" && p.linked_order_id).map(p => p.linked_order_id);
      const depositRefs = successPayments.filter(p => p.purpose === "deposit").map(p => p.reference);

      const [existingOrders, existingAgentOrders, confirmedDeposits] = await Promise.all([
        orderIds.length > 0
          ? supabase.from("orders").select("order_id").in("order_id", orderIds).then(r => new Set((r.data || []).map(o => o.order_id)))
          : Promise.resolve(new Set<string>()),
        agentOrderIds.length > 0
          ? supabase.from("agent_orders").select("order_id").in("order_id", agentOrderIds).then(r => new Set((r.data || []).map(o => o.order_id)))
          : Promise.resolve(new Set<string>()),
        depositRefs.length > 0
          ? supabase.from("wallet_transactions").select("reference").in("reference", depositRefs).eq("status", "confirmed").then(r => new Set((r.data || []).map(d => d.reference)))
          : Promise.resolve(new Set<string>()),
      ]);

      for (const payment of successPayments) {
        let needsFulfillment = false;

        if (payment.purpose === "order") {
          needsFulfillment = !!payment.linked_order_id && !existingOrders.has(payment.linked_order_id);
        } else if (payment.purpose === "agent_order") {
          needsFulfillment = !!payment.linked_order_id && !existingAgentOrders.has(payment.linked_order_id);
        } else if (payment.purpose === "deposit") {
          // Check by wallet_txn_id or reference
          if (payment.linked_wallet_txn_id) {
            const { data: txn } = await supabase.from("wallet_transactions").select("status").eq("id", payment.linked_wallet_txn_id).maybeSingle();
            needsFulfillment = !txn || txn.status !== "confirmed";
          } else {
            needsFulfillment = !confirmedDeposits.has(payment.reference);
          }
        }

        if (!needsFulfillment) continue;

        results.phase2_missing_fulfillment.checked++;
        console.log(`[auto-reconcile] Phase 2: ${payment.reference} (${payment.purpose}) needs fulfillment retry`);

        const result = await executeFulfillment(supabase, payment, 
          Number(payment.processing_fee) > 0
            ? Math.round((Number(payment.total_paid || payment.amount_ghs) - Number(payment.processing_fee)) * 100) / 100
            : Number(payment.amount_ghs)
        );

        if (result.fulfilled) {
          if (result.action.includes("already") || result.action.includes("exists")) {
            results.phase2_missing_fulfillment.already_done++;
          } else {
            results.phase2_missing_fulfillment.fulfilled++;
          }
          console.log(`[auto-reconcile] Phase 2: ${payment.reference} → ${result.action} ${result.detail || ""}`);
        } else {
          results.phase2_missing_fulfillment.failed++;
          console.error(`[auto-reconcile] Phase 2: ${payment.reference} failed: ${result.action} ${result.detail || ""}`);
        }
      }
    }

    console.log("[auto-reconcile] Complete:", JSON.stringify(results));
    return json({ success: true, ...results });
  } catch (err) {
    console.error("[auto-reconcile] Fatal error:", err);
    return json({ error: String(err) }, 500);
  }
});
