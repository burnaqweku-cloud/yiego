import { supabase } from "@/integrations/supabase/client";

/* Follow-ups: the automatic reminder sequence for people who never bought or went quiet.
   Everything is decided in the database; this file only talks to it. */

interface Rpc { rpc<T>(name: string, args?: Record<string, unknown>): PromiseLike<{ data: T | null; error: { message?: string } | null }> }
const phase1 = () => (supabase as unknown as { schema(name: string): Rpc }).schema("phase1");

export interface FollowUpMessage {
  key: string; track: "first" | "back"; step: number; wait_days: number; is_offer: boolean; enabled: boolean;
  subject: string; heading: string; body: string; cta_label: string; cta_path: string; push_title: string; push_body: string;
  sent: number; opened: number; clicked: number; bought: number;
}
export interface FollowUps {
  settings: { enabled: boolean; daily_cap: number } | null; can_edit: boolean;
  waiting: { first: number; app: number; back: number }; sent_today: number; unsubscribed: number;
  offer: { price: number; normal: number; used: number; max: number; active: boolean } | null;
  messages: FollowUpMessage[];
}
export const loadFollowUps = () => phase1().rpc<FollowUps>("admin_follow_ups");
export const saveFollowUpSettings = (enabled: boolean, dailyCap: number) => phase1().rpc<{ enabled: boolean; daily_cap: number }>("admin_follow_up_settings", { p_enabled: enabled, p_daily_cap: dailyCap });
export const saveFollowUpMessage = (m: FollowUpMessage) => phase1().rpc<boolean>("admin_follow_up_save", { p_key: m.key, p_subject: m.subject, p_heading: m.heading, p_body: m.body, p_cta_label: m.cta_label, p_push_title: m.push_title, p_push_body: m.push_body, p_enabled: m.enabled });
export const previewFollowUp = (key: string) => phase1().rpc<string>("admin_follow_up_preview", { p_key: key });
export const unsubscribeFollowUps = (token: string) => phase1().rpc<boolean>("follow_up_unsubscribe", { p_token: token });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A visit that came from a follow-up (its link carries ?n=<token>) is noted once, so results can show clicks. */
export function noteFollowUpClick() {
  try {
    const token = new URLSearchParams(window.location.search).get("n");
    if (token && UUID.test(token)) void Promise.resolve(phase1().rpc("follow_up_seen", { p_token: token, p_what: "click" })).then(undefined, () => undefined);
  } catch { /* nothing to note */ }
}
