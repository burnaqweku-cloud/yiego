import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* ══════════════════════════════════════════════════════════════
   Delivery speed, measured rather than claimed.

   DataMartGH's API publishes a live delivery tracker — the same
   feed behind the "Fast lane · 5h 35m" panel in their own
   dashboard. It gives a scanner state, a backlog size, and the
   placed/delivered timestamps of the order they last completed.
   The gap between those two is the real lag right now.

   refresh : called on a schedule; snapshots the tracker.
   current : public read for the site; returns only what a
             customer may see, never the supplier's identity.

   An admin's typed estimate always wins over the measurement,
   which is the manual mode the owner asked for.
   ══════════════════════════════════════════════════════════════ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}
function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Backend is not configured");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "phase1" },
  });
}

interface TrackerPayload {
  status?: string;
  data?: {
    message?: string;
    scanner?: { state?: string; active?: boolean; waiting?: boolean; pendingBatches?: number };
    stats?: Record<string, number>;
    lastDelivered?: { placedAt?: string; deliveredAt?: string; summary?: string };
  };
}

/** Minutes between an order being placed and delivered, or null if either
 *  timestamp is missing or nonsensical. */
function lagMinutes(placedAt?: string, deliveredAt?: string) {
  if (!placedAt || !deliveredAt) return null;
  const placed = Date.parse(placedAt);
  const delivered = Date.parse(deliveredAt);
  if (!Number.isFinite(placed) || !Number.isFinite(delivered) || delivered < placed) return null;
  return Math.round(((delivered - placed) / 60000) * 10) / 10;
}

/** Refresh is reachable without a session so the scheduler can call it with the
 *  publishable key. That is only safe because of this throttle: a snapshot
 *  newer than the window is returned as-is, so no amount of calling can spend
 *  the supplier's rate limit. */
const REFRESH_MIN_AGE_MS = 120_000;

