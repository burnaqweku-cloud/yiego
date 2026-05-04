// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkSecurityAccess, logSecurityEvent, extractClientIp, blockedResponse } from "../_shared/check-security.ts";
import { checkSystemOnline, checkNetworkAvailable } from "../_shared/system-status-guard.ts";
import { checkDuplicateInFlightOrder } from "../_shared/duplicate-order-guard.ts";
import { validateNetworkMatch } from "../_shared/network-detect.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Validation helpers ─────────────────────────────────────
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GHANA_PHONE_REGEX = /^0[2-5][0-9]{8}$/;
const VALID_PURPOSES = ["agent_activation", "agent_subscription", "agent_order"];
const MAX_AMOUNT_GHS = 10000;
const MAX_NAME_LEN = 100;
const MAX_EMAIL_LEN = 255;
const MAX_CALLBACK_URL_LEN = 500;
const PROCESSING_FEE_RATE = 0.04; // 4%

// ─── Subscription Pricing Constants ─────────────────────────
const MONTHLY_STANDARD = 50;
const MONTHLY_PROMO = 35;
const YEARLY_STANDARD = 250;
const YEARLY_PROMO = 185;

function isValidUUID(val: unknown): boolean {
  return typeof val === "string" && UUID_REGEX.test(val);
}

function isValidAmount(val: number): boolean {
  return Number.isFinite(val) && val > 0 && val <= MAX_AMOUNT_GHS;
}

function sanitizeString(val: unknown, maxLen: number): string | null {
  if (val == null || typeof val !== "string") return null;
  return val.trim().slice(0, maxLen) || null;
}

function calculateProcessingFee(baseAmount: number): { processingFee: number; totalPayable: number } {
  const processingFee = Math.round(baseAmount * PROCESSING_FEE_RATE * 100) / 100;
  const totalPayable = Math.round((baseAmount + processingFee) * 100) / 100;
  return { processingFee, totalPayable };
}

function generateAgentOrderId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "AGT-";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Determine if the agent qualifies for promo pricing.
 * Activation promo: agent status === 'approved' and within 24h window.
 * Renewal promo: agent is active/expired and within renewal promo windows.
 */
function isPromoActive(agent: Record<string, unknown>, latestSubscription: Record<string, unknown> | null): boolean {
  // ─── Activation promo (first-time) ───
  if (agent.status === "approved") {
    const discountExtendedUntil = agent.discount_extended_until as string | null;
    const activationDiscountExpiresAt = agent.activation_discount_expires_at as string | null;
    const effectiveExpiry = discountExtendedUntil || activationDiscountExpiresAt;
    if (effectiveExpiry && new Date(effectiveExpiry) > new Date()) return true;
    return false;
  }

  // ─── Renewal promo (existing agents) ───
  if (!latestSubscription) return false;
  const expiryDate = new Date(latestSubscription.expiry_date as string);
  const now = new Date();

  const REMINDER_DAYS = 7;
  const GRACE_HOURS = 24;
  const POST_GRACE_PROMO_HOURS = 24;

  const reminderStart = new Date(expiryDate.getTime() - REMINDER_DAYS * 24 * 60 * 60 * 1000);
  const graceEnd = new Date(expiryDate.getTime() + GRACE_HOURS * 60 * 60 * 1000);
  const postGracePromoEnd = new Date(graceEnd.getTime() + POST_GRACE_PROMO_HOURS * 60 * 60 * 1000);

  // In reminder period, grace period, or post-grace promo window
  if (now >= reminderStart && now <= postGracePromoEnd) return true;

  return false;
}

/**
 * Get subscription price based on plan and promo status.
 */
function getSubscriptionPrice(plan: string, promoActive: boolean): number {
  if (plan === "yearly") return promoActive ? YEARLY_PROMO : YEARLY_STANDARD;
  return promoActive ? MONTHLY_PROMO : MONTHLY_STANDARD;
}

/**
 * Get standard price for display.
 */
function getStandardPrice(plan: string): number {
  return plan === "yearly" ? YEARLY_STANDARD : MONTHLY_STANDARD;
}

/**
 * Returns the DataSika Agent Base Price for a product.
 */
