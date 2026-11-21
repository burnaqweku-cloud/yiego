// DataYego reseller API, v1 (owner, 21 Nov 2026). Self-contained: no shared imports, so it can be deployed alone.
// Public address: https://api.datayego.com/v1/… (the datayego-stores Worker hands it here).
//
// Sellers call it from their SERVER with their secret key:  Authorization: Bearer dy_live_…   (or X-API-Key: dy_live_…)
//   GET  /v1/status             no key: is the API open
//   GET  /v1/balance            their wallet balance
//   GET  /v1/bundles            what they can buy, at their price, and whether it is available now
//   POST /v1/orders             { bundle, phone, reference? }  pay from the wallet, queue the order
//                               (an Idempotency-Key header is used as the reference when the body has none)
//   GET  /v1/orders             their orders, newest first (?limit=1..100&status=…&before=<created_at>)
//   GET  /v1/orders/{reference} one order, by our reference or theirs
// The database decides everything (phase1.api_* functions); this function only checks the key, passes the call on and
// writes one log line per request. Keys are compared as SHA-256 hashes; the plain key is never stored. Test keys
// (dy_test_…) never charge or send anything.
//
// Security (21 Nov 2026, step 3): no CORS, so a browser page can never use a key; bodies over 8 KB are refused; wrong
// keys are logged with the caller's IP and an IP with 30 wrong keys in 10 minutes is refused; a seller can lock the
// live key to their servers' IPs. The caller's IP is the one the Worker vouches for (x-dy-client-ip with the shared
// x-dy-proxy-secret), otherwise the one Cloudflare in front of the platform saw (cf-connecting-ip).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Json = Record<string, unknown>;
const LIMIT = 120;
const MAX_BODY = 8 * 1024;

const ERRORS: Record<string, [number, string]> = {
  missing_key: [401, "Send your API key as: Authorization: Bearer <key>."],
  invalid_key: [401, "This API key is not valid. Check it, or make a new one from your DataYego dashboard."],
  account_not_active: [403, "Your API account is not active. Contact DataYego support."],
  ip_not_allowed: [403, "Your live key is locked to other IP addresses. Add this server's IP on your API page."],
  too_many_failures: [429, "Too many wrong keys from your address. Wait 10 minutes and check your key."],
  api_closed: [503, "The API is closed for maintenance. Try again shortly."],
  maintenance: [503, "DataYego is under maintenance. No orders can be placed right now. Try again shortly."],
  rate_limited: [429, "Too many requests. You can make up to 120 a minute."],
  not_found: [404, "Nothing here. See https://datayego.com/developers for the list of endpoints."],
  method_not_allowed: [405, "That method is not allowed here."],
  order_not_found: [404, "No order with that reference."],
  bad_json: [400, "The request body must be JSON."],
  body_too_large: [413, "The request body is too large."],
  missing_fields: [400, "Send bundle and phone."],
  invalid_phone: [400, "phone must be a 10-digit Ghana number, e.g. 0241234567."],
  wrong_network: [400, "This number is on a different network from the bundle."],
  unknown_bundle: [400, "No bundle with that id. Get the list from GET /v1/bundles."],
  bundle_not_offered: [400, "This bundle is not on your price list."],
  bundle_unavailable: [409, "This bundle is not available right now. Try again later."],
  bad_reference: [400, "reference may only use letters, numbers and . _ : - (up to 64)."],
  reference_conflict: [409, "This reference was already used for a different number or bundle. Use a new reference for a new order."],
  bad_status: [400, "status must be one of queued, processing, delivered, verifying, on_hold, refunded, cancelled."],
  bad_before: [400, "before must be a date and time, e.g. 2026-11-21T10:18:22Z."],
  insufficient_balance: [402, "Your balance is too low for this bundle. Top up and try again."],
  test_limit: [429, "You have made 1,000 test orders today. Test orders open again tomorrow."],
  no_wallet: [400, "Your DataYego wallet is not set up. Sign in at datayego.com once, then try again."],
  server_error: [500, "Something went wrong on our side. Try again; if you sent a reference, the same reference never charges twice."],
};
const STATUSES = ["queued", "processing", "delivered", "verifying", "on_hold", "refunded", "cancelled"];

