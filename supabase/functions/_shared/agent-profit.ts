// deno-lint-ignore-file no-explicit-any
/**
 * Shared helper for idempotent agent profit crediting + reversal.
 * 
 * RULES:
 * - Profit = agent_selling_price - agent_cost_price (snapshot at purchase time)
 * - Credit immediately on payment success (not on delivery)
 * - Reverse on terminal failure (Failed/Refunded/Cancelled)
 * - Idempotent via DB unique constraint (agent_id, order_id, type)
 * - Always audit log every attempt
 */

type SupabaseClient = any;

interface CreditResult {
  action: "credited" | "already_credited" | "skipped" | "error";
  amount?: number;
  reason?: string;
}

interface ReversalResult {
  action: "reversed" | "already_reversed" | "skipped" | "error";
  amount?: number;
  reason?: string;
}

/**
 * Credit agent profit for an agent_store order.
 * Must be called with service role client.
 */
export async function creditAgentProfit(
  supabase: SupabaseClient,
  orderId: string,
  source: string = "system"
): Promise<CreditResult> {
  try {
    // Load order
    const { data: order, error: orderErr } = await supabase
      .from("agent_orders")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();

    if (orderErr || !order) {
      await auditLog(supabase, orderId, null, "credit_attempt", "error", "Order not found", { source });
      return { action: "error", reason: "Order not found" };
    }

    const agentId = order.agent_id as string;

    // Check already credited
    if (order.profit_credited === true) {
      await auditLog(supabase, orderId, agentId, "credit_attempt", "skipped", "Already credited (flag)", { source });
      return { action: "already_credited" };
    }

    // Check payment status
    if (order.payment_status !== "paid") {
      await auditLog(supabase, orderId, agentId, "credit_attempt", "skipped", "Payment not confirmed", { source, payment_status: order.payment_status });
      return { action: "skipped", reason: "Payment not confirmed" };
    }

    // Use snapshot fields with fallback
    const profitAmount = Number(order.agent_profit_at_purchase ?? order.profit_ghs) || 0;
    const sellingPrice = Number(order.agent_store_price_at_purchase ?? order.agent_selling_price) || 0;
    const costPrice = Number(order.agent_base_price_at_purchase ?? order.agent_cost_price) || 0;

    if (sellingPrice === 0 || costPrice === 0) {
      // If we have a valid profit amount from the order, allow crediting even without price snapshots
      if (profitAmount > 0) {
        console.log(`[profit-credit] Order ${orderId}: price snapshots missing but profit_ghs=${profitAmount}, proceeding`);
      } else {
        await auditLog(supabase, orderId, agentId, "credit_attempt", "skipped", "Missing price snapshots", {
          source, sellingPrice, costPrice, profitAmount
        });
        return { action: "skipped", reason: "Missing price snapshots" };
      }
    }

    if (profitAmount <= 0) {
      // Zero profit is valid — mark credited but don't insert wallet txn
      await supabase.from("agent_orders").update({
        profit_credited: true,
        profit_credited_at: new Date().toISOString(),
      }).eq("order_id", orderId);
      await auditLog(supabase, orderId, agentId, "credit_attempt", "skipped", "Zero profit", { source, profitAmount });
      return { action: "skipped", reason: "Zero profit" };
    }

    // Insert wallet transaction (idempotent via unique index)
    const { error: txnErr } = await supabase.from("agent_wallet_transactions").insert({
      agent_id: agentId,
      type: "profit_credit",
      amount_ghs: profitAmount,
      description: `Profit from agent store order ${orderId}`,
      order_id: orderId,
      reference: `commission-${orderId}`,
      status: "completed",
    });

    if (txnErr) {
      if (txnErr.code === "23505") {
        // Already exists — mark order as credited
        await supabase.from("agent_orders").update({
          profit_credited: true,
          profit_credited_at: new Date().toISOString(),
        }).eq("order_id", orderId);
        await auditLog(supabase, orderId, agentId, "credit_attempt", "already_credited", "Duplicate constraint", { source });
        return { action: "already_credited" };
      }
      await auditLog(supabase, orderId, agentId, "credit_attempt", "error", `DB error: ${txnErr.message}`, { source });
      return { action: "error", reason: txnErr.message };
    }

    // Update cached wallet balance
    const { data: wallet } = await supabase
      .from("agent_wallets")
      .select("*")
      .eq("agent_id", agentId)
      .maybeSingle();

    if (wallet) {
      await supabase.from("agent_wallets").update({
        available_balance: Number(wallet.available_balance) + profitAmount,
        total_earned: Number(wallet.total_earned) + profitAmount,
      }).eq("id", wallet.id);
    } else {
      // Create wallet if missing
      await supabase.from("agent_wallets").insert({
        agent_id: agentId,
        available_balance: profitAmount,
        total_earned: profitAmount,
        pending_balance: 0,
        total_withdrawn: 0,
      });
    }

    // Mark order as credited
    await supabase.from("agent_orders").update({
      profit_credited: true,
      profit_credited_at: new Date().toISOString(),
    }).eq("order_id", orderId);

    await auditLog(supabase, orderId, agentId, "credit_ok", "success", null, {
      source, amount: profitAmount, sellingPrice, costPrice,
    });

    console.log(`[profit-credit] Agent ${agentId} credited GHS ${profitAmount} for order ${orderId}`);
    return { action: "credited", amount: profitAmount };
  } catch (err) {
    console.error(`[profit-credit] Unexpected error for order ${orderId}:`, err);
    await auditLog(supabase, orderId, null, "credit_attempt", "error", String(err), { source });
    return { action: "error", reason: String(err) };
  }
}

