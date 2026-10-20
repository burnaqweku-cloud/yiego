/* Vynfy SMS (https://sms.vynfy.com). Key lives in the VYNFY_API_KEY secret. */
declare const Deno: { env: { get(name: string): string | undefined } };
const BASE = "https://sms.vynfy.com/api/v1/send";
const SENDER = Deno.env.get("VYNFY_SENDER") ?? "DTYEGO";

/** Normalise Ghana numbers to 233XXXXXXXXX. */
export function toGhanaMsisdn(phone: string): string | null {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (/^233\d{9}$/.test(d)) return d;
  if (/^0\d{9}$/.test(d)) return "233" + d.slice(1);
  if (/^\d{9}$/.test(d)) return "233" + d;
  return null;
}

export type SmsResult =
  | { ok: true; jobId?: string; remaining?: number; raw?: unknown }
  | { ok: false; skipped?: boolean; reason: string; status?: number; raw?: unknown };

export async function sendSms(opts: { to: string | string[]; message: string; metadata?: Record<string, unknown>; sender?: string; callbackUrl?: string }): Promise<SmsResult> {
  const key = Deno.env.get("VYNFY_API_KEY");
  if (!key) return { ok: false, skipped: true, reason: "no_api_key" };
  const recipients = (Array.isArray(opts.to) ? opts.to : [opts.to]).map(toGhanaMsisdn).filter(Boolean) as string[];
  if (!recipients.length) return { ok: false, skipped: true, reason: "no_valid_number" };
  if (!opts.message || opts.message.length > 650) return { ok: false, skipped: true, reason: "invalid_message" };
  let res: Response;
  try { res = await fetch(BASE, {
    method: "POST",
    headers: { "X-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ sender: (opts.sender ?? SENDER).slice(0, 11), recipients, message: opts.message, metadata: opts.metadata, ...(opts.callbackUrl ? { callback_url: opts.callbackUrl } : {}) }),
    signal: AbortSignal.timeout(15000),
  }); } catch { return { ok: false, reason: "delivery_unknown" }; }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    return { ok: false, reason: "provider_rejected", status: res.status, raw: body };
  }
  // The docs call it job_id; the status endpoint calls it task_id. Accept either, wherever it sits.
  const jobId = body?.data?.job_id ?? body?.data?.task_id ?? body?.job_id ?? body?.task_id;
  return { ok: true, jobId: jobId ? String(jobId) : undefined, remaining: body?.balance?.remaining, raw: body };
}

/** Where Vynfy reports status changes. The key in the URL is a dedicated secret (internal_secrets 'sms_callback'),
    not the cron secret, so a leaked callback URL cannot run anything else. Absent secret → no callback, polling still works. */
// deno-lint-ignore no-explicit-any
export async function smsCallbackUrl(db: any): Promise<string | undefined> {
  const base = Deno.env.get("SUPABASE_URL");
  if (!base) return undefined;
  const { data } = await db.from("internal_secrets").select("value").eq("key", "sms_callback").maybeSingle();
  return data?.value ? `${base.replace(/\/$/, "")}/functions/v1/sms-callback?key=${encodeURIComponent(data.value)}` : undefined;
}
