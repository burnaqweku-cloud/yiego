/**
 * Idempotent supplier ledger debit on successful supplier dispatch.
 * Checks for existing entry by order_id + type to prevent duplicates.
 * Safe — never throws, never crashes the caller.
 */
export async function logSupplierSpend(
  supabase: any,
  orderId: string,
  costPrice: number,
  meta: {
    network?: string;
    bundle_size_gb?: number | string;
    recipient?: string;
    supplier_order_id?: string | null;
    created_by?: string | null;
  } = {}
): Promise<void> {
  try {
    if (!orderId || costPrice <= 0) return;

    // Idempotency: check if already logged
    const { data: existing } = await supabase
      .from("supplier_ledger")
      .select("id")
      .eq("order_id", orderId)
      .eq("type", "supplier_spend_order")
      .maybeSingle();

    if (existing) {
      console.log(`[supplier-ledger] Spend already logged for order ${orderId}, skipping`);
      return;
    }

    const { error } = await supabase.from("supplier_ledger").insert({
      type: "supplier_spend_order",
      direction: "debit",
      amount_ghs: costPrice,
      order_id: orderId,
      supplier_reference: meta.supplier_order_id || null,
      note: `Auto deduction for successful supplier dispatch${meta.network ? ` — ${meta.network} ${meta.bundle_size_gb}GB to ${meta.recipient}` : ''}`,
      reconciliation_status: meta.supplier_order_id ? "reconciled" : "unreconciled",
      created_by: meta.created_by || null,
    });

    if (error) {
      console.error(`[supplier-ledger] Insert failed for order ${orderId}:`, error);
    } else {
      console.log(`[supplier-ledger] Debit GHS ${costPrice} for order ${orderId}`);
    }
  } catch (err) {
    // Non-fatal
    console.error("[supplier-ledger] logSupplierSpend error (non-fatal):", err);
  }
}
