import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* "Forgot password?" inside an agent's store (16 Nov 2026). The reset email comes in the store's name, from the store's
   address, and its link opens the store's own reset page, so an agent's customer never sees DataYego. The main site
   keeps the normal reset email. Self-contained: shares no code with anything else.
     POST { email, store }  ->  always { status: "sent" } for a real store, whether or not the email has an account
   (so nobody can use it to find out who has one). At most one email a minute per account (Resend idempotency key). */

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const page = (brand: string, inner: string) => `<!doctype html><html><body style="margin:0;background:#f2f7f4;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101e1c;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:18px;overflow:hidden;"><tr><td style="background:#0b1512;padding:18px 28px;"><span style="color:#7cf0b4;font-size:20px;font-weight:700;letter-spacing:-0.02em;">${brand}</span></td></tr><tr><td style="padding:28px;">${inner}</td></tr></table><p style="margin:16px 0 0;font-size:11px;color:#8a968f;">${brand}</p></td></tr></table></body></html>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
    const slug = String(body.store ?? "").trim().toLowerCase().slice(0, 80);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
    if (!/^[a-z0-9-]{2,80}$/.test(slug)) return json({ error: "Store not found." }, 404);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: "phase1" } });
    const { data: store } = await db.from("agents").select("store_name, slug, custom_domain, custom_domain_status").eq("slug", slug).maybeSingle();
    if (!store) return json({ error: "Store not found." }, 404);
    const sent = json({ status: "sent" });

    const { data: profile } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!profile) return sent;

    const { data: link, error } = await db.auth.admin.generateLink({ type: "recovery", email });
    const hashed = link?.properties?.hashed_token;
    if (error || !hashed) { console.log("reset link not made", String(error?.message ?? "no token").slice(0, 200)); return json({ error: "We couldn't send the link. Please try again in a minute." }, 502); }

    const origin = store.custom_domain && store.custom_domain_status === "active" ? `https://${store.custom_domain}` : `https://${store.slug}.datayego.com`;
    const url = `${origin}/reset-password?token_hash=${encodeURIComponent(hashed)}&type=recovery`;
    const name = String(store.store_name ?? "").replace(/[<>"\r\n]/g, "").trim().slice(0, 60) || "Your store";
    const brand = esc(name);
    const inner = `<h1 style="margin:0 0 12px;font-size:21px;line-height:1.25;">Reset your password</h1><p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#3c4a46;">We got a request to reset the password for your ${brand} account. Tap the button to choose a new one. The link works once and expires in an hour.</p><a href="${esc(url)}" style="display:block;margin:6px 0 0;background:#22c387;color:#04120c;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:12px;">Choose a new password</a><p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#8a968f;">If you didn't ask for this, you can ignore this email. Your password stays the same.</p>`;

    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ error: "We couldn't send the link. Please try again later." }, 503);
    const res = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `store-reset:${profile.id}:${Math.floor(Date.now() / 60000)}` },
      body: JSON.stringify({ from: `${name} <stores@datayego.com>`, to: [email], subject: `Reset your ${name} password`, html: page(brand, inner) }) });
    if (!res.ok) { console.log("reset email not sent", res.status); return json({ error: "We couldn't send the link. Please try again in a minute." }, 502); }
    return sent;
  } catch (e) {
    console.log("store-password-reset failed", e instanceof Error ? e.message : String(e));
    return json({ error: "We couldn't send the link. Please try again in a minute." }, 500);
  }
});
