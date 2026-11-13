import { supabase } from "@/integrations/supabase/client";
import { appDeviceId } from "@/lib/appInstall";

/* DY Services: result checkers today, more services later. Prices, stock and who gets which PIN are
   decided in the database; this file only asks. */

interface Rpc { rpc<T>(name: string, args?: Record<string, unknown>): PromiseLike<{ data: T | null; error: { message?: string } | null }> }
const phase1 = () => (supabase as unknown as { schema(name: string): Rpc }).schema("phase1");

export interface ServiceProduct { code: string; kind: "checker" | "afa"; name: string; blurb: string; price: number; in_stock: boolean; left: number }
export interface ServicePin { serial: string; pin: string }
/** The MTN AFA registration form. The database checks every field again. */
export interface AfaDetails { full_name: string; afa_phone: string; ghana_card: string; dob: string; occupation: string; region: string; address: string }
export const GHANA_REGIONS = ["Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern", "Greater Accra", "North East", "Northern", "Oti", "Savannah", "Upper East", "Upper West", "Volta", "Western", "Western North"] as const;
export interface ServiceOrder {
  reference: string; token: string; product: string; kind?: "checker" | "afa"; name: string; quantity: number; amount: number; fee: number; phone: string;
  status: "awaiting_payment" | "paid_waiting_stock" | "processing" | "delivered" | "refunded" | "cancelled" | "expired"; paid: boolean; method: "wallet" | "paystack";
  created_at: string; delivered_at: string | null; pins: ServicePin[]; afa?: { name: string; phone: string } | null; store?: { name: string; site: string } | null;
  /** The website this checker is used on (the exam body's results site), e.g. "eresults.waecgh.org". */
  use_at?: string | null;
}
/** Where a purchase is made: nothing = the main site; store = an agent's store (its prices); asAgent = the agent buying for themselves at the agent price. */
export interface ServiceContext { store?: string; asAgent?: boolean }

const MESSAGES: Record<string, string> = {
  insufficient_balance: "Your wallet balance isn't enough. Top up, or pay with mobile money or card.",
  phone_invalid: "That phone number doesn't look right. Use a 10-digit Ghana number.",
  quantity_invalid: "Choose between 1 and 1,000.",
  sign_in_required: "Sign in to pay from your wallet.",
  service_unavailable: "This isn't available right now.",
  not_an_agent: "This price is for agents with an active plan.",
  afa_already_registered: "This number already has an AFA registration with us. You don't need to pay again.",
  afa_name_invalid: "Enter the full name exactly as it is on the Ghana Card (first name and surname).",
  afa_phone_invalid: "That doesn't look like an MTN number. AFA is for MTN only: 024, 025, 053, 054, 055 or 059.",
  afa_card_invalid: "That Ghana Card number doesn't look right. It looks like GHA-123456789-0.",
  afa_dob_invalid: "Check the date of birth. The person must be 16 or older.",
  afa_job_invalid: "Enter the person's occupation.",
  afa_region_invalid: "Choose a region.",
  afa_address_invalid: "Enter the town or area.",
};
/** A plain sentence for whatever the server said. */
export function serviceError(message: string | null | undefined, fallback = "Something went wrong. Please try again."): string {
  for (const key of Object.keys(MESSAGES)) if (message?.includes(key)) return MESSAGES[key];
  return message && !/[_{}]/.test(message) && message.length < 160 ? message : fallback;
}

