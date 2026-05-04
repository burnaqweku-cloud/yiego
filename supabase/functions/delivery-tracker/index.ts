/**
 * Real-data delivery tracker — determines current delivery conditions
 * using ONLY recent actually-delivered orders.
 *
 * ROOT CAUSE FIX (v3): Previous logic used a 24h backlog window which let
 * a handful of old stuck/abandoned orders (10-16h old) dominate the signal,
 * showing "delayed 4+ hours" even when recent deliveries were 3-30 minutes.
 *
 * New approach:
 * 1) Primary signal: median of the LAST 10 actually-delivered orders
 *    (using supplier_timestamp for real delivery time)
 * 2) Backlog signal: only considers orders waiting < 3 hours (stale orders excluded)
 * 3) The worse of the two signals is used, but stale stuck orders can't dominate
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CACHE_TTL_MS = 15_000;
let cache: { data: unknown; fetchedAt: number } | null = null;

type Severity = "healthy" | "good" | "moderate" | "slow" | "delayed";

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function classify(minutes: number): { severity: Severity; message: string } {
  if (minutes <= 10)
    return { severity: "healthy", message: "Orders are being delivered instantly right now" };
  if (minutes <= 59)
    return { severity: "good", message: "Orders are being delivered within minutes" };
  if (minutes <= 120)
    return { severity: "moderate", message: "Orders are currently taking about 1–2 hours" };
  if (minutes <= 240)
    return { severity: "slow", message: "Orders may take 2–4 hours due to network delays" };
  return { severity: "delayed", message: "Deliveries are currently delayed. Orders are still being processed" };
}

const SEVERITY_RANK: Record<Severity, number> = {
  healthy: 0, good: 1, moderate: 2, slow: 3, delayed: 4,
};

function worseSeverity(
  a: { severity: Severity; message: string },
  b: { severity: Severity; message: string },
): { severity: Severity; message: string } {
  return SEVERITY_RANK[a.severity] >= SEVERITY_RANK[b.severity] ? a : b;
}

/** Max age (hours) for a waiting order to count as "active backlog" vs "stale/stuck" */
const ACTIVE_BACKLOG_MAX_HOURS = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const now = Date.now();

    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
      return new Response(JSON.stringify(cache.data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // ── Check for active admin override ──
    const { data: overrideSetting } = await sb
      .from("site_settings")
      .select("value")
      .eq("key", "delivery_tracker_override")
      .maybeSingle();

    if (overrideSetting?.value) {
      try {
        const ov = typeof overrideSetting.value === "string"
          ? JSON.parse(overrideSetting.value)
          : overrideSetting.value;

        if (ov.active) {
          // Check expiry
          if (!ov.expires_at || new Date(ov.expires_at).getTime() > now) {
            const overridePayload = {
              message: ov.message || "Delivery status update",
              severity: ov.severity || "good",
              scannerActive: true,
              waiting: 0,
              waitSeconds: null,
              lastDelivered: null,
              checkingNow: null,
              startedAt: null,
              stats: null,
              override: true,
              fetchedAt: new Date().toISOString(),
            };
            cache = { data: overridePayload, fetchedAt: now };
            return new Response(JSON.stringify(overridePayload), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          } else {
            // Override expired — auto-clear it
            await sb
              .from("site_settings")
              .update({ value: JSON.stringify({ active: false }), updated_at: new Date().toISOString() })
              .eq("key", "delivery_tracker_override");
          }
        }
      } catch (e) {
        console.error("[delivery-tracker] override parse error:", e);
      }
    }

    // ── 1. Last 20 delivered orders (sorted by supplier_timestamp desc for recency) ──
    const cutoff48h = new Date(now - 48 * 60 * 60 * 1000).toISOString();

    const { data: deliveredOrders, error: delErr } = await sb
      .from("orders")
      .select("created_at, updated_at, supplier_timestamp")
      .eq("status", "Delivered")
      .eq("is_checkpoint", false)
      .gte("updated_at", cutoff48h)
      .order("updated_at", { ascending: false })
      .limit(20);

    // ── 2. Active backlog: only orders created within last ACTIVE_BACKLOG_MAX_HOURS ──
    const backlogCutoff = new Date(now - ACTIVE_BACKLOG_MAX_HOURS * 60 * 60 * 1000).toISOString();

    const { data: activeWaiting, error: waitErr } = await sb
      .from("orders")
      .select("created_at, status")
      .in("status", ["Pending", "Processing", "Paid"])
      .eq("is_checkpoint", false)
      .gte("created_at", backlogCutoff)
      .order("created_at", { ascending: true })
      .limit(200);

    // Also get total stuck count (including stale) for debug/admin visibility
    const { count: totalStuckCount } = await sb
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["Pending", "Processing", "Paid"])
      .eq("is_checkpoint", false)
      .gte("created_at", new Date(now - 24 * 60 * 60 * 1000).toISOString());

    if (delErr) console.error("[delivery-tracker] delivered query error:", delErr.message);
    if (waitErr) console.error("[delivery-tracker] waiting query error:", waitErr.message);

    // ── Calculate delivery durations from completed orders ──
    const allDeliveryMinutes: number[] = [];
    for (const o of deliveredOrders || []) {
      if (!o.created_at) continue;
      const deliveredAt = o.supplier_timestamp || o.updated_at;
      if (!deliveredAt) continue;
      const mins = (new Date(deliveredAt).getTime() - new Date(o.created_at).getTime()) / 60000;
      if (mins < 0 || mins > 1440) continue;
      allDeliveryMinutes.push(mins);
    }

    // Use ONLY the most recent 10 for the primary signal (prioritize recency)
    const recentDeliveryMinutes = allDeliveryMinutes.slice(0, 10);

    // ── Calculate active backlog wait times (only recent orders, not stale stuck ones) ──
    const activeWaitingCount = (activeWaiting || []).length;
    const activeWaitMinutes: number[] = [];
    for (const o of activeWaiting || []) {
      if (!o.created_at) continue;
      const mins = (now - new Date(o.created_at).getTime()) / 60000;
      if (mins >= 0) activeWaitMinutes.push(mins);
    }
    const maxActiveWaitMins = activeWaitMinutes.length > 0 ? Math.max(...activeWaitMinutes) : 0;
    const medianActiveWaitMins = activeWaitMinutes.length > 0 ? median(activeWaitMinutes) : 0;

    // ── Determine final severity ──
    let completedSignal: { severity: Severity; message: string };
    let backlogSignal: { severity: Severity; message: string };

    // Primary signal: median of recent 10 delivered orders
    if (recentDeliveryMinutes.length >= 3) {
      const med = median(recentDeliveryMinutes);
      completedSignal = classify(med);
    } else {
      completedSignal = {
        severity: "moderate",
        message: "Delivery times may vary at the moment",
      };
    }

    // Backlog signal: only from ACTIVE (recent) waiting orders
    if (activeWaitingCount === 0) {
      backlogSignal = { severity: "healthy", message: completedSignal.message };
    } else if (activeWaitingCount >= 10 && medianActiveWaitMins > 30) {
      // Large active backlog with significant wait → classify by wait time
      backlogSignal = classify(medianActiveWaitMins);
    } else if (activeWaitingCount >= 5 && medianActiveWaitMins > 15) {
      // Medium backlog
      backlogSignal = classify(medianActiveWaitMins);
    } else if (maxActiveWaitMins > 90) {
      // Even a few recent orders stuck > 90 min is notable
      backlogSignal = classify(maxActiveWaitMins * 0.6);
    } else {
      // Small/short active backlog — trust the completed signal
      backlogSignal = { severity: "good", message: "Orders are being delivered within minutes" };
    }

    // Take the worse — but now backlog can only reflect RECENT active orders, not 16h-old stuck ones
    const final = worseSeverity(completedSignal, backlogSignal);

    const lastDeliveredOrder =
      deliveredOrders && deliveredOrders.length > 0 ? deliveredOrders[0] : null;

    const payload = {
      message: final.message,
      severity: final.severity,
      scannerActive: recentDeliveryMinutes.length > 0 || activeWaitingCount > 0,
      waiting: activeWaitingCount,
      waitSeconds: medianActiveWaitMins > 0 ? Math.round(medianActiveWaitMins * 60) : null,
      lastDelivered: lastDeliveredOrder
        ? {
            summary: "Recent delivery confirmed",
            deliveredAt: lastDeliveredOrder.supplier_timestamp || lastDeliveredOrder.updated_at,
          }
        : null,
      checkingNow: activeWaitingCount > 0 ? { count: activeWaitingCount } : null,
      startedAt: null,
      stats: {
        recentSampleSize: recentDeliveryMinutes.length,
        fullSampleSize: allDeliveryMinutes.length,
        medianMinutes: recentDeliveryMinutes.length > 0 ? Math.round(median(recentDeliveryMinutes)) : null,
        fullMedianMinutes: allDeliveryMinutes.length > 0 ? Math.round(median(allDeliveryMinutes)) : null,
        activeWaitingCount,
        totalStuckCount: totalStuckCount ?? 0,
        medianActiveWaitMinutes: activeWaitMinutes.length > 0 ? Math.round(medianActiveWaitMins) : null,
        maxActiveWaitMinutes: activeWaitMinutes.length > 0 ? Math.round(maxActiveWaitMins) : null,
        backlogWindowHours: ACTIVE_BACKLOG_MAX_HOURS,
        completedSignal: completedSignal.severity,
        backlogSignal: backlogSignal.severity,
        finalSignal: final.severity,
      },
      fetchedAt: new Date().toISOString(),
    };

    cache = { data: payload, fetchedAt: now };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[delivery-tracker] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
