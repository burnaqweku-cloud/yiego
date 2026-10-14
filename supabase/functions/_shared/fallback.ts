/* Second chance for an order: the network's fallback supplier (Admin → Suppliers → "Fallback").

   Two moments use it:
   - at purchase time (fulfillment.ts): the main supplier refuses the order outright, so it is sent
     to the fallback straight away, before anything is held or marked failed;
   - after acceptance (the status syncs): the main supplier later reports refunded / failed
     (DBH's silent MTN refund, EmmaDataKing's REFUNDED), so the order is reset and queued for the
     fallback's resend loop.
   An order is given the fallback once per attempt (marker: order event `supplier.fallback`, counted since the
   last admin.retry). A second refusal in the same attempt ends up where it always did (verification queue or Needs review). */

// deno-lint-ignore no-explicit-any
type Db = any;
export const FALLBACK_EVENT = "supplier.fallback";

export interface FallbackTarget { id: string; code: string; name: string; mappingPrice: number | null }

/** The fallback supplier for this order's network, if it exists, is active, knows the bundle, and this
 *  order has not already been handed to a fallback. */
export async function fallbackFor(supabase: Db, order: { id: string; network_id: string; product_id: string; supplier_id: string | null }, excludeSupplierId: string | null): Promise<FallbackTarget | null> {
  const { data: network } = await supabase.from("networks").select("preferred_supplier_id, fallback_supplier_id").eq("id", order.network_id).maybeSingle();
  // A pinned bundle ("Always via") falls back to the network's fallback, or to the network's main supplier when the
  // pin IS the fallback. Only ever used after a confirmed refund (callers enforce that).
  const { data: product } = await supabase.from("data_products").select("forced_supplier_id").eq("id", order.product_id).maybeSingle();
  const forced: string | null = product?.forced_supplier_id ?? null;
  let fallbackId: string | null = network?.fallback_supplier_id ?? null;
  if (forced && fallbackId === forced) fallbackId = network?.preferred_supplier_id ?? null;
  if (!fallbackId || fallbackId === excludeSupplierId) return null;
  // Once per attempt, not once for ever: an admin Retry starts a fresh attempt, so only fallback hand-offs
  // since the latest retry count. (Stops automatic ping-pong, never blocks a person re-sending the order.)
  const { data: lastRetry } = await supabase.from("order_events").select("created_at").eq("order_id", order.id).eq("event_type", "admin.retry").order("created_at", { ascending: false }).limit(1).maybeSingle();
  let used = supabase.from("order_events").select("id", { count: "exact", head: true }).eq("order_id", order.id).eq("event_type", FALLBACK_EVENT);
  if (lastRetry?.created_at) used = used.gt("created_at", lastRetry.created_at);
  const { count } = await used;
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
