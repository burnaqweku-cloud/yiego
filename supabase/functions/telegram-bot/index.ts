// deno-lint-ignore-file no-explicit-any
// DataSika Telegram bot — LONG-POLL FALLBACK.
//
// Primary delivery is now via `telegram-webhook` (push from Telegram).
// This endpoint is retained as an emergency fallback. It is NO LONGER
// wired to pg_cron (the `telegram-bot-poll` job has been disabled).
//
// To re-enable polling (rollback path):
//   1. UPDATE cron.job SET active = true WHERE jobname = 'telegram-bot-poll';
//   2. Optionally delete the webhook via telegram-set-webhook (action=delete).
//
// All command handling lives in `_shared/telegram-bot-core.ts` and is
// shared with `telegram-webhook`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUpdates } from "../_shared/telegram.ts";
import {
  processUpdate,
  MAX_RUNTIME_MS,
  MIN_REMAINING_MS,
} from "../_shared/telegram-bot-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (_req) => {
  const start = Date.now();
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let processed = 0;
  let { data: state } = await supa
    .from("telegram_bot_state")
    .select("update_offset")
    .eq("id", 1)
    .single();
  let offset: number = state?.update_offset ?? 0;

  while (true) {
    const remaining = MAX_RUNTIME_MS - (Date.now() - start);
    if (remaining < MIN_REMAINING_MS) break;
    const timeout = Math.min(50, Math.floor(remaining / 1000) - 5);
    if (timeout < 1) break;

    const result = await getUpdates(offset, timeout);
    if (!result.ok) {
      console.error("[telegram-bot] getUpdates failed");
      break;
    }
    const updates: any[] = result.data?.result ?? [];
    if (updates.length === 0) continue;

    for (const u of updates) {
      try { await processUpdate(supa, u); }
      catch (e) { console.error("[telegram-bot] update error:", e); }
      processed += 1;
    }

    offset = Math.max(...updates.map((u) => u.update_id)) + 1;
    await supa
      .from("telegram_bot_state")
      .update({ update_offset: offset, last_polled_at: new Date().toISOString() })
      .eq("id", 1);
  }

  return new Response(
    JSON.stringify({ ok: true, processed, offset, mode: "fallback-poll" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
