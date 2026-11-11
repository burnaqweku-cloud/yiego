/* Sending phone notifications through Firebase Cloud Messaging (the HTTP v1 API).
   The FIREBASE_SERVICE_ACCOUNT secret holds the service-account JSON; it is only ever read here. */

export interface FcmMessage { title: string; body: string; url: string; tag?: string }
export type FcmResult = { ok: true } | { ok: false; dead: boolean; error: string };

interface ServiceAccount { project_id: string; client_email: string; private_key: string; token_uri?: string }

export function fcmConfigured(): boolean {
  return Boolean(Deno.env.get("FIREBASE_SERVICE_ACCOUNT"));
}

function serviceAccount(): ServiceAccount {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
  const parsed = JSON.parse(raw) as ServiceAccount;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT is not a service account key");
  return parsed;
}

const b64url = (bytes: Uint8Array | string) => {
  const bin = typeof bytes === "string" ? bytes : String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function signingKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

let cached: { token: string; projectId: string; expires: number } | null = null;

/** A short-lived Google access token for sending messages (kept for the life of this run). */
export async function fcmAccess(): Promise<{ token: string; projectId: string }> {
  if (cached && cached.expires > Date.now() + 60_000) return cached;
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: tokenUri, iat: now, exp: now + 3600 }))}`;
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await signingKey(sa.private_key), new TextEncoder().encode(unsigned)));
  const response = await fetch(tokenUri, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(signature)}` }) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.access_token) throw new Error(`Google refused the sign-in (${response.status}): ${json.error_description ?? json.error ?? "no reason given"}`);
  cached = { token: json.access_token, projectId: sa.project_id, expires: Date.now() + Number(json.expires_in ?? 3600) * 1000 };
  return cached;
}

/** One notification to one phone. `dead` means the phone's address is gone for good and should be retired. */
export async function fcmSend(access: { token: string; projectId: string }, deviceToken: string, message: FcmMessage): Promise<FcmResult> {
  try {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${access.projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: {
        token: deviceToken,
        notification: { title: message.title, body: message.body },
        data: { url: message.url },
        android: { priority: "HIGH", notification: { channel_id: "orders", ...(message.tag ? { tag: message.tag } : {}) } },
      } }),
    });
    if (response.ok) return { ok: true };
    const json = await response.json().catch(() => ({}));
    const status = String(json?.error?.status ?? "");
    const code = String(json?.error?.details?.[0]?.errorCode ?? "");
    // The app was removed or the address expired: Google will never deliver to it again.
    const dead = response.status === 404 || code === "UNREGISTERED" || (response.status === 400 && status === "INVALID_ARGUMENT" && /registration token|not a valid FCM/i.test(String(json?.error?.message ?? "")));
    return { ok: false, dead, error: `${response.status} ${code || status || "error"}`.trim() };
  } catch (error) {
    return { ok: false, dead: false, error: error instanceof Error ? error.message : "network error" };
  }
}
