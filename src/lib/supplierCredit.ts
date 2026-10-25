import { supabase } from "@/integrations/supabase/client";

export interface SupplierCreditOrder {
  id: string; status: string; payment_status: string;
  supplier_order_reference: string | null; supplier_purchase_id?: string | null;
  suppliers?: { code: string } | null;
}
export interface SupplierCredit {
  confirmed: boolean; note: string; at: string;
  supplierCode: string | null; supplierReference: string | null; purchaseId: string | null;
}
export function creditMatches(order: SupplierCreditOrder, credit?: SupplierCredit) {
  return Boolean(credit?.confirmed && credit.supplierCode === (order.suppliers?.code ?? null)
    && credit.supplierReference === order.supplier_order_reference
    && credit.purchaseId === (order.supplier_purchase_id ?? null));
}
export function canMarkSupplierCredit(order: SupplierCreditOrder) {
  return order.payment_status === "succeeded" && ["failed_needs_review", "failed", "paid", "processing", "pending_supplier"].includes(order.status);
}
type Audit = { target_id: string; action: string; reason: string; created_at: string; after_value: {
  confirmed: boolean; supplier_code: string | null; supplier_reference: string | null; purchase_id: string | null;
} };
type Db = { from: (table: string) => { select: (columns: string) => {
  eq: (column: string, value: string) => { in: (column: string, values: string[]) => {
    order: (column: string, options: { ascending: boolean }) => PromiseLike<{ data: Audit[] | null; error: unknown }>;
  } };
} }; rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }> };
const db = () => (supabase as unknown as { schema: (name: string) => Db }).schema("phase1");
export async function loadSupplierCredits() {
  const { data, error } = await db().from("audit_logs").select("target_id, action, reason, created_at, after_value")
    .eq("target_type", "order").in("action", ["order.supplier_credit.confirmed", "order.supplier_credit.cleared"])
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not read supplier confirmations.");
  const result: Record<string, SupplierCredit> = {};
  for (const row of data ?? []) {
    if (result[row.target_id]) continue;
    result[row.target_id] = { confirmed: row.action === "order.supplier_credit.confirmed" && row.after_value?.confirmed === true,
      note: row.reason, at: row.created_at, supplierCode: row.after_value?.supplier_code ?? null,
      supplierReference: row.after_value?.supplier_reference ?? null, purchaseId: row.after_value?.purchase_id ?? null };
  }
  return result;
}
export async function setSupplierCredit(orderId: string, confirmed: boolean, note: string) {
  const { error } = await db().rpc("admin_set_supplier_credit_confirmation", { p_order_id: orderId, p_confirmed: confirmed, p_note: note.trim() });
  if (error) throw new Error("Confirmation could not be saved. The private confirmation service must be activated; no refund or status change occurred.");
}