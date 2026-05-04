// notify-event — central event-to-notification dispatcher.
// Builds title/message/deep-link for a known event, writes the in-app
// `notifications` row(s), and fires the OneSignal push via send-push-notification.
// Designed to be called from DB triggers (pg_net), other edge functions, and admin tools.
//
// Idempotency: each event uses a deterministic idempotencyKey so duplicate triggers
// (webhook + polling + manual admin) cannot produce a second push or duplicate in-app row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMessage, buildOrderStatusMessage } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key",
};

const SITE_URL = "https://datasika.com";

type EventType =
  | "order_delivered"            // user → "Your MTN 5GB has been delivered"
  | "agent_order_delivered"      // agent → "Order delivered to customer"
  | "agent_new_sale"             // agent → "New sale from your store"
  | "support_reply"              // user/agent → "Support replied to your request"
  | "ai_ticket_resolved"         // user → "Your support ticket has been resolved"
  | "withdrawal_paid"            // agent → "Withdrawal paid"
  | "withdrawal_approved"        // agent → "Withdrawal approved"
  | "withdrawal_rejected"        // agent → "Withdrawal rejected, funds restored"
  | "subscription_expiring"      // agent → "Subscription expires in N days"
  | "subscription_expired"       // agent → "Subscription expired"
  | "admin_new_withdrawal"       // admin → "New withdrawal request"
  | "admin_new_ai_ticket"        // admin → "New AI support ticket"
  | "admin_critical_alert"       // admin → custom critical
  // Telegram-bot direct messages (sent to a chat_id, not a user_id):
  | "telegram_order_delivered"   // bot user → "Bundle delivered" message
  | "telegram_order_failed";     // bot user → "Delivery failed" message

interface EventPayload {
  event: EventType;
  // Recipient targeting (one of):
  user_id?: string | null;       // direct user (writes notifications row + targets player_id)
  agent_id?: string | null;      // agent record id (resolved to user_id)
  to_admins?: boolean;           // broadcast to all admin/staff role users
  // Event details (used to build copy + deep link):
  data?: Record<string, any>;
  // Optional explicit overrides:
  idempotencyKey?: string;
  url?: string;
  // Optional: skip push (in-app only)
  inAppOnly?: boolean;
  // Optional: skip in-app (push only)
  pushOnly?: boolean;
}