let proxySecret: { value: string; at: number } | null = null;

Deno.serve(async (req) => {
  const started = Date.now();
  const requestId = "req_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const url = new URL(req.url);
  // The platform passes /api/v1/…; also accept /v1/….
  const path = url.pathname.replace(/^\/api(?=\/|$)/, "").replace(/\/+$/, "") || "/";
  const head: Record<string, string> = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Request-Id": requestId, "X-Content-Type-Options": "nosniff" };
  const reply = (status: number, body: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...head, ...extra } });
  const fail = (code: string, message?: string, extra: Json = {}) => {
    const [status, fallback] = ERRORS[code] ?? [400, "Request refused."];
    return reply(status, { error: { code, message: message ?? fallback, request_id: requestId, ...extra } }, code === "rate_limited" ? { "Retry-After": "60" } : {});
  };

  // No CORS on purpose: a key must never be used from a web page, where anyone can read it.
  if (req.method === "OPTIONS") return new Response(null, { status: 403, headers: head });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "phase1" },
  });
  const ip = await callerIp(req, db);

  if (req.method === "GET" && (path === "/v1/status" || path === "/v1")) {
    const { data } = await db.from("site_settings").select("value").eq("key", "api").maybeSingle();
    return reply(200, { status: data?.value?.enabled ? "open" : "closed", time: new Date().toISOString() });
  }

  const raw = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || (req.headers.get("x-api-key") ?? "").trim();
  if (!raw) return fail("missing_key");
  // A malformed key still counts as a wrong key for the IP limit.
  const auth = await db.rpc("api_auth2", { p_hash: /^dy_(live|test)_[0-9a-f]{40,64}$/.test(raw) ? await sha256Hex(raw) : "x", p_ip: ip, p_request: requestId });
  if (auth.error) return fail("server_error");
  const who = auth.data as Json;
  if (who?.error) {
    const code = String(who.error);
    if (who.client_id && who.key_id) await log(db, String(who.client_id), String(who.key_id), req.method, path, ERRORS[code]?.[0] ?? 400, Date.now() - started, ip, requestId);
    return fail(code, undefined, code === "ip_not_allowed" && ip ? { your_ip: ip } : {});
  }
  const client = String(who.client_id);
  const key = String(who.key_id);
  const mode = String(who.mode);
  head["X-RateLimit-Limit"] = String(LIMIT);
  head["X-RateLimit-Remaining"] = String(who.remaining ?? "");
  if (mode === "test") head["X-DataYego-Mode"] = "test";

  let res: Response;
  try {
    res = await route(db, req, path, url, client, mode, reply, fail);
  } catch {
    res = fail("server_error");
  }
  await log(db, client, key, req.method, path, res.status, Date.now() - started, ip, requestId);
  return res;
});

type Reply = (status: number, body: unknown, extra?: Record<string, string>) => Response;
type Fail = (code: string, message?: string, extra?: Json) => Response;