async function refresh() {
  const supabase = admin();
  const { data: supplier } = await supabase
    .from("suppliers").select("id").eq("code", "datamartgh").maybeSingle();
  if (!supplier) return json({ error: "supplier_not_found" }, { status: 404 });

  const { data: existing } = await supabase
    .from("supplier_delivery_status").select("checked_at").eq("supplier_id", supplier.id).maybeSingle();
  if (existing?.checked_at && Date.now() - Date.parse(existing.checked_at) < REFRESH_MIN_AGE_MS) {
    return json({ status: "success", skipped: "throttled", checked_at: existing.checked_at });
  }

  const base = Deno.env.get("DATAMARTGH_BASE_URL") ?? "https://api.datamartgh.shop/api/developer";
  const apiKey = Deno.env.get("DATAMARTGH_API_KEY");
  if (!apiKey) return json({ error: "supplier_not_configured" }, { status: 503 });

  let snapshot: Record<string, unknown>;
  try {
    const res = await fetch(`${base}/delivery-tracker`, {
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await res.json().catch(() => null)) as TrackerPayload | null;
    if (!res.ok || !payload?.data) {
      snapshot = { scanner_state: "unknown", error_message: `tracker_http_${res.status}`, raw: payload ?? {} };
    } else {
      const d = payload.data;
      snapshot = {
        scanner_state: d.scanner?.state ?? (d.scanner?.waiting ? "waiting" : "unknown"),
        message: d.message ?? null,
        last_lag_minutes: lagMinutes(d.lastDelivered?.placedAt, d.lastDelivered?.deliveredAt),
        pending_batches: typeof d.scanner?.pendingBatches === "number" ? d.scanner.pendingBatches : null,
        stats: d.stats ?? {},
        raw: d,
        error_message: null,
      };
    }
  } catch (error) {
    // The supplier being unreachable is itself a delivery signal, so it is
    // recorded rather than thrown away.
    snapshot = {
      scanner_state: "unknown",
      error_message: error instanceof Error ? error.message : "tracker_unreachable",
      raw: {},
    };
  }

  const { error } = await supabase.from("supplier_delivery_status").upsert({
    supplier_id: supplier.id,
    ...snapshot,
    checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) return json({ error: "snapshot_not_saved" }, { status: 500 });
  return json({ status: "success", ...snapshot });
}

/** What the site is allowed to show. Deliberately returns wording, never the
 *  supplier's name, backlog internals or our costs. */
async function current() {
  const supabase = admin();
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, delivery_estimate_manual, delivery_slow_threshold_minutes")
    .eq("code", "datamartgh").maybeSingle();
  if (!supplier) return json({ status: "success", state: "unknown", estimate: null, slow: false });

  const { data: snap } = await supabase
    .from("supplier_delivery_status")
    .select("scanner_state, last_lag_minutes, checked_at")
    .eq("supplier_id", supplier.id).maybeSingle();

  const threshold = Number(supplier.delivery_slow_threshold_minutes ?? 45);
  const lag = snap?.last_lag_minutes === null || snap?.last_lag_minutes === undefined
    ? null : Number(snap.last_lag_minutes);
  const slow = lag !== null && lag > threshold;

  // A typed estimate is the owner's word and always wins. Otherwise describe
  // the measurement, and say nothing at all rather than guess.
  // State the measurement and nothing else. Any characterisation of what is
  // "normal" is the owner's to make, through the manual override.
  const manual = (supplier.delivery_estimate_manual ?? "").trim();
  let estimate: string | null = manual || null;
  if (!manual && lag !== null) {
    estimate = slow
      ? `Deliveries are slower than usual right now — the most recent order took about ${humanise(lag)}.`
      : `The most recent order was delivered in about ${humanise(lag)}.`;
  }

  return json({
    status: "success",
    state: snap?.scanner_state ?? "unknown",
    slow,
    estimate,
    measured_minutes: lag,
    checked_at: snap?.checked_at ?? null,
    source: manual ? "manual" : lag !== null ? "measured" : "none",
  });
}

function humanise(minutes: number) {
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${Math.round(minutes)} minutes`;
  const hours = minutes / 60;
  return hours < 2 ? `${hours.toFixed(1)} hours` : `${Math.round(hours)} hours`;
}

/** Admin view: the measurement, the override, and what customers are seeing. */
async function adminState(req: Request) {
  const supabase = admin();
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Authentication required" }, { status: 401 });
  const { data: auth } = await supabase.auth.getUser(token);
  if (!auth?.user) return json({ error: "Invalid session" }, { status: 401 });
  const { data: isAdmin } = await supabase
    .from("admin_users").select("user_id").eq("user_id", auth.user.id).eq("is_active", true).maybeSingle();
  if (!isAdmin) return json({ error: "Admin access required" }, { status: 403 });
  return { supabase, userId: auth.user.id };
}

async function setManual(req: Request, value: string) {
  const gate = await adminState(req);
  if (gate instanceof Response) return gate;
  const text = value.trim().slice(0, 200);
  const { error } = await gate.supabase
    .from("suppliers")
    .update({ delivery_estimate_manual: text || null, delivery_estimate_updated_at: new Date().toISOString() })
    .eq("code", "datamartgh");
  if (error) return json({ error: "Could not save the estimate." }, { status: 500 });
  return json({ status: "success", delivery_estimate_manual: text || null });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method === "GET") return await current();
    const body = await req.json().catch(() => ({}));
    if (body?.action === "refresh") return await refresh();
    if (body?.action === "set_manual") return await setManual(req, String(body.estimate ?? ""));
    if (body?.action === "admin_state") {
      const gate = await adminState(req);
      if (gate instanceof Response) return gate;
      const { data: supplier } = await gate.supabase
        .from("suppliers").select("id, delivery_estimate_manual").eq("code", "datamartgh").maybeSingle();
      const { data: snap } = await gate.supabase
        .from("supplier_delivery_status")
        .select("scanner_state, message, last_lag_minutes, pending_batches, checked_at, error_message")
        .eq("supplier_id", supplier?.id ?? "").maybeSingle();
      return json({ status: "success", manual: supplier?.delivery_estimate_manual ?? null, snapshot: snap ?? null });
    }
    return await current();
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "unavailable" }, { status: 503 });
  }
});
