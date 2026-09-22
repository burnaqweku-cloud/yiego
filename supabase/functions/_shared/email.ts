const RESEND_URL = "https://api.resend.com/emails";
const SUPPORT_EMAIL = "support@yiego.shop";

export async function sendEmail(input: { to: string; subject: string; html: string; replyTo?: string }) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { skipped: true as const, reason: "no_api_key" };
  const from = Deno.env.get("EMAIL_FROM") ?? "DataYego <noreply@datayego.com>";
  const body: Record<string, unknown> = { from, to: [input.to], subject: input.subject, html: input.html };
  if (input.replyTo) body.reply_to = input.replyTo;
  const res = await fetch(RESEND_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await res.json().catch(() => null);
  return { skipped: false as const, ok: res.ok, status: res.status, payload };
}

/* ── Shared frame. `brand` swaps the DataYego header/footer for a store's. ── */
function frame(brand: string | undefined, inner: string) {
  const header = brand
    ? `<tr><td style="background:#0b1512;padding:18px 28px;"><span style="color:#7cf0b4;font-size:20px;font-weight:700;letter-spacing:-0.02em;">${brand}</span></td></tr>`
    : `<tr><td style="background:#0b1512;padding:18px 28px;"><img src="https://datayego.com/yiego-icon-192.png" width="34" height="34" alt="DataYego" style="display:inline-block;vertical-align:middle;border-radius:9px;" /><span style="color:#7cf0b4;font-size:20px;font-weight:700;letter-spacing:-0.02em;vertical-align:middle;margin-left:10px;">DataYego</span></td></tr>`;
  const footer = brand ? `${brand} · payments secured by DataYego` : "DataYego · Ghana data bundles";
  return `<!doctype html><html><body style="margin:0;background:#f2f7f4;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101e1c;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">${header}<tr><td style="padding:28px;">${inner}</td></tr></table><p style="margin:16px 0 0;font-size:11px;color:#8a968f;">${footer}</p></td></tr></table></body></html>`;
}

export async function sendWelcomeEmail(to: string, name: string) {
  if (!to) return { skipped: true, reason: "no_recipient" };
  const hi = name ? `Hi ${name},` : "Hi,";
  const inner = `<p style="margin:0 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#22c387;">Welcome</p><h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;">Welcome to DataYego</h1><p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3c4a46;">${hi} your account is ready. Buy data for any Ghana line, top up your wallet, and track every order from one place.</p><a href="https://datayego.com/shop" style="display:block;margin:8px 0 6px;background:#22c387;color:#04120c;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:12px;">Buy data</a><p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#8a968f;">Fund your wallet once, then buy in two taps — MTN, Telecel and AirtelTigo, delivered in minutes.</p>`;
  return sendEmail({ to, subject: "Welcome to DataYego", html: frame(undefined, inner), replyTo: SUPPORT_EMAIL });
}

interface OrderEmailRow { id: string; order_reference: string; guest_email: string | null; user_id: string | null; recipient_phone: string | null; amount: number | string; currency: string | null; data_products: { name: string } | null; networks: { name: string } | null; agents: { slug: string; store_name: string } | null }

/** Order confirmation. Orders from an agent's store are branded as the store
 *  and link back to the store's own tracking page. */
// deno-lint-ignore no-explicit-any
export async function sendOrderConfirmation(supabase: any, orderId: string) {
  const { data: order } = await supabase.from("orders").select("id, order_reference, guest_email, user_id, recipient_phone, amount, currency, data_products(name), networks(name), agents(slug, store_name)").eq("id", orderId).maybeSingle();
  const row = order as OrderEmailRow | null;
  if (!row) return { skipped: true, reason: "order_not_found" };
  let to = row.guest_email;
  if (!to && row.user_id) { const { data: profile } = await supabase.from("profiles").select("email").eq("id", row.user_id).maybeSingle(); to = (profile?.email as string | undefined) ?? null; }
  if (!to) return { skipped: true, reason: "no_recipient_email" };
  const { data: already } = await supabase.from("order_events").select("id").eq("order_id", orderId).eq("event_type", "notification.email_sent").limit(1).maybeSingle();
  if (already) return { skipped: true, reason: "already_sent" };
  const siteUrl = (Deno.env.get("SITE_URL") ?? Deno.env.get("APP_URL") ?? "https://datayego.com").replace(/\/$/, "");
  const store = row.agents;
  const trackUrl = store ? `${siteUrl}/s/${store.slug}/track?reference=${encodeURIComponent(row.order_reference)}` : `${siteUrl}/track-order?reference=${encodeURIComponent(row.order_reference)}`;
  const amount = `${row.currency ?? "GHS"} ${Number(row.amount).toFixed(2)}`;
  const product = row.data_products?.name ?? "Data bundle"; const network = row.networks?.name ?? "";
  const hint = store ? `Or open ${store.store_name} and use “Track an order” with <b>${row.order_reference}</b>.` : `Or go to datayego.com, choose “Track an order”, and enter <b>${row.order_reference}</b>.`;
  const inner = `<p style="margin:0 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#22c387;">Order confirmed</p><h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;">Your data order is on its way</h1><p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3c4a46;">Keep this email — your Order ID is how you track this order any time.</p><table role="presentation" width="100%" style="border:1px solid #e2ebe7;border-radius:14px;"><tr><td style="padding:14px 16px;border-bottom:1px solid #eef3f0;font-size:13px;color:#5a6864;">Order ID</td><td style="padding:14px 16px;border-bottom:1px solid #eef3f0;font-size:15px;font-weight:700;text-align:right;">${row.order_reference}</td></tr><tr><td style="padding:14px 16px;border-bottom:1px solid #eef3f0;font-size:13px;color:#5a6864;">Bundle</td><td style="padding:14px 16px;border-bottom:1px solid #eef3f0;font-size:14px;font-weight:600;text-align:right;">${network} · ${product}</td></tr><tr><td style="padding:14px 16px;border-bottom:1px solid #eef3f0;font-size:13px;color:#5a6864;">Recipient</td><td style="padding:14px 16px;border-bottom:1px solid #eef3f0;font-size:14px;font-weight:600;text-align:right;">${row.recipient_phone ?? ""}</td></tr><tr><td style="padding:14px 16px;font-size:13px;color:#5a6864;">Amount</td><td style="padding:14px 16px;font-size:14px;font-weight:600;text-align:right;">${amount}</td></tr></table><a href="${trackUrl}" style="display:block;margin:22px 0 6px;background:#22c387;color:#04120c;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:12px;">Track this order</a><p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#8a968f;">${hint}</p>`;
  const result = await sendEmail({ to, subject: store ? `Your ${store.store_name} order ${row.order_reference}` : `Your DataYego order ${row.order_reference}`, replyTo: SUPPORT_EMAIL, html: frame(store?.store_name, inner) });
  if (!result.skipped && result.ok) await supabase.from("order_events").insert({ order_id: orderId, event_type: "notification.email_sent", message: "Order confirmation email sent", metadata: { to, store: store?.slug ?? null } });
  return result;
}
