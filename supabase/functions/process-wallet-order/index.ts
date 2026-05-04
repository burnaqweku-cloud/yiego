// deno-lint-ignore-file no-explicit-any
// Bulk dispatch queue gate active (Phase 2 activation 2026-04-30)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkSecurityAccess, logSecurityEvent, extractClientIp, blockedResponse } from "../_shared/check-security.ts";
import { processReferralQualification } from "../_shared/referral-qualify.ts";
import { dispatchToSupplier, parseDispatchResult, shouldQueueOrder } from "../_shared/supplier-dispatch.ts";
import { logSupplierSpend } from "../_shared/supplier-ledger.ts";
import { checkSystemOnline, checkNetworkAvailable } from "../_shared/system-status-guard.ts";
import { checkDuplicateInFlightOrder } from "../_shared/duplicate-order-guard.ts";
import { validateNetworkMatch } from "../_shared/network-detect.ts";

/** Log a security event (fire-and-forget) */
async function logSecurityEventLocal(supabase: any, eventType: string, severity: string, details: Record<string, unknown>) {
  try {
    await supabase.from("security_event_logs").insert({
      event_type: eventType, severity,
      user_id: details.user_id || null,
      agent_id: details.agent_id || null,
      order_id: details.order_id || null,
      payment_reference: details.payment_reference || null,
      details,
    });
  } catch (_) { /* non-fatal */ }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    console.error("[sms] Fire-and-forget failed:", e);
  }
}

// ─── Validation helpers ─────────────────────────────────────
const MAX_ORDER_ID_LEN = 20;

function isValidOrderId(val: unknown): boolean {
  if (typeof val !== "string") return false;
  const trimmed = val.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_ORDER_ID_LEN;
}

/** Calculate the selling price for a normal customer server-side (same logic as usePricing) */
async function calculateSellingPrice(
  supabase: any,
  product: Record<string, unknown>
): Promise<number> {
  const productId = product.id as string;
  const costPriceRaw = product.cost_price_ghs as number | null;
  const costPrice = costPriceRaw != null && costPriceRaw > 0 ? costPriceRaw : 0;
  const fallbackPrice = Number(product.price_ghs);

  const { data: settingsRows } = await supabase.from("site_settings").select("key, value");
  const s: Record<string, string> = {};
  (settingsRows || []).forEach((row: any) => { s[row.key] = row.value; });

  const { data: overrides } = await supabase
    .from("pricing_overrides")
    .select("*")
    .eq("product_id", productId)
    .eq("customer_type", "normal");
  const override = overrides?.[0] as Record<string, unknown> | undefined;

  if (override?.pricing_mode === "manual" && override.manual_price != null && Number(override.manual_price) > 0) {
    return Number(override.manual_price);
  }
  if (override?.markup_percent_override != null && costPrice > 0) {
    return Math.round(costPrice * (1 + Number(override.markup_percent_override) / 100) * 100) / 100;
  }
  if (costPrice > 0) {
    if (product.markup_percent != null) {
      return Math.round(costPrice * (1 + Number(product.markup_percent) / 100) * 100) / 100;
    }
    const normalMarkupType = s.normal_markup_type || "percent";
    if (normalMarkupType === "fixed") {
      return Math.round((costPrice + parseFloat(s.normal_markup_fixed || "0")) * 100) / 100;
    }
    const network = String(product.network).toLowerCase();
    const networkKey = `${network}_markup_percent`;
    const markupPercent = s[networkKey]
      ? parseFloat(s[networkKey])
      : parseFloat(s.default_markup_percent || "15");
    return Math.round(costPrice * (1 + markupPercent / 100) * 100) / 100;
  }
  return fallbackPrice;
}

