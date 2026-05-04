/**
 * Reconciliation helper — creates payment_events and reconciliation_cases
 * when a payment succeeds but order creation fails.
 * 
 * Called from paystack-webhook and paystack-verify edge functions.
 */

interface ReconciliationPaymentData {
  provider_reference: string;
  amount: number;
  currency?: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  user_id?: string | null;
  agent_id?: string | null;
  store_id?: string | null;
  metadata_json?: Record<string, unknown>;
  purpose?: string;
}

interface ReconciliationCaseData {
  case_type: string;
  severity?: string;
  reason_code: string;
  reason_detail: string;
  intended_channel: string;
  intended_user_id?: string | null;
  intended_agent_id?: string | null;
  intended_store_id?: string | null;
  intended_product?: Record<string, unknown> | null;
  intended_recipient?: string | null;
  expected_order_amount?: number | null;
}

/**
 * Upsert a payment_event record. Returns the event ID.
 */
export async function upsertPaymentEvent(
  supabase: any,
  data: ReconciliationPaymentData
): Promise<string | null> {
  try {
    // Try insert first
    const { data: inserted, error: insertErr } = await supabase
      .from("payment_events")
      .insert({
        provider: "paystack",
        provider_reference: data.provider_reference,
        amount: data.amount,
        currency: data.currency || "GHS",
        customer_email: data.customer_email || null,
        customer_phone: data.customer_phone || null,
        user_id: data.user_id || null,
        agent_id: data.agent_id || null,
        store_id: data.store_id || null,
        metadata_json: data.metadata_json || {},
        status: "verified",
        verified_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (inserted) return inserted.id;

    // If duplicate, fetch existing
    if (insertErr?.code === "23505") {
      const { data: existing } = await supabase
        .from("payment_events")
        .select("id")
        .eq("provider_reference", data.provider_reference)
        .single();
      
      if (existing) {
        // Update status to verified
        await supabase
          .from("payment_events")
          .update({ status: "verified", verified_at: new Date().toISOString() })
          .eq("id", existing.id);
        return existing.id;
      }
    }

    console.error("[reconciliation] Failed to upsert payment_event:", insertErr);
    return null;
  } catch (err) {
    console.error("[reconciliation] Error in upsertPaymentEvent:", err);
    return null;
  }
}

/**
 * Create a reconciliation case for a payment that succeeded but order failed.
 * Idempotent — won't create duplicate for same payment_event_id + case_type.
 */
export async function createReconciliationCase(
  supabase: any,
  paymentEventId: string,
  caseData: ReconciliationCaseData
): Promise<string | null> {
  try {
    const { data: inserted, error } = await supabase
      .from("reconciliation_cases")
      .insert({
        payment_event_id: paymentEventId,
        case_type: caseData.case_type,
        severity: caseData.severity || "high",
        state: "open",
        reason_code: caseData.reason_code,
        reason_detail: (caseData.reason_detail || "").slice(0, 2000),
        intended_channel: caseData.intended_channel,
        intended_user_id: caseData.intended_user_id || null,
        intended_agent_id: caseData.intended_agent_id || null,
        intended_store_id: caseData.intended_store_id || null,
        intended_product: caseData.intended_product || null,
        intended_recipient: caseData.intended_recipient || null,
        expected_order_amount: caseData.expected_order_amount || null,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        console.log("[reconciliation] Case already exists for this payment event + type");
        return null; // Not an error, just idempotent
      }
      console.error("[reconciliation] Failed to create case:", error);
      return null;
    }

    const caseId = inserted.id;

    // Log the case creation action
    await supabase.from("reconciliation_actions").insert({
      case_id: caseId,
      admin_id: "00000000-0000-0000-0000-000000000000", // system
      action_type: "open_case",
      action_payload_json: {
        reason_code: caseData.reason_code,
        reason_detail: (caseData.reason_detail || "").slice(0, 500),
        auto_created: true,
      },
    });

    console.log(`[reconciliation] Created case ${caseId} for payment event ${paymentEventId}`);
    return caseId;
  } catch (err) {
    console.error("[reconciliation] Error in createReconciliationCase:", err);
    return null;
  }
}

/**
 * Full flow: upsert payment event + create reconciliation case.
 * Safe to call — never throws, never crashes caller flow.
 */
export async function handleOrderCreationFailure(
  supabase: any,
  payment: Record<string, unknown>,
  errorMessage: string,
  channel: "normal_user" | "agent_store" = "normal_user"
): Promise<void> {
  try {
    const reference = payment.reference as string;
    const meta = payment.checkout_meta as Record<string, unknown> | null;

    const eventId = await upsertPaymentEvent(supabase, {
      provider_reference: reference,
      amount: Number(payment.amount_ghs) || 0,
      currency: "GHS",
      customer_email: payment.customer_email as string | null,
      user_id: payment.user_id as string | null,
      agent_id: meta?.agent_id as string | null,
      store_id: meta?.store_id as string | null,
      metadata_json: {
        purpose: payment.purpose,
        checkout_meta: meta,
        linked_order_id: payment.linked_order_id,
      },
    });

    if (!eventId) {
      console.error("[reconciliation] Could not create payment event for:", reference);
      return;
    }

    await createReconciliationCase(supabase, eventId, {
      case_type: "payment_success_order_failed",
      severity: "high",
      reason_code: "order_create_failed",
      reason_detail: errorMessage,
      intended_channel: channel,
      intended_user_id: payment.user_id as string | null,
      intended_agent_id: meta?.agent_id as string | null,
      intended_store_id: meta?.store_id as string | null,
      intended_product: meta ? {
        network: meta.network,
        bundle_size_gb: meta.bundle_size_gb,
        product_id: meta.product_id,
      } : null,
      intended_recipient: (meta?.recipient_phone || meta?.customer_phone) as string | null,
      expected_order_amount: Number(payment.amount_ghs) || null,
    });
  } catch (err) {
    // Never crash the caller
    console.error("[reconciliation] handleOrderCreationFailure error (non-fatal):", err);
  }
}
