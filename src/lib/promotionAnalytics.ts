import { supabase } from "@/integrations/supabase/client";

export interface PromotionMetrics {
  visitors: number; visits: number; signup_starts: number; accounts: number; confirmed_accounts: number;
  checkouts: number; buyers: number; paid_orders: number; delivered: number; pending: number; cancelled: number; refunded: number;
  sales: number; discount: number;
}
export interface PromotionBreakdown extends PromotionMetrics { label: string; source?: string; campaign?: string }
export interface PromotionReport {
  started_at: string; from: string; to: string; totals: PromotionMetrics;
  daily: PromotionBreakdown[]; sources: PromotionBreakdown[]; bundles: { label: string; checkouts: number; paid_orders: number; sales: number }[];
}
interface RpcClient { rpc<T>(name: string, args?: Record<string, unknown>): PromiseLike<{ data: T | null; error: { message: string } | null }> }
const db = () => (supabase as unknown as { schema(name: string): RpcClient }).schema("phase1");
const key = "yg-promotion-touch-v1";
export function conversionRate(part: number, whole: number) { return whole > 0 ? Math.round(part / whole * 10000) / 100 : 0; }
export function promotionAdLink(source: string, campaign: string) {
  const url = new URL("https://datayego.com/promo");
  url.searchParams.set("utm_source", source.trim().slice(0, 80) || "tiktok");
  url.searchParams.set("utm_medium", "paid_social");
  if (campaign.trim()) url.searchParams.set("utm_campaign", campaign.trim().slice(0, 120));
  return url.toString();
}
export function promoTouch() {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    if (parsed && typeof parsed.id === "string" && typeof parsed.token === "string" && Date.now() - parsed.at < 30 * 86400000) return parsed as { id: string; token: string; at: number };
  } catch { /* storage unavailable */ }
  return null;
}
export function promoSignupMetadata() {
  const touch = promoTouch();
  return touch ? { promo_visit_id: touch.id, promo_visit_token: touch.token } : {};
}
export async function trackPromotion(kind: "visit" | "signup_started" | "checkout_clicked") {
  try {
    let touch = promoTouch();
    if (!touch) {
      if (kind !== "visit") return;
      touch = { id: crypto.randomUUID(), token: crypto.randomUUID(), at: Date.now() };
      localStorage.setItem(key, JSON.stringify(touch));
    }
    const params = new URLSearchParams(window.location.search);
    let referrer = "direct";
    if (document.referrer) { try { referrer = new URL(document.referrer).hostname; } catch { /* invalid referrer */ } }
    await db().rpc("promotion_track", {
      p_visit: touch.id, p_token: touch.token, p_kind: kind,
      p_source: params.get("utm_source") || referrer,
      p_medium: params.get("utm_medium") || "organic",
      p_campaign: params.get("utm_campaign") || "unlabelled",
    });
  } catch { /* reporting must never block signup or checkout */ }
}
export const loadPromotionReport = (from: string, to: string) => db().rpc<PromotionReport>("admin_promotion_report", { p_from: from, p_to: to });

export function promotionReportCsv(report: PromotionReport) {
  const quote = (value: unknown) => `"${String(value ?? "").replace(/^[=+@\-]/, "'$&").replace(/"/g, '""')}"`;
  const rows: unknown[][] = [["From (Ghana)", report.from, "To (Ghana)", report.to], ["Group", "Label", "Visitors", "Signup starts", "Accounts created", "Confirmed accounts", "Checkouts", "Buyers", "Visit to buyer %", "Paid orders", "Delivered", "Pending", "Cancelled", "Refunded", "Sales GHS", "Discount GHS"]];
  for (const [group, list] of [["Total", [{ ...report.totals, label: "All" }]], ["Day", report.daily], ["Source/campaign", report.sources]] as const) {
    for (const row of list) rows.push([group,row.label,row.visitors,row.signup_starts,row.accounts,row.confirmed_accounts,row.checkouts,row.buyers,conversionRate(row.buyers,row.visitors),row.paid_orders,row.delivered,row.pending,row.cancelled,row.refunded,row.sales,row.discount]);
  }
  return rows.map(row => row.map(quote).join(",")).join("\r\n");
}