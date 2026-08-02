const PAYSTACK_BASE_URL = "https://api.paystack.co";

export function getPaystackSecretKey() {
  const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY");

  if (!secretKey) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }

  return secretKey;
}

export function amountToSubunit(amount: number) {
  return Math.round(amount * 100);
}

export function amountFromSubunit(amount: number) {
  return Math.round(amount) / 100;
}

export function makePaystackReference(prefix: string) {
  const safePrefix = prefix.replace(/[^A-Za-z0-9.-=]/g, "").slice(0, 12) || "YG";
  return `${safePrefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export async function initializePaystackTransaction(input: {
  email: string;
  amount: number;
  reference: string;
  currency?: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}) {
  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getPaystackSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      amount: amountToSubunit(input.amount),
      reference: input.reference,
      currency: input.currency ?? "GHS",
      channels: ["card", "mobile_money"],
      ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }),
  });

  const payload = await response.json();

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

export async function verifyPaystackTransaction(reference: string) {
  const response = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${getPaystackSecretKey()}`,
      },
    },
  );

  const payload = await response.json();

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

export async function verifyPaystackWebhookSignature(rawBody: string, signature: string | null) {
  const secret = getPaystackSecretKey();

  if (!signature) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expected = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return result === 0;
}
