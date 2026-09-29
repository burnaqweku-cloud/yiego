import { supabase } from "@/integrations/supabase/client";
import { deviceHash } from "@/lib/device";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p1 = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");

const REF_KEY = "yiego_invite_ref";
export function rememberInvite(code: string) { const c = code.trim().toUpperCase(); if (/^[A-Z2-9]{4,10}$/.test(c)) localStorage.setItem(REF_KEY, c); }
export function pendingInvite(): string | null { return localStorage.getItem(REF_KEY); }
export function clearInvite() { localStorage.removeItem(REF_KEY); }

/* Tell the server which device this account is using (sign-in, checkout). */
export async function recordDevice() {
  try { const { data: s } = await supabase.auth.getSession(); if (!s.session) return; await p1().rpc("record_device", { p_hash: await deviceHash() }); } catch { /* best effort */ }
}

export interface ReferralSummary { code: string | null; reward: number; agent_reward: number; invited: number; rewarded: number; earned: number; list: Array<{ name: string; joined: string; status: "waiting" | "rewarded" | "reversed" | "not_eligible"; amount: number | null; agent: "rewarded" | "reversed" | null; agent_amount: number | null }> }
export async function myReferrals(): Promise<ReferralSummary | null> { const { data } = await p1().rpc("my_referrals", {}); return (data as ReferralSummary) ?? null; }
export async function friendPriceEligible(): Promise<boolean> { const { data } = await p1().rpc("my_friend_price", {}); return Boolean((data as { eligible?: boolean } | null)?.eligible); }
export const inviteLink = (code: string) => `${window.location.origin}/r/${code}`;
