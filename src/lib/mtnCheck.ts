import { supabase } from "@/integrations/supabase/client";

/* MTN number check against our supplier's approved list. Public, no login, no limits. */
export type CheckStatus = "approved" | "not_approved" | "unapproved" | "blocked" | "not_enforced" | "invalid" | "not_mtn";
export interface CheckResult { msisdn: string; status: CheckStatus; message: string | null; submitted: string | null }
export interface SubmitOutcome { msisdn: string; outcome: "submitted" | "submitted_unconfirmed" | "already_submitted" | "already_approved" | "blocked"; message?: string | null }

const MTN = ["024", "025", "053", "054", "055", "059"];
export const normalizeGh = (v: string) => { const d = v.replace(/\D/g, ""); return d.startsWith("233") ? `0${d.slice(3)}` : d; };
export const isValidGh = (n: string) => /^0\d{9}$/.test(n);
export const isMtn = (n: string) => isValidGh(n) && MTN.includes(n.slice(0, 3));

export async function checkNumbers(numbers: string[]): Promise<CheckResult[]> {
  const { data, error } = await supabase.functions.invoke<{ results: CheckResult[] }>("check-mtn-number", { body: { action: "check", numbers } });
  if (error || !data) throw new Error(error?.message ?? "check_failed");
  return data.results;
}
export async function submitNumbers(numbers: string[], source: "shop" | "checker" | "checker_bulk" | "checkout"): Promise<SubmitOutcome[]> {
  const { data, error } = await supabase.functions.invoke<{ outcomes: SubmitOutcome[] }>("check-mtn-number", { body: { action: "submit", numbers, source } });
  if (error || !data) throw new Error(error?.message ?? "submit_failed");
  return data.outcomes;
}

/* Wording shared by every screen. */
export const STATUS_COPY: Record<CheckStatus, { tone: "ok" | "wait" | "bad"; title: string; text: string }> = {
  approved: { tone: "ok", title: "Approved", text: "MTN bundles to this number deliver in minutes." },
  not_enforced: { tone: "ok", title: "Approved", text: "MTN bundles to this number deliver in minutes." },
  not_approved: { tone: "wait", title: "Not yet approved", text: "You can still buy. MTN will verify this number first, which can take a few days. After that, every order to it is fast." },
  unapproved: { tone: "wait", title: "Verification pending with MTN", text: "This number is already with MTN for verification. You can still buy; your order delivers once MTN approves it." },
  blocked: { tone: "bad", title: "Blocked", text: "Our supplier can't send bundles to this number." },
  not_mtn: { tone: "bad", title: "Not an MTN number", text: "This check is for MTN numbers (024, 025, 053, 054, 055, 059)." },
  invalid: { tone: "bad", title: "Not a valid number", text: "Enter a 10-digit Ghana number starting with 0." },
};
export const SUBMIT_COPY: Record<SubmitOutcome["outcome"], string> = {
  submitted: "Submitted. MTN usually approves within a few days. Once approved, orders to this number deliver in minutes.",
  submitted_unconfirmed: "Submitted to our supplier. If MTN approves it, orders to this number will deliver in minutes.",
  already_submitted: "This number is already with MTN for verification.",
  already_approved: "Good news: this number is already approved.",
  blocked: "Our supplier can't send bundles to this number.",
};
