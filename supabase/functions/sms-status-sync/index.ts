import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { z } from "npm:zod@3.25.76";

/* Delivery reports for order SMS. Vynfy only says "queued" when we send; this asks
   GET /api/v1/status/<task_id> afterwards and records what the network did with each
   text (delivered / not delivered / failed / still pending) on the outbox row.
   Internal only (cron secret). Never sends anything; never re-queues anything.
   { "probe": "<task_id>" } returns Vynfy's raw reply for one task, for inspection. */

const Input = z.object({ probe: z.string().min(1).max(80).optional(), limit: z.number().int().min(1).max(200).optional() }).strict();
const BASE = "https://sms.vynfy.com/api/v1/status/";

async function fetchStatus(key: string, taskId: string): Promise<{ http: number; body: unknown }> {
  const res = await fetch(BASE + encodeURIComponent(taskId), { headers: { "X-API-Key": key }, signal: AbortSignal.timeout(15000) });
  const body = await res.json().catch(() => null);
  return { http: res.status, body };
}

/** Find a delivery word anywhere in the reply: top level, under data, or per recipient. */
function readDelivery(body: unknown): string | null {
  const seen: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 4 || v === null || typeof v !== "object") return;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/status|state/i.test(k) && typeof val === "string") seen.push(val.toLowerCase());
      else walk(val, depth + 1);
    }
  };
  walk(body, 0);
  // Final states win over "sent"/"pending".
  const rank = (s: string) => /deliver/.test(s) && !/not|un/.test(s) ? 4 : /not_?deliver|undeliver|fail|reject|expired/.test(s) ? 3 : /sent/.test(s) ? 2 : /pending|queue|process/.test(s) ? 1 : 0;
  seen.sort((a, b) => rank(b) - rank(a));
  return seen[0] ?? null;
}

const DELIVERY = (s: string | null): "delivered" | "not_delivered" | "failed" | "sent" | "pending" | "unknown" => {
  if (!s) return "unknown";
  if (/deliver/.test(s) && !/not|un/.test(s)) return "delivered";
  if (/not_?deliver|undeliver/.test(s)) return "not_delivered";
  if (/fail|reject|expired/.test(s)) return "failed";
  if (/sent/.test(s)) return "sent";
  if (/pending|queue|process/.test(s)) return "pending";
  return "unknown";
};

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const db = createSupabaseAdmin();
    const denied = await requireCronSecret(req, db); if (denied) return denied;
    const key = Deno.env.get("VYNFY_API_KEY");
    if (!key) return jsonResponse({ error: "no_vynfy_key" }, { status: 500 });
    const parsed = Input.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonResponse({ error: "Invalid request" }, { status: 400 });

    if (parsed.data.probe) {
      const r = await fetchStatus(key, parsed.data.probe);
      return jsonResponse({ ...r, delivery: DELIVERY(readDelivery(r.body)) });
    }

    // Texts Vynfy accepted that have no final report yet. Stop asking after 3 days; the network won't change its mind.
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await db.from("order_sms_outbox")
      .select("id,provider_job_id,delivery_status,delivery_checks")
      .eq("status", "sent").not("provider_job_id", "is", null).gte("sent_at", since)
      .or("delivery_status.is.null,delivery_status.in.(pending,sent,unknown)")
      .lt("delivery_checks", 12)
      .order("sent_at", { ascending: true }).limit(parsed.data.limit ?? 60);
    if (error) throw new Error("Cannot read outbox");

    const counts: Record<string, number> = {};
    for (const row of rows ?? []) {
      let delivery = "unknown"; let raw: unknown = null;
      try { const r = await fetchStatus(key, row.provider_job_id); raw = r.body; delivery = r.http === 200 ? DELIVERY(readDelivery(r.body)) : "unknown"; }
      catch { delivery = "unknown"; }
      counts[delivery] = (counts[delivery] ?? 0) + 1;
      await db.from("order_sms_outbox").update({
        delivery_status: delivery, delivery_checked_at: new Date().toISOString(),
        delivery_checks: (row.delivery_checks ?? 0) + 1, delivery_raw: raw,
      }).eq("id", row.id);
    }
    return jsonResponse({ checked: (rows ?? []).length, counts });
  } catch { return jsonResponse({ error: "Status sync unavailable" }, { status: 500 }); }
});
