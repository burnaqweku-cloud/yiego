import { supabase } from "@/integrations/supabase/client";

export const DATAMARTGH_NETWORK_CODES = {
  mtn: "YELLO",
  telecel: "TELECEL",
  airteltigo: "AT_PREMIUM",
} as const;

export type Phase1NetworkCode = keyof typeof DATAMARTGH_NETWORK_CODES;

export interface NumberVerificationResult {
  phoneNumber: string;
  network?: string;
  servable?: boolean;
  recommendation?: "sell_any" | "activate_first" | string;
  message?: string;
  cached?: boolean;
}

export interface GuestDataPaymentInput {
  productId: string;
  recipientPhone: string;
  guestEmail?: string;
  guestPhone?: string;
}

export interface WalletDepositInput {
  amount: number;
}

export interface WalletDataOrderInput {
  productId: string;
  recipientPhone: string;
}

export interface WalletDataOrderResponse {
  status: "success" | "needs_review";
  data: {
    orderId: string;
    orderReference: string;
    ledgerReference?: string;
    balanceAfter?: number;
    fulfillment?: unknown;
  };
  error?: string;
}

export interface PreparedOrderSummary {
  id: string;
  order_reference: string;
  recipient_phone: string;
  amount: number | string;
  currency: string;
  status: string;
  payment_status: string;
  payment_arrangement: "unselected" | "self" | "shared";
  selected_payment_method: "wallet" | "paystack" | null;
  payment_expires_at: string | null;
  created_at: string;
  updated_at: string;
  data_products: { name: string; capacity_gb?: number | string } | null;
  networks: { name: string; code: string } | null;
}

export interface PreparedOrderResult {
  existing: boolean;
  orderId: string;
  orderReference: string;
  amount?: number;
  recipientPhone?: string;
  expiresAt?: string;
}

export interface OrderPaymentActionResponse<T = unknown> {
  status: "success" | "needs_review";
  data?: T;
  error?: string;
}

export interface Phase1Product {
  id: string;
  app_product_code: string | null;
  name: string;
  validity: string | null;
  capacity_gb?: number | string | null;
  customer_price: number;
  network_id?: string;
}

interface Phase1ProductQuery {
  select: (columns: string) => Phase1ProductQuery;
  eq: (column: string, value: unknown) => Phase1ProductQuery;
  order: (column: string, options?: { ascending?: boolean }) => Phase1ProductQuery;
  then: PromiseLike<{ data: Phase1Product[] | null; error: { message: string } | null }>["then"];
}

interface Phase1SchemaClient {
  from: (table: "data_products") => Phase1ProductQuery;
}

export interface PaystackCheckoutResponse {
  status: "success";
  data: {
    authorizationUrl: string;
    accessCode: string;
    reference?: string;
    orderReference?: string;
    paymentReference?: string;
  };
}

export interface FunctionResult<T> {
  data: T | null;
  error: string | null;
}

async function invokePhase1Function<T>(
  name: string,
  options?: Parameters<typeof supabase.functions.invoke>[1],
): Promise<FunctionResult<T>> {
  const { data, error } = await supabase.functions.invoke<T>(name, options);

  if (!error) {
    return { data: data ?? null, error: null };
  }

  // On a non-2xx response, error.message is only the generic "Edge Function
  // returned a non-2xx status code" line; the function's real, human-written
  // message travels in the response body on error.context.
  let message = error.message ?? "Request failed";
  const context = (error as { context?: Response }).context;
  if (context && typeof context.clone === "function") {
    try {
      const body = (await context.clone().json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // Body was not JSON — keep the generic message.
    }
  }

  return { data: null, error: message };
}

export function createGuestDataPayment(input: GuestDataPaymentInput) {
  return invokePhase1Function<PaystackCheckoutResponse>("create-guest-data-payment", {
    body: input,
  });
}

export function createWalletDeposit(input: WalletDepositInput) {
  return invokePhase1Function<PaystackCheckoutResponse>("create-wallet-deposit", {
    body: input,
  });
}

export function createWalletDataOrder(input: WalletDataOrderInput) {
  return invokePhase1Function<WalletDataOrderResponse>("create-wallet-data-order", {
    body: input,
  });
}

export async function loadPhase1Products() {
  const phase1Client = (supabase as unknown as { schema: (name: string) => Phase1SchemaClient }).schema("phase1");
  const { data, error } = await phase1Client
    .from("data_products")
    .select("id, app_product_code, name, validity, capacity_gb, customer_price, network_id")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  return {
    data: (data ?? []) as Phase1Product[],
    error: error?.message ?? null,
  };
}

/**
 * Supplier verification is intentionally not called directly from normal
 * frontend screens yet. DataMartGH proxy functions require an internal secret
 * so public traffic cannot burn supplier wallet/rate limits.
 */
export function mapNetworkToDataMartGH(network: Phase1NetworkCode) {
  return DATAMARTGH_NETWORK_CODES[network];
}

export function prepareDataOrder(input: WalletDataOrderInput) {
  return invokePhase1Function<OrderPaymentActionResponse<PreparedOrderResult>>("order-payment-action", {
    body: { action: "prepare", ...input },
  });
}

export function listPendingOrders() {
  return invokePhase1Function<OrderPaymentActionResponse<PreparedOrderSummary[]>>("order-payment-action", {
    body: { action: "list_pending" },
  });
}

export function orderPaymentAction<T = unknown>(
  action: string,
  orderReference: string,
  extra: Record<string, unknown> = {},
) {
  return invokePhase1Function<OrderPaymentActionResponse<T>>("order-payment-action", {
    body: { action, orderReference, ...extra },
  });
}