/** Calculate agent price for a product server-side */
async function calculateAgentSellingPrice(
  supabase: any,
  product: Record<string, unknown>,
  normalPrice: number
): Promise<number> {
  const productId = product.id as string;
  const costPriceRaw = product.cost_price_ghs as number | null;
  const costPrice = costPriceRaw != null && costPriceRaw > 0 ? costPriceRaw : 0;

  // Check for manual agent override
  const { data: agentOverrides } = await supabase
    .from("pricing_overrides")
    .select("*")
    .eq("product_id", productId)
    .eq("customer_type", "agent");
  const agentOverride = agentOverrides?.[0] as Record<string, unknown> | undefined;

  if (agentOverride?.pricing_mode === "manual" && agentOverride.manual_price != null && Number(agentOverride.manual_price) > 0) {
    return Number(agentOverride.manual_price);
  }

  // Auto-calculate from global settings
  const { data: settingsRows } = await supabase.from("site_settings").select("key, value");
  const s: Record<string, string> = {};
  (settingsRows || []).forEach((row: any) => { s[row.key] = row.value; });

  const method = s.agent_pricing_method || "retail_minus_percent";
  const network = String(product.network).toLowerCase();
  const networkValueKey = `agent_${network}_value`;
  const networkOverride = s[networkValueKey] ? parseFloat(s[networkValueKey]) : null;

  let agentPrice: number;
  switch (method) {
    case "retail_minus_fixed": {
      const discount = networkOverride ?? parseFloat(s.agent_discount_fixed || "0.50");
      agentPrice = normalPrice - discount;
      break;
    }
    case "retail_minus_percent": {
      const discountPct = networkOverride ?? parseFloat(s.agent_discount_percent || "10");
      agentPrice = normalPrice * (1 - discountPct / 100);
      break;
    }
    case "cost_plus_fixed": {
      const buffer = networkOverride ?? parseFloat(s.agent_buffer_fixed || "0.20");
      agentPrice = costPrice > 0 ? costPrice + buffer : normalPrice * 0.85;
      break;
    }
    case "cost_plus_percent": {
      const bufferPct = networkOverride ?? parseFloat(s.agent_buffer_percent || "5");
      agentPrice = costPrice > 0 ? costPrice * (1 + bufferPct / 100) : normalPrice * 0.85;
      break;
    }
    default:
      agentPrice = normalPrice * 0.9;
  }
  return Math.round(Math.max(agentPrice, 0) * 100) / 100;
}

