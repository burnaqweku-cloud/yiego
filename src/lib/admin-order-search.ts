import { isCancellableUnpaid } from "../../supabase/functions/_shared/unpaidOrder";
import type { AdminOrderRow } from "./admin-data";

export const ADMIN_ORDER_COLUMNS = "id, order_reference, product_id, recipient_phone, guest_email, amount, cost_amount, paid_at, currency, status, payment_status, supplier_status, supplier_order_reference, supplier_purchase_id, supplier_retry_after, supplier_retry_count, failure_reason, admin_resolution_status, admin_resolution_reason, admin_resolution_updated_at, wallet_ledger_entry_id, payment_provider, created_at, updated_at, data_products(name, capacity_gb), networks(name, code), suppliers(code, name, public_name), agent_id, agent_price, agent_margin, agents(slug, store_name)";

export function exactOrderReference(value: string): string | null {
  const reference = value.trim().toUpperCase();
  return /^(?:YG|AG|DS-ADM)-[A-Z0-9]+$/.test(reference) ? reference : null;
}

interface SearchQuery<T> extends PromiseLike<{ data: T | null; error: { message: string } | null }> {
  select(columns: string): SearchQuery<T>;
  or(filters: string): SearchQuery<T>;
  order(column: string, options: { ascending: boolean }): SearchQuery<T>;
  limit(count: number): SearchQuery<T>;
}
export interface OrderSearchDatabase { from<T>(table: string): SearchQuery<T[]> }

/** Targeted protected lookup; never depend on the recent browsing cache. */
export async function findAdminOrder(database: OrderSearchDatabase, input: string): Promise<AdminOrderRow | null> {
  const needle = input.trim();
  if (!needle) return null;
  // Quote filter values so punctuation cannot inject additional PostgREST filters.
  const quoted = JSON.stringify(needle.replace(/[%*]/g, "\\$&"));
  const filters = [`order_reference.ilike.${quoted}`, `supplier_order_reference.ilike.${quoted}`, `supplier_purchase_id.eq.${JSON.stringify(needle)}`];
  if (/^\+?[\d\s()-]+$/.test(needle)) {
    const digits = needle.replace(/\D/g, "");
    const local = digits.startsWith("233") ? `0${digits.slice(3)}` : digits;
    if (/^0\d{9}$/.test(local)) {
      filters.push(`recipient_phone.eq.${JSON.stringify(local)}`, `recipient_phone.eq.${JSON.stringify(`+233${local.slice(1)}`)}`, `recipient_phone.eq.${JSON.stringify(`233${local.slice(1)}`)}`);
    }
  }
  const result = await database.from<AdminOrderRow>("orders").select(ADMIN_ORDER_COLUMNS).or(filters.join(",")).order("created_at", { ascending: false }).limit(1000);
  if (result.error) throw new Error("Could not search orders. Please try again.");
  const candidates = result.data ?? [];
  return candidates.find(isCancellableUnpaid) ?? candidates[0] ?? null;
}