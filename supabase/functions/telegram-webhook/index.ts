// deno-lint-ignore-file no-explicit-any
// DataSika Telegram webhook receiver.
//
// Replaces the pg_cron long-poll loop. Telegram POSTs each Update
// directly to this endpoint (~100ms latency vs 0–60s with polling).
//
// SECURITY: every request must carry header
//   X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>
// configured via setWebhook. Mismatches return 401.
//
// RELIABILITY: this function ALWAYS returns 200 after auth passes.
// Telegram retries non-200 responses for up to 24h, which would cause
// duplicate processing. Internal errors are logged and swallowed.
//
// ─── ROLLBACK PROCEDURE ─────────────────────────────────────────────
// If webhooks break in production:
//   1. Remove the webhook (curl, or run telegram-set-webhook with
//      action="delete"):
//        POST https://api.telegram.org/bot<TOKEN>/setWebhook
//        body: { "url": "" }
//   2. Re-enable the pg_cron job:
//        UPDATE cron.job SET active = true
//          WHERE jobname = 'telegram-bot-poll';
//   3. Polling (telegram-bot/index.ts fallback loop) resumes within 60s.
// ────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processUpdate } from "../_shared/telegram-bot-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check
  if (req.method === "GET") {
    return json(200, { ok: true, service: "telegram-webhook" });
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  // Verify Telegram's secret token header
  const expected = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!expected) {
    console.error("[telegram-webhook] TELEGRAM_WEBHOOK_SECRET not configured");
    return json(500, { ok: false, error: "server_misconfigured" });
  }
  const provided = req.headers.get("x-telegram-bot-api-secret-token");
  if (provided !== expected) {
    console.warn("[telegram-webhook] secret token mismatch");
    return json(401, { ok: false, error: "unauthorized" });
  }

  // From here on, ALWAYS return 200 to prevent Telegram retry storms.
  let update: any = null;
  try {
    update = await req.json();
  } catch (e) {
    console.error("[telegram-webhook] malformed body:", e);
    return json(200, { ok: true, ignored: "malformed_body" });
  }

  if (!update || typeof update !== "object") {
    return json(200, { ok: true, ignored: "empty_update" });
  }

  const updateId = update?.update_id ?? null;
  const updateKind = update?.callback_query ? "callback_query" : update?.message ? "message" : "unknown";

  // ── Synchronous dispatch ─────────────────────────────────────────
  // Telegram considers the update delivered only after this endpoint returns
  // 200. Do not fire-and-forget processUpdate: edge isolates can shut down
  // immediately after the response, silently losing bot work. Button spinner
  // responsiveness is handled inside processUpdate by acking callbacks fast.
  try {
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const startedAt = Date.now();
    console.log("[telegram-webhook] processUpdate:start", { update_id: updateId, kind: updateKind });
    await processUpdate(supa, update);
    console.log("[telegram-webhook] processUpdate:done", {
      update_id: updateId,
      kind: updateKind,
      duration_ms: Date.now() - startedAt,
    });
  } catch (e) {
    console.error("[telegram-webhook] processUpdate:fatal", { update_id: updateId, kind: updateKind, error: e });
    // swallow — still return 200
  }

  return json(200, { ok: true });
});
