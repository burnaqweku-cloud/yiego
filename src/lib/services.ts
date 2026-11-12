import { supabase } from "@/integrations/supabase/client";
import { appDeviceId } from "@/lib/appInstall";

/* DY Services: result checkers today, more services later. Prices, stock and who gets which PIN are
   decided in the database; this file only asks. */

interface Rpc { rpc<T>(name: string, args?: Record<string, unknown>): PromiseLike<{ data: T | null; error: { message?: string } | null }> }
const phase1 = () => (supabase as unknown as { schema(name: string): Rpc }).schema("phase1");

export interface ServiceProduct { code: string; kind: "checker" | "afa"; name: string; blurb: string; price: number; in_stock: boolean; left: number }
export interface ServicePin { serial: string; pin: string }
export interface ServiceOrder {
  reference: string; token: string; product: string; name: string; quantity: number; amount: number; fee: number; phone: string;
  status: "awaiting_payment" | "paid_waiting_stock" | "delivered" | "refunded" | "cancelled" | "expired"; paid: boolean; method: "wallet" | "paystack";
  created_at: string; delivered_at: string | null; pins: ServicePin[];
}

const MESSAGES: Record<string, string> = {
  insufficient_balance: "Your wallet balance isn't enough. Top up, or pay with mobile money or card.",
  phone_invalid: "That phone number doesn't look right. Use a 10-digit Ghana number.",
  quantity_invalid: "Choose between 1 and 100.",
  sign_in_required: "Sign in to pay from your wallet.",
  service_unavailable: "This isn't available right now.",
};
/** A plain sentence for whatever the server said. */
export function serviceError(message: string | null | undefined, fallback = "Something went wrong. Please try again."): string {
  for (const key of Object.keys(MESSAGES)) if (message?.includes(key)) return MESSAGES[key];
  return message && !/[_{}]/.test(message) && message.length < 160 ? message : fallback;
}

export async function loadServices(): Promise<ServiceProduct[]> {
  const { data } = await phase1().rpc<ServiceProduct[]>("service_catalog");
  return (data ?? []).map((p) => ({ ...p, price: Number(p.price) }));
}
export async function buyServiceWithWallet(productCode: string, quantity: number, phone: string): Promise<{ order: ServiceOrder | null; error: string | null }> {
  const { data, error } = await phase1().rpc<ServiceOrder>("service_buy_wallet", { p_product: productCode, p_qty: quantity, p_phone: phone, p_device: appDeviceId() });
  return { order: data ?? null, error: error ? serviceError(error.message) : data ? null : serviceError(null) };
}
async function call<T>(body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke<{ status?: string; data?: T; error?: string }>("service-pay", { body });
  if (!error) return data?.status === "success" ? { data: data.data ?? null, error: null } : { data: null, error: serviceError(data?.error) };
  let message: string | undefined;
  try { message = ((await (error as { context?: Response }).context?.clone().json()) as { error?: string } | undefined)?.error; } catch { message = undefined; }
  return { data: null, error: serviceError(message) };
}
/** Opens a mobile money / card payment for a service order. The buyer comes back to /services/order/<token>. */
export const startServiceCheckout = (input: { productCode: string; quantity: number; phone: string; email?: string }) =>
  call<{ authorizationUrl: string; token: string; reference: string; total: number }>({ action: "start", ...input, deviceId: appDeviceId() });
/** On return from the payment page: checks the payment and gives back the order (with its PINs once delivered). */
export const confirmServiceOrder = (token: string) => call<ServiceOrder>({ action: "confirm", token });
export async function myServiceOrders(): Promise<ServiceOrder[]> {
  const { data } = await phase1().rpc<ServiceOrder[]>("service_my_orders");
  return data ?? [];
}
export const SERVICE_FEE_RATE = 0.04;
export const serviceFee = (base: number) => Math.round(base * SERVICE_FEE_RATE * 100) / 100;

/* Admin */
export interface AdminServiceProduct { code: string; kind: string; name: string; customer_price: number; agent_price: number; is_active: boolean; low_stock_at: number; left: number; held: number; stock_value: number; sold: number; sold_today: number }
export interface AdminServiceOrder { id: string; reference: string; name: string; quantity: number; amount: number; fee_amount: number; cost_amount: number | null; phone: string; status: ServiceOrder["status"]; payment_method: "wallet" | "paystack"; agent_id: string | null; agent_margin: number | null; created_at: string; paid_at: string | null; delivered_at: string | null; sent: string | null }
export interface AdminServices {
  can_edit: boolean; products: AdminServiceProduct[]; waiting: number;
  totals: { sales: number; cost: number; margins: number; orders: number; sales_today: number; profit_today: number };
  orders: AdminServiceOrder[]; batches: { id: string; name: string; quantity: number; total_cost: number; paid_from: string; note: string | null; created_at: string }[];
}
export interface AddStockResult { added: number; cost_each?: number; left?: number; not_read: string[]; already_in_stock: string[] }
export const loadAdminServices = () => phase1().rpc<AdminServices>("admin_services");
export const addServiceStock = (product: string, lines: string, totalCost: number, paidFrom: string, note: string) =>
  phase1().rpc<AddStockResult>("admin_service_add_stock", { p_product: product, p_lines: lines, p_total_cost: totalCost, p_paid_from: paidFrom, p_note: note || null });
export const setServiceProduct = (p: AdminServiceProduct) =>
  phase1().rpc<boolean>("admin_service_set", { p_product: p.code, p_customer_price: p.customer_price, p_agent_price: p.agent_price, p_active: p.is_active, p_low_stock_at: p.low_stock_at });
export const refundServiceToWallet = (orderId: string, reason: string) => phase1().rpc<{ refunded: number }>("admin_service_refund", { p_order: orderId, p_method: "wallet", p_reference: null, p_reason: reason });
export const recordServiceRefund = (orderId: string, reference: string, reason: string) => phase1().rpc<{ refunded: number }>("admin_service_refund", { p_order: orderId, p_method: "manual", p_reference: reference, p_reason: reason });
export const refundServiceViaPaystack = (orderId: string, reason: string) => call<unknown>({ action: "refund", orderId, reason });
