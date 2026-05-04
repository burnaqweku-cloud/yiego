import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ARKESEL_URL = "https://sms.arkesel.com/api/v2/sms/send";
const SENDER_ID = "DTSIKA";

// ─── Retry schedules (seconds) ──────────────────────────────
const RATE_LIMIT_BACKOFF = [30, 60, 120, 300, 600]; // 429 / rate-limit errors
const SERVER_ERROR_BACKOFF = [10, 30, 60, 120, 300]; // 5xx / network errors

// ─── Throttle: 1 SMS per second ─────────────────────────────
const THROTTLE_MS = 1100; // slightly over 1s for safety

// ─── Max items to process per invocation ────────────────────
const BATCH_SIZE = 50;

// ─── Permanent failure detection ────────────────────────────
function isPermanentFailure(httpStatus: number, responseBody: string): boolean {
  // Auth failures
  if (httpStatus === 401 || httpStatus === 403) return true;
  // Bad request (invalid phone, malformed payload)
  if (httpStatus === 400) return true;
  // Check response body for permanent error indicators
  const lower = responseBody.toLowerCase();
  if (lower.includes("invalid key") || lower.includes("authentication failed")) return true;
  if (lower.includes("invalid phone") || lower.includes("invalid recipient")) return true;
  return false;
}

// ─── Rate limit detection ───────────────────────────────────
function isRateLimitError(httpStatus: number, responseBody: string): boolean {
  if (httpStatus === 429) return true;
  const lower = responseBody.toLowerCase();
  if (lower.includes("rate") && lower.includes("limit")) return true;
  if (lower.includes("too many request")) return true;
  return false;
}

// ─── Get backoff delay for next retry ───────────────────────
function getBackoffSeconds(attempt: number, isRateLimit: boolean): number {
  const schedule = isRateLimit ? RATE_LIMIT_BACKOFF : SERVER_ERROR_BACKOFF;
  const idx = Math.min(attempt - 1, schedule.length - 1);
  return schedule[idx];
}

