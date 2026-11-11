import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { fcmAccess, fcmConfigured, fcmSend } from "../_shared/fcm.ts";
import { createVapidKeys, webPushSend, type VapidKeys } from "../_shared/webpush.ts";

/* Sends the phone notifications waiting in phase1.push_outbox (payment received, data delivered,
   refunds, announcements, tests). Run by the database the moment one is queued and by a one-minute
   job as a safety net. Internal secret only.
   The database decides what is queued and who receives it (push_claim / push_recipients); this
   function only delivers and reports back (push_finish), so nothing is ever sent twice. */

interface Job { id: number; kind: string; title: string; body: string; url: string }
interface Recipient { device: string; channel: string; token: string }

/** Our Web Push (iPhone) key pair. Made here the first time, kept in internal_secrets; the public half
    is published in site_settings for phones to subscribe with. */
// deno-lint-ignore no-explicit-any
async function vapidKeys(db: any): Promise<VapidKeys | null> {
  try {
    let { data } = await db.from("internal_secrets").select("value").eq("key", "vapid").maybeSingle();
    if (!data?.value) {
      await db.from("internal_secrets").upsert({ key: "vapid", value: JSON.stringify(await createVapidKeys()) }, { onConflict: "key", ignoreDuplicates: true });
      ({ data } = await db.from("internal_secrets").select("value").eq("key", "vapid").maybeSingle());
      if (!data?.value) return null;
    }
    const keys = JSON.parse(data.value) as VapidKeys;
    const published = await db.from("site_settings").select("value").eq("key", "push_webpush").maybeSingle();
    if (published.data?.value?.public_key !== keys.publicKey) await db.from("site_settings").upsert({ key: "push_webpush", value: { public_key: keys.publicKey } }, { onConflict: "key" });
    return keys;
  } catch { return null; }
}

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const db = createSupabaseAdmin();
    const denied = await requireCronSecret(req, db); if (denied) return denied;
    if (!fcmConfigured()) return jsonResponse({ error: "FIREBASE_SERVICE_ACCOUNT is not set" }, { status: 503 });

    const vapid = await vapidKeys(db);

    const claimed = await db.rpc("push_claim", { p_limit: 25 });
    if (claimed.error) return jsonResponse({ error: claimed.error.message }, { status: 500 });
    const jobs = (claimed.data ?? []) as Job[];
    if (jobs.length === 0) return jsonResponse({ jobs: 0 });

    let access: { token: string; projectId: string };
    try { access = await fcmAccess(); }
    catch (error) {
      // Could not sign in to Google: hand every job back so the next run tries again.
      const reason = error instanceof Error ? error.message : "Google sign-in failed";
      for (const job of jobs) await db.rpc("push_finish", { p_id: job.id, p_recipients: 0, p_delivered: 0, p_dead: [], p_error: reason, p_retry: true });
      return jsonResponse({ error: reason }, { status: 502 });
    }

    const summary: { id: number; kind: string; recipients: number; delivered: number }[] = [];
    for (const job of jobs) {
      const found = await db.rpc("push_recipients", { p_id: job.id });
      const recipients = ((found.data ?? []) as Recipient[]).filter((r) => r.channel === "fcm" || (r.channel === "webpush" && vapid));
      let delivered = 0; const dead: string[] = []; let lastError: string | null = found.error?.message ?? null;
      // Twenty at a time keeps a large announcement quick without flooding Google.
      for (let i = 0; i < recipients.length; i += 20) {
        const results = await Promise.all(recipients.slice(i, i + 20).map((r) => {
          const message = { title: job.title, body: job.body, url: job.url, tag: `${job.kind}:${job.id}` };
          return (r.channel === "webpush" ? webPushSend(vapid!, r.token, message) : fcmSend(access, r.token, message)).then((result) => ({ r, result }));
        }));
        for (const { r, result } of results) {
          if (result.ok) delivered += 1;
          else { lastError = result.error; if (result.dead) dead.push(r.device); }
        }
      }
      await db.rpc("push_finish", { p_id: job.id, p_recipients: recipients.length, p_delivered: delivered, p_dead: dead, p_error: delivered === recipients.length ? null : lastError, p_retry: false });
      summary.push({ id: job.id, kind: job.kind, recipients: recipients.length, delivered });
    }
    return jsonResponse({ jobs: jobs.length, summary });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
