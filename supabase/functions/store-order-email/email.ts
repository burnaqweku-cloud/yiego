/* The order email for someone who bought in an agent's store. Everything the customer sees is the store's:
   its name as the sender and in the header, its own address in the links. DataYego's name is nowhere in it.
   Plain TypeScript (no Deno, no network) so the site's tests can read it. */

export interface StoreOrderRow {
  id: number; kind: "confirmed" | "verifying"; email: string; reference: string; amount: number | string; currency: string; phone: string | null;
  bundle: string; network: string; store: string; slug: string; domain: string | null; email_domain: string | null;
}

/** A store's name is typed by its agent: it is shown as text, never run as markup. */
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plainName = (r: Pick<StoreOrderRow, "store">) => r.store.replace(/[<>"\r\n]/g, "").trim().slice(0, 60) || "Your store";

/** Where the store lives: its own domain when it has one, otherwise its store address. */
export const storeUrl = (r: Pick<StoreOrderRow, "slug" | "domain">) => (r.domain ? `https://${r.domain}` : `https://${r.slug}.datayego.com`);
/** Who the email comes from: the store's name, from its own email domain when it has one. */
export const storeSender = (r: Pick<StoreOrderRow, "store" | "email_domain">) => (r.email_domain ? `${plainName(r)} <hello@${r.email_domain}>` : `${plainName(r)} <stores@datayego.com>`);

export function storeOrderEmail(r: StoreOrderRow): { subject: string; html: string } {
  const brand = esc(plainName(r)); const ref = esc(r.reference);
  const confirmed = r.kind === "confirmed";
  const trackUrl = `${storeUrl(r)}/track?reference=${encodeURIComponent(r.reference)}`;
  const amount = `${esc(r.currency || "GHS")} ${Number(r.amount).toFixed(2)}`;
  const eyebrow = confirmed ? "Order confirmed" : "Payment received";
  const title = confirmed ? "Your data order is on its way" : "We're verifying your order";
  const intro = confirmed
    ? "Keep this email. Your Order ID is how you track this order any time."
    : `We received your payment and are verifying your order. We will update you shortly. Your Order ID is <b>${ref}</b>.`;
  const line = (label: string, value: string, last = false) => `<tr><td style="padding:14px 16px;${last ? "" : "border-bottom:1px solid #eef3f0;"}font-size:13px;color:#5a6864;">${label}</td><td style="padding:14px 16px;${last ? "" : "border-bottom:1px solid #eef3f0;"}font-size:14px;font-weight:600;text-align:right;">${value}</td></tr>`;
  const inner = `<p style="margin:0 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#22c387;">${eyebrow}</p><h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;">${title}</h1><p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3c4a46;">${intro}</p>`
    + `<table role="presentation" width="100%" style="border:1px solid #e2ebe7;border-radius:14px;">${line("Order ID", ref)}${line("Bundle", [esc(r.network), esc(r.bundle)].filter(Boolean).join(" · "))}${line("Recipient", esc(r.phone ?? ""))}${line("Amount", amount, true)}</table>`
    + `<a href="${trackUrl}" style="display:block;margin:22px 0 6px;background:#22c387;color:#04120c;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:12px;">Track this order</a>`
    + `<p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#8a968f;">Or open ${brand} and use “Track an order” with <b>${ref}</b>.</p>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f2f7f4;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101e1c;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);"><tr><td style="background:#0b1512;padding:18px 28px;"><span style="color:#7cf0b4;font-size:20px;font-weight:700;letter-spacing:-0.02em;">${brand}</span></td></tr><tr><td style="padding:28px;">${inner}</td></tr></table><p style="margin:16px 0 0;font-size:11px;color:#8a968f;">${brand} · payments secured by Paystack</p></td></tr></table></body></html>`;
  return { subject: `Your ${plainName(r)} order ${r.reference}`, html };
}
