// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Arkesel V2 constants ───────────────────────────────────
const ARKESEL_URL = "https://sms.arkesel.com/api/v2/sms/send";
const SENDER_ID = "DTSIKA";

// ─── Approved SMS event types (whitelist) ───────────────────
const APPROVED_EVENTS = new Set([
  "welcome_sms",
  "wallet_deposit_success",
  "wallet_deposit_failed",
  "agent_application_received",
  "agent_approved",
  "agent_discount_expiring",
  "agent_subscription_active",
  "subscription_expiring_soon",
  "subscription_expires_today",
  "subscription_expired",
  "withdrawal_requested",
  "withdrawal_paid",
  "admin_withdrawal_alert",
]);

// ─── Default SMS templates (clean, no prefix) ───────────────
const DEFAULT_TEMPLATES: Record<string, string> = {
  welcome_sms:
    "Welcome {name}. Your account has been created successfully.",
  wallet_deposit_success:
    "Your wallet has been credited with GHS {amount}. Deposit ID: {reference}. New balance: GHS {balance}.",
  wallet_deposit_failed:
    "Your payment was not successful. Please try again or contact support if the issue persists.",
  agent_application_received:
    "Your application has been submitted successfully. Our team will review it and get back to you soon.",
  agent_approved:
    "Congratulations. Your application has been approved. Activate your store within 24 hours and enjoy the discounted activation fee of GHS 35. After 24 hours, the fee returns to GHS 50.",
  agent_subscription_active:
    "Your store has been activated successfully. You can now start selling and managing your store.",
  agent_discount_expiring:
    "Reminder: your discounted activation fee of GHS 35 expires in {hours_left} hour(s). Activate now before it returns to GHS 50.",
  subscription_expiring_soon:
    "Reminder: your store subscription expires in {days_left} day(s). Renew early to keep your store active without interruption.",
  subscription_expires_today:
    "Reminder: your store subscription expires today. Renew now to avoid interruption to your store access.",
  subscription_expired:
    "Your store subscription has expired. Renew now to restore access and continue selling.",
  withdrawal_requested:
    "Your withdrawal request of GHS {amount} has been received and is being processed.",
  withdrawal_paid:
    "Your withdrawal of GHS {amount} has been paid successfully.",
  admin_withdrawal_alert:
    "New withdrawal request: GHS {amount} from {agent_name}. Please review and process.",
};

// ─── Phone normalization ────────────────────────────────────
function normalizeGhanaNumber(phone: string): string | null {
  const cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (/^0[2-5][0-9]{8}$/.test(cleaned)) return "233" + cleaned.slice(1);
  if (/^\+233[2-5][0-9]{8}$/.test(cleaned)) return cleaned.slice(1);
  if (/^233[2-5][0-9]{8}$/.test(cleaned)) return cleaned;
  return null;
}

// ─── Error classification ───────────────────────────────────
function classifyError(httpStatus: number, body: string): string {
  if (httpStatus === 401) return "Authentication failed – check ARKESEL_API_KEY";
  if (httpStatus === 402) return "Insufficient Arkesel balance / credit";
  if (httpStatus === 403) return "Inactive gateway or Sender ID not approved";
  if (httpStatus === 422) return "Validation error – check recipient format or payload";
  if (httpStatus >= 500) return "Arkesel server error (temporary)";
  try {
    const parsed = JSON.parse(body);
    if (parsed?.message) return String(parsed.message);
  } catch { /* ignore */ }
  return `HTTP ${httpStatus}: ${body.slice(0, 200)}`;
}

// ─── Resolve template for event ─────────────────────────────
async function resolveTemplate(
  supabase: any,
  eventType: string
): Promise<string | null> {
  const templateKey = `sms_template_${eventType}`;
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", templateKey)
    .maybeSingle();

  if (data?.value && data.value.trim().length > 0) {
    return data.value.trim();
  }

  return DEFAULT_TEMPLATES[eventType] || null;
}

// ─── Fill placeholders ──────────────────────────────────────
function fillPlaceholders(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  if (!vars.name || vars.name.trim() === "") {
    vars.name = "there";
  }
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value || "");
  }
  return result;
}

// ─── Generate idempotency key ───────────────────────────────
function generateIdempotencyKey(
  eventType: string,
  toNumber: string,
  orderId: string | null,
  reference: string | null,
  agentId: string | null
): string {
  const parts = [
    eventType,
    toNumber,
    orderId || "",
    reference || "",
    agentId || "",
  ];
  return parts.join(":");
}

