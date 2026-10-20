import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sendSms, smsCallbackUrl } from "../_shared/sms.ts";
import { buildOrderSms, SAMPLE_ORDER, SAMPLE_STORE_ORDER, validateSmsTemplate, type SmsTemplateKind } from "../_shared/orderSmsTemplates.ts";
import { loadSmsSettings, loadSmsTemplates, recordSmsCredits } from "../_shared/smsConfig.ts";
import { z } from "npm:zod@3.25.76";

/* Admin → SMS: the one action that needs the Vynfy key — sending a test text. Everything else on those
   pages is a database RPC. Admin session with two-factor, like the other admin functions.
   { action: "send_test", to, kind }          one of the four templates filled with a sample order (store: true for a store sample)
   { action: "send_test", to, message }       any custom text
   { action: "preview", body, store? }        render a draft template without saving or sending */

const sessionHasMfa = (token: string) => { try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))?.aal === "aal2"; } catch { return false; } };
const KINDS = ["purchase", "delivered", "verified_delivered", "verified_on_way"] as const;
const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send_test"), to: z.string().regex(/^\+233\d{9}$/), kind: z.enum(KINDS).optional(), message: z.string().min(1).max(306).optional(), store: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("preview"), body: z.string().max(400), kind: z.enum(KINDS), store: z.boolean().optional() }).strict(),
]);

const sampleFor = (kind: SmsTemplateKind, store: boolean) => {
  const base = store ? SAMPLE_STORE_ORDER : SAMPLE_ORDER;
  return kind === "verified_on_way" ? { ...base, status: "processing", created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() } : base;
};
const orderKind = (kind: SmsTemplateKind) => (kind.startsWith("verified") ? "verified" : kind) as "purchase" | "delivered" | "verified";

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return jsonResponse({ error: "Authentication required" }, { status: 401 });
    const db = createSupabaseAdmin();
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user) return jsonResponse({ error: "Invalid session" }, { status: 401 });
    const { data: admin } = await db.from("admin_users").select("user_id").eq("user_id", auth.user.id).eq("is_active", true).maybeSingle();
    if (!admin) return jsonResponse({ error: "Admin access required" }, { status: 403 });
    if (!sessionHasMfa(token)) return jsonResponse({ error: "Two-factor verification required. Sign in to the admin panel again." }, { status: 403 });

    const parsed = Input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonResponse({ error: "Invalid request" }, { status: 400 });
    const input = parsed.data;
    const [settings, templates] = await Promise.all([loadSmsSettings(db), loadSmsTemplates(db)]);

    if (input.action === "preview") {
      const problems = validateSmsTemplate(input.body);
      if (problems.length) return jsonResponse({ ok: false, problems });
      try {
        const message = buildOrderSms(sampleFor(input.kind, Boolean(input.store)), orderKind(input.kind), { ...templates, [input.kind]: input.body });
        return jsonResponse({ ok: true, message, length: message.length, segments: message.length <= 160 ? 1 : Math.ceil(message.length / 153) });
      } catch (e) { return jsonResponse({ ok: false, problems: [(e as Error).message] }); }
    }

    // send_test
    if (!settings.testNumbers.includes(input.to)) return jsonResponse({ error: "That number isn't on the test list. Add it under Settings first." }, { status: 400 });
    let message: string;
    if (input.message) message = input.message;
    else if (input.kind) message = buildOrderSms(sampleFor(input.kind, Boolean(input.store)), orderKind(input.kind), templates);
    else return jsonResponse({ error: "Choose a template or type a message" }, { status: 400 });
    const result = await sendSms({ to: input.to, message, sender: settings.senderId, metadata: { purpose: "admin_test", by: auth.user.id }, callbackUrl: await smsCallbackUrl(db) });
    if (!result.ok) return jsonResponse({ ok: false, error: result.reason === "provider_rejected" ? "Vynfy refused the message" : result.reason === "no_api_key" ? "Vynfy key is not set" : "Vynfy didn't answer", message }, { status: 502 });
    await recordSmsCredits(db, result.remaining);
    // A successful test is what the master switch requires before it can be turned on.
    await db.from("order_sms_control").update({ test_passed_at: new Date().toISOString() }).eq("id", true);
    return jsonResponse({ ok: true, message, taskId: result.jobId ?? null, remaining: result.remaining ?? null });
  } catch { return jsonResponse({ error: "SMS action unavailable" }, { status: 500 }); }
});
