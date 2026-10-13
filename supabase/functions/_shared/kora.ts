/* Kora (Korapay) hosted "Checkout Redirect". Mirrors flutterwave.ts / paystack.ts; gateway.ts
   routes to it.

   Secret (Supabase edge function secret, never in the database or the front end):
     KORA_SECRET_KEY   sk_test_…  (test)  or  sk_live_…  (live)
   Kora signs webhooks with the same secret key, so there is no separate webhook hash.

   Test mode is detected from the key prefix. While the key is a TEST key, gateway.ts only ever
   offers Kora to admin accounts, and a test payment settles nothing (no wallet credit, no plan,
   no supplier order). Swapping in a live key switches both guards off. */

const KORA_BASE_URL = "https://api.korapay.com/merchant/api/v1";

export function getKoraSecretKey(): string | null {
  const key = Deno.env.get("KORA_SECRET_KEY")?.trim();
  return key || null;
}
export const koraConfigured = () => Boolean(getKoraSecretKey());
/** Kora test keys look like sk_test_…; live keys look like sk_live_…. */
export const koraIsTestKey = (key = getKoraSecretKey()) => /^sk_test_/i.test(key ?? "");

function headers() {
  return { Authorization: `Bearer ${getKoraSecretKey() ?? ""}`, "Content-Type": "application/json" };
}

/** Start a hosted checkout. `reference` is ours (the same YG… reference we give the other gateways);
 *  Kora appends ?reference=<it> to the redirect and echoes it in the webhook, so lookups stay by
 *  our reference. The webhook URL is passed per charge (notification_url), so nothing needs to be
 *  configured in their dashboard for payments to settle. */
export async function initializeKoraCharge(input: {
  email: string;
  amount: number;
  reference: string;
  currency?: string;
  callbackUrl?: string;
  notificationUrl?: string;
  customerName?: string | null;
  narration?: string;
  metadata?: Record<string, unknown>;
}) {
  // Kora allows at most 5 metadata keys, names ≤ 20 chars of [A-Za-z0-9-], and no empty object.
  const meta: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.metadata ?? {})) {
    if (Object.keys(meta).length >= 5) break;
    const key = k.replace(/[^A-Za-z0-9-]/g, "-").slice(0, 20);
    if (v == null || typeof v === "object") continue;
    meta[key] = String(v).slice(0, 100);
  }
  const body = {
    amount: Number(input.amount.toFixed(2)),
    currency: input.currency ?? "GHS",
    reference: input.reference,
    customer: { email: input.email, ...(input.customerName ? { name: input.customerName } : {}) },
    ...(input.callbackUrl ? { redirect_url: input.callbackUrl } : {}),
    ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
    narration: input.narration ?? "DataYego",
    channels: ["mobile_money", "card"],
    default_channel: "mobile_money",
    merchant_bears_cost: true,
    ...(Object.keys(meta).length ? { metadata: meta } : {}),
  };
  const response = await fetch(`${KORA_BASE_URL}/charges/initialize`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null);
  return { ok: response.ok && payload?.status === true, status: response.status, payload, link: (payload?.data?.checkout_url as string | undefined) ?? null };
}

export interface KoraVerification { ok: boolean; status: string; amount: number; currency: string | null; fee: number | null; transactionId: string | null; payload: unknown }

/** Query a charge by OUR reference. Kora's "success" is the only state we treat as paid. */
export async function verifyKoraCharge(reference: string): Promise<KoraVerification> {
  const response = await fetch(`${KORA_BASE_URL}/charges/${encodeURIComponent(reference)}`, { headers: headers() });
  const payload = await response.json().catch(() => null);
  const d = payload?.data ?? {};
  return { ok: response.ok && payload?.status === true && String(d.status).toLowerCase() === "success", status: String(d.status ?? "unknown"), amount: Number(d.amount ?? 0), currency: d.currency ?? null, fee: d.fee != null ? Number(d.fee) : null, transactionId: d.transaction_reference ?? d.payment_reference ?? d.reference ?? null, payload };
}

/** Kora sends x-korapay-signature = hex HMAC-SHA256 of the JSON of the `data` object, keyed with the
 *  secret key. We re-serialise the parsed object the way their own example does. */
export async function verifyKoraWebhookSignature(data: unknown, signature: string | null): Promise<boolean> {
  const secret = getKoraSecretKey();
  if (!secret || !signature || data == null) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, enc.encode(JSON.stringify(data)));
  const expected = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
