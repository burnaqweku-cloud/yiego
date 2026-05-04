// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Canonical phone normalization for Ghana numbers.
 * Converts 0551234567, +233551234567, 233551234567 → 0551234567
 */
export function normalizeGhanaPhone(phone: string): string {
  let p = phone.replace(/[\s\-\(\)]/g, "");
  if (p.startsWith("+233")) p = "0" + p.slice(4);
  else if (p.startsWith("233") && p.length === 12) p = "0" + p.slice(3);
  return p;
}

/**
 * Statuses that indicate an order is still active / in-flight.
 * "Pending" is only blocking if the order is recent (within PENDING_MAX_AGE_MINUTES).
 *
 * NOTE: 'Voided' is intentionally NOT in any blocking list. Voided is a terminal
 * admin-set status that frees the recipient number for immediate reorder. Treat
 * it like 'Delivered' / 'Failed' / 'Cancelled' for unblock purposes.
 */
const PAID_ACTIVE_STATUSES = ["Pending Payment", "Pending Approval", "Paid", "Processing", "paid", "processing"];
const PENDING_STATUSES = ["Pending", "pending"];
const ALL_ACTIVE_STATUSES = [...PAID_ACTIVE_STATUSES, ...PENDING_STATUSES];

/** Stale "Pending" orders older than this are NOT considered blocking (ghost cleanup) */
const PENDING_MAX_AGE_MINUTES = 15;

export interface DuplicateCheckResult {
  blocked: boolean;
  existingOrderId?: string;
  existingStatus?: string;
  message?: string;
}

/**
 * Check if a recipient phone number already has an active in-flight order.
 * Checks BOTH `orders` and `agent_orders` tables.
 * Uses service-role client to bypass RLS.
 *
 * @param skipOrderId - If provided, this order_id is excluded from the check (self-skip for wallet flow)
 */
export async function checkDuplicateInFlightOrder(
  supabase: any,
  recipientPhone: string,
  skipOrderId?: string,
): Promise<DuplicateCheckResult> {
  const norm = normalizeGhanaPhone(recipientPhone);

  // Build all possible formats to match against
  const variants = new Set<string>();
  variants.add(norm); // 0551234567
  if (norm.startsWith("0")) {
    variants.add("+233" + norm.slice(1)); // +233551234567
    variants.add("233" + norm.slice(1));  // 233551234567
  }
  const variantArray = Array.from(variants);

  const cutoff = new Date(Date.now() - PENDING_MAX_AGE_MINUTES * 60 * 1000).toISOString();

  // Check orders table — paid/processing statuses (no time limit)
  const { data: paidOrder } = await supabase
    .from("orders")
    .select("order_id, status, recipient_number")
    .in("recipient_number", variantArray)
    .in("status", PAID_ACTIVE_STATUSES)
    .limit(1)
    .maybeSingle();

  if (paidOrder && paidOrder.order_id !== skipOrderId) {
    return {
      blocked: true,
      existingOrderId: paidOrder.order_id,
      existingStatus: paidOrder.status,
      message: `An order for this number is already being processed (${paidOrder.order_id}). Please wait for it to complete before placing another order.`,
    };
  }

  // Check orders table — "Pending" status with time window (only recent ones block)
  const { data: pendingOrder } = await supabase
    .from("orders")
    .select("order_id, status, recipient_number, created_at")
    .in("recipient_number", variantArray)
    .in("status", PENDING_STATUSES)
    .gte("created_at", cutoff)
    .limit(1)
    .maybeSingle();

  if (pendingOrder && pendingOrder.order_id !== skipOrderId) {
    return {
      blocked: true,
      existingOrderId: pendingOrder.order_id,
      existingStatus: pendingOrder.status,
      message: `An order for this number is already being processed (${pendingOrder.order_id}). Please wait for it to complete before placing another order.`,
    };
  }

  // Check agent_orders table — all active statuses
  const { data: activeAgentOrder } = await supabase
    .from("agent_orders")
    .select("order_id, status, customer_phone")
    .in("customer_phone", variantArray)
    .in("status", PAID_ACTIVE_STATUSES)
    .limit(1)
    .maybeSingle();

  if (activeAgentOrder && activeAgentOrder.order_id !== skipOrderId) {
    return {
      blocked: true,
      existingOrderId: activeAgentOrder.order_id,
      existingStatus: activeAgentOrder.status,
      message: `An order for this number is already being processed (${activeAgentOrder.order_id}). Please wait for it to complete before placing another order.`,
    };
  }

  // Check agent_orders — "Pending" with time window
  const { data: pendingAgentOrder } = await supabase
    .from("agent_orders")
    .select("order_id, status, customer_phone, created_at")
    .in("customer_phone", variantArray)
    .in("status", PENDING_STATUSES)
    .gte("created_at", cutoff)
    .limit(1)
    .maybeSingle();

  if (pendingAgentOrder && pendingAgentOrder.order_id !== skipOrderId) {
    return {
      blocked: true,
      existingOrderId: pendingAgentOrder.order_id,
      existingStatus: pendingAgentOrder.status,
      message: `An order for this number is already being processed (${pendingAgentOrder.order_id}). Please wait for it to complete before placing another order.`,
    };
  }

  return { blocked: false };
}

