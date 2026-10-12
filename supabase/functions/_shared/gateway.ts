/* Which gateway takes a payment, and one call to start it.

   The switch lives in phase1.site_settings key 'payment_gateway': {"provider":"paystack"|"flutterwave"}.
   Default paystack. Master-only to change (master_set_payment_gateway).

   Safety rules, in order:
   1. Flutterwave not configured (no secret)            -> paystack
   2. Switch says paystack                               -> paystack
   3. Switch says flutterwave but the key is a TEST key  -> flutterwave ONLY for admin accounts
      (admin_role(uid) is set); guests and customers    -> paystack
   4. Switch says flutterwave with a live key            -> flutterwave for everyone
   So customers can never be shown a test-mode checkout. */
import { initializePaystackTransaction } from "./paystack.ts";
import { flutterwaveConfigured, flutterwaveIsTestKey, initializeFlutterwavePayment } from "./flutterwave.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
export type Gateway = "paystack" | "flutterwave";

export async function configuredGateway(supabase: Db): Promise<Gateway> {
  const { data } = await supabase.from("site_settings").select("value").eq("key", "payment_gateway").maybeSingle();
  const p = String((data?.value as { provider?: string } | null)?.provider ?? "paystack").toLowerCase();
  return p === "flutterwave" ? "flutterwave" : "paystack";
}

export async function isAdminUser(supabase: Db, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabase.rpc("admin_role", { p_user: userId });
  return Boolean(data);
}

/** The gateway this payer gets right now (see the rules above). */
export async function resolveGateway(supabase: Db, payerUserId: string | null | undefined): Promise<{ gateway: Gateway; test: boolean }> {
  if (!flutterwaveConfigured()) return { gateway: "paystack", test: false };
  const wanted = await configuredGateway(supabase);
  if (wanted !== "flutterwave") return { gateway: "paystack", test: false };
  if (!flutterwaveIsTestKey()) return { gateway: "flutterwave", test: false };
  return (await isAdminUser(supabase, payerUserId)) ? { gateway: "flutterwave", test: true } : { gateway: "paystack", test: false };
}

export interface CheckoutStart {
  ok: boolean;
  status: number;
  gateway: Gateway;
  /** True when this is a Flutterwave TEST-key checkout (admins only). Stored on the intent so the webhook delivers nothing. */
  test: boolean;
  authorizationUrl: string | null;
  accessCode: string | null;
  message: string | null;
  payload: unknown;
}

/** Start a payment on whichever gateway resolveGateway picks. The reference is ours and is the
 *  same on both gateways, so every existing lookup by provider_reference keeps working. */
export async function startCheckout(supabase: Db, input: {
  payerUserId: string | null | undefined;
  email: string;
  amount: number;
  reference: string;
  currency?: string;
  callbackUrl?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<CheckoutStart> {
  const { gateway, test } = await resolveGateway(supabase, input.payerUserId);
  if (gateway === "flutterwave") {
    const r = await initializeFlutterwavePayment({ ...input, metadata: { ...(input.metadata ?? {}), gateway: "flutterwave", test } });
    return { ok: r.ok && Boolean(r.link), status: r.status, gateway, test, authorizationUrl: r.link, accessCode: null, message: r.ok ? null : (r.payload?.message ?? "Could not start Flutterwave payment"), payload: r.payload };
  }
  const r = await initializePaystackTransaction({ email: input.email, amount: input.amount, reference: input.reference, currency: input.currency, callbackUrl: input.callbackUrl, metadata: input.metadata });
  const okay = r.ok && Boolean(r.payload?.status);
  return { ok: okay, status: r.status, gateway, test: false, authorizationUrl: okay ? r.payload.data.authorization_url : null, accessCode: okay ? r.payload.data.access_code ?? null : null, message: okay ? null : (r.payload?.message ?? "Could not initialize Paystack transaction"), payload: r.payload };
}
