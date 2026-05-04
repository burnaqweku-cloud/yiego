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
const MAX_AMOUNT_GHS = 10000;
const MAX_REFERENCE_LEN = 100;
const MAX_EMAIL_LEN = 255;
const MAX_CALLBACK_URL_LEN = 500;
const PROCESSING_FEE_RATE = 0.04; // 4%

function isValidUUID(val: unknown): boolean {
  return typeof val === "string" && UUID_REGEX.test(val);
}

function isValidAmount(val: unknown): boolean {
  const num = Number(val);
  return typeof val === "number" && Number.isFinite(num) && num > 0 && num <= MAX_AMOUNT_GHS;
}

function sanitizeString(val: unknown, maxLen: number): string | null {
  if (val == null || typeof val !== "string") return null;
  return val.trim().slice(0, maxLen) || null;
}

/** Calculate processing fee */
function calculateProcessingFee(baseAmount: number): { processingFee: number; totalPayable: number } {
  const processingFee = Math.round(baseAmount * PROCESSING_FEE_RATE * 100) / 100;
  const totalPayable = Math.round((baseAmount + processingFee) * 100) / 100;
  return { processingFee, totalPayable };
}

/** Generate a unique order ID like DS-XXXXXXXX.
 * The prefix defaults to "DS-" to preserve byte-identical behaviour for the
 * website. Trusted server-side callers (e.g. the Telegram bot) may pass a
 * different prefix via the optional `order_id_prefix` request param. */
function generateOrderId(prefix = "DS-"): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = prefix;
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/** Calculate the selling price for a normal customer (replicates usePricing logic) */
async function calculateSellingPrice(
  supabase: any,
  product: Record<string, unknown>
): Promise<{ sellingPrice: number; costPrice: number; markupPercent: number | null; profit: number }> {
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

  let sellingPrice: number;

  if (override?.pricing_mode === "manual" && override.manual_price != null && Number(override.manual_price) > 0) {
    sellingPrice = Number(override.manual_price);
  } else if (override?.markup_percent_override != null && costPrice > 0) {
    sellingPrice = Math.round(costPrice * (1 + Number(override.markup_percent_override) / 100) * 100) / 100;
  } else if (costPrice > 0) {
    if (product.markup_percent != null) {
      sellingPrice = Math.round(costPrice * (1 + Number(product.markup_percent) / 100) * 100) / 100;
    } else {
      const normalMarkupType = s.normal_markup_type || "percent";
      if (normalMarkupType === "fixed") {
        sellingPrice = Math.round((costPrice + parseFloat(s.normal_markup_fixed || "0")) * 100) / 100;
      } else {
        const network = String(product.network).toLowerCase();
        const networkKey = `${network}_markup_percent`;
        const markupPercent = s[networkKey]
          ? parseFloat(s[networkKey])
          : parseFloat(s.default_markup_percent || "15");
        sellingPrice = Math.round(costPrice * (1 + markupPercent / 100) * 100) / 100;
      }
    }
  } else {
    sellingPrice = fallbackPrice;
  }

  const profit = costPrice > 0 ? Math.round((sellingPrice - costPrice) * 100) / 100 : 0;
  const markupPercent = costPrice > 0 ? Math.round(((sellingPrice - costPrice) / costPrice) * 10000) / 100 : null;

  return { sellingPrice, costPrice, markupPercent, profit };
}

