// DataYego reseller API, v1 (owner, 21 Nov 2026). Self-contained: no shared imports, so it can be deployed alone.
//
// Sellers call it with their secret key:  Authorization: Bearer dy_live_…   (or X-API-Key: dy_live_…)
//   GET  /v1/balance            their wallet balance
//   GET  /v1/bundles            what they can buy, at their price, and whether it is available now
//   POST /v1/orders             { bundle, phone, reference? }  pay from the wallet, queue the order
//   GET  /v1/orders             their latest orders (?limit=1..100)
//   GET  /v1/orders/{reference} one order, by our reference or theirs
// The database decides everything (phase1.api_* functions, migration 20261121110000_reseller_api.sql); this
// function only checks the key, passes the call on and writes one log line per request. Keys are compared as
// SHA-256 hashes; the plain key is never stored. Test keys (dy_test_…) never charge or send anything.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Json = Record<string, unknown>;

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

/** Errors always look the same: { error: { code, message } }. */
const ERRORS: Record<string, [number, string]> = {
  missing_key: [401, "Send your API key as: Authorization: Bearer <key>."],
  invalid_key: [401, "This API key is not valid. Check it, or make a new one from your DataYego dashboard."],
  account_not_active: [403, "Your API account is not active. Contact DataYego support."],
  api_closed: [503, "The API is closed for maintenance. Try again shortly."],
  rate_limited: [429, "Too many requests. You can make up to 120 a minute."],
  not_found: [404, "Nothing here. See the documentation for the list of endpoints."],
  order_not_found: [404, "No order with that reference."],
  bad_json: [400, "The request body must be JSON."],
  missing_fields: [400, "Send bundle and phone."],
  invalid_phone: [400, "phone must be a 10-digit Ghana number, e.g. 0241234567."],
  wrong_network: [400, "This number is on a different network from the bundle."],
  unknown_bundle: [400, "No bundle with that id. Get the list from GET /v1/bundles."],
  bundle_not_offered: [400, "This bundle is not on your price list."],
  bundle_unavailable: [409, "This bundle is not available right now. Try again later."],
  bad_reference: [400, "reference may only use letters, numbers and . _ : - (up to 64)."],
  insufficient_balance: [402, "Your balance is too low for this bundle. Top up and try again."],
  no_wallet: [400, "Your DataYego wallet is not set up. Sign in at datayego.com once, then try again."],
  server_error: [500, "Something went wrong on our side. Try again; if you sent a reference, the same reference never charges twice."],
};

function fail(code: string, message?: string, extra: Json = {}) {
  const [status, fallback] = ERRORS[code] ?? [400, "Request refused."];
  return reply(status, { error: { code, message: message ?? fallback, ...extra } });
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const started = Date.now();
  const url = new URL(req.url);
  // The platform passes /api/v1/…; also accept /v1/… (a custom domain can map straight onto it).
  const path = url.pathname.replace(/^\/api(?=\/|$)/, "").replace(/\/+$/, "") || "/";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "phase1" },
  });

  const raw = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || (req.headers.get("x-api-key") ?? "").trim();
  if (!raw) return fail("missing_key");
  if (!/^dy_(live|test)_[0-9a-f]{40,64}$/.test(raw)) return fail("invalid_key");

  const auth = await db.rpc("api_auth", { p_hash: await sha256Hex(raw) });
  if (auth.error) return fail("server_error");
  const who = auth.data as Json;
  if (who?.error) return fail(String(who.error));
  const client = String(who.client_id);
  const key = String(who.key_id);
  const mode = String(who.mode);

  let res: Response;
  try {
    res = await route(db, req, path, url, client, mode);
  } catch {
    res = fail("server_error");
  }
  // One line per request: rate limit and the seller's usage. Never holds up the answer on failure.
  try { await db.rpc("api_log", { p_client: client, p_key: key, p_method: req.method, p_path: path, p_status: res.status, p_ms: Date.now() - started, p_ip: ip }); } catch { /* ignore */ }
  return res;
});

// deno-lint-ignore no-explicit-any
async function route(db: any, req: Request, path: string, url: URL, client: string, mode: string): Promise<Response> {
  const test = mode === "test";

  if (req.method === "GET" && path === "/v1/balance") {
    if (test) return reply(200, { balance: 1000, currency: "GHS", test: true });
    const r = await db.rpc("api_balance", { p_client: client });
    if (r.error) return fail("server_error");
    return reply(200, r.data);
  }

  if (req.method === "GET" && path === "/v1/bundles") {
    const r = await db.rpc("api_bundles", { p_client: client });
    if (r.error) return fail("server_error");
    return reply(200, { bundles: r.data ?? [] });
  }

  if (req.method === "POST" && path === "/v1/orders") {
    let body: Json;
    try { body = await req.json(); } catch { return fail("bad_json"); }
    const bundle = typeof body?.bundle === "string" ? body.bundle.trim() : "";
    const phone = typeof body?.phone === "string" || typeof body?.phone === "number" ? String(body.phone).trim() : "";
    const reference = typeof body?.reference === "string" ? body.reference.trim() : null;
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

  if (req.method === "GET" && path === "/v1/orders") {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
    const r = await db.rpc("api_list_orders", { p_client: client, p_mode: mode, p_limit: limit });
    if (r.error) return fail("server_error");
    return reply(200, { orders: r.data ?? [] });
  }

  const one = path.match(/^\/v1\/orders\/([A-Za-z0-9._:-]{1,64})$/);
  if (req.method === "GET" && one) {
    const r = await db.rpc("api_get_order", { p_client: client, p_mode: mode, p_reference: one[1] });
    if (r.error) return fail("server_error");
    if (!r.data) return fail("order_not_found");
    return reply(200, { order: r.data });
  }

  return fail("not_found");
}
