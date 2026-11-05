import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { koraConfigured, koraIsTestKey, koraLiveReady, readKoraBalances } from "../_shared/kora.ts";

/* Internal read-only check of the Kora setup: is the secret saved, is it a live key, and does Kora
   answer with our balances. Cron secret only. Never returns the key. */
Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  const denied = await requireCronSecret(req, createSupabaseAdmin()); if (denied) return denied;
  const configured = koraConfigured();
  const balances = configured ? await readKoraBalances().catch((e) => ({ ok: false, items: null, error: e instanceof Error ? e.message : String(e) })) : null;
  return jsonResponse({ configured, test_key: configured ? koraIsTestKey() : null, live_ready: koraLiveReady(), balances });
});
