import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sendEmail } from "../_shared/email.ts";

/* Emails an announcement to its audience (agents, customers or everyone).
   Admin only. Visitors have no address, so that audience is refused. */
const site = () => (Deno.env.get("SITE_URL") ?? "https://datayego.com").replace(/\/$/, "");
const wrap = (title: string, body: string, link?: { url: string; label: string } | null) => `<!doctype html><html><body style="margin:0;background:#f2f7f4;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101e1c;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:18px;overflow:hidden;"><tr><td style="background:#0b1512;padding:18px 28px;color:#7cf0b4;font-size:20px;font-weight:700;">DataYego</td></tr><tr><td style="padding:28px;font-size:14px;line-height:1.6;color:#3c4a46;"><h1 style="margin:0 0 14px;font-size:20px;color:#101e1c;">${title}</h1><p style="white-space:pre-line;margin:0;">${body}</p>${link ? `<a href="${link.url}" style="display:block;margin:22px 0 6px;background:#22c387;color:#04120c;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:12px;">${link.label}</a>` : ""}<p style="margin:18px 0 0;font-size:11px;color:#8a968f;">You're receiving this because you use DataYego. <a href="${site()}" style="color:#8a968f;">datayego.com</a></p></td></tr></table></td></tr></table></body></html>`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Admin sessions must have passed two-factor (aal2). The database applies the same rule.
const sessionHasMfa = (token: string) => { try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))?.aal === "aal2"; } catch { return false; } };

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "Authentication required" }, { status: 401 });
    const supabase = createSupabaseAdmin();
    const { data: auth } = await supabase.auth.getUser(token);
    if (!auth?.user) return jsonResponse({ error: "Invalid session" }, { status: 401 });
    const { data: adm } = await supabase.from("admin_users").select("user_id").eq("user_id", auth.user.id).eq("is_active", true).maybeSingle();
    if (!adm) return jsonResponse({ error: "Admin only" }, { status: 403 });
    if (!sessionHasMfa(token)) return jsonResponse({ error: "Two-factor verification required. Sign in to the admin panel again." }, { status: 403 });
    const { announcementId } = await req.json();
    const { data: a } = await supabase.from("announcements").select("*").eq("id", announcementId).maybeSingle();
    if (!a) return jsonResponse({ error: "Announcement not found" }, { status: 404 });
    let emails: string[] = [];
    if (a.audience === "agents") {
      const { data } = await supabase.from("agents").select("user_id").in("status", ["active", "lapsed", "paused", "awaiting_payment"]);
      const ids = (data ?? []).map((r: { user_id: string }) => r.user_id);
      if (ids.length) { const { data: p } = await supabase.from("profiles").select("email").in("id", ids); emails = (p ?? []).map((r: { email: string }) => r.email).filter(Boolean); }
    } else if (a.audience === "customers" || a.audience === "everyone") {
      const { data: p } = await supabase.from("profiles").select("email").not("email", "is", null).limit(5000);
      emails = (p ?? []).map((r: { email: string }) => r.email).filter(Boolean);
      if (a.audience === "customers") { const { data: ag } = await supabase.from("agents").select("user_id"); const { data: agp } = await supabase.from("profiles").select("email").in("id", (ag ?? []).map((r: { user_id: string }) => r.user_id)); const agentEmails = new Set((agp ?? []).map((r: { email: string }) => r.email)); emails = emails.filter((e) => !agentEmails.has(e)); }
    } else return jsonResponse({ error: "Visitors have no email address to send to." }, { status: 400 });
    const html = wrap(esc(a.title), esc(a.body), a.link_url ? { url: a.link_url, label: a.link_label ?? "Open" } : null);
    let sent = 0;
    for (const to of [...new Set(emails)]) { const r = await sendEmail({ to, subject: a.title, html, replyTo: "support@yiego.shop" }); if (!r.skipped && r.ok) sent += 1; }
    await supabase.from("announcements").update({ emailed_at: new Date().toISOString() }).eq("id", a.id);
    return jsonResponse({ status: "success", sent, total: emails.length });
  } catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 }); }
});