/** Check if a user is an operationally active agent with valid subscription pricing */
async function checkActiveAgent(
  supabase: any,
  userId: string | null
): Promise<{ isAgent: boolean; agentId: string | null }> {
  if (!userId) return { isAgent: false, agentId: null };
  const { data: agent } = await supabase
    .from("agents")
    .select("id, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!agent) return { isAgent: false, agentId: null };

  // Check subscription effective state — expired agents must NOT get agent pricing
  const { data: stateRows } = await supabase.rpc("get_agent_effective_state", { p_agent_id: agent.id });
  const state = stateRows?.[0];
  if (!state?.has_agent_pricing) {
    console.log(`[paystack-initialize] Agent ${agent.id} has_agent_pricing=false (state=${state?.effective_state}), using normal pricing`);
    return { isAgent: false, agentId: agent.id };
  }

  return { isAgent: true, agentId: agent.id };
}

/** Calculate agent price for a product (replicates usePricing getAgentPrice logic) */
async function calculateAgentPrice(
  supabase: any,
  product: Record<string, unknown>,
  normalPricing: { sellingPrice: number; costPrice: number; markupPercent: number | null; profit: number }
): Promise<{ sellingPrice: number; costPrice: number; markupPercent: number | null; profit: number }> {
  const productId = product.id as string;
  const costPrice = normalPricing.costPrice;
  const retailPrice = normalPricing.sellingPrice;

  // Check for manual agent override first
  const { data: agentOverrides } = await supabase
    .from("pricing_overrides")
    .select("*")
    .eq("product_id", productId)
    .eq("customer_type", "agent");
  const agentOverride = agentOverrides?.[0] as Record<string, unknown> | undefined;

  if (agentOverride?.pricing_mode === "manual" && agentOverride.manual_price != null && Number(agentOverride.manual_price) > 0) {
    const agentPrice = Number(agentOverride.manual_price);
    const profit = costPrice > 0 ? Math.round((agentPrice - costPrice) * 100) / 100 : 0;
    const mp = costPrice > 0 ? Math.round(((agentPrice - costPrice) / costPrice) * 10000) / 100 : null;
    return { sellingPrice: agentPrice, costPrice, markupPercent: mp, profit };
  }

  // Auto-calculate from global settings
  const { data: settingsRows } = await supabase.from("site_settings").select("key, value");
  const s: Record<string, string> = {};
  (settingsRows || []).forEach((row: any) => { s[row.key] = row.value; });

  const method = s.agent_pricing_method || "retail_minus_percent";
  const network = String(product.network).toLowerCase();

  // Per-network override values
  const networkValueKey = `agent_${network}_value`;
  const networkOverride = s[networkValueKey] ? parseFloat(s[networkValueKey]) : null;

  let agentPrice: number;

  switch (method) {
    case "retail_minus_fixed": {
      const discount = networkOverride ?? parseFloat(s.agent_discount_fixed || "0.50");
      agentPrice = retailPrice - discount;
      break;
    }
    case "retail_minus_percent": {
      const discountPct = networkOverride ?? parseFloat(s.agent_discount_percent || "10");
      agentPrice = retailPrice * (1 - discountPct / 100);
      break;
    }
    case "cost_plus_fixed": {
      const buffer = networkOverride ?? parseFloat(s.agent_buffer_fixed || "0.20");
      agentPrice = costPrice > 0 ? costPrice + buffer : retailPrice * 0.85;
      break;
    }
    case "cost_plus_percent": {
      const bufferPct = networkOverride ?? parseFloat(s.agent_buffer_percent || "5");
      agentPrice = costPrice > 0 ? costPrice * (1 + bufferPct / 100) : retailPrice * 0.85;
      break;
    }
    default:
      agentPrice = retailPrice * 0.9;
  }

  agentPrice = Math.round(Math.max(agentPrice, 0) * 100) / 100;
  const profit = costPrice > 0 ? Math.round((agentPrice - costPrice) * 100) / 100 : 0;
  const mp = costPrice > 0 ? Math.round(((agentPrice - costPrice) / costPrice) * 10000) / 100 : null;
  return { sellingPrice: agentPrice, costPrice, markupPercent: mp, profit };
}

// ─── IP-based rate limiting (in-memory, rolling window) ──────
const rateLimitStore = new Map<string, number[]>();

function checkRateLimit(ip: string, action: string, maxPerMinute: number): boolean {
  const key = `${action}:${ip}`;
  const now = Date.now();
  const windowMs = 60_000; // 1 minute
  const windowStart = now - windowMs;

  const timestamps: number[] = (rateLimitStore.get(key) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= maxPerMinute) {
    return false; // rate limited
  }

  timestamps.push(now);
  rateLimitStore.set(key, timestamps);
  return true; // allowed
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ─── Rate limiting ───────────────────────────────────────────
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const allowed = checkRateLimit(clientIp, "paystack-init", 10);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please wait a moment and try again." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const timestamp = new Date().toISOString();
    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackKey) {
      console.error(`[${timestamp}] [paystack-initialize] CRITICAL: PAYSTACK_SECRET_KEY is not set. Payment cannot be initialized.`);
      return new Response(
        JSON.stringify({ error: "Payment is temporarily unavailable. Please try again shortly." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { purpose, callback_url } = body;

    // ─── Optional, additive params (defaults preserve existing behavior) ──
    // reference_prefix: overrides the "ORD" prefix used in the generated
    // reference. Sanitised to A-Z 0-9 only, max 8 chars. Order purpose only.
    const rawPrefix = typeof body.reference_prefix === "string" ? body.reference_prefix : null;
    const cleanPrefix = rawPrefix
      ? rawPrefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || null
      : null;
    // telegram_chat_id: when present, the resulting checkout_meta is tagged
    // with `source: "telegram"` and the chat id, so the webhook's existing
    // processOrder() path can notify the Telegram chat after delivery.
    const rawTgChat = body.telegram_chat_id;
    const telegramChatId =
      typeof rawTgChat === "number" && Number.isFinite(rawTgChat) && Math.abs(rawTgChat) < 1e15
        ? Math.trunc(rawTgChat)
        : null;
    // user_id_override: SERVICE-ROLE ONLY. Allows trusted server-side callers
    // (e.g. the Telegram bot) to act on behalf of a known linked user without
    // the user's own JWT. Hard-rejected when present without service-role auth.
    const rawUserOverride = typeof body.user_id_override === "string" ? body.user_id_override : null;
    const userIdOverride = rawUserOverride && isValidUUID(rawUserOverride) ? rawUserOverride : null;
    const userIdOverrideRequested = rawUserOverride !== null;
    // order_id_prefix: overrides the "DS-" prefix used in generated orderId.
    // Sanitised to A-Z 0-9 + trailing dash, max 5 chars including the dash.
    // Defaults to "DS-" so existing (web) callers see byte-identical behaviour.
    // Order purpose only — deposits do not generate orderIds.
    const rawOrderPrefix = typeof body.order_id_prefix === "string" ? body.order_id_prefix : null;
    let cleanOrderPrefix: string | null = null;
    if (rawOrderPrefix) {
      const stripped = rawOrderPrefix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 5);
      if (stripped) cleanOrderPrefix = stripped.endsWith("-") ? stripped : `${stripped}-`;
    }

    if (!purpose || !callback_url) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: purpose, callback_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["order", "deposit"].includes(purpose)) {
      return new Response(
        JSON.stringify({ error: "Invalid purpose. Use 'order' or 'deposit'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── System status guard: only block data orders, NOT deposits ──
    // Wallet deposits must ALWAYS work even when system is offline.
    if (purpose === "order") {
      const offlineRes = await checkSystemOnline(corsHeaders);
      if (offlineRes) return offlineRes;
    }

    const cleanCallbackUrl = sanitizeString(callback_url, MAX_CALLBACK_URL_LEN);
    if (!cleanCallbackUrl) {
      return new Response(
        JSON.stringify({ error: "Invalid callback_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Authentication ─────────────────────────────────────────
    // Deposits REQUIRE auth; orders allow guest checkout
    let userId: string | null = null;
    let isServiceRole = false;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      // Detect service-role: compare the raw bearer to the configured key.
      // (auth.getClaims doesn't expose the role for service-role JWTs reliably.)
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (serviceRoleKey && token === serviceRoleKey) {
        isServiceRole = true;
      } else {
        const supabaseAuth = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
        if (!claimsErr && claimsData?.claims?.sub) {
          userId = claimsData.claims.sub as string;
        }
      }
    }

    // Hard-reject user_id_override from any non-service-role caller. This
    // prevents client-side code from impersonating another user's wallet.
    if (userIdOverrideRequested && !isServiceRole) {
      console.warn(
        `[paystack-initialize] user_id_override rejected: caller is not service-role (ip=${clientIp})`
      );
      return new Response(
        JSON.stringify({ error: "Forbidden: user_id_override requires service-role authentication" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // Apply the override only when service-role auth is present and the
    // override resolved to a valid UUID.
    if (isServiceRole && userIdOverride) {
      userId = userIdOverride;
    }

    // Deposits must be authenticated — only logged-in users can top up wallets
    if (purpose === "deposit" && !userId) {
      return new Response(
        JSON.stringify({ error: "Authentication required for wallet deposits" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── Security access check ─────────────────────────────────
    const deviceHash = body.device_hash || null;
    const secCheck = await checkSecurityAccess({
      supabase, userId, ip: clientIp, deviceHash,
    });
    if (!secCheck.allowed) {
      logSecurityEvent(supabase, "payment_blocked", {
        userId, ip: clientIp, deviceHash,
        meta: { purpose, block_type: secCheck.block_type },
      });
      return blockedResponse(secCheck.message || "Access restricted.", corsHeaders);
    }

    let baseAmountGhs: number;
    let processingFee: number;
    let totalPayable: number;
    let reference: string;
    let email: string;
    let metadata: Record<string, unknown> = { purpose, user_id: userId };
    let linkedOrderId: string | null = null;
    let responseExtra: Record<string, unknown> = {};
    let checkoutMeta: Record<string, unknown> | null = null;

    if (purpose === "order") {
      const { product_id, recipient_phone, flow, customer_name } = body;

      if (!product_id || !recipient_phone) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: product_id, recipient_phone" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!isValidUUID(product_id)) {
        return new Response(
          JSON.stringify({ error: "Invalid product_id format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const phone = String(recipient_phone).replace(/\s/g, "");
      if (!GHANA_PHONE_REGEX.test(phone)) {
        return new Response(
          JSON.stringify({ error: "Invalid Ghana phone number" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (flow && !["guest", "authenticated", "checkout", "dashboard"].includes(String(flow))) {
        return new Response(
          JSON.stringify({ error: "Invalid flow value" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
        console.log(`[${timestamp}] [paystack-initialize] Duplicate blocked: ${phone} → ${dupCheck.existingOrderId}`);
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

      const normalPricing = await calculateSellingPrice(supabase, product);
      let pricing = normalPricing;

      // Check if user is an active agent — use agent pricing if so
      const { isAgent } = await checkActiveAgent(supabase, userId);
      if (isAgent) {
        pricing = await calculateAgentPrice(supabase, product, normalPricing);
        console.log(`[${timestamp}] [paystack-initialize] Agent detected: normal=GHS${normalPricing.sellingPrice} agent=GHS${pricing.sellingPrice}`);
      }

      baseAmountGhs = pricing.sellingPrice;

      if (!isValidAmount(baseAmountGhs)) {
        console.error(`Calculated amount out of range: ${baseAmountGhs}`);
        return new Response(
          JSON.stringify({ error: "Calculated price is out of acceptable range" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Calculate 4% processing fee
      const fees = calculateProcessingFee(baseAmountGhs);
      processingFee = fees.processingFee;
      totalPayable = fees.totalPayable;

      const orderId = generateOrderId(cleanOrderPrefix || "DS-");
      // Default reference prefix "ORD" preserves byte-identical behaviour for
      // all existing (web) callers. Telegram bot passes "TGORD" so refs stay
      // distinguishable.
      const refPrefix = cleanPrefix || "ORD";
      reference = `${refPrefix}-${orderId}-${Date.now().toString(36).toUpperCase()}`;

      checkoutMeta = {
        order_id: orderId,
        user_id: userId,
        recipient_phone: phone,
        customer_name: sanitizeString(customer_name, 100) || null,
        network: product.network,
        product_id: product.id,
        bundle_size_gb: product.bundle_size_gb,
        amount_ghs: baseAmountGhs,
        processing_fee: processingFee,
        total_paid: totalPayable,
        cost_price_ghs: pricing.costPrice > 0 ? pricing.costPrice : null,
        markup_percent: pricing.markupPercent,
        profit_ghs: pricing.profit > 0 ? pricing.profit : null,
        flow: flow || "guest",
        // Additive: only present when caller passed telegram_chat_id.
        // Web callers never pass it, so the resulting object is identical.
        ...(telegramChatId !== null
          ? { source: "telegram", telegram_chat_id: telegramChatId }
          : {}),
      };

      linkedOrderId = orderId;
      email = sanitizeString(body.email, MAX_EMAIL_LEN) || (userId ? "" : `guest-${orderId}@datasika.com`);
      metadata = { ...metadata, order_id: orderId, flow: flow || "guest", product_id };
      responseExtra = { order_id: orderId, processing_fee: processingFee, total_payable: totalPayable };

      console.log(`[${timestamp}] [paystack-initialize] purpose=order orderId=${orderId} network=${product.network} size=${product.bundle_size_gb}GB amount=GHS${baseAmountGhs} fee=GHS${processingFee} total=GHS${totalPayable} phone=${phone} flow=${flow || "guest"}`);

    } else if (purpose === "deposit") {
      const { amount_ghs: depositAmount, reference: depositRef, email: depositEmail } = body;

      if (!depositAmount || !depositRef) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: amount_ghs, reference" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!isValidAmount(depositAmount)) {
        return new Response(
          JSON.stringify({ error: `Invalid deposit amount. Must be between GHS 0.01 and GHS ${MAX_AMOUNT_GHS}.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cleanRef = sanitizeString(depositRef, MAX_REFERENCE_LEN);
      if (!cleanRef) {
        return new Response(
          JSON.stringify({ error: "Invalid reference format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      baseAmountGhs = depositAmount;
      // Calculate 4% processing fee for deposits too
      const fees = calculateProcessingFee(baseAmountGhs);
      processingFee = fees.processingFee;
      totalPayable = fees.totalPayable;

      reference = cleanRef;
      email = sanitizeString(depositEmail, MAX_EMAIL_LEN) || `wallet-${cleanRef}@datasika.local`;
      metadata = {
        ...metadata,
        wallet_txn_id: body.metadata?.wallet_txn_id || null,
        flow: "deposit",
        base_amount: baseAmountGhs,
        processing_fee: processingFee,
      };
      linkedOrderId = null;
      // Additive: when telegram_chat_id is provided, persist a checkout_meta
      // tag so the deposit is attributable. Web deposit callers don't pass
      // it, so checkoutMeta stays null (byte-identical to prior behaviour).
      if (telegramChatId !== null) {
        checkoutMeta = {
          source: "telegram",
          telegram_chat_id: telegramChatId,
          flow: "deposit",
        };
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid purpose. Use 'order' or 'deposit'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!email && userId) {
      const { data: profile } = await supabase.from("profiles").select("email").eq("id", userId).maybeSingle();
      email = profile?.email || `user-${reference}@datasika.local`;
    }
    if (!email) email = `guest-${reference}@datasika.com`;

    // ─── CREATE PAYMENT INTENT (before payment) ──
    if (purpose === "order" && checkoutMeta) {
      const phone = checkoutMeta.recipient_phone as string;
      await supabase.from("payment_intents").insert({
        paystack_reference: reference,
        payment_status: "pending",
        order_type: userId ? "user" : "guest",
        user_id: userId || null,
        recipient_number: phone,
        network: checkoutMeta.network as string,
        bundle_id: checkoutMeta.product_id as string,
        bundle_size_gb: checkoutMeta.bundle_size_gb as number,
        expected_amount: baseAmountGhs,
        guest_email: !userId ? (sanitizeString(body.email, MAX_EMAIL_LEN) || null) : null,
        created_ip: clientIp,
      }).then(({ error: intentErr }) => {
        if (intentErr && intentErr.code !== "23505") {
          console.error("[paystack-initialize] Failed to create payment_intent (non-fatal):", intentErr);
        }
      });
    }

    // ─── CREATE PAYMENT INTENT FOR DEPOSITS TOO ──
    if (purpose === "deposit" && userId) {
      await supabase.from("payment_intents").insert({
        paystack_reference: reference,
        payment_status: "pending",
        order_type: "deposit",
        user_id: userId,
        recipient_number: "N/A",
        network: "N/A",
        bundle_size_gb: 0,
        expected_amount: baseAmountGhs,
        created_ip: clientIp,
      }).then(({ error: intentErr }) => {
        if (intentErr && intentErr.code !== "23505") {
          console.error("[paystack-initialize] Failed to create deposit payment_intent (non-fatal):", intentErr);
        }
      });
    }

    // ─── CREATE PAYSTACK PAYMENT RECORD ──
    const { error: insertError } = await supabase.from("paystack_payments").insert({
      reference,
      purpose,
      amount_ghs: baseAmountGhs,
      processing_fee: processingFee,
      total_paid: totalPayable,
      currency: "GHS",
      status: "pending",
      customer_email: email,
      linked_order_id: linkedOrderId,
      linked_wallet_txn_id: body.metadata?.wallet_txn_id || null,
      user_id: userId,
      checkout_meta: checkoutMeta,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        console.warn("Duplicate reference:", reference);
        return new Response(
          JSON.stringify({ error: "This payment reference already exists" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("Failed to create paystack_payments record:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to initialize payment" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── INITIALIZE PAYSTACK TRANSACTION with totalPayable ──────
    const amountPesewas = Math.round(totalPayable * 100);

    // Enrich metadata with intent fields for Paystack
    if (purpose === "order" && checkoutMeta) {
      metadata.recipient_number = checkoutMeta.recipient_phone;
      metadata.network = checkoutMeta.network;
      metadata.bundle_id = checkoutMeta.product_id;
      metadata.bundle_size = checkoutMeta.bundle_size_gb;
      metadata.order_type = userId ? "user" : "guest";
      if (!userId) metadata.guest_email = sanitizeString(body.email, MAX_EMAIL_LEN) || undefined;
    }

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
      console.warn(`[${timestamp}] [paystack-initialize] settlement_mode read failed, defaulting to main:`, e);
    }

    const paystackPayload: Record<string, unknown> = {
      amount: amountPesewas,
      email,
      reference,
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

    console.log(`[${timestamp}] [paystack-initialize] Calling Paystack API: purpose=${purpose} amount=${amountPesewas}pesewas reference=${reference} settlement=${settlementMode} subaccount=${useSubaccount ? "yes" : "no"}`);

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paystackPayload),
    });

    const paystackData = await paystackRes.json();
    console.log(`[${timestamp}] [paystack-initialize] Paystack response status=${paystackRes.status} ok=${paystackRes.ok}`);

    if (!paystackRes.ok || !paystackData.status) {
      const paystackError = paystackData.message || `HTTP ${paystackRes.status}`;
      console.error(`[${timestamp}] [paystack-initialize] Paystack init FAILED: ${paystackError}`);
      await supabase.from("paystack_payments").delete().eq("reference", reference);
      return new Response(
        JSON.stringify({ error: "Payment is temporarily unavailable. Please try again shortly." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${timestamp}] [paystack-initialize] SUCCESS reference=${reference} total=GHS${totalPayable}`);

    return new Response(
      JSON.stringify({
        success: true,
        authorization_url: paystackData.data.authorization_url,
        access_code: paystackData.data.access_code,
        reference: paystackData.data.reference,
        processing_fee: processingFee,
        total_payable: totalPayable,
        ...responseExtra,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(`[paystack-initialize] Unexpected error:`, err);
    return new Response(
      JSON.stringify({ error: "Payment is temporarily unavailable. Please try again shortly." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
