// Sends the reseller API's webhooks (owner, 21 Nov 2026). Self-contained: no shared imports, so it deploys alone.
// Called only by the database (cron 'api-webhooks' every minute, and api_webhook_wake right after an event is queued),
// with the internal cron secret. It claims due events (phase1.api_webhook_claim, held for 2 minutes so two runs never
// send the same one), posts each to the seller's https address and records the answer (phase1.api_webhook_done, which
// schedules retries: 1 min, 5 min, 15 min, 1 h, 3 h, 6 h, 12 h, then gives up).
//
// What the seller gets:  POST <their url>
//   Content-Type: application/json
//   X-DataYego-Event: order.delivered
//   X-DataYego-Delivery: evt_123          (the same id on every retry of that event)
//   X-DataYego-Signature: t=1763700000,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with their whsec_ secret>
//   { "id": "evt_123", "type": "order.delivered", "created_at": "…", "test": false, "data": { "order": { … } } }
//
// Safety: only https on port 443, never an IP address, never a private, loopback or cloud-metadata address (checked
// again here by looking the name up), redirects are not followed, 10 seconds to answer, the answer's body is never read.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { eventBody, isPrivateIp, signatureHeader, urlProblem } from "./webhook.ts";

type Ev = { id: number; client_id: string; event: string; test: boolean; payload: unknown; created_at: string; attempts: number; url: string | null; secret: string | null };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false }, db: { schema: "phase1" },
  });
  const given = req.headers.get("x-yiego-internal-secret") ?? "";
  const { data: sec } = await db.from("internal_secrets").select("value").eq("key", "cron").maybeSingle();
  if (!sec?.value || given.length !== sec.value.length || !safeEqual(given, sec.value)) return json(403, { error: "Forbidden" });

  const started = Date.now();
  let sent = 0, failed = 0;
  while (Date.now() - started < 40_000) {
    const { data, error } = await db.rpc("api_webhook_claim", { p_limit: 25 });
    if (error) return json(500, { error: "claim_failed" });
    const batch = (data ?? []) as Ev[];
    if (!batch.length) break;
    // One seller's events go out one after another, in order; different sellers at the same time.
    const bySeller = new Map<string, Ev[]>();
    for (const e of batch) bySeller.set(e.client_id, [...(bySeller.get(e.client_id) ?? []), e]);
    await Promise.all([...bySeller.values()].map(async (list) => {
      for (const e of list) {
        const r = await deliver(e);
        await db.rpc("api_webhook_done", { p_id: e.id, p_ok: r.ok, p_status: r.status, p_error: r.error, p_final: r.final });
        if (r.ok) sent++; else failed++;
      }
    }));
  }
  return json(200, { sent, failed });
});

async function deliver(e: Ev): Promise<{ ok: boolean; status: number | null; error: string | null; final: boolean }> {
  if (!e.url || !e.secret) return { ok: false, status: null, error: "No webhook address", final: true };
  const problem = await addressProblem(e.url);
  if (problem) return { ok: false, status: null, error: problem, final: false };
  const body = eventBody(e);
  const signature = await signatureHeader(e.secret, Math.floor(Date.now() / 1000), body);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(e.url, {
      method: "POST", body, redirect: "manual", signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json", "User-Agent": "DataYego-Webhooks/1.0",
        "X-DataYego-Event": e.event, "X-DataYego-Delivery": `evt_${e.id}`, "X-DataYego-Signature": signature,
      },
    });
    try { await r.body?.cancel(); } catch { /* ignore */ }
    if (r.status >= 200 && r.status < 300) return { ok: true, status: r.status, error: null, final: false };
    const why = r.status >= 300 && r.status < 400 ? `Your server answered ${r.status} (a redirect; webhooks don't follow redirects, use the final address)` : `Your server answered ${r.status}`;
    return { ok: false, status: r.status, error: why, final: false };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    return { ok: false, status: null, error: aborted ? "No answer within 10 seconds" : "Could not connect to your server", final: false };
  } finally {
    clearTimeout(timer);
  }
}

// ── Address checks: the fixed rules, then the name looked up so it can't point inside a private network ────────
async function addressProblem(raw: string): Promise<string | null> {
  const fixed = urlProblem(raw);
  if (fixed) return fixed;
  const host = new URL(raw).hostname.toLowerCase().replace(/\.$/, "");
  const ips = await lookup(host);
  if (ips === null) return "Could not look up your server's name";
  if (!ips.length) return "Your server's name has no address";
  if (ips.some(isPrivateIp)) return "Your server's name points to a private address";
  return null;
}

async function lookup(host: string): Promise<string[] | null> {
  const out: string[] = [];
  // deno-lint-ignore no-explicit-any
  const resolve = (Deno as any).resolveDns as ((h: string, t: string) => Promise<string[]>) | undefined;
  if (resolve) {
    let worked = false;
    for (const type of ["A", "AAAA"]) {
      try { out.push(...await resolve(host, type)); worked = true; } catch (e) { if (e instanceof Deno.errors.NotFound) worked = true; }
    }
    if (worked) return out;
  }
  // Fallback: DNS over HTTPS.
  try {
    for (const type of ["A", "AAAA"]) {
      const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, { headers: { accept: "application/dns-json" } });
      if (!r.ok) return null;
      const j = await r.json() as { Answer?: { type: number; data: string }[] };
      for (const a of j.Answer ?? []) if (a.type === 1 || a.type === 28) out.push(a.data);
    }
    return out;
  } catch { return null; }
}

function safeEqual(a: string, b: string) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
