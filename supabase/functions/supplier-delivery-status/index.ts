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

/** The Delivery Progress panel the site renders: a status banner and timed
 *  rows, mirroring what the supplier shows its own agents. Anything the admin
 *  typed is passed through verbatim; the rest is measured. Wording only —
 *  never the supplier's identity. */
async function current() {
  const supabase = admin();
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, delivery_estimate_manual, delivery_slow_threshold_minutes, delivery_panel")
    .eq("code", "datamartgh").maybeSingle();
  if (!supplier) return json({ status: "success", banner: null, rows: [] });

  const { data: snap } = await supabase
    .from("supplier_delivery_status")
    .select("scanner_state, last_lag_minutes, checked_at, raw")
    .eq("supplier_id", supplier.id).maybeSingle();

  const threshold = Number(supplier.delivery_slow_threshold_minutes ?? 45);
  const lag = snap?.last_lag_minutes === null || snap?.last_lag_minutes === undefined
    ? null : Number(snap.last_lag_minutes);
  const slow = lag !== null && lag > threshold;

  const panel = (supplier.delivery_panel ?? {}) as {
    banner?: string;
    rows?: Array<{ label?: string; value?: string; detail?: string; tone?: string }>;
  };

  // Banner: the admin's sentence wins. Otherwise state the condition plainly,
  // and say nothing at all when nothing has been measured.
  const bannerText = (panel.banner ?? "").trim() || (supplier.delivery_estimate_manual ?? "").trim();
  const banner = bannerText
    ? { text: bannerText, tone: slow ? "slow" : "ok" }
    : lag === null
      ? null
      : slow
        ? { text: `Deliveries are slower than usual — orders are taking about ${humanise(lag)}. Every order still gets delivered.`, tone: "slow" }
        : { text: "Deliveries are running normally.", tone: "ok" };

  // Rows the admin typed come first. The measured row only fills in when they
  // have written none, so their wording is never contradicted underneath.
  const rows: Array<Record<string, unknown>> = (panel.rows ?? [])
    .filter((row) => (row?.label ?? "").toString().trim() && (row?.value ?? "").toString().trim())
    .map((row) => ({
      label: String(row.label).trim(),
      value: String(row.value).trim(),
      detail: (row.detail ?? "").toString().trim() || null,
      tone: row.tone === "fast" ? "fast" : "queue",
      source: "manual",
    }));

  // No auto-generated row: the panel shows the banner plus whatever rows the
  // admin has written. The measurement still drives the banner's tone.

  return json({
    status: "success",
    banner,
    rows,
    slow,
    measured_minutes: lag,
    checked_at: snap?.checked_at ?? null,
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

/** Save the admin-authored panel. Everything is trimmed and length-capped;
 *  empty fields simply drop out, which is how a row is deleted and how the
 *  panel hands control back to the measurement. */
async function setPanel(req: Request, body: Record<string, unknown>) {
  const gate = await adminState(req);
  if (gate instanceof Response) return gate;

  const banner = String(body.banner ?? "").trim().slice(0, 240);
  const rawRows = Array.isArray(body.rows) ? body.rows : [];
  const rows = rawRows
    .slice(0, 4)
    .map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      return {
        label: String(r.label ?? "").trim().slice(0, 60),
        value: String(r.value ?? "").trim().slice(0, 40),
        detail: String(r.detail ?? "").trim().slice(0, 120),
        tone: r.tone === "fast" ? "fast" : "queue",
      };
    })
    .filter((row) => row.label && row.value);

  const { error } = await gate.supabase
    .from("suppliers")
    .update({ delivery_panel: { banner, rows }, delivery_estimate_updated_at: new Date().toISOString() })
    .eq("code", "datamartgh");
  if (error) return json({ error: "Could not save the panel." }, { status: 500 });
  return json({ status: "success", banner, rows });
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
    if (body?.action === "set_panel") return await setPanel(req, body as Record<string, unknown>);
    if (body?.action === "admin_state") {
      const gate = await adminState(req);
      if (gate instanceof Response) return gate;
      const { data: supplier } = await gate.supabase
        .from("suppliers").select("id, delivery_estimate_manual, delivery_panel").eq("code", "datamartgh").maybeSingle();
      const { data: snap } = await gate.supabase
        .from("supplier_delivery_status")
        .select("scanner_state, message, last_lag_minutes, pending_batches, checked_at, error_message")
        .eq("supplier_id", supplier?.id ?? "").maybeSingle();
      return json({
        status: "success",
        manual: supplier?.delivery_estimate_manual ?? null,
        panel: supplier?.delivery_panel ?? {},
        snapshot: snap ?? null,
      });
    }
    return await current();
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "unavailable" }, { status: 503 });
  }
});
