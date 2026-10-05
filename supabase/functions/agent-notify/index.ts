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
    if (body.kind === "application") {
      // Sub-agent applications: "received" (to applicant + parent), "approved" / "declined" (to applicant).
      const denied = await requireCronSecret(req, supabase); if (denied) return denied;
      const { data: a } = await supabase.from("network_applications").select("id, status, applicant_name, applicant_email, store_name, requested_slug, answers, decision_note, agents!network_applications_parent_agent_id_fkey(store_name, slug, user_id, network_fee, custom_domain, custom_domain_status)").eq("id", String(body.applicationId)).maybeSingle();
      if (!a?.agents) return jsonResponse({ skipped: "not_found" });
      const parent = a.agents as { store_name: string; slug: string; user_id: string; network_fee: number; custom_domain: string | null; custom_domain_status: string | null };
      const storeUrl = parent.custom_domain && parent.custom_domain_status === "active" ? `https://${parent.custom_domain}` : `https://${parent.slug}.datayego.com`;
      const first = (a.applicant_name ?? "").split(" ")[0];
      const event = String(body.event);
      // Auto-approved applications are approved in the same transaction; don't send "received" on top of "approved".
      if (event === "received" && a.status !== "pending") return jsonResponse({ skipped: "auto_approved" });
      let sent = 0;
      if (event === "received") {
        if (a.applicant_email) { const r = await sendEmail({ to: a.applicant_email, subject: `${parent.store_name} received your application`, html: wrap("Application received", `<p>${first ? `Hi ${esc(first)},` : "Hi,"}</p><p>Thanks for applying to sell data under <b>${esc(parent.store_name)}</b>. They'll look at it and you'll get an email as soon as they decide.</p><p>Store name you asked for: <b>${esc(a.store_name)}</b> (${esc(a.requested_slug)}.datayego.com)</p>`, { href: `${storeUrl}/join`, label: "See your application" }) }); if (!("skipped" in r && r.skipped) && r.ok) sent++; }
        const { data: pu } = await supabase.auth.admin.getUserById(parent.user_id);
        if (pu?.user?.email) { const answers = (a.answers as Array<{ label: string; answer: string }>).filter((x) => x.answer).map((x) => `<p style="margin:0 0 10px"><b>${esc(x.label)}</b><br>${esc(x.answer)}</p>`).join("");
          const r = await sendEmail({ to: pu.user.email, subject: `New agent application: ${a.applicant_name ?? a.store_name}`, html: wrap("Someone wants to sell under you", `<p><b>${esc(a.applicant_name ?? "An applicant")}</b> applied to open <b>${esc(a.store_name)}</b> under ${esc(parent.store_name)}.</p>${answers}`, { href: `${site}/agent/network`, label: "Review in your dashboard" }) }); if (!("skipped" in r && r.skipped) && r.ok) sent++; }
      } else if (event === "approved" && a.applicant_email) {
        const fee = Number(parent.network_fee ?? 0);
        const r = await sendEmail({ to: a.applicant_email, subject: `You're approved to sell under ${parent.store_name}`, html: wrap("You're in", `<p>${first ? `Hi ${esc(first)},` : "Hi,"}</p><p><b>${esc(parent.store_name)}</b> approved your application.${a.decision_note ? ` They added: <i>${esc(a.decision_note)}</i>` : ""}</p><p>${fee > 0 ? `Sign in to your dashboard to pay the GH\u20b5 ${fee.toFixed(2)} fee and your store opens straight away.` : "Your store is open. Sign in to set your prices, add your logo and share your link."}</p>`, { href: `${site}/agent`, label: "Open your dashboard" }) }); if (!("skipped" in r && r.skipped) && r.ok) sent++;
      } else if (event === "declined" && a.applicant_email) {
        const r = await sendEmail({ to: a.applicant_email, subject: `About your application to ${parent.store_name}`, html: wrap("Application not approved", `<p>${first ? `Hi ${esc(first)},` : "Hi,"}</p><p><b>${esc(parent.store_name)}</b> didn't approve your application this time.${a.decision_note ? ` Their note: <i>${esc(a.decision_note)}</i>` : ""}</p><p>You can still buy data from ${esc(parent.store_name)} as a customer, and you're welcome to apply again later.</p>`, { href: storeUrl, label: `Open ${parent.store_name}` }) }); if (!("skipped" in r && r.skipped) && r.ok) sent++;
      }
      return jsonResponse({ sent });
    }
    return jsonResponse({ error: "Unsupported kind" }, { status: 400 });
  } catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 }); }
});
