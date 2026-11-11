/* Sending notifications to iPhones (and any browser) through Web Push: the message is encrypted for
   that one phone (RFC 8291, aes128gcm) and signed with our own VAPID key (RFC 8292).
   The VAPID key pair is made once by the sender and kept in phase1.internal_secrets (key 'vapid');
   only its public half ever leaves the server. */

export interface WebPushMessage { title: string; body: string; url: string; tag?: string }
export type WebPushResult = { ok: true } | { ok: false; dead: boolean; error: string };
export interface VapidKeys { publicKey: string; privateJwk: JsonWebKey }
interface Subscription { endpoint: string; keys: { p256dh: string; auth: string } }

const enc = new TextEncoder();
export const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const fromB64url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };

/** A fresh VAPID key pair. The public key is the 65-byte point the phone subscribes with. */
export async function createVapidKeys(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  return { publicKey, privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey) };
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/** The encrypted body for one phone. */
export async function encryptPayload(payload: Uint8Array, p256dh: Uint8Array, auth: Uint8Array): Promise<Uint8Array> {
  const phoneKey = await crypto.subtle.importKey("raw", p256dh, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ours = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const ourPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ours.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: phoneKey }, ours.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode("WebPush: info\0"), p256dh, ourPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // One record: the message, then 0x02 to mark it as the last.
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21); header.set(salt, 0); new DataView(header.buffer).setUint32(16, 4096); header[20] = ourPublic.length;
  return concat(header, ourPublic, sealed);
}

const signers = new Map<string, { header: string; expires: number }>();
/** The signed pass that tells the push service this message is really from DataYego (one per service, reused for an hour). */
async function vapidHeader(vapid: VapidKeys, endpoint: string): Promise<string> {
  const audience = new URL(endpoint).origin;
  const cached = signers.get(audience);
  if (cached && cached.expires > Date.now()) return cached.header;
  const key = await crypto.subtle.importKey("jwk", vapid.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const unsigned = `${b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })))}.${b64url(enc.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "https://datayego.com" })))}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned)));
  const header = `vapid t=${unsigned}.${b64url(signature)}, k=${vapid.publicKey}`;
  signers.set(audience, { header, expires: Date.now() + 3600_000 });
  return header;
}

/** One notification to one phone. `token` is the subscription the phone gave us, as JSON. */
export async function webPushSend(vapid: VapidKeys, token: string, message: WebPushMessage): Promise<WebPushResult> {
  let sub: Subscription;
  try {
    sub = JSON.parse(token) as Subscription;
    if (!/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("bad");
  } catch { return { ok: false, dead: true, error: "unreadable subscription" }; }
  try {
    const body = await encryptPayload(enc.encode(JSON.stringify(message)), fromB64url(sub.keys.p256dh), fromB64url(sub.keys.auth));
    const response = await fetch(sub.endpoint, {
      method: "POST",
      headers: { Authorization: await vapidHeader(vapid, sub.endpoint), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "high" },
      body,
    });
    if (response.ok) return { ok: true };
    const reason = (await response.text().catch(() => "")).slice(0, 120);
    // 404 / 410: the phone removed DataYego or switched notifications off. It will never accept another.
    return { ok: false, dead: response.status === 404 || response.status === 410, error: `${response.status} ${reason}`.trim() };
  } catch (error) {
    return { ok: false, dead: false, error: error instanceof Error ? error.message : "network error" };
  }
}
