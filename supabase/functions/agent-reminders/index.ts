import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { sendEmail } from "../_shared/email.ts";

/* Daily at 08:00: email agents whose plan ends in 3 days, on the day, and on the last grace day. */
const site = () => (Deno.env.get("SITE_URL") ?? "https://datayego.com").replace(/\/$/, "");
const wrap = (title: string, body: string) => `<!doctype html><html><body style="margin:0;background:#f2f7f4;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101e1c;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:18px;overflow:hidden;"><tr><td style="background:#0b1512;padding:18px 28px;color:#7cf0b4;font-size:20px;font-weight:700;">DataYego</td></tr><tr><td style="padding:28px;font-size:14px;line-height:1.6;color:#3c4a46;"><h1 style="margin:0 0 14px;font-size:20px;color:#101e1c;">${title}</h1>${body}<a href="${site()}/agent" style="display:block;margin:22px 0 6px;background:#22c387;color:#04120c;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:12px;">Renew now</a></td></tr></table></td></tr></table></body></html>`;

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const supabase = createSupabaseAdmin();
    const denied = await requireCronSecret(req, supabase); if (denied) return denied;
    const { data: due } = await supabase.rpc("agents_due_for_reminder");
    const results: unknown[] = [];
    for (const a of (due ?? []) as Array<{ agent_id: string; user_id: string; store_name: string; paid_until: string; kind: string }>) {
      const { data: profile } = await supabase.from("profiles").select("email, full_name").eq("id", a.user_id).maybeSingle();
      if (!profile?.email) { results.push({ agent: a.agent_id, skipped: "no_email" }); continue; }
      const { data: quote } = await supabase.rpc("agent_plan_quote");
      const price = Number(quote?.pay_now ?? 0).toFixed(2);
      const when = new Date(a.paid_until).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
      const html = a.kind === "grace"
        ? wrap("Your store closes tonight", `<p>Hi ${profile.full_name ?? ""},</p><p>Your DataYego agent plan for <b>${a.store_name}</b> ended on <b>${when}</b>. Tonight your store stops taking orders and agent prices are locked. Your balance, orders and settings stay exactly as they are — renew any time and everything reopens instantly.</p><p>From <b>GH₵ ${price}</b> a month.</p>`)
        : a.kind === "3d"
        ? wrap("Your agent month ends in 3 days", `<p>Hi ${profile.full_name ?? ""},</p><p>Your DataYego agent plan for <b>${a.store_name}</b> runs until <b>${when}</b>. Renew before then and your store stays open without a break.</p><p>This month's fee: <b>GH₵ ${price}</b>.</p>`)
        : wrap("Your agent month ends today", `<p>Hi ${profile.full_name ?? ""},</p><p>Today is the last day of your DataYego agent plan for <b>${a.store_name}</b>. You have until tomorrow night to renew; after that your store stops taking orders until you do. Nothing is lost — it reopens the moment you pay.</p><p>Fee: <b>GH₵ ${price}</b>.</p>`);
      const r = await sendEmail({ to: profile.email, subject: a.kind === "grace" ? "Your DataYego store closes tonight" : a.kind === "3d" ? "Your DataYego agent plan ends in 3 days" : "Your DataYego agent plan ends today", replyTo: "support@yiego.shop", html });
      if (!r.skipped && r.ok) await supabase.rpc("agents_mark_reminded", { p_agent: a.agent_id, p_kind: a.kind });
      results.push({ agent: a.agent_id, kind: a.kind, sent: !r.skipped && r.ok });
    }
    return jsonResponse({ reminded: results.length, results });
  } catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 }); }
});
