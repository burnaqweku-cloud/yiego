/* The layout of an announcement email. Pure code, so it can be tested and looked at before anything is sent. */

const SITE = "https://datayego.com";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The email: the title, the button straight under it (not everyone reads to the end), then the words. */
export function announcementEmail(title: string, body: string, link: { url: string; label: string } | null): string {
  const button = link ? `<a href="${esc(link.url)}" style="display:block;margin:0 0 20px;background:#22c387;color:#04120c;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:12px;">${esc(link.label)}</a>` : "";
  return `<!doctype html><html><body style="margin:0;background:#f2f7f4;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101e1c;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:18px;overflow:hidden;"><tr><td style="background:#0b1512;padding:18px 28px;color:#7cf0b4;font-size:20px;font-weight:700;">DataYego</td></tr><tr><td style="padding:28px;font-size:14px;line-height:1.6;color:#3c4a46;"><h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#101e1c;">${esc(title)}</h1>${button}<p style="white-space:pre-line;margin:0;">${esc(body)}</p><p style="margin:20px 0 0;font-size:11px;line-height:1.6;color:#8a968f;">You're receiving this because you have a DataYego account. <a href="${SITE}" style="color:#8a968f;">datayego.com</a></p></td></tr></table></td></tr></table></body></html>`;
}

/** Where the button goes: a page on our own site, or a full https address. Anything else gets no button. */
export function linkOf(url: string | null, label: string | null): { url: string; label: string } | null {
  const u = String(url ?? "").trim();
  const full = /^\/[A-Za-z0-9/_-]*$/.test(u) ? SITE + u : /^https:\/\/[^\s"<>]+$/.test(u) ? u : "";
  return full ? { url: full, label: String(label ?? "").trim() || "Open" } : null;
}
