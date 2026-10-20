import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { sendSms } from "../_shared/sms.ts";
import { z } from "npm:zod@3.25.76";

/* Owner-only SMS test: sends one custom message to the approved test number. Internal secret required.
   Never touches orders, the outbox or the activation switch. */
const Input = z.object({ to: z.enum(["+233557375894", "+233536529090", "+233533533414"]), message: z.string().min(1).max(300), sender: z.enum(["Datayego", "DTYEGO"]).optional() }).strict();

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  const denied = await requireCronSecret(req, createSupabaseAdmin()); if (denied) return denied;
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ error: "Invalid request" }, { status: 400 });
  const result = await sendSms({ to: parsed.data.to, message: parsed.data.message, sender: parsed.data.sender, metadata: { purpose: "owner_test" } });
  return jsonResponse(result, { status: result.ok ? 200 : 502 });
});
