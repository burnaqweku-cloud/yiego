import { handleOptions, jsonResponse, corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";

/* Follow-ups: the emails of the follow-up sequence (signed up but never bought, has the app but never
   bought, bought before and went quiet). The database picks who is due and writes the app notification
   (follow_up_claim); this function sends the email and reports back (follow_up_finish).
     POST + internal secret        run the sender (twice an hour, daytime only; the database enforces the hours and the daily limit)
     GET  ?o=<token>               a 1x1 image in the email: marks it opened
     POST ?u=<token>               one-click unsubscribe (the button mail apps show next to the sender) */

interface Due { id: number; token: string; email: string; name: string | null; message_key: string; subject: string; heading: string; body: string; cta_label: string; cta_path: string }

const SITE = "https://datayego.com";
const SELF = `${Deno.env.get("SUPABASE_URL")}/functions/v1/follow-up-run`;
const PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Kept in this file (not shared) so this sender can be changed without touching order emails. */
async function sendEmail(input: { to: string; subject: string; html: string; text: string; idempotencyKey: string; headers: Record<string, string> }) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { ok: false, error: "no_api_key" };
  const from = Deno.env.get("EMAIL_FROM") ?? "DataYego <noreply@datayego.com>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html, text: input.text, reply_to: "support@yiego.shop", headers: input.headers }),
  });
  if (res.ok) return { ok: true, error: null };
  return { ok: false, error: `${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}` };
}

function frame(inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#f2f7f4;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101e1c;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);"><tr><td style="background:#0b1512;padding:18px 28px;"><img src="https://datayego.com/yiego-icon-192.png" width="34" height="34" alt="DataYego" style="display:inline-block;vertical-align:middle;border-radius:9px;" /><span style="color:#7cf0b4;font-size:20px;font-weight:700;letter-spacing:-0.02em;vertical-align:middle;margin-left:10px;">DataYego</span></td></tr><tr><td style="padding:28px;">${inner}</td></tr></table><p style="margin:16px 0 0;font-size:11px;color:#8a968f;">DataYego · Ghana data bundles</p></td></tr></table></body></html>`;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function render(d: Due) {
  const name = d.name ? d.name.slice(0, 30) : "there";
  const fill = (t: string) => t.replaceAll("{name}", name);
  const link = `${SITE}${d.cta_path}${d.cta_path.includes("?") ? "&" : "?"}n=${d.token}`;
  const unsubscribe = `${SITE}/unsubscribe?t=${d.token}`;
  const paragraphs = fill(d.body).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const inner = `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">${esc(fill(d.heading))}</h1>`
    + paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:14.5px;line-height:1.65;color:#3c4a46;">${esc(p).replace(/\n/g, "<br />")}</p>`).join("")
    + `<a href="${link}" style="display:block;margin:20px 0 6px;background:#22c387;color:#04120c;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:12px;">${esc(d.cta_label)}</a>`
    + `<p style="margin:22px 0 0;font-size:11.5px;line-height:1.6;color:#8a968f;">You are getting this because you have a DataYego account. <a href="${unsubscribe}" style="color:#8a968f;text-decoration:underline;">Stop these reminders</a>. Order emails are not affected.</p>`
    + `<img src="${SELF}?o=${d.token}" width="1" height="1" alt="" style="display:block;border:0;" />`;
  const text = `${fill(d.heading)}\n\n${paragraphs.join("\n\n")}\n\n${d.cta_label}: ${link}\n\nStop these reminders: ${unsubscribe}`;
  return { subject: fill(d.subject), html: frame(inner), text, unsubscribe };
}

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  const url = new URL(req.url);
  try {
    const db = createSupabaseAdmin();
    const opened = url.searchParams.get("o");
    if (req.method === "GET" && opened) {
      if (UUID.test(opened)) await db.rpc("follow_up_seen", { p_token: opened, p_what: "open" });
      return new Response(PIXEL, { headers: { ...corsHeaders, "Content-Type": "image/gif", "Cache-Control": "no-store" } });
    }
    const unsub = url.searchParams.get("u");
    if (req.method === "POST" && unsub) {
      if (UUID.test(unsub)) await db.rpc("follow_up_unsubscribe", { p_token: unsub });
      return jsonResponse({ unsubscribed: true });
    }
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
    const denied = await requireCronSecret(req, db); if (denied) return denied;

    let sent = 0, failed = 0;
    // A few short rounds per run keeps each run quick; the database stops handing out work at the daily limit.
    for (let round = 0; round < 3; round++) {
      const claimed = await db.rpc("follow_up_claim", { p_limit: 15 });
      if (claimed.error) return jsonResponse({ error: claimed.error.message, sent, failed }, { status: 500 });
      const due = (claimed.data ?? []) as Due[];
      if (due.length === 0) break;
      for (const d of due) {
        let ok = false; let error: string | null = null;
        try {
          const mail = render(d);
          const result = await sendEmail({
            to: d.email, subject: mail.subject, html: mail.html, text: mail.text, idempotencyKey: `follow-up-${d.id}`,
            headers: { "List-Unsubscribe": `<${SELF}?u=${d.token}>, <${mail.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          });
          ok = result.ok; error = result.error;
        } catch (e) { error = e instanceof Error ? e.message : "send failed"; }
        await db.rpc("follow_up_finish", { p_id: d.id, p_ok: ok, p_error: error });
        if (ok) sent += 1; else failed += 1;
        // Resend allows a few sends a second; a short pause keeps us well inside that.
        await new Promise((r) => setTimeout(r, 350));
      }
    }
    return jsonResponse({ sent, failed });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
