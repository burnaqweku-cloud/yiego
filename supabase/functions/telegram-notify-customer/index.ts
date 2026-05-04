// Notifies a Telegram customer when their order changes status.
// Called by the Postgres trigger `notify_telegram_on_delivered()` (and may
// also be invoked from edge functions / admin tooling). Auth model:
//   - Internal trigger calls send `x-internal-key: <NOTIFY_TRIGGER_SECRET>`
//   - Admin tools may pass the service-role key in the same header
// Request body: { order_id: string, event?: "delivered" | "failed" | "processing" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMessage, buildOrderStatusMessage, type OrderStatusEvent } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ── Auth: accept the dedicated trigger secret OR the service-role key ──
  const internalKey = req.headers.get("x-internal-key") || "";
  const triggerSecret = Deno.env.get("NOTIFY_TRIGGER_SECRET") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorized =
    (!!triggerSecret && internalKey === triggerSecret) ||
    (!!serviceRoleKey && internalKey === serviceRoleKey);
  if (!authorized) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    const orderId: string | undefined = body.order_id;
    const event: string = body.event || "delivered";

    if (!orderId) return jsonResponse({ error: "order_id required" }, 400);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey,
    );

    const { data: order, error } = await supa
      .from("orders")
      .select(
        "order_id, network, bundle_size_gb, recipient_number, status, total_paid, telegram_chat_id, created_at",
      )
      .eq("order_id", orderId)
      .maybeSingle();

    if (error || !order) return jsonResponse({ error: "Order not found" }, 404);

    if (!order.telegram_chat_id) {
      return jsonResponse({ skipped: true, reason: "not a telegram order" });
    }

    // Resolve the canonical event so the shared copy stays consistent
    // even when the trigger fires with a stale `event` value.
    let resolvedEvent: OrderStatusEvent;
    if (event === "delivered" || order.status === "Delivered") {
      resolvedEvent = "delivered";
    } else if (event === "failed" || order.status === "Failed") {
      resolvedEvent = "failed";
    } else {
      resolvedEvent = "processing";
    }

    await sendMessage(
      order.telegram_chat_id,
      buildOrderStatusMessage(order, resolvedEvent),
    );

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error("[telegram-notify-customer] error:", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});