async function resolveDataSikaAgentBasePrice(
  supabase: any,
  productId: string,
  product: Record<string, unknown>
): Promise<{ price: number; source: string }> {
  const { data: override } = await supabase
    .from("pricing_overrides")
    .select("manual_price, pricing_mode")
    .eq("product_id", productId)
    .eq("customer_type", "agent")
    .maybeSingle();

  if (override?.manual_price != null && Number(override.manual_price) > 0) {
    return { price: Number(override.manual_price), source: "pricing_overrides" };
  }

  if (product.agent_price_ghs != null && Number(product.agent_price_ghs) > 0) {
    return { price: Number(product.agent_price_ghs), source: "product.agent_price_ghs" };
  }

  console.warn(`[agent-base-price] No agent pricing override found for product ${productId}. Falling back to retail price GHS ${product.price_ghs}. Admin should configure agent pricing.`);
  return { price: Number(product.price_ghs), source: "retail_fallback" };
}

async function calculateAgentStorePrice(
  supabase: any,
  agentId: string,
  product: Record<string, unknown>
): Promise<{
  sellingPrice: number;
  dataSikaAgentBasePrice: number;
  dataSikaAgentBasePriceSource: string;
  supplierCost: number | null;
  profit: number;
}> {
  const productId = product.id as string;

  const { price: dataSikaAgentBasePrice, source: dataSikaAgentBasePriceSource } =
    await resolveDataSikaAgentBasePrice(supabase, productId, product);

  const supplierCost = product.cost_price_ghs != null ? Number(product.cost_price_ghs) : null;

  console.log(`[agent-store-price] product=${productId} network=${product.network} bundleGB=${product.bundle_size_gb} DS_base=${dataSikaAgentBasePrice} (source: ${dataSikaAgentBasePriceSource}) supplier_cost=${supplierCost}`);

  const { data: agentPricing } = await supabase
    .from("agent_pricing")
    .select("*")
    .eq("agent_id", agentId)
    .eq("product_id", productId)
    .maybeSingle();

  if (agentPricing?.custom_price && Number(agentPricing.custom_price) > 0) {
    const sellingPrice = Number(agentPricing.custom_price);
    const profit = Math.max(0, Math.round((sellingPrice - dataSikaAgentBasePrice) * 100) / 100);
    return { sellingPrice, dataSikaAgentBasePrice, dataSikaAgentBasePriceSource, supplierCost, profit };
  }

  if (agentPricing?.markup_percent != null) {
    const sellingPrice = Math.round(dataSikaAgentBasePrice * (1 + Number(agentPricing.markup_percent) / 100) * 100) / 100;
    const profit = Math.max(0, Math.round((sellingPrice - dataSikaAgentBasePrice) * 100) / 100);
    return { sellingPrice, dataSikaAgentBasePrice, dataSikaAgentBasePriceSource, supplierCost, profit };
  }

  const { data: networkPricing } = await supabase
    .from("agent_pricing")
    .select("*")
    .eq("agent_id", agentId)
    .eq("network", product.network as string)
    .is("product_id", null)
    .maybeSingle();

  if (networkPricing?.markup_percent != null) {
    const sellingPrice = Math.round(dataSikaAgentBasePrice * (1 + Number(networkPricing.markup_percent) / 100) * 100) / 100;
    const profit = Math.max(0, Math.round((sellingPrice - dataSikaAgentBasePrice) * 100) / 100);
    return { sellingPrice, dataSikaAgentBasePrice, dataSikaAgentBasePriceSource, supplierCost, profit };
  }

  const sellingPrice = dataSikaAgentBasePrice;
  return { sellingPrice, dataSikaAgentBasePrice, dataSikaAgentBasePriceSource, supplierCost, profit: 0 };
}

// ─── IP-based rate limiting (in-memory, rolling window) ──────
const rateLimitStore = new Map<string, number[]>();

