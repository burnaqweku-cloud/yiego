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

export interface Phase1Product {
  id: string;
  app_product_code: string | null;
  name: string;
  validity: string | null;
  customer_price: number;
  network_id?: string;
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

  return {
    data: data ?? null,
    error: error?.message ?? null,
  };
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
  const { data, error } = await supabase
    .schema("phase1")
    .from("data_products")
    .select("id, app_product_code, name, validity, customer_price, network_id")
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