export async function loadServices(store?: string): Promise<ServiceProduct[]> {
  const { data } = await phase1().rpc<ServiceProduct[]>("service_catalog", store ? { p_store: store } : {});
  return (data ?? []).map((p) => ({ ...p, price: Number(p.price) }));
}
/** Whether result-checker PINs are also sent by SMS right now (an admin switch). When off, they go on screen and by email. */
export async function servicesSendSms(): Promise<boolean> {
  const { data } = await phase1().rpc<{ sms?: boolean }>("service_info");
  return Boolean(data?.sms);
}
export async function buyServiceWithWallet(productCode: string, quantity: number, phone: string, details?: AfaDetails, context: ServiceContext = {}): Promise<{ order: ServiceOrder | null; error: string | null }> {
  const { data, error } = await phase1().rpc<ServiceOrder>("service_buy_wallet", { p_product: productCode, p_qty: quantity, p_phone: phone, p_device: appDeviceId(), ...(details ? { p_details: details } : {}),
    ...(context.store ? { p_store: context.store } : {}), ...(context.asAgent ? { p_as_agent: true } : {}) });
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
export const startServiceCheckout = (input: { productCode: string; quantity: number; phone: string; email?: string; details?: AfaDetails; store?: string }) =>
  call<{ authorizationUrl: string; token: string; reference: string; total: number }>({ action: "start", ...input, deviceId: appDeviceId() });
/** On return from the payment page: checks the payment and gives back the order (with its PINs once delivered). */
export const confirmServiceOrder = (token: string) => call<ServiceOrder>({ action: "confirm", token });
export async function myServiceOrders(): Promise<ServiceOrder[]> {
  const { data } = await phase1().rpc<ServiceOrder[]>("service_my_orders");
  return data ?? [];
}
/* Agents: which services their store sells, and at what price. */
export interface AgentServiceProduct { code: string; kind: "checker" | "afa"; name: string; blurb: string; agent_price: number; customer_price: number; price: number; enabled: boolean; in_stock: boolean }
export interface AgentServices { active: boolean; products: AgentServiceProduct[]; earned: number;
  sales: { reference: string; name: string; quantity: number; amount: number; margin: number | null; self: boolean; status: ServiceOrder["status"]; at: string; phone: string }[] }
export const loadAgentServices = () => phase1().rpc<AgentServices>("agent_services");
export const setAgentService = (code: string, price: number, enabled: boolean) => phase1().rpc<boolean>("agent_service_set", { p_product: code, p_price: price, p_enabled: enabled });
export const SERVICE_FEE_RATE = 0.04;
export const serviceFee = (base: number) => Math.round(base * SERVICE_FEE_RATE * 100) / 100;

/* Admin */
export interface AdminServiceProduct { code: string; kind: string; name: string; customer_price: number; agent_price: number; is_active: boolean; low_stock_at: number; left: number; held: number; stock_value: number; sold: number; sold_today: number }
export interface AdminServiceOrder { id: string; reference: string; name: string; quantity: number; amount: number; fee_amount: number; cost_amount: number | null; phone: string; status: ServiceOrder["status"]; payment_method: "wallet" | "paystack"; agent_id: string | null; agent_margin: number | null; created_at: string; paid_at: string | null; delivered_at: string | null; sent: string | null; kind?: string }
export interface AdminRegistration { id: string; reference: string; status: ServiceOrder["status"]; amount: number; fee_amount: number; cost_amount: number | null; phone: string; payment_method: "wallet" | "paystack"; paid_at: string | null; delivered_at: string | null;
  details: Partial<AfaDetails>; step: "queued" | "sending" | "submitted" | "unclear" | "rejected" | "done" | "cancelled"; note: string | null; supplier: string | null; supplier_reference: string | null; step_at: string }
export interface AdminServices {
  can_edit: boolean; products: AdminServiceProduct[]; waiting: number; registering?: number; registrations?: AdminRegistration[];
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
/** The owner registered this AFA order by hand: what it cost and where that money came from. */
export const markRegistrationDone = (orderId: string, cost: number, paidFrom: string, note: string) => phase1().rpc<string>("admin_service_registration_done", { p_order: orderId, p_cost: cost, p_paid_from: paidFrom, p_note: note || null });
/** Send a refused or unclear AFA registration to the supplier again. */
export const retryRegistration = (orderId: string) => phase1().rpc<string>("admin_service_registration_retry", { p_order: orderId });
export const refundServiceViaPaystack = (orderId: string, reason: string) => call<unknown>({ action: "refund", orderId, reason });

export interface SmsSenders { can_edit: boolean; services_enabled: boolean; services_sender: string; agents_enabled: boolean; agents_sender: string; agent_approved_text: string; verify_sender: string; verify_enabled: boolean; credits: number | null;
  recent: { kind: string; phone_end: string; status: string; result: string | null; created_at: string }[];
  /** Every text sent lately and what the network did with it (see lib/smsDelivery). Absent until the server has the record. */
  texts?: SmsText[]; texts_today?: { sent: number; delivered: number; not_delivered: number; waiting: number; refused: number } }
export interface SmsText { id: number; sent_at: string; phone_end: string; sender: string; part: number; parts: number; accepted: boolean; refusal: string | null;
  delivery: string; delivery_reason: string | null; delivery_checked_at: string | null; order_reference: string | null; queue_kind: string | null }
export const loadSmsSenders = () => phase1().rpc<SmsSenders>("admin_sms_senders");
export const saveSmsSenders = (s: SmsSenders) => phase1().rpc<boolean>("admin_sms_senders_save", { p_services_enabled: s.services_enabled, p_services_sender: s.services_sender, p_agents_enabled: s.agents_enabled, p_agents_sender: s.agents_sender, p_agent_text: s.agent_approved_text });
