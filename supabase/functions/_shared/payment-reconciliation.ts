/**
 * Upsert a payment_reconciliation_cases row when a payment succeeds
 * but order creation fails. Idempotent on paystack_reference.
 * Safe — never throws, never crashes the caller.
 */
export async function upsertReconciliationCase(
  supabase: any,
  payment: Record<string, unknown>,
  errorMessage: string,
  channel: "normal_user" | "agent_store" = "normal_user"
): Promise<void> {
  try {
    const reference = payment.reference as string;
    if (!reference) {
      console.error("[payment-reconciliation] No reference, skipping");
      return;
    }

    const meta = payment.checkout_meta as Record<string, unknown> | null;
    const agentId = meta?.agent_id as string | null;

    const { error } = await supabase
      .from("payment_reconciliation_cases")
      .upsert(
        {
          paystack_reference: reference,
          payment_id: payment.id || null,
          user_id: payment.user_id || null,
          agent_id: agentId || null,
          amount: Number(payment.amount_ghs) || 0,
          currency: "GHS",
          status: "open",
          severity: "high",
          reason: "payment_success_order_missing",
          metadata: {
            error_message: (errorMessage || "").slice(0, 2000),
            channel,
            purpose: payment.purpose,
            linked_order_id: payment.linked_order_id,
            customer_email: payment.customer_email,
            checkout_meta: meta,
          },
        },
        { onConflict: "paystack_reference", ignoreDuplicates: true }
      );

    if (error) {
      console.error("[payment-reconciliation] Upsert failed:", error);
    } else {
      console.log(`[payment-reconciliation] Case created/exists for ref=${reference}`);
    }
  } catch (err) {
    // Never crash the caller
    console.error("[payment-reconciliation] Error (non-fatal):", err);
  }
}
