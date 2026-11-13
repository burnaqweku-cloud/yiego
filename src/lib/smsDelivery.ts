/* How one text is described to an admin: was it delivered, or sent and not delivered?
   "Sent" only means the SMS provider took it. The network's own report, read a little later, says whether the phone got it. */

export interface SentText { accepted: boolean; refusal: string | null; delivery: string; delivery_reason: string | null; sent_at: string }
export interface TextStatus { label: string; tone: "good" | "warn" | "bad" | "muted"; note?: string }

/** A report normally arrives within a minute or two; after this long without one the text is called out. */
export const REPORT_LATE_MS = 5 * 60 * 1000;

export function textStatus(t: SentText, now = Date.now()): TextStatus {
  if (!t.accepted) return { label: "Not sent", tone: "bad", note: t.refusal ?? "The SMS provider did not take it." };
  if (t.delivery === "delivered") return { label: "Delivered", tone: "good" };
  if (t.delivery === "not_delivered" || t.delivery === "failed") return { label: "Sent, not delivered", tone: "bad", ...(t.delivery_reason ? { note: t.delivery_reason } : {}) };
  const age = now - new Date(t.sent_at).getTime();
  return age > REPORT_LATE_MS ? { label: "Sent, not delivered yet", tone: "warn" } : { label: "Sent, waiting for the report", tone: "muted" };
}