function checkRateLimit(ip: string, action: string, maxPerMinute: number): boolean {
  const key = `${action}:${ip}`;
  const now = Date.now();
  const windowMs = 60_000;
  const windowStart = now - windowMs;

  const timestamps: number[] = (rateLimitStore.get(key) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= maxPerMinute) {
    return false;
  }

  timestamps.push(now);
  rateLimitStore.set(key, timestamps);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const allowed = checkRateLimit(clientIp, "agent-payment-init", 10);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please wait a moment and try again." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { purpose } = body;

    // System status guard: only block agent_order (data orders)
    if (purpose === "agent_order") {
      const offlineRes = await checkSystemOnline(corsHeaders);
      if (offlineRes) return offlineRes;
    }

    // Authentication
    const authHeader = req.headers.get("Authorization");
    let callerUserId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser();
      if (authError) {
        console.error("[agent-init] Auth error:", authError.message);
      }
      if (authUser?.id) {
        callerUserId = authUser.id;
      }
    }

    if (purpose !== "agent_order" && !callerUserId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackKey) {
      console.error("PAYSTACK_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Payment provider not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { agent_id, callback_url, email } = body;

    console.log(`[agent-init] Received request: purpose=${purpose}, agent_id=${agent_id}, caller=${callerUserId || 'guest'}`);

    if (!purpose || !agent_id || !callback_url) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: purpose, agent_id, callback_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!VALID_PURPOSES.includes(purpose)) {
      return new Response(
        JSON.stringify({ error: `Invalid purpose. Use one of: ${VALID_PURPOSES.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isValidUUID(agent_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid agent_id format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanCallbackUrl = sanitizeString(callback_url, MAX_CALLBACK_URL_LEN);
    if (!cleanCallbackUrl) {
      return new Response(
        JSON.stringify({ error: "Invalid callback_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Security access check
    const deviceHash = body.device_hash || null;
    const secCheck = await checkSecurityAccess({
      supabase, userId: callerUserId, ip: clientIp, deviceHash,
    });
    if (!secCheck.allowed) {
      logSecurityEvent(supabase, "agent_payment_blocked", {
        userId: callerUserId, ip: clientIp, deviceHash,
        meta: { purpose, agent_id, block_type: secCheck.block_type },
      });
      return blockedResponse(secCheck.message || "Access restricted.", corsHeaders);
    }

    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("*")
      .eq("id", agent_id)
      .maybeSingle();

    if (agentErr || !agent) {
      console.error("[agent-init] Agent not found:", agent_id, agentErr);
      return new Response(
        JSON.stringify({ error: "Agent not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ownership check: only for activation/subscription
    if (purpose !== "agent_order" && agent.user_id !== callerUserId) {
      console.error(`[agent-init] Ownership mismatch: caller=${callerUserId}, agent.user_id=${agent.user_id}`);
      return new Response(
        JSON.stringify({ error: "Forbidden: you do not own this agent" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let baseAmountGhs: number;
    let processingFee: number;
    let totalPayable: number;
    let finalReference: string;
    let paystackEmail: string;
    let metadata: Record<string, unknown> = { purpose, agent_id };
    let linkedOrderId: string | null = null;
    let checkoutMeta: Record<string, unknown> | null = null;

    if (purpose === "agent_activation") {
      const { data: feeSetting } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "agent_activation_fee")
        .maybeSingle();
      baseAmountGhs = feeSetting ? parseFloat(feeSetting.value) : 50;

      if (!isValidAmount(baseAmountGhs)) {
        console.error("[agent-init] Invalid activation fee:", baseAmountGhs);
        return new Response(
          JSON.stringify({ error: "Invalid activation fee configuration" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const fees = calculateProcessingFee(baseAmountGhs);
      processingFee = fees.processingFee;
      totalPayable = fees.totalPayable;

      finalReference = `act-${agent_id.substring(0, 8)}-${Date.now()}`;
      paystackEmail = sanitizeString(email, MAX_EMAIL_LEN) || agent.store_email;

    } else if (purpose === "agent_subscription") {
      // ─── Plan selection + promo pricing + intent-based flow ───
      const plan = body.plan === "yearly" ? "yearly" : "monthly";

      // Fetch latest subscription for renewal promo check
      const { data: latestSub } = await supabase
        .from("agent_subscriptions")
        .select("expiry_date")
        .eq("agent_id", agent.id)
        .order("expiry_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const promoActive = isPromoActive(agent, latestSub);
      baseAmountGhs = getSubscriptionPrice(plan, promoActive);
      const standardPrice = getStandardPrice(plan);

      const fees = calculateProcessingFee(baseAmountGhs);
      processingFee = fees.processingFee;
      totalPayable = fees.totalPayable;

      paystackEmail = sanitizeString(email, MAX_EMAIL_LEN) || agent.store_email;

      if (!paystackEmail) {
        console.error("[agent-init] No email for subscription payment");
        return new Response(
          JSON.stringify({ error: "Add an email to your profile to continue." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
      finalReference = `AGT_SUB_${Date.now()}_${randomPart}`;

      // Determine intent type
      const intentType = agent.status === "approved" ? "activation" : "renewal";

      // ─── CRITICAL FIX: Create intent ONLY, do NOT create subscription or change agent status ───
      const { data: intent, error: intentErr } = await supabase
        .from("agent_subscription_payment_intents")
        .insert({
          agent_id: agent.id,
          intent_type: intentType,
          plan,
          amount_expected: baseAmountGhs,
          paystack_reference: finalReference,
          status: "initialized",
        })
        .select("id")
        .single();

      if (intentErr) {
        console.error("[agent-init] Failed to create subscription intent:", intentErr);
        return new Response(
          JSON.stringify({ error: "Failed to initialize subscription payment" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      metadata = {
        ...metadata,
        intent_id: intent.id,
        intent_type: intentType,
        plan,
        plan_price_standard: standardPrice,
        plan_price_current: baseAmountGhs,
        promo_active: promoActive,
      };

      console.log(`[agent-init] Subscription intent created: ${intent.id}, type=${intentType}, plan=${plan}, promo=${promoActive}, ref=${finalReference}, base=GHS ${baseAmountGhs}, fee=${processingFee}, total=${totalPayable}`);

    } else if (purpose === "agent_order") {
      const { product_id, customer_phone, customer_name, customer_email } = body;

      if (!product_id || !customer_phone) {
        return new Response(
          JSON.stringify({ error: "Missing order fields: product_id, customer_phone" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!isValidUUID(product_id)) {
        return new Response(
          JSON.stringify({ error: "Invalid product_id format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const phone = String(customer_phone).replace(/\s/g, "");
      if (!GHANA_PHONE_REGEX.test(phone)) {
        return new Response(
          JSON.stringify({ error: "Invalid Ghana phone number" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cleanName = sanitizeString(customer_name, MAX_NAME_LEN);
      const cleanEmail = sanitizeString(customer_email, MAX_EMAIL_LEN);

      const { data: product, error: prodErr } = await supabase
        .from("products")
        .select("*")
        .eq("id", product_id)
        .eq("active", true)
        .maybeSingle();

      if (prodErr || !product) {
        return new Response(
          JSON.stringify({ error: "Product not found or inactive" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ─── Network availability guard ───
      const networkAvailRes = await checkNetworkAvailable(product.network as string, corsHeaders);
      if (networkAvailRes) return networkAvailRes;

      // ─── Duplicate in-flight order guard ───
      const dupCheck = await checkDuplicateInFlightOrder(supabase, phone);
      if (dupCheck.blocked) {
        console.log(`[agent-init] Duplicate blocked: ${phone} → ${dupCheck.existingOrderId}`);
        return new Response(
          JSON.stringify({ error: dupCheck.message }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ─── Network mismatch guard ───
      const networkMismatch = validateNetworkMatch(phone, product.network as string);
      if (networkMismatch) {
        return new Response(
          JSON.stringify({ error: networkMismatch }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ─── Check agent subscription via canonical effective state RPC ───
      const { data: stateRows, error: stateErr } = await supabase
        .rpc("get_agent_effective_state", { p_agent_id: agent_id });

      const agentState = Array.isArray(stateRows) && stateRows.length > 0 ? stateRows[0] : null;
      if (!agentState || !agentState.can_store_accept_orders) {
        console.warn(`[agent-init] Store checkout blocked: agent=${agent_id}, state=${agentState?.effective_state || 'unknown'}`);
        return new Response(
          JSON.stringify({ error: "This store is currently inactive. The agent needs to renew their subscription." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pricing = await calculateAgentStorePrice(supabase, agent_id, product);
      baseAmountGhs = pricing.sellingPrice;

      if (baseAmountGhs < pricing.dataSikaAgentBasePrice) {
        console.warn(`[agent-init] Selling price GHS ${baseAmountGhs} is below DataSika base GHS ${pricing.dataSikaAgentBasePrice}, using base as floor`);
        baseAmountGhs = pricing.dataSikaAgentBasePrice;
      }

      if (!isValidAmount(baseAmountGhs)) {
        console.error("[agent-init] Calculated amount out of range:", baseAmountGhs);
        return new Response(
          JSON.stringify({ error: "Calculated price is out of acceptable range" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const fees = calculateProcessingFee(baseAmountGhs);
      processingFee = fees.processingFee;
      totalPayable = fees.totalPayable;

      const agentProfit = Math.max(0, Math.round((baseAmountGhs - pricing.dataSikaAgentBasePrice) * 100) / 100);
      const dataSikaProfit = pricing.supplierCost != null && pricing.supplierCost > 0
        ? Math.max(0, Math.round((pricing.dataSikaAgentBasePrice - pricing.supplierCost) * 100) / 100)
        : Math.max(0, pricing.dataSikaAgentBasePrice);

      const orderId = generateAgentOrderId();
      finalReference = `agtord-${orderId}-${Date.now().toString(36).toUpperCase()}`;
      paystackEmail = cleanEmail || `guest+${orderId}@datasika.com`;
      linkedOrderId = orderId;

      checkoutMeta = {
        agent_id,
        order_id: orderId,
        customer_phone: phone,
        customer_name: cleanName,
        customer_email: cleanEmail,
        network: product.network,
        bundle_size_gb: product.bundle_size_gb,
        product_id: product.id,
        agent_selling_price: baseAmountGhs,
        agent_cost_price: pricing.dataSikaAgentBasePrice,
        datasika_agent_base_price_source: pricing.dataSikaAgentBasePriceSource,
        supplier_cost_at_purchase: pricing.supplierCost,
        datasika_profit_at_purchase: dataSikaProfit,
        profit_ghs: agentProfit,
        processing_fee: processingFee,
        total_paid: totalPayable,
      };

      metadata = { ...metadata, order_id: orderId, product_id };
      console.log(`[agent-init] Checkout ${orderId}: ${product.network} ${product.bundle_size_gb}GB selling=GHS ${baseAmountGhs} DS_base=GHS ${pricing.dataSikaAgentBasePrice} (${pricing.dataSikaAgentBasePriceSource}) agent_profit=GHS ${agentProfit} datasika_profit=GHS ${dataSikaProfit} supplier_cost=GHS ${pricing.supplierCost} fee=GHS ${processingFee} total=GHS ${totalPayable}`);

    } else {
      console.error("[agent-init] Invalid purpose:", purpose);
      return new Response(
        JSON.stringify({ error: `Invalid purpose: ${purpose}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── CREATE PAYMENT INTENT for agent_order ──
    if (purpose === "agent_order" && checkoutMeta) {
      const phone = checkoutMeta.customer_phone as string;
      await supabase.from("payment_intents").insert({
        paystack_reference: finalReference,
        payment_status: "pending",
        order_type: "agent",
        user_id: callerUserId || null,
        agent_id: agent_id,
        store_id: agent_id,
        recipient_number: phone,
        network: checkoutMeta.network as string,
        bundle_id: checkoutMeta.product_id as string,
        bundle_size_gb: checkoutMeta.bundle_size_gb as number,
        expected_amount: baseAmountGhs,
        guest_email: (checkoutMeta.customer_email as string) || null,
        created_ip: clientIp,
      }).then(({ error: intentErr }) => {
        if (intentErr && intentErr.code !== "23505") {
          console.error("[agent-init] Failed to create payment_intent (non-fatal):", intentErr);
        }
      });
    }

    // Create paystack_payments record
    const paymentUserId = purpose === "agent_order" ? (callerUserId || null) : agent.user_id;
    const { error: insertErr } = await supabase.from("paystack_payments").insert({
      reference: finalReference,
      purpose,
      amount_ghs: baseAmountGhs,
      processing_fee: processingFee,
      total_paid: totalPayable,
      currency: "GHS",
      status: "pending",
      customer_email: paystackEmail,
      linked_order_id: linkedOrderId,
      user_id: paymentUserId,
      checkout_meta: checkoutMeta,
    });

    if (insertErr) {
      if (insertErr.code === "23505") {
        return new Response(
          JSON.stringify({ error: "Duplicate payment reference" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("[agent-init] Failed to create payment record:", insertErr);
      return new Response(
        JSON.stringify({ error: "Failed to initialize payment record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enrich metadata with intent fields for agent_order
    if (purpose === "agent_order" && checkoutMeta) {
      metadata.recipient_number = checkoutMeta.customer_phone;
      metadata.network = checkoutMeta.network;
      metadata.bundle_id = checkoutMeta.product_id;
      metadata.bundle_size = checkoutMeta.bundle_size_gb;
      metadata.order_type = "agent";
      metadata.store_id = agent_id;
    }

    // Initialize Paystack with totalPayable (base + fee)
    const amountPesewas = Math.round(totalPayable * 100);
    const subaccountCode = Deno.env.get("PAYSTACK_SUBACCOUNT_CODE")?.trim();
    // Read admin-controlled settlement mode (main | subaccount). Defaults to 'main'.
    let settlementMode = "main";
    try {
      const { data: modeRow } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "paystack_settlement_mode")
        .maybeSingle();
      if (modeRow?.value === "subaccount") settlementMode = "subaccount";
    } catch (e) {
      console.warn("[agent-init] settlement_mode read failed, defaulting to main:", e);
    }

    const paystackPayload: Record<string, unknown> = {
      amount: amountPesewas,
      email: paystackEmail,
      reference: finalReference,
      callback_url: cleanCallbackUrl,
      currency: "GHS",
      metadata,
      channels: ["mobile_money", "card", "bank"],
    };
    // Only route to subaccount when admin has explicitly enabled subaccount mode.
    const useSubaccount = settlementMode === "subaccount" && !!subaccountCode;
    if (useSubaccount) {
      paystackPayload.subaccount = subaccountCode;
      paystackPayload.bearer = "subaccount";
    }
    console.log(`[agent-init] settlement_mode=${settlementMode} subaccount=${useSubaccount ? "yes" : "no"}`);

    console.log("[agent-init] Initializing Paystack:", JSON.stringify(paystackPayload));

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paystackPayload),
    });

    const paystackData = await paystackRes.json();
    console.log("[agent-init] Paystack response status:", paystackRes.status, "body:", JSON.stringify(paystackData));

    if (!paystackRes.ok || !paystackData.status) {
      console.error("[agent-init] Paystack init failed:", paystackData);
      // Log error for admin diagnostics
      await supabase.from("paystack_init_error_logs").insert({
        context: purpose,
        agent_id: agent_id,
        intent_type: metadata.intent_type || null,
        plan: metadata.plan || null,
        amount_expected: baseAmountGhs,
        error_message: paystackData.message || "Unknown Paystack error",
        raw_response: JSON.stringify(paystackData).slice(0, 2000),
      }).then(({ error: logErr }) => {
        if (logErr) console.error("[agent-init] Failed to log init error:", logErr);
      });
      await supabase.from("paystack_payments").delete().eq("reference", finalReference);
      return new Response(
        JSON.stringify({ error: paystackData.message || "Paystack initialization failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[agent-init] Success! authorization_url ready, ref=${finalReference}`);

    return new Response(
      JSON.stringify({
        success: true,
        authorization_url: paystackData.data.authorization_url,
        access_code: paystackData.data.access_code,
        reference: paystackData.data.reference,
        order_id: linkedOrderId,
        processing_fee: processingFee,
        total_payable: totalPayable,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[agent-init] Unexpected error:", err);
    // Best-effort error logging
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const body = await req.clone().json().catch(() => ({}));
      await supabase.from("paystack_init_error_logs").insert({
        context: body.purpose || "unknown",
        agent_id: body.agent_id || null,
        error_message: String(err),
      });
    } catch (_) { /* ignore logging failures */ }
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