// ─── Send single SMS via Arkesel ────────────────────────────
async function sendSMS(
  to: string,
  message: string,
  apiKey: string
): Promise<{
  ok: boolean;
  httpStatus: number;
  responseBody: string;
  messageId?: string;
  responseCode?: string;
}> {
  const payload = {
    sender: SENDER_ID,
    message,
    recipients: [to],
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const res = await fetch(ARKESEL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const bodyText = await res.text();
    const httpStatus = res.status;

    let messageId = "";
    let responseCode = "";
    try {
      const parsed = JSON.parse(bodyText);
      responseCode = String(parsed?.status || parsed?.code || "");
      messageId = String((parsed.data as any)?.[0]?.id || parsed?.data?.id || "");
    } catch { /* raw text */ }

    const ok = res.ok && (httpStatus === 200 || httpStatus === 201);
    return { ok, httpStatus, responseBody: bodyText, messageId, responseCode };
  } catch (err) {
    // Network error / timeout
    const errStr = String(err);
    const isTimeout = errStr.includes("abort") || errStr.includes("timeout");
    return {
      ok: false,
      httpStatus: 0,
      responseBody: isTimeout ? "Request timeout (15s)" : errStr,
    };
  }
}

// ─── Main handler ───────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  const maxRuntime = 55000; // 55s max to stay within 60s edge function limit

  try {
    const rawKey = Deno.env.get("ARKESEL_API_KEY");
    if (!rawKey) {
      return new Response(JSON.stringify({ error: "ARKESEL_API_KEY not configured" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const apiKey = rawKey.trim();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch items ready to process: queued or retrying with next_retry_at <= now
    const now = new Date().toISOString();
    const { data: items, error: fetchError } = await supabase
      .from("sms_queue")
      .select("*")
      .in("status", ["queued", "retrying"])
      .lte("next_retry_at", now)
      .order("next_retry_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error("[process-sms-queue] Fetch error:", fetchError);
      return new Response(JSON.stringify({ error: "Failed to fetch queue" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "Queue empty" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[process-sms-queue] Processing ${items.length} items`);

    let processed = 0;
    let sent = 0;
    let retried = 0;
    let failed = 0;

    for (const item of items) {
      // Check runtime limit
      if (Date.now() - startTime > maxRuntime) {
        console.log(`[process-sms-queue] Runtime limit reached after ${processed} items`);
        break;
      }

      // Mark as sending (optimistic lock)
      const { error: lockError } = await supabase
        .from("sms_queue")
        .update({ status: "sending", updated_at: new Date().toISOString() })
        .eq("id", item.id)
        .eq("status", item.status); // CAS: only update if status hasn't changed

      if (lockError) {
        console.warn(`[process-sms-queue] Lock failed for ${item.id}, skipping`);
        continue;
      }

      const attempt = (item.attempts || 0) + 1;

      // Send the SMS
      const result = await sendSMS(item.to_number, item.message, apiKey);

      const maskedPayload = JSON.stringify({
        sender: SENDER_ID,
        message: item.message,
        recipients: [item.to_number],
      });

      if (result.ok) {
        // ── Success ──
        await supabase.from("sms_queue").update({
          status: "sent",
          attempts: attempt,
          last_http_status: result.httpStatus,
          last_response: result.responseBody?.slice(0, 2000),
          last_error: null,
        }).eq("id", item.id);

        // Log to sms_logs
        await supabase.from("sms_logs").insert({
          to_number: item.to_number,
          message: item.message,
          event_type: item.event_type,
          user_id: item.user_id || null,
          agent_id: item.agent_id || null,
          order_id: item.order_id || null,
          reference: item.reference || null,
          status: "sent",
          attempts: attempt,
          http_status: result.httpStatus,
          provider_response: result.responseBody?.slice(0, 2000),
          provider_response_code: result.responseCode || null,
          provider_message_id: result.messageId || null,
          error_message: null,
          request_url: ARKESEL_URL,
          request_method: "POST",
          request_payload: maskedPayload,
        });

        sent++;
      } else if (isPermanentFailure(result.httpStatus, result.responseBody)) {
        // ── Permanent failure: don't retry ──
        const errorMsg = result.responseBody?.slice(0, 500) || "Permanent failure";

        await supabase.from("sms_queue").update({
          status: "failed",
          attempts: attempt,
          last_http_status: result.httpStatus,
          last_response: result.responseBody?.slice(0, 2000),
          last_error: errorMsg,
        }).eq("id", item.id);

        await supabase.from("sms_logs").insert({
          to_number: item.to_number,
          message: item.message,
          event_type: item.event_type,
          user_id: item.user_id || null,
          agent_id: item.agent_id || null,
          order_id: item.order_id || null,
          reference: item.reference || null,
          status: "failed",
          attempts: attempt,
          http_status: result.httpStatus,
          provider_response: result.responseBody?.slice(0, 2000),
          error_message: `Permanent failure: ${errorMsg}`,
          request_url: ARKESEL_URL,
          request_method: "POST",
          request_payload: maskedPayload,
        });

        failed++;
      } else if (attempt >= (item.max_retries || 5)) {
        // ── Max retries exhausted ──
        const errorMsg = result.responseBody?.slice(0, 500) || "Max retries exhausted";

        await supabase.from("sms_queue").update({
          status: "failed",
          attempts: attempt,
          last_http_status: result.httpStatus,
          last_response: result.responseBody?.slice(0, 2000),
          last_error: `Max retries (${item.max_retries}) exhausted: ${errorMsg}`,
        }).eq("id", item.id);

        await supabase.from("sms_logs").insert({
          to_number: item.to_number,
          message: item.message,
          event_type: item.event_type,
          user_id: item.user_id || null,
          agent_id: item.agent_id || null,
          order_id: item.order_id || null,
          reference: item.reference || null,
          status: "failed",
          attempts: attempt,
          http_status: result.httpStatus,
          provider_response: result.responseBody?.slice(0, 2000),
          error_message: `Max retries exhausted: ${errorMsg}`,
          request_url: ARKESEL_URL,
          request_method: "POST",
          request_payload: maskedPayload,
        });

        failed++;
      } else {
        // ── Temporary failure: schedule retry ──
        const rateLimit = isRateLimitError(result.httpStatus, result.responseBody);
        const backoffSec = getBackoffSeconds(attempt, rateLimit);
        const nextRetry = new Date(Date.now() + backoffSec * 1000).toISOString();

        await supabase.from("sms_queue").update({
          status: "retrying",
          attempts: attempt,
          next_retry_at: nextRetry,
          last_http_status: result.httpStatus,
          last_response: result.responseBody?.slice(0, 2000),
          last_error: `Retry ${attempt}/${item.max_retries}: ${result.responseBody?.slice(0, 200)}`,
        }).eq("id", item.id);

        // Log the retry attempt
        await supabase.from("sms_logs").insert({
          to_number: item.to_number,
          message: item.message,
          event_type: item.event_type,
          user_id: item.user_id || null,
          agent_id: item.agent_id || null,
          order_id: item.order_id || null,
          reference: item.reference || null,
          status: "retrying",
          attempts: attempt,
          http_status: result.httpStatus,
          provider_response: result.responseBody?.slice(0, 2000),
          error_message: `Retry scheduled at ${nextRetry} (attempt ${attempt}, backoff ${backoffSec}s, rate_limit=${rateLimit})`,
          request_url: ARKESEL_URL,
          request_method: "POST",
          request_payload: maskedPayload,
        });

        retried++;
      }

      processed++;

      // Throttle: wait between sends to respect rate limits
      if (processed < items.length) {
        await new Promise(r => setTimeout(r, THROTTLE_MS));
      }
    }

    const summary = { processed, sent, retried, failed, total_queued: items.length };
    console.log(`[process-sms-queue] Done:`, JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[process-sms-queue] Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal error", details: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
