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

// ─── Fire-and-forget Telegram message (via gateway) ────────
// Used to send payment-confirmation receipts to Telegram chats immediately
// after the webhook processes a TG-prefixed order or a TG-initiated deposit.
// Works for BOTH linked and guest users — we route purely by chat_id.
function maskPhone(num: string | null | undefined): string {
  if (!num) return "—";
  const s = String(num);
  if (s.length <= 4) return s;
  return s.slice(0, -4).replace(/\d/g, "•") + s.slice(-4);
}
async function tgSendMessage(chatId: number | string, text: string) {
  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const tgKey = Deno.env.get("TELEGRAM_API_KEY");
    if (!lovableKey || !tgKey) {
      console.warn("[tg] missing gateway keys, skipping send");
      return;
    }
    const res = await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": tgKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[tg] sendMessage failed [${res.status}]:`, body.slice(0, 200));
    }
  } catch (e) {
    console.error("[tg] sendMessage exception:", e);
  }
}

// ─── Fire-and-forget Push Notification helper ──────────────
async function firePush(params: {
  title: string;
  message: string;
  playerIds?: string[];
  segment?: string;
  url?: string;
  idempotencyKey?: string;
  entityType?: string;
  entityId?: string;
}) {
  try {
    const fnUrl = Deno.env.get("SUPABASE_URL")! + "/functions/v1/send-push-notification";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": key,
      },
      body: JSON.stringify({ ...params, triggeredBy: "system" }),
    });
  } catch (e) {
    console.error("[push] Fire-and-forget failed:", e);
  }
}

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hashHex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ─── GET diagnostic endpoint: proves webhook URL is reachable ───
  if (req.method === "GET") {
    console.log("[webhook] GET diagnostic ping received");
    return new Response(JSON.stringify({ 
      status: "ok", 
      function: "paystack-webhook", 
      timestamp: new Date().toISOString(),
      message: "Webhook endpoint is reachable. Paystack should POST to this URL.",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Log every incoming request immediately for diagnostics
  const incomingTimestamp = new Date().toISOString();
  console.log(`[webhook] ─── INCOMING REQUEST ─── ${incomingTimestamp} method=${req.method} content-type=${req.headers.get("content-type")} has-signature=${!!req.headers.get("x-paystack-signature")}`);

  try {
    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackKey) {
      console.error("[webhook] PAYSTACK_SECRET_KEY not configured — rejecting");
      return new Response(JSON.stringify({ error: "Not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");
    console.log(`[webhook] Body length=${rawBody.length}, signature=${signature ? signature.substring(0, 16) + "..." : "MISSING"}`);

    if (!signature) {
      console.warn("[webhook] REJECTED: Missing x-paystack-signature header");
      return new Response(JSON.stringify({ error: "Missing signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const isValid = await verifySignature(rawBody, signature, paystackKey);
    if (!isValid) {
      console.warn("[webhook] REJECTED: Signature verification failed. Key starts with:", paystackKey.substring(0, 7));
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("[webhook] ✓ Signature verified successfully");

    const event = JSON.parse(rawBody);
    console.log("[webhook] Event:", event.event, "ref:", event.data?.reference);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const txData = event.data;

    // ─── TRANSFER EVENTS (agent withdrawal payouts) ───
    // Handles transfer.success / transfer.failed / transfer.reversed
    // Completely isolated from charge.* logic below.
    if (typeof event.event === "string" && event.event.startsWith("transfer.")) {
      try {
        await handleTransferEvent(supabase, event);
      } catch (e) {
        console.error("[webhook:transfer] handler error (non-fatal):", e);
      }
      return new Response(JSON.stringify({ received: true, transfer: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Store ALL webhook events in paystack_transactions ──
    if (txData?.reference) {
      try {
        const customer = txData.customer as Record<string, unknown> | null;
        const authorization = txData.authorization as Record<string, unknown> | null;
        const meta = txData.metadata as Record<string, unknown> | null;
        let purpose: string | null = null;
        if (meta) purpose = (meta.purpose as string) || (meta.payment_for as string) || (meta.type as string) || null;
        // Extract ONLY trusted Paystack payer phone (not recipient/metadata phones)
        const payerPhoneCandidates: (string | null | undefined)[] = [
          customer?.phone as string,
          (txData.authorization as Record<string, unknown> | null)?.mobile_number as string,
        ];
        let customerPhone: string | null = null;
        for (const c of payerPhoneCandidates) {
          if (c && typeof c === "string" && c.trim()) {
            let p = c.replace(/\s+/g, "").trim();
            if (p.startsWith("+233")) p = "0" + p.slice(4);
            else if (p.startsWith("233") && p.length >= 12) p = "0" + p.slice(3);
            if (p.length === 10 && p.startsWith("0")) {
              customerPhone = p;
              break;
            }
          }
        }

        await supabase.from("paystack_transactions").upsert({
          reference: txData.reference,
          paystack_id: txData.id ? Number(txData.id) : null,
          status: txData.status || event.event?.replace("charge.", "") || "unknown",
          channel: txData.channel || null,
          currency: txData.currency || "GHS",
          amount: Number(txData.amount) || 0,
          fees: txData.fees != null ? Number(txData.fees) : null,
          paid_at: txData.paid_at || null,
          customer_email: customer?.email as string || null,
          customer_phone: customerPhone,
          customer_name: customer?.first_name ? `${customer.first_name} ${customer.last_name || ""}`.trim() : null,
          authorization_brand: authorization?.brand as string || null,
          authorization_last4: authorization?.last4 as string || null,
          ip_address: txData.ip_address as string || null,
          metadata: meta || {},
          raw: txData,
          purpose,
          linked_user_id: meta?.user_id as string || null,
          linked_order_id: meta?.order_id as string || meta?.linked_order_id as string || null,
          linked_deposit_id: meta?.deposit_id as string || meta?.linked_wallet_txn_id as string || null,
          linked_agent_subscription_id: meta?.subscription_id as string || null,
        }, { onConflict: "reference" });
      } catch (e) {
        console.error("[webhook] Failed to store in paystack_transactions:", e);
      }
    }

    // ── Update payment_intent status ──
    if (txData?.reference) {
      const intentStatus = event.event === "charge.success" ? "success" : "failed";
      const intentUpdate: Record<string, unknown> = { payment_status: intentStatus };
      if (intentStatus === "failed") {
        intentUpdate.fulfillment_error = "Payment failed at Paystack";
      }
      await supabase
        .from("payment_intents")
        .update(intentUpdate)
        .eq("paystack_reference", txData.reference)
        .then(({ error: intentErr }) => {
          if (intentErr) console.error("[webhook] Failed to update payment_intent (non-fatal):", intentErr);
        });
    }

    if (event.event !== "charge.success") {
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const reference = txData.reference;
    if (!reference) return new Response(JSON.stringify({ error: "No reference" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Idempotency: check if already processed
    const { data: payment } = await supabase.from("paystack_payments").select("*").eq("reference", reference).maybeSingle();
    if (!payment) {
      console.warn("[webhook] Unknown reference:", reference);
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (payment.status === "success" || payment.status === "completed") {
      console.log("[webhook] Already processed:", reference);
      return new Response(JSON.stringify({ received: true, already_processed: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const channel = txData.channel || null;
    const customerEmail = txData.customer?.email || null;
    const paidAt = txData.paid_at || null;
    const totalPaidGhs = (Number(txData.amount) || 0) / 100;

    // ── SECURITY: Verify paid amount matches expected amount ──
    const expectedTotal = Number(payment.total_paid) || (Number(payment.amount_ghs) + Number(payment.processing_fee || 0));
    const amountDiff = Math.abs(totalPaidGhs - expectedTotal);
    if (amountDiff > 0.02) {
      console.error(`[webhook] PAYMENT_AMOUNT_MISMATCH: ref=${reference} paid=GHS${totalPaidGhs} expected=GHS${expectedTotal} diff=GHS${amountDiff}`);
      try {
        await supabase.from("security_event_logs").insert({
          event_type: "PAYMENT_AMOUNT_MISMATCH",
          severity: "critical",
          user_id: payment.user_id || null,
          payment_reference: reference,
          details: { purpose: payment.purpose, paid_amount: totalPaidGhs, expected_amount: expectedTotal, difference: amountDiff, source: "webhook" },
        });
      } catch (_) { /* non-fatal */ }
      return new Response(JSON.stringify({ received: true, error: "Amount mismatch" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const storedProcessingFee = Number(payment.processing_fee) || 0;
    const amountGhs = storedProcessingFee > 0 ? Math.round((totalPaidGhs - storedProcessingFee) * 100) / 100 : totalPaidGhs;

    // ── ATOMIC: Only update if still pending (prevents race with verify endpoint) ──
    const { data: updatedPayment, error: updateErr } = await supabase.from("paystack_payments").update({
      status: "success", channel, customer_email: customerEmail, paid_at: paidAt,
      verified_at: new Date().toISOString(), raw_response: txData,
    }).eq("reference", reference).neq("status", "success").select("id").maybeSingle();

    if (updateErr) {
      console.error("[webhook] Failed to update payment status:", updateErr);
    }

    // If no row was updated, the verify endpoint already processed this payment
    if (!updatedPayment) {
      console.log("[webhook] Race condition prevented — already processed by verify path:", reference);
      try {
        await supabase.from("security_event_logs").insert({
          event_type: "DUPLICATE_WEBHOOK_PROCESSING_BLOCKED",
          severity: "low",
          payment_reference: reference,
          user_id: payment.user_id || null,
          details: { purpose: payment.purpose, source: "webhook" },
        });
      } catch (_) { /* non-fatal */ }
      return new Response(JSON.stringify({ received: true, already_processed: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (payment.purpose === "deposit") {
      await processDeposit(supabase, payment, amountGhs);
    } else if (payment.purpose === "order") {
      await processOrder(supabase, payment);
    } else if (payment.purpose === "agent_activation") {
      await processAgentActivation(supabase, payment, txData);
    } else if (payment.purpose === "agent_order") {
      await processAgentOrder(supabase, payment);
    } else if (payment.purpose === "agent_subscription") {
      await processAgentSubscription(supabase, payment, txData);
    }

    return new Response(JSON.stringify({ received: true, processed: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[webhook] Error:", err);
    return new Response(JSON.stringify({ received: true, error: "Processing error" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

async function processDeposit(supabase: any, payment: Record<string, unknown>, amountGhs: number) {
  const userId = payment.user_id as string;
  const walletTxnId = payment.linked_wallet_txn_id as string;
  const reference = payment.reference as string;

  console.log(`[webhook:deposit] userId=${userId}, walletTxnId=${walletTxnId}, amount=${amountGhs}, ref=${reference}`);

  if (!userId) { console.error("[webhook:deposit] No user_id for deposit"); return; }

  if (walletTxnId) {
    const { data: existingTxn } = await supabase.from("wallet_transactions").select("status").eq("id", walletTxnId).maybeSingle();
    if (existingTxn?.status === "confirmed") {
      console.log("[webhook:deposit] Already confirmed:", walletTxnId);
      return;
    }
    const { error: txnErr } = await supabase.from("wallet_transactions").update({ status: "confirmed" }).eq("id", walletTxnId);
    if (txnErr) console.error("[webhook:deposit] Failed to update wallet_transaction:", txnErr);
    else console.log("[webhook:deposit] Wallet transaction marked confirmed:", walletTxnId);
  }

  const { data: wallet } = await supabase.from("wallets").select("id, balance_ghs").eq("user_id", userId).maybeSingle();
  if (wallet) {
    const newBalance = Number(wallet.balance_ghs) + amountGhs;
    const { error: walletErr } = await supabase.from("wallets").update({ balance_ghs: newBalance }).eq("id", wallet.id);
    if (walletErr) console.error("[webhook:deposit] CRITICAL: Failed to credit wallet:", walletErr);
    else {
      console.log(`[webhook:deposit] Wallet credited: GHS ${amountGhs} -> new balance: GHS ${newBalance}`);
      const { data: profile } = await supabase.from("profiles").select("phone, full_name").eq("id", userId).maybeSingle();
      if (profile?.phone) {
        fireSMS({
          to: profile.phone,
          event_type: "wallet_deposit_success",
          user_id: userId,
          reference,
          template_vars: {
            name: profile.full_name || "there",
            amount: amountGhs.toFixed(2),
            balance: newBalance.toFixed(2),
            reference,
          },
        });
      }
      const { data: players } = await supabase.from("onesignal_players").select("player_id").eq("user_id", userId).eq("is_active", true);
      const playerIds = players?.map((p: { player_id: string }) => p.player_id) ?? [];
      if (playerIds.length > 0) {
        firePush({
          title: "Wallet Updated 💰",
          message: `Your wallet has been credited with GHS ${amountGhs.toFixed(2)} successfully.`,
          playerIds,
          url: "https://datasika.com/dashboard/wallet",
          idempotencyKey: `wallet_deposit_${reference}`,
          entityType: "wallet_deposit",
          entityId: reference,
        });
      }
    }
  } else {
    const { error: insertErr } = await supabase.from("wallets").insert({ user_id: userId, balance_ghs: amountGhs });
    if (insertErr) console.error("[webhook:deposit] CRITICAL: Failed to create wallet:", insertErr);
    else console.log(`[webhook:deposit] New wallet created with GHS ${amountGhs}`);
  }

  // Update payment_intent: mark deposit fulfilled by webhook
  await supabase.from("payment_intents")
    .update({ order_created: true, payment_status: "success", fulfilled_by: "webhook", fulfilled_at: new Date().toISOString() })
    .eq("paystack_reference", reference)
    .then(({ error: e }: { error: any }) => { if (e) console.error("[webhook:deposit] intent update failed (non-fatal):", e); });

  // ── Telegram: notify the chat that initiated the deposit (if any) ──
  const depMeta = (payment.checkout_meta as Record<string, unknown> | null) || null;
  const depTgChat = depMeta?.telegram_chat_id ? Number(depMeta.telegram_chat_id) : null;
  if (depTgChat) {
    const balanceText =
      `✅ <b>Wallet topped up</b>\n` +
      `💰 Amount: GHS ${amountGhs.toFixed(2)}\n` +
      `🧾 Reference: <code>${reference}</code>\n\n` +
      `Your DataSika wallet has been credited. Tap /account to see your new balance.`;
    tgSendMessage(depTgChat, balanceText);
  }
}

/**
 * Process order AFTER payment verification via webhook.
 * Uses dispatchToSupplier to route to the correct supplier.
 */
async function processOrder(supabase: any, payment: Record<string, unknown>) {
  const orderId = payment.linked_order_id as string;
  if (!orderId) { console.error("[webhook] No order_id"); return; }

  const { data: existingOrder } = await supabase.from("orders").select("*").eq("order_id", orderId).maybeSingle();

  let order: Record<string, unknown> | null = existingOrder;

  if (existingOrder) {
    if (["Processing", "Delivered"].includes(existingOrder.status as string)) return;
    await supabase.from("orders").update({ status: "Paid", payment_status: "paid", payment_method: "paystack" }).eq("order_id", orderId);
  } else {
    const meta = payment.checkout_meta as Record<string, unknown> | null;
    if (!meta) {
      console.error("[webhook] No checkout_meta and no existing order for:", orderId);
      return;
    }

    console.log(`[webhook] Creating order ${orderId} from checkout_meta after payment webhook`);

    const telegramChatId = meta.telegram_chat_id ? Number(meta.telegram_chat_id) : null;
    const orderSource = meta.order_source || (telegramChatId ? "telegram" : "web");

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
      order_source: orderSource,
      telegram_chat_id: telegramChatId,
    }).select().maybeSingle();

    if (orderErr) {
      if (orderErr.code === "23505") {
        const { data: raceOrder } = await supabase.from("orders").select("*").eq("order_id", orderId).maybeSingle();
        if (raceOrder && ["Processing", "Delivered"].includes(raceOrder.status as string)) return;
        order = raceOrder;
      } else {
        console.error("[webhook] Failed to create order:", orderErr);
        await handleOrderCreationFailure(supabase, payment, `Order insert failed: ${orderErr.message}`, "normal_user");
        await upsertReconciliationCase(supabase, payment, `Order insert failed: ${orderErr.message}`, "normal_user");
        return;
      }
    } else {
      order = newOrder;
    }
  }

  if (!order) {
    const { data: refetchOrder } = await supabase.from("orders").select("*").eq("order_id", orderId).maybeSingle();
    order = refetchOrder;
  }
  if (!order) { console.error("[webhook] Order not found after creation:", orderId); return; }

  // Update payment_intent: mark order as created + fulfilled by webhook
  const ref = payment.reference as string;
  if (ref) {
    await supabase.from("payment_intents")
      .update({ order_created: true, order_id: orderId, payment_status: "success", fulfilled_by: "webhook", fulfilled_at: new Date().toISOString() })
      .eq("paystack_reference", ref)
      .then(({ error: e }: { error: any }) => { if (e) console.error("[webhook] intent update failed (non-fatal):", e); });
  }

  await supabase.from("orders").update({ status: "Paid", payment_status: "paid", payment_method: "paystack" }).eq("order_id", orderId);
  console.log(`[webhook] Order ${orderId} marked Paid, dispatching to supplier...`);

  // ── Telegram: send payment-confirmation receipt to the chat (linked OR guest) ──
  // Routed by telegram_chat_id stored on the order. Independent of user_id.
  const tgChatForOrder = order.telegram_chat_id as number | string | null;
  if (tgChatForOrder) {
    const totalPaid = Number(order.total_paid ?? order.amount_ghs ?? 0).toFixed(2);
    // Show full recipient — this is the user's OWN confirmation (they need
    // to verify it went to the right number). Masking only applies to
    // cross-user lookups (e.g., Track Order on someone else's order).
    const recipientFull = String(order.recipient_number ?? "—");
    const text =
      `✅ <b>Payment confirmed</b>\n` +
      `📦 ${order.bundle_size_gb}GB ${order.network} → <code>${recipientFull}</code>\n` +
      `🧾 Order: <code>${orderId}</code>\n` +
      `💰 Paid: GHS ${totalPaid}\n\n` +
      `We're processing your bundle now and will notify you the moment it's delivered.`;
    // Fire-and-forget so we never block dispatch on Telegram latency.
    tgSendMessage(tgChatForOrder, text);
  }


  // Bulk dispatch queue gate (master switch = feature flag + manual_bulk mode)
  if (await shouldQueueOrder(supabase, { order_id: orderId as string, network: order.network as string }, "orders")) {
    console.log(`[webhook][queue] Order ${orderId} queued (flag+manual_bulk active), staying as Pending`);
    await supabase.from("orders").update({ status: "Pending", queue_state: "queued" }).eq("order_id", orderId);
    return;
  }

  // Use dispatch layer to route to correct supplier
  const result = await dispatchToSupplier(supabase, {
    network: order.network as string,
    phone_number: order.recipient_number as string,
    data_amount: String(order.bundle_size_gb),
  }, order.product_id as string | null, { orderId: orderId as string });

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

    console.log(`[webhook] Order ${orderId} → Processing via ${p.supplierCode}`);

    const costPrice = Number(order.cost_price_ghs) || Number(order.amount_ghs) || 0;
    await logSupplierSpend(supabase, orderId, costPrice, {
      network: order.network as string, bundle_size_gb: order.bundle_size_gb as number | string,
      recipient: order.recipient_number as string, supplier_order_id: p.supplierOrderId,
    });

    const orderUserId = order.user_id as string | null;
    if (orderUserId) {
      await processReferralQualification(supabase, orderUserId, orderId, {
        amount: Number(order.amount_ghs) || undefined,
        network: order.network as string,
        bundle: `${order.bundle_size_gb}GB`,
        order_source: (order.order_source as string) || "webhook",
      });
    }
  } else {
    const reason = result.body.message || result.body.error || `Supplier HTTP ${result.status}`;
    await supabase.from("orders").update({
      status: "Processing",
      failure_reason: String(reason),
      supplier_raw_response: rawResponse,
      supplier_status: "failed",
      supplier_message: String(reason),
      supplier_timestamp: new Date().toISOString(),
      supplier_id: result.supplierId,
    }).eq("order_id", orderId);
    console.error(`[webhook] Order ${orderId} supplier ${result.supplierCode} failed, keeping as Processing for retry`);
  }

  // SMS for order placement intentionally disabled — not an approved transactional event
  // Push notifications still active for logged-in users
  const orderUserId = order.user_id as string | null;
  if (orderUserId) {
    const { data: orderPlayers } = await supabase.from("onesignal_players").select("player_id").eq("user_id", orderUserId).eq("is_active", true);
    const orderPlayerIds = orderPlayers?.map((p: { player_id: string }) => p.player_id) ?? [];
    if (orderPlayerIds.length > 0) {
      firePush({
        title: "Order Processing 🔄",
        message: `Your ${order.network} ${order.bundle_size_gb}GB data bundle is being processed.`,
        playerIds: orderPlayerIds,
        url: `https://datasika.com/dashboard/orders`,
        idempotencyKey: `order_processing_${orderId}`,
        entityType: "order",
        entityId: orderId,
      });
    }
  }
}

async function processAgentActivation(supabase: any, payment: Record<string, unknown>, txData: Record<string, unknown>) {
  const agentId = (txData.metadata as Record<string, unknown>)?.agent_id as string;
  if (!agentId) { console.error("[webhook] No agent_id in activation metadata"); return; }

  await supabase.from("agents").update({
    status: "active", activation_paid: true,
    activation_paid_at: new Date().toISOString(),
    activation_reference: payment.reference as string,
  }).eq("id", agentId);

  console.log(`[webhook] Agent ${agentId} activated successfully`);

  const { data: agent } = await supabase.from("agents").select("user_id").eq("id", agentId).maybeSingle();
  if (agent?.user_id) {
    const { data: profile } = await supabase.from("profiles").select("phone").eq("id", agent.user_id).maybeSingle();
    if (profile?.phone) {
      fireSMS({
        to: profile.phone,
        event_type: "agent_subscription_active",
        agent_id: agentId,
        reference: payment.reference as string,
      });
    }
  }
}

/**
 * Process agent order AFTER payment verification via webhook.
 * Uses dispatchToSupplier to route to the correct supplier.
 */
async function processAgentOrder(supabase: any, payment: Record<string, unknown>) {
  const orderId = payment.linked_order_id as string;
  if (!orderId) { console.error("[webhook] No order_id for agent order"); return; }

  const { data: existingOrder } = await supabase.from("agent_orders").select("*").eq("order_id", orderId).maybeSingle();

  let order: Record<string, unknown> | null = existingOrder;

  if (existingOrder) {
    if (["Processing", "Delivered", "Paid"].includes(existingOrder.status as string)) {
      console.log("[webhook] Agent order already processed:", orderId);
      return;
    }
    await supabase.from("agent_orders").update({ payment_status: "paid", status: "Paid" }).eq("order_id", orderId);
  } else {
    const meta = payment.checkout_meta as Record<string, unknown> | null;
    if (!meta) {
      console.error("[webhook] No checkout_meta and no existing agent order for:", orderId);
      return;
    }

    console.log(`[webhook] Creating agent order ${orderId} from checkout_meta after payment webhook`);

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
        if (raceOrder && ["Processing", "Delivered", "Paid"].includes(raceOrder.status as string)) return;
        order = raceOrder;
      } else {
        console.error("[webhook] Failed to create agent order:", orderErr);
        await handleOrderCreationFailure(supabase, payment, `Agent order insert failed: ${orderErr.message}`, "agent_store");
        await upsertReconciliationCase(supabase, payment, `Agent order insert failed: ${orderErr.message}`, "agent_store");
        return;
      }
    } else {
      order = newOrder;
    }
  }

  if (!order) {
    const { data: refetchOrder } = await supabase.from("agent_orders").select("*").eq("order_id", orderId).maybeSingle();
    order = refetchOrder;
  }
  if (!order) { console.error("[webhook] Agent order not found after creation:", orderId); return; }

  await supabase.from("agent_orders").update({ payment_status: "paid", status: "Paid" }).eq("order_id", orderId);
  console.log(`[webhook] Agent order ${orderId} marked Paid, dispatching to supplier...`);

  // Update payment_intent: mark agent order fulfilled by webhook
  const agentRef = payment.reference as string;
  if (agentRef) {
    await supabase.from("payment_intents")
      .update({ order_created: true, order_id: orderId, payment_status: "success", fulfilled_by: "webhook", fulfilled_at: new Date().toISOString() })
      .eq("paystack_reference", agentRef)
      .then(({ error: e }: { error: any }) => { if (e) console.error("[webhook] agent intent update failed (non-fatal):", e); });
  }

  // Bulk dispatch queue gate (master switch = feature flag + manual_bulk mode)
  if (await shouldQueueOrder(supabase, { order_id: orderId as string, network: order.network as string }, "agent_orders")) {
    console.log(`[webhook][queue] Agent order ${orderId} queued (flag+manual_bulk active), staying as Pending`);
    await supabase.from("agent_orders").update({ status: "Pending", queue_state: "queued" }).eq("order_id", orderId);
    // Profit belongs to the agent at payment success — credit now even though supplier dispatch is deferred.
    const queuedCredit = await creditAgentProfit(supabase, orderId, "paystack_webhook_queued");
    console.log(`[webhook][queue] Profit credit result for order ${orderId}:`, queuedCredit.action, queuedCredit.reason || "");
    return;
  }

  // Use dispatch layer to route to correct supplier
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
      supplier_raw_response: rawResponse,
      supplier_timestamp: new Date().toISOString(),
    }).eq("order_id", orderId);

    console.log(`[webhook] Agent order ${orderId} → ${p.newStatus} via ${p.supplierCode}`);

    const agentCostPrice = Number(order.supplier_cost_at_purchase) || Number(order.agent_cost_price) || 0;
    await logSupplierSpend(supabase, orderId, agentCostPrice, {
      network: order.network as string, bundle_size_gb: order.bundle_size_gb as number | string,
      recipient: order.customer_phone as string, supplier_order_id: p.supplierOrderId,
    });
  } else {
    const reason = result.body.message || result.body.error || `Supplier HTTP ${result.status}`;
    await supabase.from("agent_orders").update({
      status: "Processing", supplier_raw_response: rawResponse,
      supplier_status: "failed", supplier_message: String(reason).slice(0, 500),
      supplier_timestamp: new Date().toISOString(),
    }).eq("order_id", orderId);
    console.error(`[webhook] Agent order ${orderId} supplier ${result.supplierCode} failed, keeping as Processing for retry`);
  }

  // ── Idempotent profit crediting via shared helper ──
  const creditResult = await creditAgentProfit(supabase, orderId, "paystack_webhook");
  console.log(`[webhook] Profit credit result for order ${orderId}:`, creditResult.action, creditResult.reason || "");
}

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

/**
 * Process agent subscription AFTER payment webhook.
 * Uses the SAME logic as paystack-verify's processAgentSubscription.
 * Double-processing is prevented by:
 *   1) The atomic .neq("status","success") guard on paystack_payments (only one path claims it)
 *   2) Intent-based idempotency (intent status checked before processing)
 */
async function processAgentSubscription(supabase: any, payment: Record<string, unknown>, txData: Record<string, unknown>) {
  const reference = payment.reference as string;
  const meta = (txData.metadata || payment.checkout_meta) as Record<string, unknown> | null;
  const agentId = meta?.agent_id as string;
  const intentId = meta?.intent_id as string;
  const legacySubscriptionId = meta?.subscription_id as string;
  const plan = (meta?.plan as string) || "monthly";

  console.log(`[webhook:subscription] ref=${reference}, agentId=${agentId}, intentId=${intentId}, plan=${plan}`);

  if (!agentId) {
    console.error("[webhook:subscription] No agent_id in metadata");
    return;
  }

  // ── SECURITY: Strict subscription amount verification ──
  const PLAN_PRICES: Record<string, { standard: number; promo: number }> = {
    monthly: { standard: 50, promo: 35 },
    yearly: { standard: 250, promo: 185 },
  };
  const planConfig = PLAN_PRICES[plan];
  if (!planConfig) {
    console.error(`[webhook:subscription] Unknown plan: ${plan}`);
    await logSecurityEventLocal(supabase, "SUBSCRIPTION_INVALID_PLAN", "high", {
      agent_id: agentId, payment_reference: reference, plan,
    });
    return;
  }

  const paidAmountGhs = (Number(txData.amount) || 0) / 100;
  const storedProcessingFee = Number(payment.processing_fee) || 0;
  const baseAmountPaid = storedProcessingFee > 0
    ? Math.round((paidAmountGhs - storedProcessingFee) * 100) / 100
    : paidAmountGhs;

  const isStandardMatch = Math.abs(baseAmountPaid - planConfig.standard) <= 0.02;
  const isPromoMatch = Math.abs(baseAmountPaid - planConfig.promo) <= 0.02;

  if (!isStandardMatch && !isPromoMatch) {
    console.error(`[webhook:subscription] SUBSCRIPTION_AMOUNT_MISMATCH: ref=${reference} paid_base=GHS${baseAmountPaid}`);
    await logSecurityEventLocal(supabase, "SUBSCRIPTION_AMOUNT_MISMATCH", "critical", {
      agent_id: agentId, payment_reference: reference, plan,
      paid_base_amount: baseAmountPaid,
      expected_standard: planConfig.standard,
      expected_promo: planConfig.promo,
      processing_fee: storedProcessingFee,
      total_paid: paidAmountGhs,
      source: "webhook",
    });
    return;
  }

  // ── Intent-based idempotency check (secondary guard after atomic payment status) ──
  if (intentId) {
    // Atomic: only claim the intent if it hasn't been claimed yet
    const { data: claimedIntent } = await supabase
      .from("agent_subscription_payment_intents")
      .update({ status: "success", updated_at: new Date().toISOString() })
      .eq("id", intentId)
      .neq("status", "success")
      .select("id")
      .maybeSingle();

    if (!claimedIntent) {
      console.log(`[webhook:subscription] Intent ${intentId} already processed (idempotent)`);
      return;
    }
  }

  const now = new Date();
  const daysToAdd = plan === "yearly" ? 365 : 30;

  // ── Determine expiry ──
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
    newExpiry = new Date(new Date(currentSub.expiry_date).getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    console.log(`[webhook:subscription] Extending from ${currentSub.expiry_date} → ${newExpiry.toISOString()}`);
  } else {
    newExpiry = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    console.log(`[webhook:subscription] Starting fresh → ${newExpiry.toISOString()}`);
  }

  // ── Legacy flow ──
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
    if (subErr) console.error("[webhook:subscription] Legacy sub update failed:", subErr);
  } else {
    // ── New intent-based flow ──
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
      console.error("[webhook:subscription] Failed to create subscription:", subInsertErr);
    } else {
      console.log(`[webhook:subscription] Subscription created, expires ${newExpiry.toISOString()}`);
    }
  }

  // ── Activate agent ──
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
    console.error("[webhook:subscription] Failed to activate agent:", agentErr);
    return;
  }

  console.log(`[webhook:subscription] Agent ${agentId} activated with ${plan} plan, expires ${newExpiry.toISOString()}`);

  // SMS notification
  const { data: agentData } = await supabase.from("agents").select("user_id").eq("id", agentId).maybeSingle();
  if (agentData?.user_id) {
    const { data: profile } = await supabase.from("profiles").select("phone").eq("id", agentData.user_id).maybeSingle();
    if (profile?.phone) {
      fireSMS({
        to: profile.phone,
        event_type: "agent_subscription_active",
        agent_id: agentId,
        reference,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// TRANSFER EVENT HANDLER (agent withdrawal payouts)
// ─────────────────────────────────────────────────────────────
async function handleTransferEvent(supabase: any, event: any) {
  const data = event.data || {};
  const transferRef: string | null = data.reference || null;
  const transferCode: string | null = data.transfer_code || null;
  const transferId: number | null = data.id ? Number(data.id) : null;
  const psStatus: string = (data.status as string) || event.event.replace("transfer.", "");
  const failureReason: string | null = data.failure_reason || data.failures || data.message || null;
  const eventId = `${event.event}:${transferCode || transferRef || transferId || data.id || crypto.randomUUID()}`;

  console.log(`[webhook:transfer] event=${event.event} ref=${transferRef} code=${transferCode} status=${psStatus}`);

  // 1. Idempotency check via paystack_event_id unique constraint
  const { data: dupCheck } = await supabase
    .from("paystack_transfer_events")
    .select("id, processed")
    .eq("paystack_event_id", eventId)
    .maybeSingle();

  if (dupCheck?.processed) {
    console.log(`[webhook:transfer] DUPLICATE event ${eventId} — skip`);
    return;
  }

  // 2. Find the matching withdrawal
  let withdrawal: Record<string, any> | null = null;
  if (transferRef) {
    const { data: byRef } = await supabase
      .from("agent_withdrawals")
      .select("*")
      .eq("paystack_transfer_reference", transferRef)
      .maybeSingle();
    withdrawal = byRef as Record<string, any> | null;
  }
  if (!withdrawal && transferCode) {
    const { data: byCode } = await supabase
      .from("agent_withdrawals")
      .select("*")
      .eq("paystack_transfer_code", transferCode)
      .maybeSingle();
    withdrawal = byCode as Record<string, any> | null;
  }

  // Insert event log row (best-effort dedupe via unique index on paystack_event_id)
  await supabase.from("paystack_transfer_events").insert({
    paystack_event_id: eventId,
    event_type: event.event,
    transfer_reference: transferRef,
    transfer_code: transferCode,
    withdrawal_id: withdrawal?.id || null,
    status: psStatus,
    raw_payload: event,
    processed: false,
  }).then(({ error }: { error: any }) => {
    if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
      console.error("[webhook:transfer] event log insert failed:", error);
    }
  });

  if (!withdrawal) {
    console.warn("[webhook:transfer] no matching withdrawal for", { transferRef, transferCode });
    return;
  }

  const withdrawalId = withdrawal.id as string;
  const amount = Number(withdrawal.amount_ghs);
  const agentId = withdrawal.agent_id as string;

  // Already in terminal state? Skip.
  if (withdrawal.status === "paid" || withdrawal.status === "payout_failed" || withdrawal.status === "rejected") {
    console.log(`[webhook:transfer] withdrawal ${withdrawalId} already terminal (${withdrawal.status}) — skip`);
    await supabase.from("paystack_transfer_events")
      .update({ processed: true, processing_notes: "already_terminal" })
      .eq("paystack_event_id", eventId);
    return;
  }

  // 3. Apply status transition
  if (event.event === "transfer.success") {
    await supabase
      .from("agent_withdrawals")
      .update({
        status: "paid",
        paystack_transfer_status: "success",
        paystack_transfer_id: transferId || withdrawal.paystack_transfer_id,
        payout_completed_at: new Date().toISOString(),
        processed_at: withdrawal.processed_at || new Date().toISOString(),
        paystack_raw_response: data,
      })
      .eq("id", withdrawalId);

    // NOTE: agent_wallets.total_withdrawn and the agent_wallet_transactions
    // 'withdrawal_paid' ledger row are written automatically by the
    // handle_withdrawal_paid() trigger (idempotent, single source of truth).
    //
    // Finance ledger / real cash movement is intentionally NOT auto-written
    // here. The finance_ledger_entries table is admin-manual-only — admins
    // record real cash movement entries themselves from the Finance pages.
  } else if (event.event === "transfer.failed" || event.event === "transfer.reversed") {
    await supabase
      .from("agent_withdrawals")
      .update({
        status: "payout_failed",
        paystack_transfer_status: psStatus,
        payout_failure_reason: failureReason || `Paystack ${event.event}`,
        paystack_raw_response: data,
      })
      .eq("id", withdrawalId);

    // Auto-refund: credit FULL deduction (amount + fee) back (only once)
    try {
      const { data: existingRefund } = await supabase
        .from("agent_wallet_transactions")
        .select("id")
        .eq("reference", `auto-refund-${withdrawalId}`)
        .maybeSingle();

      if (!existingRefund) {
        const fee = Number(withdrawal.withdrawal_fee_ghs ?? 0);
        const refundTotal = amount + fee;
        const { data: walletRaw } = await supabase
          .from("agent_wallets")
          .select("id, available_balance")
          .eq("agent_id", agentId)
          .maybeSingle();
        const wallet = walletRaw as Record<string, any> | null;
        if (wallet) {
          await supabase
            .from("agent_wallets")
            .update({ available_balance: Number(wallet.available_balance) + refundTotal })
            .eq("id", wallet.id);

          await supabase.from("agent_wallet_transactions").insert({
            agent_id: agentId,
            type: "withdrawal_reversed",
            amount_ghs: refundTotal,
            description: `Withdrawal payout failed — GHS ${refundTotal.toFixed(2)} restored (incl. GHS ${fee.toFixed(2)} fee). ${failureReason || ""}`.slice(0, 240),
            reference: `auto-refund-${withdrawalId}`,
            status: "completed",
          });
        }
      }
    } catch (e) {
      console.error("[webhook:transfer:failed] auto-refund failed:", e);
    }
  } else {
    console.log(`[webhook:transfer] no-op for event ${event.event}`);
  }

  // 4. Mark event processed
  await supabase
    .from("paystack_transfer_events")
    .update({ processed: true })
    .eq("paystack_event_id", eventId);
}