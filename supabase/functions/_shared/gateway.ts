/* Which gateway takes a payment, and one call to start it.

   The switch lives in phase1.site_settings key 'payment_gateway':
     {"provider":"paystack"|"flutterwave"|"kora"}
   Default paystack. Master-only to change (master_set_payment_gateway).

   Safety rules, in order:
   1. Chosen gateway not configured (no secret)          -> paystack
   2. Switch says paystack                                -> paystack
   3. Switch says X but X's key is a TEST key             -> X ONLY for admin accounts
      (admin_role(uid) is set); guests and customers     -> paystack
   4. Switch says X with a live key                       -> X for everyone
   So customers can never be shown a test-mode checkout. */
import { initializePaystackTransaction } from "./paystack.ts";
import { flutterwaveConfigured, flutterwaveIsTestKey, initializeFlutterwavePayment, verifyFlutterwaveByReference } from "./flutterwave.ts";
import { initializeKoraCharge, koraConfigured, koraIsTestKey, verifyKoraCharge } from "./kora.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
export type Gateway = "paystack" | "flutterwave" | "kora";
export const GATEWAY_LABEL: Record<Gateway, string> = { paystack: "Paystack", flutterwave: "Flutterwave", kora: "Kora" };

export function gatewayConfigured(g: Gateway): boolean {
  return g === "paystack" ? Boolean(Deno.env.get("PAYSTACK_SECRET_KEY")?.trim()) : g === "flutterwave" ? flutterwaveConfigured() : koraConfigured();
}
export function gatewayIsTestKey(g: Gateway): boolean {
  return g === "flutterwave" ? flutterwaveIsTestKey() : g === "kora" ? koraIsTestKey() : false;
}

export async function configuredGateway(supabase: Db): Promise<Gateway> {
  const { data } = await supabase.from("site_settings").select("value").eq("key", "payment_gateway").maybeSingle();
  const p = String((data?.value as { provider?: string } | null)?.provider ?? "paystack").toLowerCase();
  return p === "flutterwave" || p === "kora" ? p : "paystack";
}

export async function isAdminUser(supabase: Db, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabase.rpc("admin_role", { p_user: userId });
  return Boolean(data);
}

/** The gateway this payer gets right now (see the rules above). */
export async function resolveGateway(supabase: Db, payerUserId: string | null | undefined): Promise<{ gateway: Gateway; test: boolean }> {
  const wanted = await configuredGateway(supabase);
  if (wanted === "paystack" || !gatewayConfigured(wanted)) return { gateway: "paystack", test: false };
  if (!gatewayIsTestKey(wanted)) return { gateway: wanted, test: false };
  return (await isAdminUser(supabase, payerUserId)) ? { gateway: wanted, test: true } : { gateway: "paystack", test: false };
}

export interface CheckoutStart {
  ok: boolean;
  status: number;
  gateway: Gateway;
  /** True when this is a TEST-key checkout (admins only). Stored on the intent so the webhook delivers nothing. */
  test: boolean;
  authorizationUrl: string | null;
  accessCode: string | null;
  message: string | null;
  payload: unknown;
}

const webhookUrl = (g: Gateway) => `${(Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "")}/functions/v1/${g}-webhook`;

/** Start a payment on whichever gateway resolveGateway picks. The reference is ours and is the
 *  same on every gateway, so every existing lookup by provider_reference keeps working. */
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
    const r = await initializeFlutterwavePayment({ ...input, metadata: { ...(input.metadata ?? {}), gateway, test } });
    return { ok: r.ok && Boolean(r.link), status: r.status, gateway, test, authorizationUrl: r.link, accessCode: null, message: r.ok ? null : (r.payload?.message ?? "Could not start Flutterwave payment"), payload: r.payload };
  }
  if (gateway === "kora") {
    const r = await initializeKoraCharge({ ...input, notificationUrl: webhookUrl("kora"), narration: `DataYego ${String(input.metadata?.orderReference ?? input.metadata?.purpose ?? "").replace(/_/g, " ")}`.trim(), metadata: { purpose: input.metadata?.purpose, orderRef: input.metadata?.orderReference, test: test ? "1" : "0" } });
    return { ok: r.ok && Boolean(r.link), status: r.status, gateway, test, authorizationUrl: r.link, accessCode: null, message: r.ok ? null : (r.payload?.message ?? "Could not start Kora payment"), payload: r.payload };
  }
  const r = await initializePaystackTransaction({ email: input.email, amount: input.amount, reference: input.reference, currency: input.currency, callbackUrl: input.callbackUrl, metadata: input.metadata });
  const okay = r.ok && Boolean(r.payload?.status);
  return { ok: okay, status: r.status, gateway, test: false, authorizationUrl: okay ? r.payload.data.authorization_url : null, accessCode: okay ? r.payload.data.access_code ?? null : null, message: okay ? null : (r.payload?.message ?? "Could not initialize Paystack transaction"), payload: r.payload };
}

export interface GatewayVerification { ok: boolean; status: string; amount: number; currency: string | null; transactionId: string | null; payload: unknown }

/** Ask a non-Paystack gateway whether OUR reference was paid. (Paystack keeps its own verify path.) */
export async function verifyWithGateway(gateway: Exclude<Gateway, "paystack">, reference: string): Promise<GatewayVerification> {
  if (gateway === "flutterwave") { const v = await verifyFlutterwaveByReference(reference); return { ok: v.ok, status: v.status, amount: v.amount, currency: v.currency, transactionId: v.transactionId, payload: v.payload }; }
  const v = await verifyKoraCharge(reference); return { ok: v.ok, status: v.status, amount: v.amount, currency: v.currency, transactionId: v.transactionId, payload: v.payload };
}
