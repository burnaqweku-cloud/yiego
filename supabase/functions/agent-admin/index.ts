import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sendEmail } from "../_shared/email.ts";

/* Agent admin actions that need email: approve / decline an application. */
const site = () => (Deno.env.get("SITE_URL") ?? "https://datayego.com").replace(/\/$/, "");
const wrap = (title: string, body: string) => `<!doctype html><html><body style="margin:0;background:#f2f7f4;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101e1c;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:18px;overflow:hidden;"><tr><td style="background:#0b1512;padding:18px 28px;color:#7cf0b4;font-size:20px;font-weight:700;">DataYego</td></tr><tr><td style="padding:28px;font-size:14px;line-height:1.6;color:#3c4a46;"><h1 style="margin:0 0 14px;font-size:20px;color:#101e1c;">${title}</h1>${body}</td></tr></table></td></tr></table></body></html>`;

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
    const body = await req.json();
    if (body.action === "review_application") {
      const { data, error } = await supabase.rpc("admin_review_application", { p_actor: auth.user.id, p_application_id: body.applicationId, p_approve: Boolean(body.approve), p_reason: body.reason ?? null });
      if (error) return jsonResponse({ error: error.message }, { status: 400 });
      const { data: profile } = await supabase.from("profiles").select("email").eq("id", data.user_id).maybeSingle();
      const to = profile?.email as string | undefined;
      if (to) {
        try {
          if (data.approved) {
            await sendEmail({ to, subject: "You're approved as a DataYego agent", replyTo: "support@yiego.shop", html: wrap("You're approved 🎉", `<p>Hi ${data.full_name},</p><p>Your DataYego agent application has been approved. Here's what happens next:</p><ol><li>Log in to DataYego with this email.</li><li>Choose your plan and pay the monthly fee — there's a launch discount running now.</li><li>Set up your store: name, prices, and share your link.</li></ol><p>Your store address will be <b>${site()}/s/${data.slug}</b> once you're set up.</p><a href="${site()}/agent" style="display:block;margin:22px 0 6px;background:#22c387;color:#04120c;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:12px;">Get started</a>`) });
          } else {
            await sendEmail({ to, subject: "About your DataYego agent application", replyTo: "support@yiego.shop", html: wrap("Your application", `<p>Hi ${data.full_name},</p><p>Thanks for applying to be a DataYego agent. We're not able to approve your application right now.</p>${data.reason ? `<p><b>Reason:</b> ${String(data.reason)}</p>` : ""}<p>You're welcome to apply again later, and you can keep buying data on DataYego as usual.</p>`) });
          }
        } catch { /* email is best-effort */ }
      }
      return jsonResponse({ status: "success", data });
    }
    if (body.action === "resend_approval") {
      const { data: g } = await supabase.from("agents").select("id, slug, user_id, application_id").eq("application_id", body.applicationId).maybeSingle();
      if (!g) return jsonResponse({ error: "Not an approved application" }, { status: 404 });
      const { data: app } = await supabase.from("agent_applications").select("full_name").eq("id", body.applicationId).maybeSingle();
      const { data: profile } = await supabase.from("profiles").select("email").eq("id", g.user_id).maybeSingle();
      if (!profile?.email) return jsonResponse({ error: "No email on this account" }, { status: 409 });
      const r = await sendEmail({ to: profile.email, subject: "You're approved as a DataYego agent", replyTo: "support@yiego.shop", html: wrap("You're approved 🎉", `<p>Hi ${app?.full_name ?? ""},</p><p>Your DataYego agent application has been approved. Here's what happens next:</p><ol><li>Log in to DataYego with this email.</li><li>Choose your plan and pay the monthly fee — there's a launch discount running now.</li><li>Set up your store: name, prices, and share your link.</li></ol><p>Your store address will be <b>${site()}/s/${g.slug}</b> once you're set up.</p><a href="${site()}/agent" style="display:block;margin:22px 0 6px;background:#22c387;color:#04120c;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:12px;">Get started</a>`) });
      return jsonResponse({ status: "success", to: profile.email, resend: r });
    }
    if (body.action === "test_email") {
      const { data: adm } = await supabase.from("admin_users").select("user_id").eq("user_id", auth.user.id).eq("is_active", true).maybeSingle();
      if (!adm) return jsonResponse({ error: "Admin only" }, { status: 403 });
      const r = await sendEmail({ to: auth.user.email ?? "", subject: "DataYego email test", html: wrap("Email works", "<p>If you're reading this, sending is fine.</p>") });
      return jsonResponse({ status: "success", resend: r, hasKey: Boolean(Deno.env.get("RESEND_API_KEY")), from: Deno.env.get("EMAIL_FROM") ?? "DataYego <noreply@yiego.shop>" });
    }
    return jsonResponse({ error: "Unsupported action" }, { status: 400 });
  } catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 }); }
});
