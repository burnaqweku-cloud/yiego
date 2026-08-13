// Transactional email via Resend. Dormant until RESEND_API_KEY is set — with
// no key, sendEmail() returns { skipped: true } without a network call, so the
// payment and fulfilment paths are unaffected. Every caller wraps this in a
// try/catch so a mail failure can never break an order.
const RESEND_URL = "https://api.resend.com/emails";

export async function sendEmail(input: { to: string; subject: string; html: string }) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { skipped: true as const, reason: "no_api_key" };

  const from = Deno.env.get("EMAIL_FROM") ?? "YieGo <noreply@yiego.shop>";
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
  });
  const payload = await res.json().catch(() => null);
  return { skipped: false as const, ok: res.ok, status: res.status, payload };
}

interface OrderEmailRow {
  id: string;
  order_reference: string;
  guest_email: string | null;
  recipient_phone: string | null;
  amount: number | string;
  currency: string | null;
  data_products: { name: string } | null;
  networks: { name: string } | null;
}

function orderEmailHtml(o: {
  ref: string; product: string; network: string; phone: string; amount: string; trackUrl: string;
}) {
  return `<!doctype html><html><body style="margin:0;background:#f2f7f4;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101e1c;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <tr><td style="background:#0b1512;padding:22px 28px;">
        <span style="color:#7cf0b4;font-size:20px;font-weight:700;letter-spacing:-0.02em;">YieGo</span>
      </td></tr>
      <tr><td style="padding:28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#22c387;">Order confirmed</p>
        <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;">Your data order is on its way</h1>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3c4a46;">Keep this email — your Order ID is how you track this order any time.</p>
        <table role="presentation" width="100%" style="border:1px solid #e2ebe7;border-radius:14px;">
          <tr><td style="padding:14px 16px;border-bottom:1px solid #eef3f0;font-size:13px;color:#5a6864;">Order ID</td><td style="padding:14px 16px;border-bottom:1px solid #eef3f0;font-size:15px;font-weight:700;text-align:right;">${o.ref}</td></tr>
          <tr><td style="padding:14px 16px;border-bottom:1px solid #eef3f0;font-size:13px;color:#5a6864;">Bundle</td><td style="padding:14px 16px;border-bottom:1px solid #eef3f0;font-size:14px;font-weight:600;text-align:right;">${o.network} · ${o.product}</td></tr>
          <tr><td style="padding:14px 16px;border-bottom:1px solid #eef3f0;font-size:13px;color:#5a6864;">Recipient</td><td style="padding:14px 16px;border-bottom:1px solid #eef3f0;font-size:14px;font-weight:600;text-align:right;">${o.phone}</td></tr>
          <tr><td style="padding:14px 16px;font-size:13px;color:#5a6864;">Amount</td><td style="padding:14px 16px;font-size:14px;font-weight:600;text-align:right;">${o.amount}</td></tr>
        </table>
        <a href="${o.trackUrl}" style="display:block;margin:22px 0 6px;background:#22c387;color:#04120c;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:12px;">Track this order</a>
        <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#8a968f;">Or go to yiego.shop, choose “Track an order”, and enter <b>${o.ref}</b>.</p>
      </td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:11px;color:#8a968f;">YieGo · Ghana data bundles</p>
  </td></tr></table>
  </body></html>`;
}

/**
 * Emails a guest their order confirmation + Order ID. No-op for account orders
 * (they have order history) and idempotent — records a one-time order event so
 * the webhook and the reconcile fallback can't both send it twice.
 */
export async function sendGuestOrderConfirmation(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  orderId: string,
) {
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_reference, guest_email, recipient_phone, amount, currency, data_products(name), networks(name)")
    .eq("id", orderId)
    .maybeSingle();
  const row = order as OrderEmailRow | null;
  if (!row?.guest_email) return { skipped: true, reason: "not_a_guest_order" };

  const { data: already } = await supabase
    .from("order_events")
    .select("id")
    .eq("order_id", orderId)
    .eq("event_type", "notification.email_sent")
    .limit(1)
    .maybeSingle();
  if (already) return { skipped: true, reason: "already_sent" };

  const siteUrl = (Deno.env.get("SITE_URL") ?? Deno.env.get("APP_URL") ?? "https://yiego.shop").replace(/\/$/, "");
  const trackUrl = `${siteUrl}/track-order?reference=${encodeURIComponent(row.order_reference)}`;
  const amount = `${row.currency ?? "GHS"} ${Number(row.amount).toFixed(2)}`;

  const result = await sendEmail({
    to: row.guest_email,
    subject: `Your YieGo order ${row.order_reference}`,
    html: orderEmailHtml({
      ref: row.order_reference,
      product: row.data_products?.name ?? "Data bundle",
      network: row.networks?.name ?? "",
      phone: row.recipient_phone ?? "",
      amount,
      trackUrl,
    }),
  });

  // Only mark as sent on a real successful send, so a dormant (no-key) run
  // doesn't permanently suppress the email once the key is configured.
  if (!result.skipped && result.ok) {
    await supabase.from("order_events").insert({
      order_id: orderId,
      event_type: "notification.email_sent",
      message: "Order confirmation email sent to guest",
      metadata: { to: row.guest_email },
    });
  }
  return result;
}
