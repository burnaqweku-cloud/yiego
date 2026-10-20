import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { sendSms, smsCallbackUrl } from "../_shared/sms.ts";
import { loadSmsSettings, recordSmsCredits } from "../_shared/smsConfig.ts";
import { z } from "npm:zod@3.25.76";

/* Internal SMS test: one custom message to one of the approved test numbers (Admin → SMS → Settings).
   Cron secret required. Never touches orders, the outbox or the activation switch. */
const Input = z.object({ to: z.string().regex(/^\+233\d{9}$/), message: z.string().min(1).max(300), sender: z.string().regex(/^[A-Za-z0-9]{3,11}$/).optional() }).strict();

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  const db = createSupabaseAdmin();
  const denied = await requireCronSecret(req, db); if (denied) return denied;
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ error: "Invalid request" }, { status: 400 });
  const settings = await loadSmsSettings(db);
  if (!settings.testNumbers.includes(parsed.data.to)) return jsonResponse({ error: "Not an approved test number" }, { status: 400 });
  const result = await sendSms({ to: parsed.data.to, message: parsed.data.message, sender: parsed.data.sender ?? settings.senderId, metadata: { purpose: "owner_test" }, callbackUrl: await smsCallbackUrl(db) });
  if (result.ok) await recordSmsCredits(db, result.remaining);
  return jsonResponse(result, { status: result.ok ? 200 : 502 });
});
