import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sendEmail } from "../_shared/email.ts";

/* Emails the newest maintenance on/off notice to every DataYego user (sub-agents excluded:
   their customers know them by their own store). Master admin + two-factor only.
   Each call queues recipients once (unique per notice + address) and sends one small batch;
   the admin page keeps calling until nothing is pending. Resend idempotency keys stop repeats. */
const BATCH = 25;
const site = () => (Deno.env.get("SITE_URL") ?? "https://datayego.com").replace(/\/$/, "");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sessionHasMfa = (token: string) => { try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))?.aal === "aal2"; } catch { return false; } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const html = (title: string, body: string, restored: boolean) => `<!doctype html><html><body style="margin:0;background:#ffffff;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101e1c;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:480px;background:#fff;border:1px solid #e6e2d6;border-radius:18px;overflow:hidden;"><tr><td style="background:#16140f;padding:18px 28px;color:#e8b64c;font-size:20px;font-weight:700;">DataYego</td></tr><tr><td style="padding:28px;font-size:14px;line-height:1.6;color:#3c4a46;"><h1 style="margin:0 0 14px;font-size:20px;color:#101e1c;">${esc(title)}</h1><p style="white-space:pre-line;margin:0;">${esc(body)}</p>${restored ? `<a href="${site()}" style="display:block;margin:22px 0 6px;background:#e8b64c;color:#16140f;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:12px;">Buy data now</a>` : `<a href="${site()}/track" style="display:block;margin:22px 0 6px;background:#16140f;color:#e8b64c;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:12px;">Track an order</a>`}<p style="margin:18px 0 0;font-size:11px;color:#8a968f;">You're receiving this service notice because you have a DataYego account. <a href="${site()}" style="color:#8a968f;">datayego.com</a></p></td></tr></table></td></tr></table></body></html>`;

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "Authentication required" }, { status: 401 });
    const db = createSupabaseAdmin();
    const { data: auth } = await db.auth.getUser(token);
    if (!auth?.user) return jsonResponse({ error: "Invalid session" }, { status: 401 });
    if (!sessionHasMfa(token)) return jsonResponse({ error: "Two-factor verification required. Sign in to the admin panel again." }, { status: 403 });
    const { data: role } = await db.rpc("admin_role", { p_user: auth.user.id });
    if (role !== "master") return jsonResponse({ error: "Only the master administrator can send maintenance emails." }, { status: 403 });

    const input = await req.json().catch(() => ({}));
    const announcementId = typeof input?.announcementId === "string" ? input.announcementId.slice(0, 120) : "";
    if (!announcementId.startsWith("maintenance:")) return jsonResponse({ error: "Invalid notice" }, { status: 400 });

    // Content comes only from the saved settings, and only the newest notice can be emailed.
    const { data: setting } = await db.from("site_settings").select("value").eq("key", "agent_plan").single();
    const list = Array.isArray(setting?.value?.maintenance_announcements) ? setting.value.maintenance_announcements : [];
    const notice = list[0];
    if (!notice || notice.id !== announcementId) return jsonResponse({ error: "Only the latest maintenance notice can be emailed." }, { status: 409 });
    const restored = notice.kind === "notice";

    const { count: queued } = await db.from("maintenance_email_outbox").select("id", { count: "exact", head: true }).eq("announcement_id", announcementId);
    if (!queued) {
      const { data: subs } = await db.from("agents").select("user_id").not("parent_agent_id", "is", null);
      const subIds = new Set((subs ?? []).map((r: { user_id: string }) => r.user_id));
      const { data: people, error } = await db.from("profiles").select("id,email").not("email", "is", null).limit(20000);
      if (error) throw new Error("Could not load recipients");
      const emails = [...new Set((people ?? []).filter((p: { id: string }) => !subIds.has(p.id)).map((p: { email: string }) => String(p.email).trim().toLowerCase()).filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
      for (let i = 0; i < emails.length; i += 500) {
        const rows = emails.slice(i, i + 500).map((email) => ({ announcement_id: announcementId, email }));
        const { error: insErr } = await db.from("maintenance_email_outbox").upsert(rows, { onConflict: "announcement_id,email", ignoreDuplicates: true });
        if (insErr) throw new Error("Could not queue recipients");
      }
    }

    // Reclaim sends interrupted more than 5 minutes ago; the idempotency key prevents a second copy.
    await db.from("maintenance_email_outbox").update({ status: "pending" }).eq("announcement_id", announcementId).eq("status", "sending").lt("claimed_at", new Date(Date.now() - 5 * 60_000).toISOString());
    const { data: candidates } = await db.from("maintenance_email_outbox").select("id").eq("announcement_id", announcementId).eq("status", "pending").order("id").limit(BATCH);
    const ids = (candidates ?? []).map((r: { id: number }) => r.id);
    const { data: claimed } = ids.length
      ? await db.from("maintenance_email_outbox").update({ status: "sending", claimed_at: new Date().toISOString() }).in("id", ids).eq("status", "pending").select("id,email,attempts")
      : { data: [] };

    let rateLimited = false;
    for (const row of claimed ?? []) {
      if (rateLimited) { await db.from("maintenance_email_outbox").update({ status: "pending" }).eq("id", row.id); continue; }
      const r = await sendEmail({ to: row.email, subject: notice.title, html: html(notice.title, notice.body, restored), replyTo: "support@yiego.shop", idempotencyKey: `${announcementId}:${row.email}` });
      const attempts = row.attempts + 1;
      if (r.skipped) { await db.from("maintenance_email_outbox").update({ status: "pending" }).eq("id", row.id); throw new Error("Email service is not configured"); }
      if (r.ok) await db.from("maintenance_email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), attempts, last_error: null }).eq("id", row.id);
      else {
        if (r.status === 429) rateLimited = true;
        const giveUp = r.status !== 429 && (attempts >= 3 || (r.status >= 400 && r.status < 500));
        await db.from("maintenance_email_outbox").update({ status: giveUp ? "failed" : "pending", attempts, last_error: `${r.status}: ${JSON.stringify(r.payload)?.slice(0, 300)}` }).eq("id", row.id);
      }
      await sleep(rateLimited ? 0 : 600); // Resend default limit: 2 requests per second
    }

    const counts: Record<string, number> = {};
    for (const s of ["pending", "sending", "sent", "failed"]) {
      const { count } = await db.from("maintenance_email_outbox").select("id", { count: "exact", head: true }).eq("announcement_id", announcementId).eq("status", s);
      counts[s] = count ?? 0;
    }
    return jsonResponse({ announcementId, ...counts, total: counts.pending + counts.sending + counts.sent + counts.failed, rateLimited });
  } catch (e) {
    console.error("maintenance-email failed:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Could not send maintenance emails" }, { status: 500 });
  }
});
