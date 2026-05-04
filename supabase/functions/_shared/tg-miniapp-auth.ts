// Shared helpers for Telegram Mini App authentication.
// - verifyInitData: validates the HMAC-SHA-256 signature of the
//   Telegram WebApp initData payload using the bot token.
// - signSession / verifySession: short-lived (5 min) HS256 JWT
//   used by the Mini App for subsequent API calls.

export interface TgInitDataUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface TgVerifiedInit {
  user: TgInitDataUser;
  auth_date: number;
  query_id?: string;
  start_param?: string;
  raw: Record<string, string>;
}

const MAX_AUTH_AGE_SEC = 60 * 60; // 1 hour
const SESSION_TTL_SEC = 5 * 60;   // 5 minutes

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(keyBytes: Uint8Array, msg: string): Promise<ArrayBuffer> {
  // BufferSource cast keeps Deno's strict types happy
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, enc.encode(msg));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify a Telegram WebApp initData string. Throws on failure. */
export async function verifyInitData(initData: string): Promise<TgVerifiedInit> {
  if (!initData || typeof initData !== "string") {
    throw new Error("MISSING_INIT_DATA");
  }
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN not configured");

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("INIT_DATA_NO_HASH");
  params.delete("hash");

  // Build data_check_string: alphabetically sorted "key=value" lines
  const entries: [string, string][] = [];
  params.forEach((v, k) => entries.push([k, v]));
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  // secret_key = HMAC_SHA256(key="WebAppData", message=BOT_TOKEN)
  const secretKey = await hmacSha256(enc.encode("WebAppData"), botToken);
  // computed_hash = HMAC_SHA256(key=secret_key, message=dataCheckString)
  const computedSig = await hmacSha256(new Uint8Array(secretKey), dataCheckString);
  const computedHex = toHex(computedSig);

  if (!constantTimeEqual(computedHex, hash)) {
    throw new Error("INVALID_INIT_DATA_SIGNATURE");
  }

  const authDate = Number(params.get("auth_date") ?? "0");
  if (!authDate) throw new Error("INIT_DATA_NO_AUTH_DATE");
  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec > MAX_AUTH_AGE_SEC) throw new Error("INIT_DATA_EXPIRED");
  if (ageSec < -300) throw new Error("INIT_DATA_FUTURE");

  const userJson = params.get("user");
  if (!userJson) throw new Error("INIT_DATA_NO_USER");
  let user: TgInitDataUser;
  try {
    user = JSON.parse(userJson);
  } catch {
    throw new Error("INIT_DATA_BAD_USER_JSON");
  }
  if (!user || typeof user.id !== "number") throw new Error("INIT_DATA_BAD_USER");

  const raw: Record<string, string> = {};
  for (const [k, v] of entries) raw[k] = v;

  return {
    user,
    auth_date: authDate,
    query_id: params.get("query_id") ?? undefined,
    start_param: params.get("start_param") ?? undefined,
    raw,
  };
}

// ─── Session JWT (HS256) ────────────────────────────────────────────────────

export interface TgSessionClaims {
  chat_id: number;
  user_id?: string | null;
  iat: number;
  exp: number;
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlEncodeStr(str: string): string {
  return b64urlEncode(enc.encode(str));
}
function b64urlDecodeToStr(s: string): string {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return atob(s);
}

function getJwtSecret(): string {
  const s = Deno.env.get("TG_MINIAPP_JWT_SECRET");
  if (!s) throw new Error("TG_MINIAPP_JWT_SECRET not configured");
  return s;
}

export async function signSession(payload: { chat_id: number; user_id?: string | null }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: TgSessionClaims = {
    chat_id: payload.chat_id,
    user_id: payload.user_id ?? null,
    iat: now,
    exp: now + SESSION_TTL_SEC,
  };
  const header = b64urlEncodeStr(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64urlEncodeStr(JSON.stringify(claims));
  const signing = `${header}.${body}`;
  const sig = await hmacSha256(enc.encode(getJwtSecret()), signing);
  return `${signing}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verifySession(jwt: string): Promise<TgSessionClaims> {
  if (!jwt || typeof jwt !== "string") throw new Error("MISSING_SESSION");
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("BAD_SESSION_FORMAT");
  const [header, body, sig] = parts;
  const expected = await hmacSha256(enc.encode(getJwtSecret()), `${header}.${body}`);
  const expectedB64 = b64urlEncode(new Uint8Array(expected));
  if (!constantTimeEqual(expectedB64, sig)) throw new Error("BAD_SESSION_SIGNATURE");
  let claims: TgSessionClaims;
  try {
    claims = JSON.parse(b64urlDecodeToStr(body));
  } catch {
    throw new Error("BAD_SESSION_BODY");
  }
  const now = Math.floor(Date.now() / 1000);
  if (!claims?.exp || claims.exp < now) throw new Error("SESSION_EXPIRED");
  if (typeof claims.chat_id !== "number") throw new Error("BAD_SESSION_CLAIMS");
  return claims;
}

/** Read Bearer token from Authorization header and verify. */
export async function requireMiniAppSession(req: Request): Promise<TgSessionClaims> {
  const auth = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) throw new Error("MISSING_BEARER");
  return verifySession(auth.slice(7).trim());
}

export const TG_MINIAPP_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
