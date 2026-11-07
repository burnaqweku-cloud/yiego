import { supabase } from "@/integrations/supabase/client";

/* Partner links: datayego.com/?p=CODE. The code is remembered on this device for 30 days and attached to the
 * shopper's next main-shop order. The server decides everything (owner check, once per order, never the partner's
 * own orders); earnings are only credited when the order is delivered. */
const KEY = "dy_partner_ref";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const PARTNER_PACKAGES = {
  starter: { name: "Starter", blurb: "Every partner starts here." },
  pro: { name: "Pro", blurb: "About 5,000 delivered orders in a week. Apply and we upgrade you." },
  premier: { name: "Premier", blurb: "10,000+ orders a week. Talk to our team for custom rates." },
} as const;
export type PartnerPackage = keyof typeof PARTNER_PACKAGES;

export function normalizePartnerCode(raw: string | null | undefined): string | null {
  const code = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length >= 3 && code.length <= 24 ? code : null;
}

export function capturePartnerCode(search = typeof window !== "undefined" ? window.location.search : "") {
  try {
    const code = normalizePartnerCode(new URLSearchParams(search).get("p"));
    if (code) localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch { /* storage unavailable */ }
}

export function savedPartnerCode(now = Date.now()): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { code?: string; at?: number } | null;
    if (!v?.code || !v.at || now - v.at > TTL_MS) return null;
    return normalizePartnerCode(v.code);
  } catch { return null; }
}

interface RpcClient { rpc<T>(name: string, args?: Record<string, unknown>): PromiseLike<{ data: T | null; error: { message: string } | null }> }
const db = () => (supabase as unknown as { schema(name: string): RpcClient }).schema("phase1");

/** Best effort, never blocks checkout for more than ~2.5s. */
export async function attachPartnerToOrder(reference: string, token?: string | null) {
  const code = savedPartnerCode();
  if (!code || !reference) return false;
  const call = Promise.resolve(db().rpc<boolean>("partner_attach_order", { p_reference: reference, p_code: code, p_token: token ?? null })).then((r) => Boolean(r.data)).catch(() => false);
  return Promise.race([call, new Promise<boolean>((res) => setTimeout(() => res(false), 2500))]);
}

export interface PartnerRate { name: string; gb: number; network: string; starter: number; pro: number }
export interface PartnerDashboard {
  code: string; name: string; package: PartnerPackage; status: string; owed: number; paid: number;
  orders_today: number; orders_week: number; orders_total: number; rates: PartnerRate[];
  recent: { ref: string; bundle: string | null; amount: number; status: string; created_at: string }[];
  payouts: { amount: number; reference: string | null; created_at: string }[];
}
export const loadPartnerDashboard = () => db().rpc<PartnerDashboard | null>("partner_dashboard");

export interface AdminPartner { id: string; code: string; name: string; package: PartnerPackage; status: string; momo_number: string | null; email: string | null; owed: number; paid: number; orders_week: number; orders_total: number; created_at: string }
export interface AdminPartnerRate { product_id: string; name: string; gb: number; network: string; price: number; starter: number; pro: number }
export const loadAdminPartners = () => db().rpc<{ partners: AdminPartner[]; rates: AdminPartnerRate[] }>("admin_partners");
export const createPartner = (email: string, name: string, code?: string) => db().rpc("admin_partner_create", { p_email: email, p_name: name, p_code: code || null });
export const updatePartner = (id: string, patch: { package?: PartnerPackage; status?: string; momo?: string }) =>
  db().rpc("admin_partner_update", { p_id: id, p_package: patch.package ?? null, p_status: patch.status ?? null, p_momo: patch.momo ?? null });
export const setPartnerRate = (productId: string, starter: number, pro: number) => db().rpc("admin_partner_set_rate", { p_product: productId, p_starter: starter, p_pro: pro });
export const payPartner = (id: string, reference: string) => db().rpc<number>("admin_partner_pay", { p_id: id, p_reference: reference });

export const partnerLink = (code: string) => `https://datayego.com/?p=${code}`;
/** What a partner earns for an order count at a given per-order amount (illustration, not a promise). */
export const projectEarnings = (perOrder: number, orders: number) => Math.round(perOrder * orders * 100) / 100;
