/* What happened to a text after we sent it. Pure code, so it can be tested.

   The SMS provider only says "queued" when it takes a text. Whether the phone got it is a second question, asked
   later: GET /api/v1/status/<job id>. Its reply carries a status word (DELIVERED, NOT_DELIVERED, SENT, PENDING ...)
   somewhere inside; these helpers find it wherever it sits.

   Seen on 13 Nov 2026: about a third of texts the provider accepted never reached the phone, with no error at send
   time. Only this report tells a text that was delivered from one that was sent and lost. */

export type Delivery = "delivered" | "not_delivered" | "failed" | "sent" | "pending" | "unknown";

const NOT_DELIVERED = /not[ _-]?deliver|undeliver|non[ _-]?deliver/;
const isDelivered = (s: string) => /deliver/.test(s) && !NOT_DELIVERED.test(s);
// Final answers win over "sent", and "sent" over "still queued".
const rank = (s: string) => (isDelivered(s) ? 4 : NOT_DELIVERED.test(s) || /fail|reject|expired/.test(s) ? 3 : /sent|submitted/.test(s) ? 2 : /pending|queue|process|accepted/.test(s) ? 1 : 0);

function statusWords(body: unknown): string[] {
  const seen: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 5 || v === null || typeof v !== "object") return;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/status|state|^event$/i.test(k) && typeof val === "string") seen.push(val.toLowerCase());
      else walk(val, depth + 1);
    }
  };
  walk(body, 0);
  return seen;
}

/** What the network did with the text, from the provider's status reply. */
export function deliveryOf(body: unknown): Delivery {
  if ((body as { success?: unknown } | null)?.success === false) return "unknown";
  const best = statusWords(body).sort((a, b) => rank(b) - rank(a))[0];
  if (!best) return "unknown";
  if (isDelivered(best)) return "delivered";
  if (NOT_DELIVERED.test(best)) return "not_delivered";
  if (/fail|reject|expired/.test(best)) return "failed";
  if (/sent|submitted/.test(best)) return "sent";
  if (/pending|queue|process|accepted/.test(best)) return "pending";
  return "unknown";
}

/** The provider's own words for why a text failed, when it gives any. */
export function reasonOf(body: unknown): string | null {
  let found: string | null = null;
  const walk = (v: unknown, depth: number) => {
    if (found || depth > 5 || v === null || typeof v !== "object") return;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (found) return;
      if (/^(error_message|error|reason|failure_reason|error_description)$/i.test(k) && typeof val === "string" && val.trim()) found = val.trim().slice(0, 200);
      else walk(val, depth + 1);
    }
  };
  walk(body, 0);
  return found;
}

/** The provider's id for a text it accepted (its docs say job_id, its status endpoint task_id). */
export function jobIdOf(body: unknown): string | null {
  const b = body as { data?: { job_id?: unknown; task_id?: unknown }; job_id?: unknown; task_id?: unknown } | null;
  const id = b?.data?.job_id ?? b?.data?.task_id ?? b?.job_id ?? b?.task_id;
  return id == null || id === "" ? null : String(id).slice(0, 120);
}

/** The reply with any copy of the text itself removed: a text can carry a PIN, and the reply is kept. */
export function withoutText(body: unknown, depth = 0): unknown {
  if (depth > 6 || body === null || typeof body !== "object") return body;
  if (Array.isArray(body)) return body.slice(0, 20).map((v) => withoutText(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (/^(message|text|content|body|sms)$/i.test(k)) continue;
    out[k] = withoutText(v, depth + 1);
  }
  return out;
}