// Format a Ghana phone number to local 0XXXXXXXXX (full, unmasked).
// Customer-facing notifications need the FULL recipient number — they're often
// buying for someone else and need to verify which order this is about.
function formatPhoneFull(raw: string | undefined | null): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    // If it already looks like a Ghana national format (10 digits starting with 0), keep
    if (last10.startsWith("0")) return last10;
    return `0${last10.slice(-9)}`;
  }
  return raw;
}
function shortOrderId(id: string | undefined | null): string {
  if (!id) return "";
  const s = String(id).toUpperCase();
  // If it already has a DS-XXX prefix style, keep that prefix + last 6
  const m = s.match(/^([A-Z]{2,4})[-_]?(.+)$/);
  if (m && m[2].length >= 6) return `${m[1]}-${m[2].slice(-6)}`;
  return s.length > 6 ? `…${s.slice(-6)}` : s;
}
// Friendly issue-type labels for support tickets
const ISSUE_TYPE_LABELS: Record<string, string> = {
  order_not_delivered: "your undelivered order",
  order_not_created: "your missing order",
  deposit_not_reflected: "your deposit not reflecting",
  wallet_issue: "your wallet issue",
  account_issue: "your account issue",
  other: "your support request",
};
function friendlyIssueType(raw: string | undefined | null): string {
  if (!raw) return "your support request";
  return ISSUE_TYPE_LABELS[String(raw)] || "your support request";
}
function friendlyDate(iso: string | undefined | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra",
    });
  } catch { return ""; }
}
function clip(s: string | undefined | null, max: number): string {
  if (!s) return "";
  const str = String(s).trim();
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function buildContent(event: EventType, data: Record<string, any> = {}) {
  const network = data.network ? String(data.network) : "";
  const bundle = data.bundle_size_gb ? `${data.bundle_size_gb}GB` : "";
  const orderId = data.order_id || "";
  const orderShort = shortOrderId(orderId);
  const recipientFull = formatPhoneFull(data.recipient_number || data.customer_phone || "");
  const amount = data.amount != null ? `GHS ${Number(data.amount).toFixed(2)}` : "";
  const days = data.days_remaining;
  const ticketCode = data.ticket_code || "";
  const withdrawalShort = shortOrderId(data.withdrawal_id || data.withdrawal_reference || "");
  const momoNumber = formatPhoneFull(data.momo_number || data.payout_number || "");
  const planName = data.plan_name ? String(data.plan_name) : "agent";
  const expiryDateFriendly = friendlyDate(data.expires_at || data.expiry_date);

  switch (event) {
    case "order_delivered":
      return {
        title: "Data Delivered ✅",
        message: [
          `Your ${network} ${bundle} bundle`,
          recipientFull ? `to ${recipientFull}` : null,
          `was delivered successfully.`,
          orderShort ? `Order ${orderShort}${amount ? ` · ${amount}` : ""}.` : (amount ? `${amount}.` : null),
        ].filter(Boolean).join(" "),
        url: `${SITE_URL}/dashboard/orders`,
        type: "order",
        related_entity_type: orderId ? "order" : null,
        related_entity_id: orderId || null,
      };
    case "agent_order_delivered":
      return {
        title: "Customer Order Delivered ✅",
        message: `${network} ${bundle} delivered to ${recipientFull || "customer"}.${orderShort ? ` Order ${orderShort}` : ""}${amount ? ` · ${amount}` : ""}.`,
        url: `${SITE_URL}/agent/orders`,
        type: "order",
        related_entity_type: orderId ? "order" : null,
        related_entity_id: orderId || null,
      };
    case "agent_new_sale":
      return {
        title: "New Sale on Your Store 🎉",
        message: `${network} ${bundle} order to ${recipientFull || "a customer"} for ${amount || "GHS —"}.${orderShort ? ` Order ${orderShort}.` : ""}`,
        url: `${SITE_URL}/agent/orders`,
        type: "order",
        related_entity_type: orderId ? "order" : null,
        related_entity_id: orderId || null,
      };
    case "support_reply": {
      const agentName = data.agent_name ? String(data.agent_name).trim() : "";
      const issue = friendlyIssueType(data.issue_type);
      const codeLabel = ticketCode || (data.ticket_id ? shortOrderId(data.ticket_id) : "");
      const responder = agentName || "Our team";
      return {
        title: "Agent Replied 💬",
        message: agentName
          ? `${responder} responded to your ticket ${codeLabel} about ${issue}. Tap to view the conversation.`
          : `${responder} responded to your ticket ${codeLabel} about ${issue}. Tap to view the conversation.`,
        url: data.is_agent
          ? `${SITE_URL}/agent/support`
          : `${SITE_URL}/dashboard/support`,
        type: "support",
        related_entity_type: data.ticket_id ? "ticket" : null,
        related_entity_id: data.ticket_id || codeLabel || null,
      };
    }
    case "ai_ticket_resolved": {
      const issue = friendlyIssueType(data.issue_type);
      const codeLabel = ticketCode || (data.ticket_id ? shortOrderId(data.ticket_id) : "");
      const summary = clip(data.resolution_message || data.resolution_notes, 80)
        || "If you're satisfied, no further action needed";
      return {
        title: "Support Ticket Resolved ✅",
        message: `Your ticket ${codeLabel} about ${issue} has been resolved. ${summary}. Tap to view details or reopen if needed.`,
        url: `${SITE_URL}/dashboard/support`,
        type: "support",
        related_entity_type: data.ticket_id ? "ticket" : null,
        related_entity_id: data.ticket_id || codeLabel || null,
      };
    }
    case "withdrawal_paid":
      return {
        title: "Withdrawal Paid 💸",
        message: `${amount} has been sent to your MoMo${momoNumber ? ` ${momoNumber}` : ""}.${withdrawalShort ? ` Reference ${withdrawalShort}.` : ""}`,
        url: `${SITE_URL}/agent/withdrawals`,
        type: "wallet",
        related_entity_type: data.withdrawal_id ? "withdrawal" : null,
        related_entity_id: data.withdrawal_id || null,
      };
    case "withdrawal_approved":
      return {
        title: "Withdrawal Approved ✅",
        message: `Your withdrawal of ${amount}${momoNumber ? ` to ${momoNumber}` : ""} was approved. Funds will arrive shortly.${withdrawalShort ? ` Reference ${withdrawalShort}.` : ""}`,
        url: `${SITE_URL}/agent/withdrawals`,
        type: "wallet",
        related_entity_type: data.withdrawal_id ? "withdrawal" : null,
        related_entity_id: data.withdrawal_id || null,
      };
    case "withdrawal_rejected":
      return {
        title: "Withdrawal Not Approved",
        message: `Your withdrawal of ${amount} wasn't approved. The funds have been returned to your balance.${withdrawalShort ? ` Reference ${withdrawalShort}.` : ""} Tap to see the reason.`,
        url: `${SITE_URL}/agent/withdrawals`,
        type: "wallet",
        related_entity_type: data.withdrawal_id ? "withdrawal" : null,
        related_entity_id: data.withdrawal_id || null,
      };
    case "subscription_expiring":
      return {
        title: days === 1 ? "Subscription Expires Tomorrow" : `Subscription Expires in ${days} Days`,
        message: `Your ${planName} agent subscription expires${expiryDateFriendly ? ` on ${expiryDateFriendly}` : days === 1 ? " tomorrow" : ` in ${days} days`}. Renew now to keep your store live and bulk orders working.`,
        url: `${SITE_URL}/agent/subscription`,
        type: "system",
        related_entity_type: data.subscription_id ? "subscription" : null,
        related_entity_id: data.subscription_id || null,
      };
    case "subscription_expired":
      return {
        title: "Subscription Expired",
        message: `Your ${planName} subscription has expired. Your store is now offline. Renew to reactivate it.`,
        url: `${SITE_URL}/agent/subscription`,
        type: "system",
        related_entity_type: data.subscription_id ? "subscription" : null,
        related_entity_id: data.subscription_id || null,
      };
    case "admin_new_withdrawal":
      return {
        title: "New Withdrawal Request",
        message: `${data.store_name || "An agent"} requested ${amount}.`,
        url: `${SITE_URL}/admin/agent-withdrawals`,
        type: "system",
        related_entity_type: data.withdrawal_id ? "withdrawal" : null,
        related_entity_id: data.withdrawal_id || null,
      };
    case "admin_new_ai_ticket":
      return {
        title: "New AI Support Ticket",
        message: `${ticketCode ? `${ticketCode}: ` : ""}${data.issue_type || "New escalation"} from ${data.customer_email || data.customer_phone || "user"}.`,
        url: `${SITE_URL}/admin/ai-tickets/${data.ticket_id || ""}`,
        type: "system",
        related_entity_type: data.ticket_id ? "ticket" : null,
        related_entity_id: data.ticket_id || null,
      };
    case "admin_critical_alert":
      return {
        title: data.title || "Critical System Alert",
        message: data.message || "A critical event needs your attention.",
        url: data.url || `${SITE_URL}/admin/dashboard`,
        type: "system",
        related_entity_type: null,
        related_entity_id: null,
      };
  }
}

async function firePush(opts: {
  title: string;
  message: string;
  url?: string;
  playerIds?: string[];
  segment?: "All" | "Agents" | "Users" | "Admins";
  filters?: any[];
  idempotencyKey?: string;
  entityType?: string;
  entityId?: string;
}) {
  try {
    const fnUrl = Deno.env.get("SUPABASE_URL")! + "/functions/v1/send-push-notification";
    // Prefer dedicated trigger secret; fall back to service role for backward compat
    const key =
      Deno.env.get("NOTIFY_TRIGGER_SECRET") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(fnUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": key },
      body: JSON.stringify({ ...opts, triggeredBy: "system" }),
    });
  } catch (e) {
    console.error("[notify-event] firePush failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: accept dedicated trigger secret, service-role key (legacy), or admin/staff JWT
  const internalKey = req.headers.get("x-internal-key");
  const triggerSecret = Deno.env.get("NOTIFY_TRIGGER_SECRET");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let isInternal =
    (!!triggerSecret && internalKey === triggerSecret) ||
    (!!serviceRoleKey && internalKey === serviceRoleKey);
  // Vault fallback: when env-cached trigger secret is stale, verify against vault.
  if (!isInternal && internalKey) {
    try {
      const rpcRes = await supabase.rpc("verify_notify_trigger_secret", { p_secret: internalKey });
      console.log("[notify-event] vault verify:", JSON.stringify({ data: rpcRes.data, error: rpcRes.error?.message, hasEnv: !!triggerSecret, keyLen: internalKey.length }));
      if (rpcRes.data === true) isInternal = true;
    } catch (e) {
      console.error("[notify-event] vault verify exception:", e);
    }
  }
  let isAuthorized = isInternal;

  if (!isAuthorized) {
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (user) {
        const { data: role } = await supabase
          .from("user_roles").select("role")
          .eq("user_id", user.id).in("role", ["admin", "staff"]).maybeSingle();
        if (role) isAuthorized = true;
      }
    }
  }

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: EventPayload = await req.json();
    const { event, data = {}, inAppOnly, pushOnly } = body;

    if (!event) {
      return new Response(JSON.stringify({ error: "event is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Telegram-bot direct events (short-circuit; no in-app/push) ──
    if (event === "telegram_order_delivered" || event === "telegram_order_failed") {
      const orderId: string | undefined = data.order_id;
      if (!orderId) {
        return new Response(JSON.stringify({ error: "order_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: order, error: oerr } = await supabase
        .from("orders")
        .select("order_id, network, bundle_size_gb, recipient_number, telegram_chat_id, status")
        .eq("order_id", orderId)
        .maybeSingle();
      if (oerr || !order) {
        return new Response(JSON.stringify({ error: "Order not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!order.telegram_chat_id) {
        return new Response(JSON.stringify({ skipped: true, reason: "not a telegram order" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const resolvedEvent = event === "telegram_order_delivered" ? "delivered" : "failed";
      const text = buildOrderStatusMessage(order, resolvedEvent);

      try {
        const res = await sendMessage(order.telegram_chat_id, text);
        return new Response(JSON.stringify({ success: true, telegram: res.ok }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        console.error("[notify-event] telegram send failed:", e);
        return new Response(JSON.stringify({ error: String(e) }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const content = buildContent(event, data);
    if (!content) {
      return new Response(JSON.stringify({ error: `Unknown event: ${event}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build deterministic idempotency key per event when not provided
    const idemKey = body.idempotencyKey
      || `${event}:${data.order_id || data.ticket_id || data.withdrawal_id || data.subscription_id || data.agent_id || data.user_id || crypto.randomUUID()}:${data.suffix || ""}`;

    // Resolve target user IDs
    let userIds: string[] = [];
    if (body.user_id) {
      userIds = [body.user_id];
    } else if (body.agent_id) {
      const { data: agent } = await supabase
        .from("agents").select("user_id").eq("id", body.agent_id).maybeSingle();
      if (agent?.user_id) userIds = [agent.user_id];
    }

    let adminUserIds: string[] = [];
    if (body.to_admins) {
      const { data: admins } = await supabase
        .from("user_roles").select("user_id").in("role", ["admin", "staff"]);
      adminUserIds = (admins || []).map((r: any) => r.user_id).filter(Boolean);
    }

    const allRecipientUserIds = Array.from(new Set([...userIds, ...adminUserIds]));

    // 1) Write in-app notifications (one row per recipient, dedup'd via idempotency)
    if (!pushOnly && allRecipientUserIds.length > 0) {
      // Dedup check: same user + idempotency_key already inserted?
      // We use (user_id, link, title, created_at>recent) as a soft dedup since notifications has no idem column.
      // Better: skip in-app insertion if a row with the same title+user_id exists in last 6 hours for this idemKey signature.
      const sinceIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const rows = [] as any[];
      for (const uid of allRecipientUserIds) {
        const { data: dup } = await supabase
          .from("notifications").select("id")
          .eq("user_id", uid).eq("title", content.title).eq("message", content.message)
          .gte("created_at", sinceIso).limit(1).maybeSingle();
        if (dup) continue;
        rows.push({
          user_id: uid,
          title: content.title,
          message: content.message,
          type: content.type,
          link: body.url || content.url,
          read: false,
          related_entity_type: (content as any).related_entity_type ?? null,
          related_entity_id: (content as any).related_entity_id ?? null,
        });
      }
      if (rows.length > 0) {
        await supabase.from("notifications").insert(rows);
      }
    }

    // 2) Push notification
    if (!inAppOnly) {
      // Direct user/agent push
      if (userIds.length > 0) {
        const { data: players } = await supabase
          .from("onesignal_players").select("player_id, user_id")
          .in("user_id", userIds).eq("is_active", true);
        const playerIds = (players || []).map((p: any) => p.player_id).filter(Boolean);
        if (playerIds.length > 0) {
          await firePush({
            title: content.title,
            message: content.message,
            url: body.url || content.url,
            playerIds,
            idempotencyKey: `${idemKey}:user`,
            entityType: event,
            entityId: data.order_id || data.ticket_id || data.withdrawal_id || null,
          });
        }
      }

      // Admin broadcast push (use admin role tag)
      if (body.to_admins && adminUserIds.length > 0) {
        const { data: adminPlayers } = await supabase
          .from("onesignal_players").select("player_id")
          .in("user_id", adminUserIds).eq("is_active", true);
        const playerIds = (adminPlayers || []).map((p: any) => p.player_id).filter(Boolean);
        if (playerIds.length > 0) {
          await firePush({
            title: content.title,
            message: content.message,
            url: body.url || content.url,
            playerIds,
            idempotencyKey: `${idemKey}:admin`,
            entityType: event,
            entityId: data.order_id || data.ticket_id || data.withdrawal_id || null,
          });
        }
      }
    }

    // 3) Telegram admin fan-out (best-effort, non-blocking) for admin/critical events
    if (body.to_admins) {
      try {
        const tgUrl = Deno.env.get("SUPABASE_URL")! + "/functions/v1/telegram-notify-admin";
        const key = Deno.env.get("NOTIFY_TRIGGER_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        await fetch(tgUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-key": key },
          body: JSON.stringify({
            event,
            title: content.title,
            message: content.message,
            url: body.url || content.url,
            data,
          }),
        }).catch((e) => console.error("[notify-event] telegram fan-out failed:", e));
      } catch (e) {
        console.error("[notify-event] telegram fan-out error:", e);
      }
    }

    return new Response(JSON.stringify({ success: true, event, recipients: allRecipientUserIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[notify-event] error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
