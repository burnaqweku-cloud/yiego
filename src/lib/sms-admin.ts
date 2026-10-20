import { supabase } from "@/integrations/supabase/client";
import { adminDatabase } from "@/lib/admin-data";

/* Admin → SMS. Reads and settings go through phase1 RPCs (admin-only in the database);
   test sends and template previews go through the admin-sms-action function, which holds the Vynfy key. */

export type SmsKind = "purchase" | "delivered" | "verified";
export type SmsTemplateKind = "purchase" | "delivered" | "verified_delivered" | "verified_on_way";
export type SmsStatus = "pending" | "sending" | "sent" | "skipped" | "uncertain" | "failed";
export type SmsDelivery = "delivered" | "not_delivered" | "failed" | "sent" | "pending" | "unknown";

export interface SmsSettings {
  enabled: boolean; activated_at: string | null; test_passed_at: string | null;
  sender_id: string; purchase_enabled: boolean; delivered_enabled: boolean; verified_enabled: boolean; store_orders_enabled: boolean;
  on_way_max_hours: number; test_numbers: string[]; credits_remaining: number | null; credits_updated_at: string | null;
  updated_at: string | null; updated_by: string | null;
}
export interface SmsCounts { queued?: number; sent: number; delivered: number; not_delivered: number; failed: number; skipped?: number }
export interface SmsAttention { id: string; kind: SmsKind; status: SmsStatus; delivery_status: SmsDelivery | null; reason: string | null; phone: string; order_reference: string; at: string }
export interface SmsOverview { settings: SmsSettings; today: SmsCounts; week: SmsCounts; by_kind: Partial<Record<SmsKind, number>>; attention: SmsAttention[] }
export interface SmsMessage {
  id: string; kind: SmsKind; status: SmsStatus; reason: string | null; delivery_status: SmsDelivery | null; delivery_reason: string | null; delivery_checked_at: string | null;
  phone: string; order_reference: string; store_name: string | null; message: string | null; created_at: string; sent_at: string | null; attempts: number; provider_job_id: string | null; requeueable: boolean;
}
export interface SmsTemplate { kind: SmsTemplateKind; body: string; updated_at: string | null; updated_by: string | null }
export interface SmsMessageFilters { kind?: SmsKind | ""; status?: SmsStatus | ""; delivery?: SmsDelivery | "none" | ""; phone?: string; from?: string; to?: string; limit?: number; offset?: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (f: string, a: Record<string, unknown> = {}) => (adminDatabase() as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }> }).rpc(f, a);
const fail = (e: { message: string } | null) => { if (e) throw new Error(friendly(e.message)); };

/** Database error codes → words an admin can act on. */
export function friendly(message: string): string {
  if (/admin_required/.test(message)) return "Admin sign-in with two-factor is required.";
  if (/test_required/.test(message)) return "Send a successful test text first, then switch on.";
  if (/not_requeueable/.test(message)) return "This text can't be re-queued: Vynfy already accepted it, so sending again would double it.";
  if (/plain_text_only/.test(message)) return "Only plain characters: no emoji, curly quotes or accents.";
  if (/too_long/.test(message)) return "Too long: the limit is 306 characters (two segments).";
  if (/unknown_placeholder/.test(message)) return "Unknown placeholder: " + (message.split(":").pop() ?? "").trim();
  if (/empty/.test(message)) return "The text is empty.";
  return message;
}

