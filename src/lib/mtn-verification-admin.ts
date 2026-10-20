import { supabase } from "@/integrations/supabase/client";
import { adminDatabase } from "@/lib/admin-data";

/* Admin → MTN verification. Reads are phase1 RPCs (admin-only in the database); the two actions that talk to
   DataBundlesHub — Check all, Send — go through the admin-mtn-verification function. Nothing runs on a schedule. */

export type CheckStatus = "approved" | "not_approved" | "not_enforced" | "blocked" | string;
export interface QueueOrder {
  id: string; order_reference: string; phone: string; bundle: string; amount: number; store_name: string | null;
  paid_at: string; held_since: string | null; days_waiting: number;
  check_status: CheckStatus | null; check_message: string | null; checked_at: string | null;
  supplier_purchase_id: string | null; send: { outcome: string; sent_at: string; detail: string | null } | null;
  /** What DataBundlesHub charges us for this bundle (their price list, kept in step with every purchase reply). */
  dbh_cost: number | null;
}
export interface DbhWallet { balance: number | null; checked_at: string | null }
export interface SentOrder {
  id: string; order_reference: string; phone: string; bundle: string; amount: number; store_name: string | null;
  sent_at: string; sent_by: string | null; outcome: "sending" | "sent" | "adopted" | "refused" | "failed"; detail: string | null;
  order_status: string; supplier_status: string | null; supplier_purchase_id: string | null; delivered_at: string | null;
}
export interface SubmittedNumber { msisdn: string; source: string; status: string; message: string | null; submitted_at: string; submit_count: number; last_checked_at: string | null; approved_at: string | null }
export interface CheckRun { id: string; run_at: string; run_by: string | null; numbers: number; batches: number; approved: number; not_yet: number; blocked: number; unknown: number; report: CheckReportRow[] }
export interface CheckReportRow { phone: string; status: "approved" | "not_yet" | "blocked" | "unknown"; message: string | null; orders: string[] }
export interface HistoryRow { at: string; order_reference: string; phone: string; event: string; message: string | null }
export interface SendResult { orderId: string; reference: string | null; outcome: "sent" | "adopted" | "refused" | "failed"; detail: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (f: string, a: Record<string, unknown> = {}) => (adminDatabase() as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }> }).rpc(f, a);
const fail = (e: { message: string } | null) => { if (e) throw new Error(/admin_required/.test(e.message) ? "Admin sign-in with two-factor is required." : e.message); };
const tidy = <T extends { bundle: string }>(rows: T[]) => rows.map((r) => ({ ...r, bundle: (r.bundle ?? "").replace(/^[\s\u00a0]+/, "") }));

export async function loadQueue(): Promise<QueueOrder[]> { const { data, error } = await rpc("admin_mtn_queue"); fail(error); return tidy((data ?? []) as QueueOrder[]); }
export async function loadSent(limit = 100): Promise<SentOrder[]> { const { data, error } = await rpc("admin_mtn_sent", { p_limit: limit }); fail(error); return tidy((data ?? []) as SentOrder[]); }
export async function loadDbhWallet(): Promise<DbhWallet> { const { data, error } = await rpc("admin_mtn_dbh_wallet"); fail(error); return { balance: data?.balance == null ? null : Number(data.balance), checked_at: data?.checked_at ?? null }; }
export async function loadSubmitted(): Promise<SubmittedNumber[]> { const { data, error } = await rpc("admin_mtn_submitted"); fail(error); return (data ?? []) as SubmittedNumber[]; }
export async function loadChecks(limit = 30): Promise<CheckRun[]> { const { data, error } = await rpc("admin_mtn_checks", { p_limit: limit }); fail(error); return (data ?? []) as CheckRun[]; }
export async function loadHistory(limit = 200): Promise<HistoryRow[]> { const { data, error } = await rpc("admin_mtn_history", { p_limit: limit }); fail(error); return (data ?? []) as HistoryRow[]; }

async function action<T>(body: Record<string, unknown>): Promise<T> {
  const r = await supabase.functions.invoke<T & { error?: string; detail?: string }>("admin-mtn-verification", { body });
  if (r.error) {
    const ctx = (r.error as { context?: Response }).context;
    const text = ctx ? await ctx.clone().json().catch(() => null) : null;
    throw new Error(text?.error ? `${text.error}${text.detail ? `: ${text.detail}` : ""}` : "Couldn't reach the verification service.");
  }
  if (r.data?.error) throw new Error(r.data.error);
  return r.data as T;
}
export const checkAll = () => action<{ ok: boolean; runId: string | null; runAt: string; numbers: number; batches: number; failedBatches: number[]; approved: number; notYet: number; blocked: number; unknown: number; report: CheckReportRow[] }>({ action: "check_all" });
export const sendOrders = (orderIds: string[]) => action<{ ok: boolean; results: SendResult[] }>({ action: "send", orderIds });

export const isApproved = (s: CheckStatus | null | undefined) => s === "approved" || s === "not_enforced";
export const CHECK_LABEL = (s: CheckStatus | null | undefined): { text: string; tone: "good" | "warn" | "bad" | "muted" } =>
  isApproved(s) ? { text: "Approved", tone: "good" } : s === "blocked" ? { text: "Blocked", tone: "bad" } : s ? { text: "Not yet", tone: "warn" } : { text: "Not checked", tone: "muted" };
export const OUTCOME_LABEL: Record<SentOrder["outcome"], { text: string; tone: "good" | "warn" | "bad" | "muted" | "default" }> = {
  sending: { text: "Sending", tone: "default" }, sent: { text: "Sent", tone: "good" }, adopted: { text: "Already with DBH", tone: "good" }, refused: { text: "Refused", tone: "warn" }, failed: { text: "Failed", tone: "bad" },
};
export const EVENT_LABEL: Record<string, string> = {
  "supplier.awaiting_mtn_approval": "Put on hold (number not approved)", "supplier.number_approved": "MTN approved the number", "supplier.verification_cleared": "Hold cleared",
  "admin.mtn_send": "Sent by admin", "admin.mtn_send_refused": "Send refused", "supplier.already_held": "DBH already had it", "supplier.fulfillment_response": "DBH answered", "supplier.fulfillment_failed": "DBH refused", "supplier.status_update": "DBH status update",
};
