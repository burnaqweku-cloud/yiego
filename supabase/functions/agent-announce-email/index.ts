import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { sendEmail } from "../_shared/email.ts";

/* Emails one saved agents-only announcement to every DataYego agent (sub-agents excluded: they only know their
   parent's store). Internal secret only, so the owner's assistant can send a notice without the admin panel.
   Same layout as announce-email. Idempotency key per announcement + address: calling it again never sends twice.
   Body: { announcementId } */
const site = () => (Deno.env.get("SITE_URL") ?? "https://datayego.com").replace(/\/$/, "");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const wrap = (title: string, body: string) => `<!doctype html><html><body style="margin:0;background:#f2f7f4;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101e1c;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:18px;overflow:hidden;"><tr><td style="background:#0b1512;padding:18px 28px;color:#7cf0b4;font-size:20px;font-weight:700;">DataYego</td></tr><tr><td style="padding:28px;font-size:14px;line-height:1.6;color:#3c4a46;"><h1 style="margin:0 0 14px;font-size:20px;color:#101e1c;">${title}</h1><p style="white-space:pre-line;margin:0;">${body}</p><p style="margin:18px 0 0;font-size:11px;color:#8a968f;">You're receiving this because you're a DataYego agent. <a href="${site()}" style="color:#8a968f;">datayego.com</a></p></td></tr></table></td></tr></table></body></html>`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const db = createSupabaseAdmin();
    const denied = await requireCronSecret(req, db); if (denied) return denied;
    const { announcementId } = await req.json().catch(() => ({}));
    const { data: a } = await db.from("announcements").select("id, title, body, audience").eq("id", String(announcementId ?? "")).maybeSingle();
    if (!a) return jsonResponse({ error: "Announcement not found" }, { status: 404 });
    if (a.audience !== "agents") return jsonResponse({ error: "Only agents announcements" }, { status: 400 });
    // Every main agent who has ever paid for a plan (active or lapsed: a lapsed agent can still have earnings to
    // withdraw). Not sub-agents, and not approved applicants who never paid.
    const { data: agents } = await db.from("agents").select("user_id").is("parent_agent_id", null).not("paid_until", "is", null);
    const ids = (agents ?? []).map((r: { user_id: string }) => r.user_id);
    const { data: people } = ids.length ? await db.from("profiles").select("email").in("id", ids) : { data: [] };
    const emails = [...new Set((people ?? []).map((p: { email: string | null }) => String(p.email ?? "").trim().toLowerCase()).filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
    const html = wrap(esc(a.title), esc(a.body));
    let sent = 0; const failed: string[] = [];
    for (const to of emails) {
      const r = await sendEmail({ to, subject: a.title, html, replyTo: "support@yiego.shop", idempotencyKey: `agent-announce:${a.id}:${to}` });
      if (!r.skipped && r.ok) sent += 1; else failed.push(to);
      await sleep(600); // Resend: 2 requests per second
    }
    await db.from("announcements").update({ emailed_at: new Date().toISOString() }).eq("id", a.id);
    return jsonResponse({ recipients: emails.length, sent, failed: failed.length });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
