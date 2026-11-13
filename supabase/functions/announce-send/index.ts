import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { announcementEmail, linkOf } from "./email.ts";

/* Emails one saved announcement to DataYego account holders, a small batch per call.
   Internal secret only: the database starts it and keeps it going (announcement_email_continue), so the owner's
   assistant can send a notice without the admin panel. The database decides who gets it (announcement_email_queue):
   never sub-agents (they only know their parent's store), never an address that has unsubscribed, and with
   skipAgents never paid agents (they get their own agents notice).
   One row per announcement + address, and a Resend idempotency key per row: a repeated call never sends twice.
   Self-contained on purpose, like service-pay (email.ts beside it is only the layout of the email).
   Body: { announcementId, skipAgents? } */

const BATCH = 60; // about 50 seconds at Resend's two requests a second
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-yiego-internal-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: "phase1" } });
    const given = req.headers.get("x-yiego-internal-secret") ?? "";
    const { data: secret } = await db.from("internal_secrets").select("value").eq("key", "cron").maybeSingle();
    if (!secret?.value || given !== secret.value) return json({ error: "Forbidden" }, 403);
    const input = await req.json().catch(() => ({})) as { announcementId?: unknown; skipAgents?: unknown };
    const skipAgents = input.skipAgents === true;
    const { data: a } = await db.from("announcements").select("id, title, body, audience, link_url, link_label, is_active").eq("id", String(input.announcementId ?? "")).maybeSingle();
    if (!a) return json({ error: "Announcement not found" }, 404);
    if (!a.is_active || !["customers", "everyone"].includes(a.audience)) return json({ error: "Only an active announcement for customers or everyone" }, 400);
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ error: "Email is not configured" }, 500);

    // Recipients are listed once; a second call only carries on where the first stopped.
    const { error: queueError } = await db.rpc("announcement_email_queue", { p_id: a.id, p_skip_agents: skipAgents });
    if (queueError) return json({ error: queueError.message }, 500);
    const { data: batch, error: claimError } = await db.rpc("announcement_email_claim", { p_id: a.id, p_limit: BATCH });
    if (claimError) return json({ error: claimError.message }, 500);

    const page = announcementEmail(a.title, a.body, linkOf(a.link_url, a.link_label));
    const from = Deno.env.get("EMAIL_FROM") ?? "DataYego <noreply@datayego.com>";
    let sent = 0, failed = 0;
    for (const row of (batch ?? []) as { id: number; email: string }[]) {
      let ok = false; let why: string | null = null;
      try {
        const res = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `announce:${a.id}:${row.email}`.slice(0, 256) },
          body: JSON.stringify({ from, to: [row.email], reply_to: "support@yiego.shop", subject: a.title, html: page }) });
        ok = res.ok;
        if (!ok) why = `${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`;
      } catch (e) { why = e instanceof Error ? e.message : String(e); }
      await db.rpc("announcement_email_done", { p_row: row.id, p_ok: ok, p_error: why });
      if (ok) sent += 1; else failed += 1;
      await sleep(550);
    }
    // More waiting? The database calls this function again; when none are left it marks the announcement as emailed.
    const { data: left } = await db.rpc("announcement_email_continue", { p_id: a.id, p_skip_agents: skipAgents });
    return json({ sent, failed, left: Number(left ?? 0) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
