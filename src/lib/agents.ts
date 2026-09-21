import { supabase } from "@/integrations/supabase/client";

/* Agents feature flag + plan. Hidden until the master admin launches it;
   admins can preview any page with ?preview=agents. */

export interface AgentPlan { monthly_price: number; payout_minimum: number; payout_fee_rate: number; payout_fee_minimum: number; popup_delay_seconds: number }
export interface PlanQuote { monthly: number; promo: { id: string; name: string; percent_off: number; ends_at: string | null } | null; pay_now: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p1 = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");

let cache: { launched: boolean; plan: AgentPlan | null; at: number } | null = null;
export async function agentsStatus(): Promise<{ launched: boolean; plan: AgentPlan | null }> {
  if (cache && Date.now() - cache.at < 60_000) return cache;
  const { data } = await p1().from("site_settings").select("key, value").in("key", ["agents_launched", "agent_plan"]);
  const launched = Boolean((data ?? []).find((r: { key: string }) => r.key === "agents_launched")?.value);
  const plan = ((data ?? []).find((r: { key: string }) => r.key === "agent_plan")?.value as AgentPlan | undefined) ?? null;
  cache = { launched, plan, at: Date.now() };
  return cache;
}
export function previewRequested() { try { return new URLSearchParams(window.location.search).get("preview") === "agents" || sessionStorage.getItem("yg-agents-preview") === "1"; } catch { return false; } }
export function rememberPreview() { try { if (new URLSearchParams(window.location.search).get("preview") === "agents") sessionStorage.setItem("yg-agents-preview", "1"); } catch { /* ignore */ } }
export async function planQuote(): Promise<PlanQuote | null> { const { data } = await p1().rpc("agent_plan_quote", {}); return (data as PlanQuote) ?? null; }
export async function applyAsAgent(input: { fullName: string; phone: string; whatsapp: string; town: string; pitch: string }) {
  return p1().rpc("agent_apply", { p_full_name: input.fullName, p_phone: input.phone, p_whatsapp: input.whatsapp, p_town: input.town, p_pitch: input.pitch }) as Promise<{ data: string | null; error: { message: string } | null }>;
}
