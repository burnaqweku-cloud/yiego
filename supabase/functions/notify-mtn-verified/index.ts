import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { sendEmail } from "../_shared/email.ts";

/* One email per order, sent once: the order's MTN number has passed first-time
   verification and the order has been re-sent. Store orders are branded as the
   store and link back to it. Only the scheduled-job secret can run this. */

const SUPPORT_EMAIL = "support@yiego.shop";
const EVENT = "notification.verified_email_sent";

function frame(brand: string | undefined, inner: string) {
  const header = brand
    ? `<tr><td style="background:#0b1512;padding:18px 28px;"><span style="color:#7cf0b4;font-size:20px;font-weight:700;">${brand}</span></td></tr>`
    : `<tr><td style="background:#0b1512;padding:18px 28px;"><img src="https://datayego.com/yiego-icon-192.png" width="34" height="34" alt="DataYego" style="display:inline-block;vertical-align:middle;border-radius:9px;" /><span style="color:#7cf0b4;font-size:20px;font-weight:700;vertical-align:middle;margin-left:10px;">DataYego</span></td></tr>`;
  const footer = brand ? `${brand} · payments secured by DataYego` : "DataYego · Ghana data bundles";
  return `<!doctype html><html><body style="margin:0;background:#f2f7f4;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101e1c;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:18px;overflow:hidden;">${header}<tr><td style="padding:28px;">${inner}</td></tr></table><p style="margin:16px 0 0;font-size:11px;color:#8a968f;">${footer}</p></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const supabase = createSupabaseAdmin();
    const denied = await requireCronSecret(req, supabase); if (denied) return denied;
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    const site = "https://datayego.com";

    const { data: orders, error } = await supabase.from("orders")
      .select("id, order_reference, guest_email, user_id, recipient_phone, supplier_order_reference, supplier_purchase_id, networks(name), data_products(name), agents(slug, store_name)")
      .eq("admin_resolution_status", "awaiting_verification").eq("payment_status", "succeeded").eq("status", "processing");
    if (error) throw new Error(error.message);

    const sent: string[] = []; const skipped: Array<{ ref: string; reason: string }> = [];
    for (const o of orders ?? []) {
      if (!o.supplier_order_reference && !o.supplier_purchase_id) { skipped.push({ ref: o.order_reference, reason: "not_resent_yet" }); continue; }
      const { data: already } = await supabase.from("order_events").select("id").eq("order_id", o.id).eq("event_type", EVENT).limit(1).maybeSingle();
      if (already) { skipped.push({ ref: o.order_reference, reason: "already_sent" }); continue; }
      let to = o.guest_email as string | null;
      if (!to && o.user_id) { const { data: p } = await supabase.from("profiles").select("email").eq("id", o.user_id).maybeSingle(); to = p?.email ?? null; }
      if (!to) { skipped.push({ ref: o.order_reference, reason: "no_email" }); continue; }
      if (dryRun) { sent.push(o.order_reference); continue; }

      const store = o.agents as { slug: string; store_name: string } | null;
      const shopUrl = store ? `${site}/s/${store.slug}` : `${site}/shop`;
      const trackUrl = store ? `${site}/s/${store.slug}/track?reference=${encodeURIComponent(o.order_reference)}` : `${site}/track-order?reference=${encodeURIComponent(o.order_reference)}`;
      const name = store?.store_name ?? "DataYego";
      const bundle = `${(o.networks as { name?: string } | null)?.name ?? "MTN"} · ${(o.data_products as { name?: string } | null)?.name ?? "Data bundle"}`;
      const inner = `<p style="margin:0 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#22c387;">Number verified</p>
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;">Congratulations — your number is verified!</h1>
<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#3c4a46;">MTN has finished verifying <b>${o.recipient_phone ?? "your number"}</b>. The verification is <b>complete</b> — it's a one-time check, and it's done.</p>
<p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#3c4a46;">Your order <b>${o.order_reference}</b> (${bundle}) has been sent for delivery. From now on, every bundle you buy for this number goes through smoothly and fast — no more waiting.</p>
<a href="${shopUrl}" style="display:block;margin:8px 0 10px;background:#22c387;color:#04120c;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:12px;">Buy data on ${name}</a>
<a href="${trackUrl}" style="display:block;margin:0 0 6px;border:1px solid #cfe0d8;color:#101e1c;text-decoration:none;text-align:center;font-weight:600;font-size:14px;padding:12px;border-radius:12px;">Track this order</a>
<p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#8a968f;">Thank you for your patience. Save <a href="${shopUrl}" style="color:#22c387;">${shopUrl.replace("https://", "")}</a> for your next bundle.</p>`;
      const r = await sendEmail({ to, subject: `Congratulations — your number is verified (${o.order_reference})`, html: frame(store?.store_name, inner), replyTo: SUPPORT_EMAIL });
      if (!r.skipped && r.ok) {
        await supabase.from("order_events").insert({ order_id: o.id, event_type: EVENT, message: "Number verified email sent", metadata: { to, store: store?.slug ?? null } });
        sent.push(o.order_reference);
      } else skipped.push({ ref: o.order_reference, reason: r.skipped ? r.reason : `send_failed_${r.status}` });
      await new Promise((res) => setTimeout(res, 600)); // stay under the email provider's rate limit
    }
    return jsonResponse({ dryRun, sent: sent.length, sentRefs: sent, skipped });
  } catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 }); }
});
