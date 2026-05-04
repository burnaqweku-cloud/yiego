// deno-lint-ignore-file no-explicit-any
// Phase 2 — Bulk Dispatch monitor.
// Reads alert thresholds from site_settings.bulk_dispatch_alert_thresholds and:
//   1. Counts queued orders across both `orders` and `agent_orders` (queue_state='queued').
//   2. Finds the oldest queued order's age in minutes.
//   3. Reads the current dispatch_mode and how long ago it was set (if 'manual_bulk').
//   4. Fires Telegram admin alerts via telegram-notify-admin when any threshold is exceeded.
//   5. Writes a `queue_alert_fired` row to bulk_dispatch_audit per fired alert.
//
// Re-fire suppression: an alert of the same kind is only re-fired if there is no
// `queue_alert_fired` audit row of the same kind in the last `cooldown_minutes`.
// (Default 30 minutes, configurable via the same settings blob.)
//
// Designed to be called from a cron (every 5 min) or manually by an admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
};

const SITE_URL = "https://datasika.com";

interface Thresholds {
  queue_size: number;
  oldest_pending_minutes: number;
  manual_mode_max_hours: number;
  cooldown_minutes?: number;
}

const DEFAULTS: Thresholds = {
  queue_size: 20,
  oldest_pending_minutes: 30,
  manual_mode_max_hours: 2,
  cooldown_minutes: 30,
};

function parseSettings(raw: any): any {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function getThresholds(supa: any): Promise<Thresholds> {
  const { data } = await supa
    .from("site_settings")
    .select("value")
    .eq("key", "bulk_dispatch_alert_thresholds")
    .maybeSingle();
  const parsed = parseSettings(data?.value);
  return {
    ...DEFAULTS,
    ...(parsed && typeof parsed === "object" ? parsed : {}),
  };
}

async function getDispatchModeRow(supa: any): Promise<{ mode: string; updated_at?: string }> {
  const { data } = await supa
    .from("site_settings")
    .select("value")
    .eq("key", "dispatch_mode")
    .maybeSingle();
  const parsed = parseSettings(data?.value);
  let mode = parsed?.mode || "auto";
  if (mode === "manual") mode = "manual_bulk";
  if (mode === "automatic") mode = "auto";
  return { mode, updated_at: parsed?.updated_at };
}

async function recentAuditFiredAt(supa: any, kind: string, cooldownMin: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - cooldownMin * 60_000).toISOString();
  const { data } = await supa
    .from("bulk_dispatch_audit")
    .select("id, created_at, metadata")
    .eq("action", "queue_alert_fired")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data || []).some((r: any) => (r?.metadata?.kind ?? null) === kind);
}

async function fireTelegram(serviceKey: string, title: string, message: string) {
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-notify-admin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": serviceKey,
      },
      body: JSON.stringify({
        title,
        message,
        url: `${SITE_URL}/admin/bulk-dispatch`,
      }),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error("[bulk-dispatch-monitor] telegram fire failed:", e);
    return { ok: false, status: 0 };
  }
}

async function logAlertAudit(supa: any, kind: string, payload: Record<string, unknown>) {
  await supa.from("bulk_dispatch_audit").insert({
    action: "queue_alert_fired",
    entity_type: "monitor",
    entity_id: kind,
    metadata: { kind, ...payload },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Internal-key gate: only the cron / other edge functions should call this.
    // Either x-internal-key=service_role OR Authorization: Bearer <service_role>.
    const provided =
      req.headers.get("x-internal-key") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    const thresholds = await getThresholds(supa);
    const { mode, updated_at: modeSetAt } = await getDispatchModeRow(supa);

    // Count queued
    const [oCount, aCount] = await Promise.all([
      supa.from("orders").select("id", { count: "exact", head: true }).eq("queue_state", "queued"),
      supa.from("agent_orders").select("id", { count: "exact", head: true }).eq("queue_state", "queued"),
    ]);
    const queuedTotal = (oCount.count ?? 0) + (aCount.count ?? 0);

    // Oldest queued
    const [oOldest, aOldest] = await Promise.all([
      supa.from("orders").select("created_at").eq("queue_state", "queued").order("created_at", { ascending: true }).limit(1).maybeSingle(),
      supa.from("agent_orders").select("created_at").eq("queue_state", "queued").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    ]);
    const oldestTimes = [oOldest.data?.created_at, aOldest.data?.created_at].filter(Boolean) as string[];
    const oldestAgeMin = oldestTimes.length > 0
      ? Math.floor((Date.now() - Math.min(...oldestTimes.map(t => +new Date(t)))) / 60_000)
      : 0;

    const cooldown = thresholds.cooldown_minutes ?? DEFAULTS.cooldown_minutes!;
    const fired: Array<{ kind: string; result: any }> = [];

    // Alert 1: queue size
    if (queuedTotal >= thresholds.queue_size) {
      const recent = await recentAuditFiredAt(supa, "queue_size", cooldown);
      if (!recent) {
        const r = await fireTelegram(serviceKey,
          `Bulk dispatch queue is large (${queuedTotal})`,
          `Queued orders: <b>${queuedTotal}</b> (threshold ${thresholds.queue_size})\nMode: <b>${mode}</b>`);
        await logAlertAudit(supa, "queue_size", { queued_total: queuedTotal, threshold: thresholds.queue_size });
        fired.push({ kind: "queue_size", result: r });
      }
    }

    // Alert 2: oldest pending too old
    if (oldestAgeMin >= thresholds.oldest_pending_minutes) {
      const recent = await recentAuditFiredAt(supa, "oldest_pending", cooldown);
      if (!recent) {
        const r = await fireTelegram(serviceKey,
          `Oldest queued order is ${oldestAgeMin}m old`,
          `Oldest queued order age: <b>${oldestAgeMin} minutes</b> (threshold ${thresholds.oldest_pending_minutes})`);
        await logAlertAudit(supa, "oldest_pending", { oldest_age_min: oldestAgeMin, threshold: thresholds.oldest_pending_minutes });
        fired.push({ kind: "oldest_pending", result: r });
      }
    }

    // Alert 3: manual mode left on for too long
    if (mode === "manual_bulk" && modeSetAt) {
      const ageHours = (Date.now() - +new Date(modeSetAt)) / 3_600_000;
      if (ageHours >= thresholds.manual_mode_max_hours) {
        const recent = await recentAuditFiredAt(supa, "manual_mode_too_long", cooldown);
        if (!recent) {
          const r = await fireTelegram(serviceKey,
            `Manual Bulk mode has been ON for ${ageHours.toFixed(1)}h`,
            `Dispatch mode has been <b>manual_bulk</b> for ${ageHours.toFixed(1)} hours (threshold ${thresholds.manual_mode_max_hours}h). Consider switching back to <b>auto</b>.`);
          await logAlertAudit(supa, "manual_mode_too_long", { age_hours: ageHours, threshold_hours: thresholds.manual_mode_max_hours });
          fired.push({ kind: "manual_mode_too_long", result: r });
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      stats: { queuedTotal, oldestAgeMin, mode, modeSetAt },
      thresholds,
      fired,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[bulk-dispatch-monitor] error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
