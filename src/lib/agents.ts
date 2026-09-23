import { supabase } from "@/integrations/supabase/client";

/* Agents feature flag + plan. Hidden until the master admin launches it;
   admins can preview any page with ?preview=agents. */

export interface AgentPlan { monthly_price: number; payout_minimum: number; payout_fee_rate: number; payout_fee_minimum: number; popup_delay_seconds: number }
export interface PlanOption { months: 1 | 3 | 12; list_price: number; pay_now: number; promo_id: string | null; per_month: number; saving_pct: number; fee: number; total: number }
export interface PlanQuote { monthly: number; grace_days: number; promo: { id: string; name: string; percent_off: number; ends_at: string | null; plan_months: number[] } | null; pay_now: number; plans: PlanOption[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p1 = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");

let cache: { launched: boolean; plan: AgentPlan | null; isAdmin: boolean; at: number } | null = null;
export async function agentsStatus(): Promise<{ launched: boolean; plan: AgentPlan | null; isAdmin: boolean }> {
  if (cache && Date.now() - cache.at < 60_000) return cache;
  const [{ data }, { data: session }] = await Promise.all([p1().from("site_settings").select("key, value").in("key", ["agents_launched", "agent_plan"]), supabase.auth.getSession()]);
  const launched = Boolean((data ?? []).find((r: { key: string }) => r.key === "agents_launched")?.value);
  const plan = ((data ?? []).find((r: { key: string }) => r.key === "agent_plan")?.value as AgentPlan | undefined) ?? null;
  let isAdmin = false;
  const uid = session?.session?.user?.id;
  if (uid) { const { data: adm } = await p1().rpc("is_active_admin", { p_user: uid }); isAdmin = Boolean(adm); }
  cache = { launched, plan, isAdmin, at: Date.now() };
  return cache;
}
/** Before launch, every signed-in admin sees the agent pages, popup and stores. Nobody else does. */
export function previewRequested() { return cache?.isAdmin === true; }
export function rememberPreview() { try { if (new URLSearchParams(window.location.search).get("preview") === "agents") sessionStorage.setItem("yg-agents-preview", "1"); } catch { /* ignore */ } }
export interface MyAgentStatus { is_agent: boolean; agent_status: string | null; application: { status: "pending" | "approved" | "declined"; created_at: string; reviewed_at: string | null; decline_reason: string | null } | null }
export async function myAgentStatus(): Promise<MyAgentStatus | null> { const { data: session } = await supabase.auth.getSession(); if (!session?.session) return null; const { data } = await p1().rpc("my_agent_status", {}); return (data as MyAgentStatus) ?? null; }
export async function planQuote(): Promise<PlanQuote | null> { const { data } = await p1().rpc("agent_plan_quote", {}); return (data as PlanQuote) ?? null; }
export async function applyAsAgent(input: { fullName: string; phone: string; whatsapp: string; town: string; pitch: string }) {
  return p1().rpc("agent_apply", { p_full_name: input.fullName, p_phone: input.phone, p_whatsapp: input.whatsapp, p_town: input.town, p_pitch: input.pitch }) as Promise<{ data: string | null; error: { message: string } | null }>;
}
