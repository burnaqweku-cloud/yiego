import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { storeOrderEmail, storeSender, type StoreOrderRow } from "./email.ts";

/* Order emails for people who buy in an agent's store, in the store's own name (13 Nov 2026).
   The email the payment functions send carried the DataYego name to the agent's customers (the sender, and
   "payments secured by DataYego"). The database now queues these emails itself (trigger zz_store_order_email_trg on
   orders) and marks the order's email as sent, which is what makes the payment functions skip their own. This
   function sends what is queued, nothing else.
   Internal secret only. One row per order and kind, and a Resend idempotency key per row: never sent twice.
   Self-contained on purpose (email.ts beside it is only the layout).
   Body: {} sends what is waiting. { sampleFor: "<admin user id>", store?: "<slug>" } sends the two emails, with a
   made-up order, to that admin's own address so the owner can see them. */

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-yiego-internal-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(key: string, row: StoreOrderRow, idempotencyKey: string): Promise<{ ok: boolean; error?: string }> {
  const mail = storeOrderEmail(row);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.slice(0, 256) },
    body: JSON.stringify({ from: storeSender(row), to: [row.email], subject: mail.subject, html: mail.html, reply_to: "support@yiego.shop" }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: "phase1" } });
    const given = req.headers.get("x-yiego-internal-secret") ?? "";
    const { data: secret } = await db.from("internal_secrets").select("value").eq("key", "cron").maybeSingle();
    if (!secret?.value || given !== secret.value) return json({ error: "Forbidden" }, 403);
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ error: "Email is not configured" }, 500);
    const input = await req.json().catch(() => ({})) as { sampleFor?: unknown; store?: unknown };

    if (typeof input.sampleFor === "string") {
      const { data: sample, error } = await db.rpc("store_order_email_sample", { p_user: input.sampleFor, p_store: typeof input.store === "string" ? input.store : null });
      if (error || !sample) return json({ error: error?.message ?? "No sample" }, 400);
      const results: { ok: boolean; error?: string }[] = [];
      for (const kind of ["confirmed", "verifying"] as const) { results.push(await send(key, { ...(sample as StoreOrderRow), kind }, `store-order-sample:${Date.now()}:${kind}`)); await sleep(550); }
      return json({ status: "success", sample: results });
    }

    const { data: rows, error } = await db.rpc("store_order_email_claim", { p_limit: 20 });
    if (error) return json({ error: error.message }, 500);
    let sent = 0, failed = 0;
    for (const row of (rows ?? []) as StoreOrderRow[]) {
      const r = await send(key, row, `store-order:${row.id}:${row.kind}`);
      await db.rpc("store_order_email_done", { p_id: row.id, p_ok: r.ok, p_error: r.error ?? null });
      if (r.ok) sent += 1; else failed += 1;
      await sleep(550); // Resend allows two requests a second
    }
    return json({ status: "success", sent, failed });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
