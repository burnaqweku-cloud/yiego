/* Second chance for an order: the network's fallback supplier (Admin → Suppliers → "Fallback").

   Two moments use it:
   - at purchase time (fulfillment.ts): the main supplier refuses the order outright, so it is sent
     to the fallback straight away, before anything is held or marked failed;
   - after acceptance (the status syncs): the main supplier later reports refunded / failed
     (DBH's silent MTN refund, EmmaDataKing's REFUNDED), so the order is reset and queued for the
     fallback's resend loop.
   An order is given the fallback once. The marker is the order event `supplier.fallback`; a second
   refusal ends up where it always did (verification queue or Needs review). */

// deno-lint-ignore no-explicit-any
type Db = any;
export const FALLBACK_EVENT = "supplier.fallback";

export interface FallbackTarget { id: string; code: string; name: string; mappingPrice: number | null }

/** The fallback supplier for this order's network, if it exists, is active, knows the bundle, and this
 *  order has not already been handed to a fallback. */
export async function fallbackFor(supabase: Db, order: { id: string; network_id: string; product_id: string; supplier_id: string | null }, excludeSupplierId: string | null): Promise<FallbackTarget | null> {
  const { data: network } = await supabase.from("networks").select("fallback_supplier_id").eq("id", order.network_id).maybeSingle();
  const fallbackId: string | null = network?.fallback_supplier_id ?? null;
  if (!fallbackId || fallbackId === excludeSupplierId) return null;
  const { count } = await supabase.from("order_events").select("id", { count: "exact", head: true }).eq("order_id", order.id).eq("event_type", FALLBACK_EVENT);
  if ((count ?? 0) > 0) return null;
  const { data: mapping } = await supabase.from("supplier_product_mappings").select("supplier_price, suppliers!inner(id, code, name, status)").eq("product_id", order.product_id).eq("supplier_id", fallbackId).eq("is_active", true).eq("suppliers.status", "active").limit(1).maybeSingle();
  if (!mapping) return null;
  const s = mapping.suppliers as { id: string; code: string; name: string };
  return { id: s.id, code: s.code, name: s.name, mappingPrice: mapping.supplier_price != null ? Number(mapping.supplier_price) : null };
}

/** After acceptance: the main supplier did not deliver. Reset the supplier fields and queue the order for the
 *  fallback's resend loop (supplier_retry_after = now). Returns the target, or null when there is none. */
export async function rerouteToFallback(supabase: Db, order: { id: string; status: string; network_id: string; product_id: string; supplier_id: string | null; order_reference?: string }, fromName: string, why: string): Promise<FallbackTarget | null> {
  const target = await fallbackFor(supabase, order, order.supplier_id);
  if (!target) return null;
  const now = new Date().toISOString();
  await supabase.from("orders").update({
    status: "processing", supplier_id: target.id, supplier_purchase_id: null, supplier_order_reference: null, supplier_transaction_reference: null,
    supplier_status: null, supplier_idempotency_key: null, failure_reason: null, admin_resolution_status: null, admin_resolution_reason: null,
    supplier_retry_after: now, supplier_retry_count: 0, updated_at: now,
  }).eq("id", order.id);
  await supabase.from("order_events").insert({
    order_id: order.id, event_type: FALLBACK_EVENT, from_status: order.status, to_status: "processing",
    message: `${fromName} did not deliver (${why}). Sending to ${target.name} instead.`,
    metadata: { from: fromName, to: target.code, why, stage: "after_acceptance" },
  });
  return target;
}