/** Check if a user is an operationally active agent with valid subscription pricing */
async function checkActiveAgent(
  supabase: any,
  userId: string
): Promise<boolean> {
  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!agent) return false;

  // Check subscription effective state — expired agents must NOT get agent pricing
  const { data: stateRows } = await supabase.rpc("get_agent_effective_state", { p_agent_id: agent.id });
  const state = stateRows?.[0];
  if (!state?.has_agent_pricing) {
    console.log(`[process-wallet-order] Agent ${agent.id} has_agent_pricing=false (state=${state?.effective_state}), using normal pricing`);
    return false;
  }

  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ─── System status guard ──────────────────────────────────
    const offlineRes = await checkSystemOnline(corsHeaders);
    if (offlineRes) return offlineRes;

    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceRole = token === serviceRoleKey;

    let userId: string | null = null;
    if (!isServiceRole) {
      const supabaseAnon = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: claims, error: claimsErr } = await supabaseAnon.auth.getClaims(token);
      if (claimsErr || !claims?.claims?.sub) {
        console.error("Auth error:", claimsErr);
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = claims.claims.sub as string;
    }

    const body = await req.json();
    const { order_id, dispatch_only } = body;

    // Use service role for DB operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    );

    // ─── Security access check (skip for trusted service-role callers) ──
    const clientIp = extractClientIp(req);
    const deviceHash = body.device_hash || null;
    if (!isServiceRole) {
      const secCheck = await checkSecurityAccess({
        supabase, userId: userId!, ip: clientIp, deviceHash,
      });
      if (!secCheck.allowed) {
        logSecurityEvent(supabase, "wallet_order_blocked", {
          userId, ip: clientIp, deviceHash,
          meta: { order_id, block_type: secCheck.block_type },
        });
        return blockedResponse(secCheck.message || "Access restricted.", corsHeaders);
      }
    }

    if (!order_id) {
      return new Response(JSON.stringify({ error: "order_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isValidOrderId(order_id)) {
      return new Response(JSON.stringify({ error: "Invalid order_id format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanOrderId = String(order_id).trim();
    console.log(`[wallet-order] Processing: ${cleanOrderId} for user: ${userId ?? "(service-role)"} dispatch_only=${!!dispatch_only}`);

    // 1. Fetch the order
    //    Service-role callers (e.g. Telegram bot) have already verified
    //    ownership when they created the order, so we don't filter by user_id.
    let orderQuery = supabase.from("orders").select("*").eq("order_id", cleanOrderId);
    if (!isServiceRole) orderQuery = orderQuery.eq("user_id", userId!);
    const { data: order, error: orderError } = await orderQuery.maybeSingle();

    if (orderError || !order) {
      console.error("[wallet-order] Order not found:", cleanOrderId, orderError);
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Network availability guard ───
    const networkAvailRes = await checkNetworkAvailable(order.network, corsHeaders);
    if (networkAvailRes) return networkAvailRes;

    // ─── Duplicate in-flight order guard (skip this order itself via skipOrderId) ───
    const dupCheck = await checkDuplicateInFlightOrder(supabase, order.recipient_number, cleanOrderId);
    if (dupCheck.blocked) {
      console.log(`[wallet-order] Duplicate blocked: ${order.recipient_number} → ${dupCheck.existingOrderId}. Cancelling ghost order ${cleanOrderId}.`);
      // Clean up the ghost "Pending" order so it doesn't block future attempts
      await supabase.from("orders").update({
        status: "Cancelled",
        failure_reason: `Blocked: duplicate in-flight order ${dupCheck.existingOrderId}`,
      }).eq("order_id", cleanOrderId).in("status", ["Pending", "pending"]);
      return new Response(JSON.stringify({ error: dupCheck.message }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Network mismatch guard ───
    const networkMismatch = validateNetworkMatch(order.recipient_number, order.network);
    if (networkMismatch) {
      await supabase.from("orders").update({
        status: "Cancelled",
        failure_reason: networkMismatch,
      }).eq("order_id", cleanOrderId).in("status", ["Pending", "pending"]);
      return new Response(JSON.stringify({ error: networkMismatch }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency - don't process again
    if (order.status === "Processing" || order.status === "Delivered") {
      return new Response(JSON.stringify({
        success: true,
        message: `Order already ${order.status}`,
        order_id: cleanOrderId,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Service-role + dispatch_only fast path ────────────────────
    // Trusted server-side callers (e.g. the Telegram bot) have ALREADY:
    //   • debited the wallet
    //   • inserted a wallet_transactions debit row
    //   • inserted the order row with status="Paid"
    // They just need this function to drive supplier dispatch (which is the
    // single source of truth for routing + status mapping). For this path we
    // skip all wallet-debit + price-recalc work and jump straight to dispatch.
    let orderAmount = Number(order.amount_ghs);
    let walletBalanceForResponse: number | null = null;

    if (!(isServiceRole && dispatch_only)) {
      // 2. Server-side price validation: recalculate from product
      //    Use agent pricing if the user is an active agent
      if (order.product_id) {
        const { data: product } = await supabase
          .from("products")
          .select("*")
          .eq("id", order.product_id)
          .maybeSingle();

        if (product) {
          const normalPrice = await calculateSellingPrice(supabase, product);
          const isAgent = await checkActiveAgent(supabase, userId!);
          const serverPrice = isAgent
            ? await calculateAgentSellingPrice(supabase, product, normalPrice)
            : normalPrice;

          if (isAgent) {
            console.log(`[wallet-order] Agent detected: normal=GHS${normalPrice} agent=GHS${serverPrice}`);
          }

          if (Math.abs(orderAmount - serverPrice) > 0.02) {
            console.warn(`[wallet-order] Price mismatch: order has GHS ${orderAmount}, server says GHS ${serverPrice}. Using server price.`);
            await logSecurityEventLocal(supabase, "INVALID_CLIENT_PRICE_ATTEMPT", "high", {
              user_id: userId,
              order_id: cleanOrderId,
              client_amount: orderAmount,
              server_amount: serverPrice,
              product_id: order.product_id,
              network: order.network,
            });
            orderAmount = serverPrice;
            await supabase.from("orders").update({
              amount_ghs: serverPrice,
              cost_price_ghs: product.cost_price_ghs,
            }).eq("order_id", cleanOrderId);
          }
        }
      }

      // 3. Check wallet balance
      const { data: wallet, error: walletError } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", userId!)
        .maybeSingle();

      if (walletError || !wallet) {
        console.error("[wallet-order] Wallet not found:", walletError);
        return new Response(JSON.stringify({ error: "Wallet not found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (Number(wallet.balance_ghs) < orderAmount) {
        return new Response(JSON.stringify({
          error: "Insufficient wallet balance",
          balance: wallet.balance_ghs,
          required: orderAmount,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 4. Deduct wallet balance (wallet-first)
      const newBalance = Number(wallet.balance_ghs) - orderAmount;
      const { error: deductError } = await supabase
        .from("wallets")
        .update({ balance_ghs: newBalance })
        .eq("id", wallet.id);

      if (deductError) {
        console.error("[wallet-order] Wallet deduction failed:", deductError);
        return new Response(JSON.stringify({ error: "Failed to deduct wallet" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 5. Create debit transaction
      const debitRef = `ORD-${cleanOrderId}`;
      await supabase.from("wallet_transactions").insert({
        user_id: userId,
        type: "debit",
        amount_ghs: orderAmount,
        status: "confirmed",
        reference: debitRef,
        description: `Payment for order ${cleanOrderId} - ${order.network} ${order.bundle_size_gb}GB`,
      });

      console.log(`[wallet-order] Wallet deducted: GHS ${orderAmount}, new balance: GHS ${newBalance}`);

      // 6. Update order to Paid
      await supabase
        .from("orders")
        .update({ status: "Paid", payment_method: "wallet", payment_status: "paid" })
        .eq("order_id", cleanOrderId);

      walletBalanceForResponse = newBalance;
    } else {
      // dispatch_only path: bot already debited + created Paid order. Read
      // current wallet balance just so we can echo it in the response.
      const ownerId = order.user_id as string;
      const { data: w } = await supabase.from("wallets").select("balance_ghs").eq("user_id", ownerId).maybeSingle();
      walletBalanceForResponse = w ? Number(w.balance_ghs) : null;
      console.log(`[wallet-order] dispatch_only: skipping debit/order-create for ${cleanOrderId}`);
    }

    // Resolve a userId for downstream attribution (referral, ledger, etc.)
    // even when called via service-role+dispatch_only.
    const effectiveUserId = userId ?? (order.user_id as string);
    const newBalance = walletBalanceForResponse ?? 0;

    // 7. Bulk dispatch queue gate (master switch = feature flag + manual_bulk mode)
    if (await shouldQueueOrder(supabase, { order_id: cleanOrderId, network: order.network }, "orders")) {
      console.log(`[wallet-order][queue] Order ${cleanOrderId} queued (flag+manual_bulk active), staying as Pending`);
      await supabase.from("orders").update({ status: "Pending", queue_state: "queued" }).eq("order_id", cleanOrderId);

      return new Response(JSON.stringify({
        success: true,
        order_id: cleanOrderId,
        status: "Pending",
        dispatch_mode: "manual_queue",
        message: "Order queued for manual bulk dispatch",
        wallet_balance: newBalance,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    // 7b. Call supplier API via dispatch layer (routes to correct supplier)
    const supplierPayload = {
      network: order.network,
      phone_number: order.recipient_number,
      data_amount: String(order.bundle_size_gb),
    };

    const startTime = Date.now();
    const result = await dispatchToSupplier(supabase, supplierPayload, order.product_id, { orderId: order.order_id });
    const responseTimeMs = Date.now() - startTime;
    const rawResponse = JSON.stringify(result.body);

    console.log(`[wallet-order] Supplier ${result.supplierCode} responded in ${responseTimeMs}ms, ok=${result.ok}`);

    if (result.ok) {
      const p = parseDispatchResult(result);

      await supabase
        .from("orders")
        .update({
          status: p.newStatus,
          supplier_order_id: p.supplierOrderId,
          supplier_reference: p.supplierReference,
          supplier_status: p.supplierStatus,
          supplier_message: p.supplierMessage,
          supplier_amount: p.supplierAmount,
          supplier_remaining_balance: p.supplierBalance,
          supplier_timestamp: new Date().toISOString(),
          supplier_raw_response: rawResponse,
          supplier_id: p.supplierId,
        })
        .eq("order_id", cleanOrderId);

      console.log(`[wallet-order] ${cleanOrderId} → ${p.newStatus} via ${p.supplierCode}`);

      // Log supplier spend
      const costPrice = Number(order.cost_price_ghs || order.amount_ghs || 0);
      await logSupplierSpend(supabase, cleanOrderId, costPrice, {
        network: order.network,
        bundle_size_gb: order.bundle_size_gb,
        recipient: order.recipient_number,
        supplier_order_id: p.supplierOrderId,
        created_by: effectiveUserId,
      });

      // Referral qualification (non-blocking)
      await processReferralQualification(supabase, effectiveUserId, cleanOrderId, {
        amount: orderAmount,
        network: order.network as string,
        bundle: `${order.bundle_size_gb}GB`,
        order_source: (isServiceRole && dispatch_only) ? "telegram" : "wallet",
      });

      // SMS for order placement intentionally disabled — not an approved transactional event

      return new Response(JSON.stringify({
        success: true,
        order_id: cleanOrderId,
        status: p.newStatus,
        supplier_order_id: p.supplierOrderId,
        supplier_code: p.supplierCode,
        wallet_deducted: orderAmount,
        wallet_balance: newBalance,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // SUPPLIER FAILED - REFUND WALLET
      console.error(`[wallet-order] Supplier ${result.supplierCode} failed for ${cleanOrderId}, refunding...`);

      const failureReason = result.body.message || result.body.error || `Supplier HTTP ${result.status}`;

      // Refund wallet — look up by user_id so this works for both the
      // standard path and the service-role+dispatch_only fast path.
      const { data: refundWallet } = await supabase
        .from("wallets")
        .select("id, balance_ghs")
        .eq("user_id", effectiveUserId)
        .maybeSingle();

      const currentBal = Number(refundWallet?.balance_ghs ?? newBalance);
      const refundBalance = currentBal + orderAmount;
      if (refundWallet) {
        await supabase
          .from("wallets")
          .update({ balance_ghs: refundBalance, updated_at: new Date().toISOString() })
          .eq("id", refundWallet.id);
      }

      // Create refund transaction (idempotent guard via reference)
      const refundRef = `REF-${cleanOrderId}`;
      const { data: existingRefund } = await supabase
        .from("wallet_transactions")
        .select("id")
        .eq("reference", refundRef)
        .eq("type", "refund")
        .maybeSingle();

      if (!existingRefund) {
        await supabase.from("wallet_transactions").insert({
          user_id: effectiveUserId,
          type: "refund",
          amount_ghs: orderAmount,
          status: "confirmed",
          reference: refundRef,
          description: `Auto-refund for failed order ${cleanOrderId}: ${String(failureReason).slice(0, 200)}`,
        });
      }

      // Update order as failed
      await supabase
        .from("orders")
        .update({
          status: "Failed",
          failure_reason: String(failureReason).slice(0, 500),
          supplier_raw_response: rawResponse,
          supplier_status: "failed",
          supplier_message: String(failureReason).slice(0, 500),
          supplier_timestamp: new Date().toISOString(),
          supplier_id: result.supplierId,
        })
        .eq("order_id", cleanOrderId);

      console.log(`[wallet-order] ${cleanOrderId} failed via ${result.supplierCode}, wallet refunded GHS ${orderAmount}`);

      // PUBLIC RESPONSE — no supplier names, no raw upstream text.
      // Raw supplier message is persisted to orders.supplier_message /
      // supplier_raw_response above for admin/debug only.
      return new Response(JSON.stringify({
        success: false,
        order_id: cleanOrderId,
        status: "Failed",
        public_message: "We could not complete this order at the moment. Your wallet has been refunded.",
        wallet_refunded: orderAmount,
        wallet_balance: refundBalance,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("[wallet-order] Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});