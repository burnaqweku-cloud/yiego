/* Vynfy SMS (https://sms.vynfy.com). Key lives in the VYNFY_API_KEY secret. */
const BASE = "https://sms.vynfy.com/api/v1/send";
const SENDER = Deno.env.get("VYNFY_SENDER") ?? "DataYego";

/** Normalise Ghana numbers to 233XXXXXXXXX. */
export function toGhanaMsisdn(phone: string): string | null {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (/^233\d{9}$/.test(d)) return d;
  if (/^0\d{9}$/.test(d)) return "233" + d.slice(1);
  if (/^\d{9}$/.test(d)) return "233" + d;
  return null;
}

export type SmsResult =
  | { ok: true; jobId?: string; remaining?: number }
  | { ok: false; skipped?: boolean; reason: string; status?: number };

export async function sendSms(opts: { to: string | string[]; message: string; metadata?: Record<string, unknown> }): Promise<SmsResult> {
  const key = Deno.env.get("VYNFY_API_KEY");
  if (!key) return { ok: false, skipped: true, reason: "no_api_key" };
  const recipients = (Array.isArray(opts.to) ? opts.to : [opts.to]).map(toGhanaMsisdn).filter(Boolean) as string[];
  if (!recipients.length) return { ok: false, skipped: true, reason: "no_valid_number" };
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "X-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ sender: SENDER.slice(0, 11), recipients, message: opts.message.slice(0, 650), metadata: opts.metadata }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    console.error(`Vynfy send failed [${res.status}]: ${JSON.stringify(body)}`);
    return { ok: false, reason: body?.message ?? body?.error ?? "send_failed", status: res.status };
  }
  return { ok: true, jobId: body?.data?.job_id, remaining: body?.balance?.remaining };
}
