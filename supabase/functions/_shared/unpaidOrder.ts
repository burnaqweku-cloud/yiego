export interface UnpaidOrderIdentity {
  user_id?: string | null;
  guest_email?: string | null;
  management_token?: string | null;
}
export function canManageUnpaidOrder(order: UnpaidOrderIdentity, userId: string | null, token: string, email: string): boolean {
  if (order.user_id) return Boolean(userId && userId === order.user_id);
  return Boolean((token && order.management_token && token === order.management_token) ||
    (email && order.guest_email && email.trim().toLowerCase() === order.guest_email.trim().toLowerCase()));
}
export function isCancellableUnpaid(order: { status: string; payment_status: string; paid_at?: string | null; supplier_order_reference?: string | null; supplier_purchase_id?: string | null }): boolean {
  return order.status === "awaiting_payment" && ["pending", "created"].includes(order.payment_status) && !order.paid_at && !order.supplier_order_reference && !order.supplier_purchase_id;
}