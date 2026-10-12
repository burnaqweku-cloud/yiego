/* Flutterwave v3, hosted ("Standard") checkout. Mirrors paystack.ts so the call sites can treat
   the two gateways the same way through gateway.ts.

   Secrets (Supabase edge function secrets, never in the database or the front end):
     FLUTTERWAVE_SECRET_KEY    FLWSECK_TEST-…  (test)  or  FLWSECK-…  (live)
     FLUTTERWAVE_PUBLIC_KEY    not needed for hosted checkout; kept for completeness
     FLUTTERWAVE_WEBHOOK_HASH  the "Secret hash" typed into Flutterwave → Settings → Webhooks

   Test mode is detected from the key prefix. While the key is a TEST key, gateway.ts only ever
   offers Flutterwave to admin accounts, and the webhook settles nothing (no wallet credit, no
   subscription, no supplier order). Swapping in a live key switches both guards off. */

const FLW_BASE_URL = "https://api.flutterwave.com/v3";

export function getFlutterwaveSecretKey(): string | null {
  const key = Deno.env.get("FLUTTERWAVE_SECRET_KEY")?.trim();
  return key || null;
}
export const flutterwaveConfigured = () => Boolean(getFlutterwaveSecretKey());
/** Flutterwave test keys look like FLWSECK_TEST-…; live keys look like FLWSECK-…. */
export const flutterwaveIsTestKey = (key = getFlutterwaveSecretKey()) => /^FLWSECK_TEST/i.test(key ?? "");

function headers() {
  return { Authorization: `Bearer ${getFlutterwaveSecretKey() ?? ""}`, "Content-Type": "application/json" };
}

/** Start a hosted checkout. `reference` is our own tx_ref (the same YG… reference we give Paystack);
 *  Flutterwave echoes it back in the redirect and the webhook, so lookups stay by our reference. */
export async function initializeFlutterwavePayment(input: {
  email: string;
  amount: number;
  reference: string;
  currency?: string;
  callbackUrl?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const body = {
    tx_ref: input.reference,
    amount: Number(input.amount.toFixed(2)),
    currency: input.currency ?? "GHS",
    payment_options: "card,mobilemoneyghana",
    ...(input.callbackUrl ? { redirect_url: input.callbackUrl } : {}),
    customer: { email: input.email, ...(input.customerName ? { name: input.customerName } : {}), ...(input.customerPhone ? { phonenumber: input.customerPhone } : {}) },
    customizations: { title: "DataYego", description: String(input.metadata?.purpose ?? "Payment").replace(/_/g, " ") },
    ...(input.metadata ? { meta: input.metadata } : {}),
  };
  const response = await fetch(`${FLW_BASE_URL}/payments`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null);
  return { ok: response.ok && payload?.status === "success", status: response.status, payload, link: (payload?.data?.link as string | undefined) ?? null };
}

export interface FlutterwaveVerification { ok: boolean; status: string; amount: number; currency: string | null; transactionId: string | null; txRef: string | null; payload: unknown }

/** Verify by OUR reference (tx_ref). Flutterwave's "successful" is the only state we treat as paid. */
export async function verifyFlutterwaveByReference(reference: string): Promise<FlutterwaveVerification> {
  const response = await fetch(`${FLW_BASE_URL}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`, { headers: headers() });
  const payload = await response.json().catch(() => null);
  const d = payload?.data ?? {};
  return { ok: response.ok && payload?.status === "success" && d.status === "successful", status: String(d.status ?? payload?.status ?? "unknown"), amount: Number(d.amount ?? 0), currency: d.currency ?? null, transactionId: d.id != null ? String(d.id) : null, txRef: d.tx_ref ?? null, payload };
}

/** Flutterwave signs nothing; it sends the secret hash you set in the dashboard as `verif-hash`. */
export function verifyFlutterwaveWebhook(req: Request): boolean {
  const expected = Deno.env.get("FLUTTERWAVE_WEBHOOK_HASH")?.trim();
  const got = req.headers.get("verif-hash")?.trim();
  return Boolean(expected && got && expected === got);
}

/** Refund a successful transaction (full or partial). Needs the Flutterwave transaction id, which the
 *  webhook/verification stores on the payment intent as metadata.transactionId. */
export async function refundFlutterwaveTransaction(transactionId: string, amount?: number) {
  const response = await fetch(`${FLW_BASE_URL}/transactions/${encodeURIComponent(transactionId)}/refund`, { method: "POST", headers: headers(), body: JSON.stringify(amount != null ? { amount: Number(amount.toFixed(2)) } : {}) });
  const payload = await response.json().catch(() => null);
  return { ok: response.ok && payload?.status === "success", status: response.status, payload };
}