/**
 * Reverse agent profit for a failed/refunded/cancelled order.
 * Idempotent via unique index on (agent_id, order_id, 'profit_reversal').
 */
export async function reverseAgentProfit(
  supabase: SupabaseClient,
  orderId: string,
  reason: string = "order_failed",
  source: string = "system"
): Promise<ReversalResult> {
  try {
    const { data: order } = await supabase
      .from("agent_orders")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();

    if (!order) {
      return { action: "skipped", reason: "Order not found" };
    }

    const agentId = order.agent_id as string;

    // Only reverse if profit was actually credited
    if (!order.profit_credited) {
      await auditLog(supabase, orderId, agentId, "reversal_attempt", "skipped", "Profit never credited", { source, reason });
      return { action: "skipped", reason: "Profit never credited" };
    }

    const profitAmount = Number(order.agent_profit_at_purchase ?? order.profit_ghs) || 0;
    if (profitAmount <= 0) {
      return { action: "skipped", reason: "Zero profit to reverse" };
    }

    // Insert reversal (idempotent)
    const { error: txnErr } = await supabase.from("agent_wallet_transactions").insert({
      agent_id: agentId,
      type: "profit_reversal",
      amount_ghs: -profitAmount,
      description: `Profit reversal for order ${orderId}: ${reason}`,
      order_id: orderId,
      reference: `reversal-${orderId}`,
      status: "completed",
    });

    if (txnErr) {
      if (txnErr.code === "23505") {
        await auditLog(supabase, orderId, agentId, "reversal_attempt", "already_reversed", "Duplicate constraint", { source });
        return { action: "already_reversed" };
      }
      await auditLog(supabase, orderId, agentId, "reversal_attempt", "error", txnErr.message, { source });
      return { action: "error", reason: txnErr.message };
    }

    // Update cached wallet
    const { data: wallet } = await supabase
      .from("agent_wallets")
      .select("*")
      .eq("agent_id", agentId)
      .maybeSingle();

    if (wallet) {
      await supabase.from("agent_wallets").update({
        available_balance: Math.max(0, Number(wallet.available_balance) - profitAmount),
        total_earned: Math.max(0, Number(wallet.total_earned) - profitAmount),
      }).eq("id", wallet.id);
    }

    await auditLog(supabase, orderId, agentId, "reversal_ok", "success", reason, {
      source, amount: profitAmount,
    });

    console.log(`[profit-reversal] Agent ${agentId} reversed GHS ${profitAmount} for order ${orderId}`);
    return { action: "reversed", amount: profitAmount };
  } catch (err) {
    console.error(`[profit-reversal] Error for order ${orderId}:`, err);
    return { action: "error", reason: String(err) };
  }
}

async function auditLog(
  supabase: SupabaseClient,
  orderId: string,
  agentId: string | null,
  action: string,
  result: string,
  reason: string | null,
  payload: Record<string, unknown> = {}
) {
  try {
    await supabase.from("agent_profit_audit_logs").insert({
      order_id: orderId,
      agent_id: agentId || "00000000-0000-0000-0000-000000000000",
      previous_status: null,
      new_status: null,
      profit_ghs: payload.amount as number ?? null,
      profit_credited: result === "success",
      wallet_credit_exists: result === "success" || result === "already_credited",
      wallet_credit_amount: payload.amount as number ?? null,
      meta: { action, result, reason, ...payload },
    });
  } catch (e) {
    console.error("[audit-log] Failed to write:", e);
  }
}
