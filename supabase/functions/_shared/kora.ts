/* Kora (Korapay) hosted "Checkout Redirect". Mirrors flutterwave.ts / paystack.ts; gateway.ts
   routes to it.

   Secret (Supabase edge function secret, never in the database or the front end):
     KORA_SECRET_KEY   sk_test_…  (test)  or  sk_live_…  (live)
   Kora signs webhooks with the same secret key, so there is no separate webhook hash.

   Test mode is detected from the key prefix. While the key is a TEST key, gateway.ts only ever
   offers Kora to admin accounts, and a test payment settles nothing (no wallet credit, no plan,
   no supplier order). Live routing additionally requires explicit readiness approval. */

import { koraRefundState, parseKoraBalances } from "./koraReporting.ts";

const KORA_BASE_URL = "https://api.korapay.com/merchant/api/v1";

export function getKoraSecretKey(): string | null {
  const key = Deno.env.get("KORA_SECRET_KEY")?.trim();
  return key || null;
}
export const koraConfigured = () => /^(sk_test_|sk_live_)/.test(getKoraSecretKey() ?? "");
/** This is deliberately OFF until refunds, GHS settlement accounting and KYC are verified. */
export const koraLiveReady = () => Deno.env.get("KORA_LIVE_ENABLED") === "true"
  && /^sk_live_/.test(getKoraSecretKey() ?? "");
/** Kora test keys look like sk_test_…; live keys look like sk_live_…. */
export const koraIsTestKey = (key = getKoraSecretKey()) => /^sk_test_/i.test(key ?? "");

function headers() {
  return { Authorization: `Bearer ${getKoraSecretKey() ?? ""}`, "Content-Type": "application/json" };
}

async function koraRequest(path: string, body?: Record<string, unknown>) {
  if (!koraConfigured()) throw new Error("Kora is not configured");
  const response = await fetch(`${KORA_BASE_URL}${path}`, {
    method: body ? "POST" : "GET", headers: headers(),
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => null);
  return { ok: response.ok && payload?.status === true, status: response.status, payload };
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
  if (!Number.isFinite(input.amount) || input.amount <= 0 || (input.currency ?? "GHS") !== "GHS") throw new Error("Invalid Kora payment amount or currency");
  if (!input.reference || input.reference.length > 100 || !input.email) throw new Error("Invalid Kora payment details");
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
  const result = await koraRequest("/charges/initialize", body);
  const link = result.payload?.data?.checkout_url;
  let safeLink: string | null = null;
  try { const url = new URL(link); if (url.protocol === "https:" && url.hostname === "checkout.korapay.com") safeLink = url.href; } catch { /* no redirect to an untrusted host */ }
  return { ...result, ok: result.ok && result.payload?.data?.reference === input.reference && safeLink !== null, link: safeLink };
}

export interface KoraVerification { ok: boolean; status: string; amount: number; currency: string | null; fee: number | null; transactionId: string | null; payload: unknown }

/** Query a charge by OUR reference. Kora's "success" is the only state we treat as paid. */
export async function verifyKoraCharge(reference: string): Promise<KoraVerification> {
  const { ok, payload } = await koraRequest(`/charges/${encodeURIComponent(reference)}`);
  const d = payload?.data ?? {};
  const amount = Number(d.amount);
  return { ok: ok && d.reference === reference && d.status === "success" && d.currency === "GHS" && Number.isFinite(amount) && amount > 0, status: String(d.status ?? "unknown"), amount, currency: d.currency ?? null, fee: d.fee != null && Number.isFinite(Number(d.fee)) ? Number(d.fee) : null, transactionId: d.transaction_reference ?? d.payment_reference ?? d.reference ?? null, payload };
}

export async function readKoraBalances() {
  const result = await koraRequest("/balances");
  const items = result.ok ? parseKoraBalances(result.payload?.data) : null;
  return { ok: result.ok && items !== null, items };
}

/** Raw, paginated provider reports; never use a single page as a complete financial total. */
export async function readKoraHistory(input: { currency?: string; dateFrom?: string; dateTo?: string; cursor?: string; direction?: "debit" | "credit" } = {}) {
  const query = new URLSearchParams({ limit: "100" });
  for (const [k, v] of Object.entries({ currency: input.currency, date_from: input.dateFrom, date_to: input.dateTo, starting_after: input.cursor, direction: input.direction })) if (v) query.set(k, v);
  return koraRequest(`/balances/history?${query}`);
}

export async function readKoraRefund(reference: string) {
  if (!reference || reference.length > 50) throw new Error("Invalid refund reference");
  const result = await koraRequest(`/refunds/${encodeURIComponent(reference)}`);
  return { ...result, state: koraRefundState(result.payload?.data?.status) };
}

/** Prepared API adapter only: no order/ledger mutations. A processing result is NOT completion.
 * GHS refund availability is not established by the public docs (only NGN minimum is listed).
 * Do not connect this to the refund engine until GHS support and accounting are verified. */
export async function initiateKoraRefund(input: { paymentReference: string; reference: string; amount?: number; reason?: string; webhookUrl?: string }) {
  if (Deno.env.get("KORA_GHS_REFUNDS_VERIFIED") !== "true") throw new Error("Kora GHS refunds are not yet verified");
  if (!input.paymentReference || !input.reference || input.reference.length > 50 || (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount <= 0))) throw new Error("Invalid Kora refund request");
  const result = await koraRequest("/refunds/initiate", {
    payment_reference: input.paymentReference, reference: input.reference,
    ...(input.amount !== undefined ? { amount: input.amount } : {}),
    ...(input.reason ? { reason: input.reason.slice(0, 200) } : {}),
    ...(input.webhookUrl ? { webhook_url: input.webhookUrl.slice(0, 200) } : {}),
  });
  return { ...result, state: koraRefundState(result.payload?.data?.status) };
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
