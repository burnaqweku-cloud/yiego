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
/** Bundles this signed-in buyer gets at the invite price right now (product id -> price). Decided by the server. */
export async function friendPrices(): Promise<Record<string, number>> {
  const { data } = await p1().rpc("my_friend_price", {});
  const prices = (data as { eligible?: boolean; prices?: Record<string, number> } | null)?.prices ?? {};
  return Object.fromEntries(Object.entries(prices).map(([id, price]) => [id, Number(price)]).filter(([, price]) => Number.isFinite(price as number)));
}
export interface InviteOffer { product_id: string; name: string; price: number; normal: number }
let offerPromise: Promise<InviteOffer | null> | null = null;
/** What an invited friend gets on their first order (for example MTN 1GB for GH₵3.50). */
export function inviteOffer(): Promise<InviteOffer | null> {
  offerPromise ??= Promise.resolve(p1().rpc("invite_offer", {})).then((r: { data: InviteOffer | null }) => (r.data ? { ...r.data, price: Number(r.data.price), normal: Number(r.data.normal) } : null), () => null);
  return offerPromise;
}
const cedis = (n: number) => `GH₵${n.toFixed(2)}`;
/** "MTN 1GB for GH₵3.50", or a plain fallback while the offer is loading or switched off. */
export const offerText = (offer: InviteOffer | null) => (offer ? `${offer.name} for ${cedis(offer.price)}` : "a special price on your first bundle");
/** The message that goes with a shared or copied invite link. */
export const inviteMessage = (link: string, offer: InviteOffer | null) => `Hello! I buy my data on DataYego. Use my link and get ${offerText(offer)}: ${link}`;
export const inviteLink = (code: string) => `${window.location.origin}/r/${code}`;