export async function loadSmsOverview(): Promise<SmsOverview> { const { data, error } = await rpc("admin_sms_overview"); fail(error); return data as SmsOverview; }
export async function loadSmsSettings(): Promise<SmsSettings> { const { data, error } = await rpc("admin_sms_settings"); fail(error); return data as SmsSettings; }
export async function saveSmsSettings(patch: Partial<SmsSettings>): Promise<SmsSettings> { const { data, error } = await rpc("admin_sms_save_settings", { p: patch }); fail(error); return data as SmsSettings; }
export async function toggleSms(on: boolean): Promise<SmsSettings> { const { data, error } = await rpc("admin_sms_toggle", { p_on: on }); fail(error); return data as SmsSettings; }
export async function loadSmsTemplates(): Promise<SmsTemplate[]> { const { data, error } = await rpc("admin_sms_templates"); fail(error); return (data ?? []) as SmsTemplate[]; }
export async function saveSmsTemplate(kind: SmsTemplateKind, body: string): Promise<SmsTemplate[]> { const { data, error } = await rpc("admin_sms_save_template", { p_kind: kind, p_body: body }); fail(error); return (data ?? []) as SmsTemplate[]; }
export async function requeueSms(id: string): Promise<void> { const { error } = await rpc("admin_sms_requeue", { p_id: id }); fail(error); }
export async function loadSmsMessages(f: SmsMessageFilters): Promise<{ rows: SmsMessage[]; total: number }> {
  const { data, error } = await rpc("admin_sms_messages", {
    p_kind: f.kind || null, p_status: f.status || null, p_delivery: f.delivery || null, p_phone: f.phone?.trim() || null,
    p_from: f.from ? new Date(f.from).toISOString() : null, p_to: f.to ? new Date(new Date(f.to).getTime() + 24 * 3600 * 1000).toISOString() : null,
    p_limit: f.limit ?? 50, p_offset: f.offset ?? 0,
  });
  fail(error);
  return { rows: (data?.rows ?? []) as SmsMessage[], total: Number(data?.total ?? 0) };
}

type ActionResult<T> = T & { error?: string };
async function action<T>(body: Record<string, unknown>): Promise<T> {
  const r = await supabase.functions.invoke<ActionResult<T>>("admin-sms-action", { body });
  // supabase-js reports non-2xx as `error`; the function's own message is in the response body.
  if (r.error) {
    const ctx = (r.error as { context?: Response }).context;
    const text = ctx ? await ctx.clone().json().catch(() => null) : null;
    throw new Error(text?.error ?? text?.problems?.join(" ") ?? "Couldn't reach the SMS service.");
  }
  if (r.data?.error) throw new Error(r.data.error);
  return r.data as T;
}
export const previewSmsTemplate = (kind: SmsTemplateKind, body: string, store: boolean) => action<{ ok: boolean; message?: string; length?: number; segments?: number; problems?: string[] }>({ action: "preview", kind, body, store });
export const sendSmsTest = (to: string, opts: { kind?: SmsTemplateKind; message?: string; store?: boolean }) => action<{ ok: boolean; message: string; taskId: string | null; remaining: number | null }>({ action: "send_test", to, ...opts });

export const SMS_KIND_LABEL: Record<SmsKind, string> = { purchase: "Paid", delivered: "Delivered", verified: "MTN verified" };
export const SMS_TEMPLATE_LABEL: Record<SmsTemplateKind, { title: string; when: string }> = {
  purchase: { title: "Paid", when: "Sent the moment a payment is confirmed." },
  delivered: { title: "Delivered", when: "Sent when the order is marked delivered (skipped if the verified text already said so)." },
  verified_delivered: { title: "MTN verified – delivered", when: "First-time MTN numbers that MTN approved, order already delivered." },
  verified_on_way: { title: "MTN verified – on its way", when: "Same, but the order is still being delivered. Only for orders under the age limit in Settings." },
};
export const SMS_STATUS_LABEL: Record<SmsStatus, string> = { pending: "Queued", sending: "Sending", sent: "Sent", skipped: "Skipped", uncertain: "Uncertain", failed: "Failed" };
export const SMS_DELIVERY_LABEL: Record<SmsDelivery, string> = { delivered: "Delivered", not_delivered: "Not delivered", failed: "Failed", sent: "With the network", pending: "Pending", unknown: "Unknown" };
export const SMS_REASON_LABEL: Record<string, string> = {
  ineligible_order: "order no longer qualifies", switched_off: "that type of text is switched off", invalid_order_details: "order details missing (size or date)",
  order_missing: "order not found", details_read_failed: "couldn't read order details", dedupe_read_failed: "couldn't check for duplicates",
  delivery_already_in_verification_sms: "the verified text already said delivered", provider_rejected: "Vynfy refused it (not charged)",
  delivery_unknown: "Vynfy didn't answer in time; check Vynfy before re-queuing", worker_interrupted: "sender was interrupted mid-send; check Vynfy before re-queuing",
  no_api_key: "Vynfy key not set", no_valid_number: "no valid Ghana number", invalid_message: "text too long for Vynfy",
  verified_delivered: "", verified_on_way: "",
};