/**
 * Check multiple phone numbers for duplicates (for bulk orders).
 * Returns a map of blocked numbers to their active order details.
 */
export async function checkBulkDuplicates(
  supabase: any,
  phones: string[],
): Promise<Map<string, DuplicateCheckResult>> {
  const results = new Map<string, DuplicateCheckResult>();
  
  // Normalize all phones and build variant lookup
  const allVariants: string[] = [];
  const phoneToVariants = new Map<string, string[]>();
  
  for (const phone of phones) {
    const norm = normalizeGhanaPhone(phone);
    const variants: string[] = [norm];
    if (norm.startsWith("0")) {
      variants.push("+233" + norm.slice(1));
      variants.push("233" + norm.slice(1));
    }
    phoneToVariants.set(phone, variants);
    allVariants.push(...variants);
  }

  const uniqueVariants = [...new Set(allVariants)];
  const cutoff = new Date(Date.now() - PENDING_MAX_AGE_MINUTES * 60 * 1000).toISOString();

  // Batch query orders table — paid/processing (no time limit)
  const { data: paidOrders } = await supabase
    .from("orders")
    .select("order_id, status, recipient_number")
    .in("recipient_number", uniqueVariants)
    .in("status", PAID_ACTIVE_STATUSES);

  // Batch query orders table — pending (with time window)
  const { data: pendingOrders } = await supabase
    .from("orders")
    .select("order_id, status, recipient_number")
    .in("recipient_number", uniqueVariants)
    .in("status", PENDING_STATUSES)
    .gte("created_at", cutoff);

  // Batch query agent_orders table — paid/processing
  const { data: paidAgentOrders } = await supabase
    .from("agent_orders")
    .select("order_id, status, customer_phone")
    .in("customer_phone", uniqueVariants)
    .in("status", PAID_ACTIVE_STATUSES);

  // Batch query agent_orders — pending with time window
  const { data: pendingAgentOrders } = await supabase
    .from("agent_orders")
    .select("order_id, status, customer_phone")
    .in("customer_phone", uniqueVariants)
    .in("status", PENDING_STATUSES)
    .gte("created_at", cutoff);

  // Build a set of blocked phone variants
  const blockedMap = new Map<string, { orderId: string; status: string }>();
  for (const o of (paidOrders || [])) {
    blockedMap.set(normalizeGhanaPhone(o.recipient_number), { orderId: o.order_id, status: o.status });
  }
  for (const o of (pendingOrders || [])) {
    blockedMap.set(normalizeGhanaPhone(o.recipient_number), { orderId: o.order_id, status: o.status });
  }
  for (const o of (paidAgentOrders || [])) {
    blockedMap.set(normalizeGhanaPhone(o.customer_phone), { orderId: o.order_id, status: o.status });
  }
  for (const o of (pendingAgentOrders || [])) {
    blockedMap.set(normalizeGhanaPhone(o.customer_phone), { orderId: o.order_id, status: o.status });
  }

  // Map back to original phone inputs
  for (const phone of phones) {
    const norm = normalizeGhanaPhone(phone);
    const blocked = blockedMap.get(norm);
    if (blocked) {
      results.set(phone, {
        blocked: true,
        existingOrderId: blocked.orderId,
        existingStatus: blocked.status,
        message: `An order for ${phone} is already being processed (${blocked.orderId}).`,
      });
    }
  }

  return results;
}