// ─── Arkesel SMS sender (used only for test/verify actions) ─
async function sendArkeselSMS(
  to: string,
  message: string,
): Promise<{
  ok: boolean;
  messageId?: string;
  httpStatus?: number;
  responseRaw?: string;
  responseCode?: string;
  error?: string;
}> {
  const rawKey = Deno.env.get("ARKESEL_API_KEY");
  if (!rawKey) return { ok: false, error: "ARKESEL_API_KEY not configured", httpStatus: 0 };
  const apiKey = rawKey.trim();

  const payload = {
    sender: SENDER_ID,
    message,
    recipients: [to],
  };

  try {
    const res = await fetch(ARKESEL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const bodyText = await res.text();
    const httpStatus = res.status;

    let responseCode = "";
    try {
      const parsed = JSON.parse(bodyText);
      responseCode = String(parsed?.status || parsed?.code || "");
    } catch { /* raw text */ }

    if (res.ok && (httpStatus === 200 || httpStatus === 201)) {
      let messageId = "";
      try {
        const parsed = JSON.parse(bodyText);
        messageId = String((parsed.data as any)?.[0]?.id || parsed?.data?.id || "");
      } catch { /* ignore */ }
      return { ok: true, messageId, httpStatus, responseRaw: bodyText, responseCode };
    }

    return { ok: false, error: classifyError(httpStatus, bodyText), httpStatus, responseRaw: bodyText, responseCode };
  } catch (err) {
    return { ok: false, error: String(err), httpStatus: 0, responseRaw: String(err) };
  }
}

// ─── Main handler ───────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      to, message, event_type, user_id, agent_id, order_id, reference,
      skip_checks, action, template_vars,
    } = body;

    // ─── Verify API Key action ──────────────────────────────
    if (action === "verify_api_key") {
      const rawKey = Deno.env.get("ARKESEL_API_KEY");
      if (!rawKey) {
        return new Response(JSON.stringify({ valid: false, error: "ARKESEL_API_KEY not configured" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const trimmedKey = rawKey.trim();
      try {
        const res = await fetch("https://sms.arkesel.com/api/v2/clients/balance-details", {
          method: "GET",
          headers: { "api-key": trimmedKey },
        });
        const bodyText = await res.text();
        if (res.ok) {
          return new Response(JSON.stringify({ valid: true, http_status: res.status, response: bodyText }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ valid: false, http_status: res.status, error: classifyError(res.status, bodyText), response: bodyText }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ valid: false, error: String(err) }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── Get default templates action ───────────────────────
    if (action === "get_default_templates") {
      return new Response(JSON.stringify({ templates: DEFAULT_TEMPLATES }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!to || !event_type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, event_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Whitelist check: block unapproved events ───────────
    if (!skip_checks && !APPROVED_EVENTS.has(event_type)) {
      console.warn(`[send-sms] Blocked unapproved event_type: ${event_type}`);
      return new Response(
        JSON.stringify({ sent: false, reason: "event_not_approved", event_type }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Resolve the final message
    let finalMessage = message;
    if (!finalMessage) {
      const template = await resolveTemplate(supabase, event_type);
      if (!template) {
        return new Response(
          JSON.stringify({ error: `No template found for event: ${event_type}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      finalMessage = fillPlaceholders(template, template_vars || {});
    }

    // Normalize phone
    const normalizedPhone = normalizeGhanaNumber(to);
    if (!normalizedPhone) {
      await supabase.from("sms_logs").insert({
        to_number: to,
        message: finalMessage,
        event_type,
        user_id: user_id || null,
        agent_id: agent_id || null,
        order_id: order_id || null,
        reference: reference || null,
        status: "skipped",
        error_message: "Invalid Ghana number",
        attempts: 0,
        request_url: ARKESEL_URL,
        request_method: "POST",
      });
      return new Response(JSON.stringify({ sent: false, reason: "invalid_number" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Test SMS: send directly (skip queue) ───────────────
    if (skip_checks) {
      const result = await sendArkeselSMS(normalizedPhone, finalMessage);
      const maskedPayload = JSON.stringify({
        sender: SENDER_ID,
        message: finalMessage,
        recipients: [normalizedPhone],
      });
      await supabase.from("sms_logs").insert({
        to_number: normalizedPhone,
        message: finalMessage,
        event_type,
        user_id: user_id || null,
        agent_id: agent_id || null,
        order_id: order_id || null,
        reference: reference || null,
        status: result.ok ? "sent" : "failed",
        request_url: ARKESEL_URL,
        request_method: "POST",
        request_payload: maskedPayload,
        http_status: result.httpStatus || null,
        provider_response: result.responseRaw || null,
        provider_response_code: result.responseCode || null,
        provider_message_id: result.messageId || null,
        error_message: result.error || null,
        attempts: 1,
      });
      return new Response(JSON.stringify({
        sent: result.ok,
        message_id: result.messageId || null,
        error: result.error || null,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Production SMS: check toggles then enqueue ─────────

    // Check global SMS toggle
    const { data: globalToggle } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "sms_enabled")
      .maybeSingle();

    if (!globalToggle || globalToggle.value !== "true") {
      await supabase.from("sms_logs").insert({
        to_number: normalizedPhone,
        message: finalMessage,
        event_type,
        user_id: user_id || null,
        agent_id: agent_id || null,
        order_id: order_id || null,
        reference: reference || null,
        status: "skipped",
        error_message: "SMS globally disabled",
        attempts: 0,
        request_url: ARKESEL_URL,
        request_method: "POST",
      });
      return new Response(JSON.stringify({ sent: false, reason: "disabled" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check per-event toggle
    const eventKey = `sms_${event_type}`;
    const { data: eventToggle } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", eventKey)
      .maybeSingle();

    if (!eventToggle || eventToggle.value !== "true") {
      await supabase.from("sms_logs").insert({
        to_number: normalizedPhone,
        message: finalMessage,
        event_type,
        user_id: user_id || null,
        agent_id: agent_id || null,
        order_id: order_id || null,
        reference: reference || null,
        status: "skipped",
        error_message: `Event ${event_type} disabled`,
        attempts: 0,
        request_url: ARKESEL_URL,
        request_method: "POST",
      });
      return new Response(JSON.stringify({ sent: false, reason: "event_disabled" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Idempotency: check sms_queue for existing entry ────
    const idempotencyKey = generateIdempotencyKey(
      event_type, normalizedPhone, order_id || null, reference || null, agent_id || null
    );

    // Check if already queued/sending/sent/retrying
    const { data: existing } = await supabase
      .from("sms_queue")
      .select("id, status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existing) {
      const skipStatuses = ["queued", "sending", "sent", "retrying"];
      if (skipStatuses.includes(existing.status)) {
        await supabase.from("sms_logs").insert({
          to_number: normalizedPhone,
          message: finalMessage,
          event_type,
          user_id: user_id || null,
          agent_id: agent_id || null,
          order_id: order_id || null,
          reference: reference || null,
          status: "skipped",
          error_message: `Deduped: already ${existing.status} (queue id: ${existing.id})`,
          attempts: 0,
          request_url: ARKESEL_URL,
          request_method: "POST",
        });
        return new Response(JSON.stringify({ sent: false, reason: "deduped", queue_status: existing.status }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (existing.status === "failed") {
        await supabase.from("sms_queue").delete().eq("id", existing.id);
      }
    }

    // Also check sms_logs for already-sent
    if (order_id || reference || agent_id) {
      let logQuery = supabase
        .from("sms_logs")
        .select("id")
        .eq("event_type", event_type)
        .eq("to_number", normalizedPhone)
        .eq("status", "sent")
        .limit(1);
      if (order_id) logQuery = logQuery.eq("order_id", order_id);
      if (reference) logQuery = logQuery.eq("reference", reference);
      if (agent_id) logQuery = logQuery.eq("agent_id", agent_id);
      const { data: exactMatch } = await logQuery;
      if (exactMatch && exactMatch.length > 0) {
        return new Response(JSON.stringify({ sent: false, reason: "deduped_from_logs" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── Enqueue the SMS ────────────────────────────────────
    const { error: insertError } = await supabase.from("sms_queue").insert({
      idempotency_key: idempotencyKey,
      to_number: normalizedPhone,
      message: finalMessage,
      event_type,
      user_id: user_id || null,
      agent_id: agent_id || null,
      order_id: order_id || null,
      reference: reference || null,
      status: "queued",
      attempts: 0,
      max_retries: 5,
      next_retry_at: new Date().toISOString(),
    });

    if (insertError) {
      if (insertError.code === "23505") {
        return new Response(JSON.stringify({ sent: false, reason: "deduped", detail: "already_queued" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw insertError;
    }

    console.log(`[send-sms] Enqueued SMS: ${event_type} -> ${normalizedPhone}, key=${idempotencyKey}`);

    return new Response(JSON.stringify({ queued: true, idempotency_key: idempotencyKey }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[send-sms] Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal error", details: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
