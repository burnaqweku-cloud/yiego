import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { sendEmail } from "../_shared/email.ts";

/* Agent emails. { kind: "sale", orderId } and { kind: "domain_paid", domainOrderId } (internal, cron secret);
   { kind: "announce", announcementId } (agent JWT): email the agent's own customers one announcement, once a day. */
const wrap = (title: string, body: string, cta?: { href: string; label: string }) => `<!doctype html><html><body style="margin:0;background:#f2f7f4;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101e1c;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:18px;overflow:hidden;"><tr><td style="padding:28px;font-size:14px;line-height:1.6;color:#3c4a46;"><h1 style="margin:0 0 14px;font-size:20px;color:#101e1c;">${title}</h1>${body}${cta ? `<a href="${cta.href}" style="display:block;margin:22px 0 6px;background:#22c387;color:#04120c;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:12px;">${cta.label}</a>` : ""}</td></tr></table></td></tr></table></body></html>`;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const supabase = createSupabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const site = (Deno.env.get("SITE_URL") ?? "https://datayego.com").replace(/\/$/, "");

    if (body.kind === "sale") {
      const denied = await requireCronSecret(req, supabase); if (denied) return denied;
      const { data: o } = await supabase.from("orders").select("order_reference, recipient_phone, amount, agent_margin, agent_id, data_products(name), networks(name), agents(store_name, user_id, sale_alert_email)").eq("id", String(body.orderId)).maybeSingle();
      if (!o?.agents || !o.agents.sale_alert_email) return jsonResponse({ skipped: "off" });
      const { data: user } = await supabase.auth.admin.getUserById(o.agents.user_id);
      if (!user?.user?.email) return jsonResponse({ skipped: "no_email" });
      const r = await sendEmail({ to: user.user.email, subject: `New order on ${o.agents.store_name}: ${o.networks?.name} ${String(o.data_products?.name ?? "").replace(/^.*?\u2014\s*/, "")}`,
        html: wrap("You made a sale", `<p>Someone just paid on <b>${esc(o.agents.store_name)}</b>.</p><p><b>${esc(o.networks?.name ?? "")} ${esc(String(o.data_products?.name ?? "").replace(/^.*?\u2014\s*/, ""))}</b> to ${esc(o.recipient_phone)}<br>Paid GH\u20b5 ${Number(o.amount).toFixed(2)} \u00b7 your profit GH\u20b5 ${Number(o.agent_margin ?? 0).toFixed(2)}<br>Order ${esc(o.order_reference)}</p><p>Delivery is automatic; you don't need to do anything.</p>`, { href: `${site}/agent/orders`, label: "See your orders" }) });
      return jsonResponse({ sent: !("skipped" in r && r.skipped) });
    }

    if (body.kind === "domain_paid") {
      const denied = await requireCronSecret(req, supabase); if (denied) return denied;
      const { data: d } = await supabase.from("domain_orders").select("id, domain, price, agents(store_name, slug, user_id)").eq("id", String(body.domainOrderId)).maybeSingle();
      if (!d?.agents) return jsonResponse({ skipped: "not_found" });
      const { data: user } = await supabase.auth.admin.getUserById(d.agents.user_id);
      const { data: admins } = await supabase.from("admin_users").select("user_id").eq("is_active", true);
      let sent = 0;
      for (const a of admins ?? []) { const { data: au } = await supabase.auth.admin.getUserById(a.user_id); if (!au?.user?.email) continue;
        const r = await sendEmail({ to: au.user.email, subject: `Domain to register: ${d.domain} (GH\u20b5 ${Number(d.price).toFixed(2)} paid)`, html: wrap("A domain was bought", `<p><b>${esc(d.agents.store_name)}</b> (${esc(d.agents.slug)}) paid <b>GH\u20b5 ${Number(d.price).toFixed(2)}</b> for <b>${esc(d.domain)}</b>.</p><p>Register it at your registrar, add the CNAME <code>@ \u2192 stores-origin.datayego.com</code>, then mark it registered in Admin \u2192 Domains.</p>`, { href: `${site}/admin/domains`, label: "Open Admin \u2192 Domains" }) });
        if (!("skipped" in r && r.skipped) && r.ok) sent++; }
      if (user?.user?.email) await sendEmail({ to: user.user.email, subject: `We're setting up ${d.domain}`, html: wrap("Payment received", `<p>Thanks! We received GH\u20b5 ${Number(d.price).toFixed(2)} for <b>${esc(d.domain)}</b>.</p><p>We register it for you and connect it to <b>${esc(d.agents.store_name)}</b>, usually within 24 hours. You'll get another email when it's live. Your store keeps working at ${esc(d.agents.slug)}.datayego.com meanwhile.</p>`, { href: `${site}/agent/domain`, label: "See status" }) });
      return jsonResponse({ admins_notified: sent });
    }

    if (body.kind === "announce") {
      const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
      if (!token) return jsonResponse({ error: "Authentication required" }, { status: 401 });
      const { data: auth } = await supabase.auth.getUser(token);
      if (!auth?.user) return jsonResponse({ error: "Invalid session" }, { status: 401 });
      const { data: agent } = await supabase.from("agents").select("id, store_name, slug, status").eq("user_id", auth.user.id).maybeSingle();
      if (!agent || agent.status !== "active") return jsonResponse({ error: "Not an active agent" }, { status: 403 });
      const { data: ann } = await supabase.from("store_announcements").select("id, title, body, emailed_at").eq("id", String(body.announcementId)).eq("agent_id", agent.id).maybeSingle();
      if (!ann) return jsonResponse({ error: "Announcement not found" }, { status: 404 });
      if (ann.emailed_at) return jsonResponse({ error: "This announcement was already emailed." }, { status: 409 });
      const { data: recent } = await supabase.from("store_announcements").select("id").eq("agent_id", agent.id).gte("emailed_at", new Date(Date.now() - 24 * 3_600_000).toISOString()).limit(1);
      if (recent && recent.length) return jsonResponse({ error: "You can email your customers once a day." }, { status: 429 });
      const { data: customers } = await supabase.from("profiles").select("email").eq("home_store_id", agent.id).not("email", "is", null);
      let sent = 0;
      for (const c of (customers ?? []) as Array<{ email: string }>) {
        const r = await sendEmail({ to: c.email, subject: `${agent.store_name}: ${ann.title}`, html: wrap(esc(ann.title), `<p style="white-space:pre-line">${esc(ann.body)}</p><p style="color:#8a968f;font-size:12px">From ${esc(agent.store_name)}.</p>`, { href: `${site}/s/${agent.slug}`, label: `Open ${agent.store_name}` }) });
        if (!("skipped" in r && r.skipped) && r.ok) sent++;
      }
      await supabase.from("store_announcements").update({ emailed_at: new Date().toISOString() }).eq("id", ann.id);
      return jsonResponse({ sent, customers: (customers ?? []).length });
    }
    return jsonResponse({ error: "Unsupported kind" }, { status: 400 });
  } catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 }); }
});