// deno-lint-ignore no-explicit-any
async function route(db: any, req: Request, path: string, url: URL, client: string, mode: string, reply: Reply, fail: Fail): Promise<Response> {
  const test = mode === "test";

  if (path === "/v1/balance") {
    if (req.method !== "GET") return fail("method_not_allowed");
    if (test) return reply(200, { balance: 1000, currency: "GHS", test: true });
    const r = await db.rpc("api_balance", { p_client: client });
    if (r.error) return fail("server_error");
    return reply(200, r.data);
  }

  if (path === "/v1/bundles") {
    if (req.method !== "GET") return fail("method_not_allowed");
    const r = await db.rpc("api_bundles", { p_client: client });
    if (r.error) return fail("server_error");
    return reply(200, { bundles: r.data ?? [] });
  }

  if (path === "/v1/orders" && req.method === "POST") {
    const len = Number(req.headers.get("content-length") ?? "0");
    if (len > MAX_BODY) return fail("body_too_large");
    let text: string;
    try { text = await req.text(); } catch { return fail("bad_json"); }
    if (text.length > MAX_BODY) return fail("body_too_large");
    let body: Json;
    try { body = JSON.parse(text); } catch { return fail("bad_json"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("bad_json");
    const bundle = typeof body.bundle === "string" ? body.bundle.trim().slice(0, 80) : "";
    const phone = typeof body.phone === "string" || typeof body.phone === "number" ? String(body.phone).trim().slice(0, 30) : "";
    const header = (req.headers.get("idempotency-key") ?? "").trim();
    const reference = typeof body.reference === "string" && body.reference.trim() ? body.reference.trim() : header || null;
    if (!bundle || !phone) return fail("missing_fields");
    const r = await db.rpc("api_place_order", { p_client: client, p_mode: mode, p_bundle: bundle, p_phone: phone, p_reference: reference });
    if (r.error) return fail("server_error");
    const out = r.data as Json;
    if (out?.error) {
      const extra: Json = {};
      if (out.balance != null) extra.balance = out.balance;
      return fail(String(out.error), typeof out.message === "string" ? out.message : undefined, extra);
    }
    const payload: Json = { order: out.order };
    if (out.balance != null) payload.balance = out.balance;
    if (out.existing) payload.existing = true;
    return reply(out.existing ? 200 : 201, payload);
  }

  if (path === "/v1/orders") {
    if (req.method !== "GET") return fail("method_not_allowed");
    const limit = Math.min(100, Math.max(1, Math.floor(Number(url.searchParams.get("limit") ?? 50)) || 50));
    const status = url.searchParams.get("status");
    if (status && !STATUSES.includes(status)) return fail("bad_status");
    const beforeText = url.searchParams.get("before");
    let before: string | null = null;
    if (beforeText) {
      const d = new Date(beforeText);
      if (Number.isNaN(d.getTime())) return fail("bad_before");
      before = d.toISOString();
    }
    const r = await db.rpc("api_list_orders2", { p_client: client, p_mode: mode, p_limit: limit, p_before: before, p_status: status });
    if (r.error) return fail("server_error");
    return reply(200, r.data ?? { orders: [], has_more: false, next_before: null });
  }

  const one = path.match(/^\/v1\/orders\/([^/]+)$/);
  if (one) {
    if (req.method !== "GET") return fail("method_not_allowed");
    let ref: string;
    try { ref = decodeURIComponent(one[1]); } catch { return fail("order_not_found"); }
    if (!/^[A-Za-z0-9._:-]{1,64}$/.test(ref)) return fail("order_not_found");
    const r = await db.rpc("api_get_order", { p_client: client, p_mode: mode, p_reference: ref });
    if (r.error) return fail("server_error");
    if (!r.data) return fail("order_not_found");
    return reply(200, { order: r.data });
  }

  return fail("not_found");
}

// deno-lint-ignore no-explicit-any
async function callerIp(req: Request, db: any): Promise<string> {
  const claimed = (req.headers.get("x-dy-client-ip") ?? "").trim();
  const proof = req.headers.get("x-dy-proxy-secret") ?? "";
  if (claimed && proof) {
    if (!proxySecret || Date.now() - proxySecret.at > 300_000) {
      const { data } = await db.from("internal_secrets").select("value").eq("key", "api_proxy").maybeSingle();
      proxySecret = { value: data?.value ?? "", at: Date.now() };
    }
    if (proxySecret.value && proof.length === proxySecret.value.length && safeEqual(proof, proxySecret.value) && /^[0-9a-fA-F:.]{3,45}$/.test(claimed)) return claimed;
  }
  return (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim().slice(0, 45);
}

// deno-lint-ignore no-explicit-any
async function log(db: any, client: string, key: string, method: string, path: string, status: number, ms: number, ip: string, requestId: string) {
  try { await db.rpc("api_log2", { p_client: client, p_key: key, p_method: method, p_path: path, p_status: status, p_ms: ms, p_ip: ip, p_request: requestId }); } catch { /* never holds up the answer */ }
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
