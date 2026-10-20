import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

/* Vynfy calls this when a text changes state (callback_url on every send). The ?key= must match the
   dedicated 'sms_callback' secret. Every call is logged raw; when the report names a task we know,
   the outbox row gets its delivery_status. Read-only on orders: no re-sends, no re-queues, ever. */

type Delivery = "delivered" | "not_delivered" | "failed" | "sent" | "pending" | "unknown";
const DELIVERY = (s: string | null): Delivery => {
  if (!s) return "unknown";
  if (/deliver/.test(s) && !/not|un/.test(s)) return "delivered";
  if (/not_?deliver|undeliver/.test(s)) return "not_delivered";
  if (/fail|reject|expired|prohibit/.test(s)) return "failed";
  if (/sent/.test(s)) return "sent";
  if (/pending|queue|process|submit/.test(s)) return "pending";
  return "unknown";
};
const RANK: Record<Delivery, number> = { delivered: 5, not_delivered: 4, failed: 4, sent: 2, pending: 1, unknown: 0 };

/** Pull task id, status and reason out of whatever shape Vynfy sends (top level, data, or messages[]). */
function read(body: unknown): { taskId: string | null; status: string | null; reason: string | null } {
  let taskId: string | null = null; const statuses: string[] = []; let reason: string | null = null;
  const walk = (v: unknown, depth: number) => {
    if (depth > 4 || v === null || typeof v !== "object") return;
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/^(task_?id|job_?id)$/i.test(k) && typeof val === "string" && !taskId) taskId = val;
      else if (/status|state/i.test(k) && typeof val === "string") statuses.push(val.toLowerCase());
      else if (/reason|error|description/i.test(k) && typeof val === "string" && !reason) reason = val.slice(0, 200);
      else walk(val, depth + 1);
    }
  };
  walk(body, 0);
  statuses.sort((a, b) => RANK[DELIVERY(b)] - RANK[DELIVERY(a)]);
  return { taskId, status: statuses[0] ?? null, reason };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const db = createSupabaseAdmin();
  try {
    const key = new URL(req.url).searchParams.get("key") ?? "";
    const { data: secret } = await db.from("internal_secrets").select("value").eq("key", "sms_callback").maybeSingle();
    if (!secret?.value || key.length !== secret.value.length || key !== secret.value) return new Response("forbidden", { status: 403 });

    const text = await req.text();
    let body: unknown; try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 2000) }; }
    const { taskId, status, reason } = read(body);
    const delivery = DELIVERY(status);
    await db.from("sms_callback_log").insert({ task_id: taskId, status: status?.slice(0, 60) ?? null, delivery, reason, body });

    if (taskId) {
      const { data: row } = await db.from("order_sms_outbox").select("id,delivery_status").eq("provider_job_id", taskId).maybeSingle();
      // A final state never goes back to pending because a late "sent" report arrived after "delivered".
      if (row && RANK[delivery] >= RANK[(row.delivery_status as Delivery) ?? "unknown"]) {
        await db.from("order_sms_outbox").update({ delivery_status: delivery, delivery_checked_at: new Date().toISOString(), delivery_raw: body }).eq("id", row.id);
      }
    }
  } catch { /* never make Vynfy retry on our error */ }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
