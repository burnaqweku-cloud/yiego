import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

/* Internal: send a one-off email to a customer. Guarded by the cron secret (internal_secrets 'cron'); used for
   manual corrections and notices from the operator. Body: { to, subject, html } */
Deno.serve(async (req) => {
  const o = handleOptions(req); if (o) return o;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  const supabase = createSupabaseAdmin();
  const { data: sec } = await supabase.from("internal_secrets").select("value").eq("key", "cron").maybeSingle();
  if (!sec?.value || req.headers.get("x-yiego-internal-secret") !== sec.value) return jsonResponse({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const to = String(body.to ?? "").trim(); const subject = String(body.subject ?? "").trim(); const html = String(body.html ?? "");
  if (!to || !subject || !html) return jsonResponse({ error: "to, subject, html required" }, { status: 400 });
  const r = await sendEmail({ to, subject, html, replyTo: "support@datayego.com" });
  return jsonResponse(r);
});
