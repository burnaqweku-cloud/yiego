import { supabase } from "@/integrations/supabase/client";
import type { PromoAdvert, UnnamedLink } from "@/lib/promoAdverts";

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
  const url = new URL("https://datayego.com/shop");
  url.searchParams.set("promo", "1");
  url.searchParams.set("utm_source", source.trim().slice(0, 80) || "tiktok");
  url.searchParams.set("utm_medium", "paid_social");
  if (campaign.trim()) url.searchParams.set("utm_campaign", campaign.trim().slice(0, 120));
  return url.toString();
}
export function promoTouch() {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    // Kept for as long as the browser keeps it, so later visits and purchases stay with the same visitor.
    // The promotion price has its own 30-day limit, checked by the server.
    if (parsed && typeof parsed.id === "string" && typeof parsed.token === "string") return parsed as { id: string; token: string; at: number };
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
/* ── Full promo-link tracking ─────────────────────────────────────────
 * Only browsers that arrived through the promotion link carry a touch, so every call below is a
 * no-op for everyone else. Steps are reported as they happen; orders, payments and deliveries are
 * never taken from the browser, the report reads those from the real records. */
export type PromoEventKind = "landing" | "page_view" | "flow_opened" | "network_selected" | "bundle_selected" | "mtn_check" | "checkout_clicked"
  | "promo_applied" | "promo_declined" | "order_created" | "review_shown" | "pay_tapped" | "payment_started" | "unpaid_order_shown" | "order_cancelled"
  | "signup_started" | "signed_in" | "topup_opened" | "topup_started" | "topup_payment_started" | "service_order";

/** Where an arrival came from. Ad platforms tag their clicks (fbclid, ttclid) and their in-app browsers name themselves. */
export function detectPlatform(search: string, referrer: string, userAgent: string): { platform: string; click_id: string | null } {
  const q = new URLSearchParams(search);
  const src = (q.get("utm_source") ?? "").toLowerCase();
  let host = "";
  try { host = referrer ? new URL(referrer).hostname.toLowerCase() : ""; } catch { host = ""; }
  const ua = userAgent.toLowerCase();
  const click = q.has("fbclid") ? "fbclid" : q.has("ttclid") ? "ttclid" : (q.has("gclid") || q.has("gbraid") || q.has("wbraid")) ? "gclid" : null;
  const has = (text: string, ...needles: string[]) => needles.some((n) => text.includes(n));
  let platform = "direct";
  if (click === "fbclid" || has(src, "facebook", "instagram", "meta") || src === "fb" || src === "ig" || has(host, "facebook.", "fb.com", "fb.me", "instagram.", "messenger.") || has(ua, "fban/", "fbav/", "fb_iab", "instagram")) platform = "meta";
  else if (click === "ttclid" || has(src, "tiktok") || has(host, "tiktok.") || has(ua, "musical_ly", "bytedancewebview", "tiktok", "trill")) platform = "tiktok";
  else if (click === "gclid" || has(src, "google") || has(host, "google.")) platform = "google";
  else if (has(src, "whatsapp") || has(host, "whatsapp.", "wa.me") || has(ua, "whatsapp")) platform = "whatsapp";
  else if (has(src, "snapchat") || has(host, "snapchat.") || has(ua, "snapchat")) platform = "snapchat";
  else if (has(src, "twitter") || src === "x" || has(host, "twitter.", "t.co") || host === "x.com") platform = "x";
  else if (has(src, "telegram") || has(host, "telegram.", "t.me")) platform = "telegram";
  else if (host || src) platform = "other";
  return { platform, click_id: click };
}

export function detectDevice(userAgent: string, width: number): { device: string; os: string; browser: string } {
  const ua = userAgent;
  const os = /android/i.test(ua) ? "Android" : /iphone|ipad|ipod/i.test(ua) ? "iOS" : /windows/i.test(ua) ? "Windows" : /mac os x/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : "Other";
  const device = /ipad|tablet/i.test(ua) || (os === "Android" && !/mobile/i.test(ua)) ? "tablet" : /mobi|iphone|ipod|android/i.test(ua) || width < 700 ? "mobile" : "desktop";
  const browser = /fban\/|fbav\/|fb_iab/i.test(ua) ? "Facebook app" : /instagram/i.test(ua) ? "Instagram app" : /musical_ly|bytedancewebview|tiktok|trill/i.test(ua) ? "TikTok app"
    : /whatsapp/i.test(ua) ? "WhatsApp" : /snapchat/i.test(ua) ? "Snapchat app" : /opera mini|opr\/|opt\//i.test(ua) ? "Opera" : /edg\//i.test(ua) ? "Edge" : /samsungbrowser/i.test(ua) ? "Samsung Internet"
    : /phoenix|transsion/i.test(ua) ? "Phoenix" : /firefox|fxios/i.test(ua) ? "Firefox" : /chrome|crios/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : "Other";
  return { device, os, browser };
}

/** Reports one step. Resolves quickly and never throws; `wait` caps how long a caller that awaits it can be held up. */
export function trackPromoEvent(kind: PromoEventKind, data: Record<string, unknown> = {}, wait = 2500): Promise<boolean> {
  const touch = promoTouch();
  if (!touch) return Promise.resolve(false);
  try {
    const call = Promise.resolve(db().rpc<boolean>("promotion_event", { p_visit: touch.id, p_token: touch.token, p_kind: kind, p_data: data })).then((r) => Boolean(r.data)).catch(() => false);
    return Promise.race([call, new Promise<boolean>((done) => setTimeout(() => done(false), wait))]);
  } catch { return Promise.resolve(false); }
}

/** Sent once per arrival through the link: who sent them, where they are and what they are using. */
export async function trackPromoLanding(country?: string) {
  if (!promoTouch() || typeof window === "undefined") return;
  const where = detectPlatform(window.location.search, document.referrer, navigator.userAgent);
  let referrer = "";
  try { referrer = document.referrer ? new URL(document.referrer).hostname : ""; } catch { referrer = ""; }
  await trackPromoEvent("landing", { ...where, ...detectDevice(navigator.userAgent, window.innerWidth), referrer, path: window.location.pathname, country: country ?? "" });
}

export interface PromoTrackingTotals {
  active: number; landed: number; sessions: number; opened_buy: number; picked: number; entered_number: number; reached_pay: number; started_payment: number;
  buyers: number; got_delivery: number; signup_started: number; accounts: number; mtn_checked: number; mtn_approved: number; mtn_not_approved: number; mtn_waiting: number;
  topup_started: number; topup_payers: number; topups_paid: number; topup_amount: number; orders_paid: number; delivered: number; refunded: number; promo_orders: number;
  sales: number; profit: number; discount: number; repeat_buyers: number; existing_buyers: number;
  /** Checker and AFA orders, counted next to data since 13 Nov 2026. */
  service_orders?: number; service_sales?: number; service_profit?: number;
}
export interface PromoTrackingGroup { label: string | null; visitors: number; entered_number: number; started_payment: number; buyers: number; orders_paid: number; sales: number; profit: number; topup_amount: number; service_orders?: number; service_sales?: number; service_profit?: number }
export interface PromoTrackingVisitor {
  id: string; created_at: string; last_at: string; landed: boolean; platform: string; source: string; campaign: string; click_id: string | null; country: string; region: string | null; city: string | null;
  device: string; os: string | null; browser: string | null; sessions: number; has_account: boolean; account_created: boolean | null; existing_customer: boolean; mtn_status: string | null;
  orders_paid: number; delivered: number; sales: number; profit: number; topup_amount: number; furthest: string; service_orders?: number; service_sales?: number;
}
export interface PromoTrackingReport {
  from: string | null; to: string | null; started_at: string | null; detail_since: string | null; totals: PromoTrackingTotals;
  platforms: PromoTrackingGroup[]; campaigns: PromoTrackingGroup[]; countries: PromoTrackingGroup[]; devices: PromoTrackingGroup[];
  days: (Omit<PromoTrackingGroup, "label"> & { day: string })[]; bundles: { label: string; picked: number; paid_orders: number; sales: number }[];
  visitor_count: number; visitors: PromoTrackingVisitor[];
  /** Every advert with its own figures, tagged links nobody has named yet, and (when one advert was asked for) that advert. */
  adverts?: PromoAdvert[]; unnamed?: UnnamedLink[]; advert?: { id: string; name: string } | null;
}
export interface PromoVisitorDetail {
  visit: (Record<string, string | number | boolean | null> & { id: string; created_at: string }) | null;
  events: { at: string; kind: PromoEventKind; data: Record<string, unknown>; phone: string | null; order_reference: string | null }[];
  orders: { reference: string; bundle: string | null; phone: string; amount: number; profit: number; status: string; payment: string; provider: string | null; created_at: string; paid_at: string | null; delivered_at: string | null; via: string; promo_price: boolean }[];
  topups: { amount: number; status: string; provider: string; created_at: string; done_at: string | null }[];
  services?: { reference: string; name: string; quantity: number; amount: number; status: string; method: string; created_at: string; paid_at: string | null; delivered_at: string | null; refunded_at: string | null; via: string }[];
}
/** The whole report, or with `advert` the same report for the visitors that one advert brought. */
export const loadPromoTracking = (from: string | null, to: string | null, advert?: string) => db().rpc<PromoTrackingReport>("admin_promo_tracking", { p_from: from, p_to: to, ...(advert ? { p_advert: advert } : {}) });
export const loadPromoVisitor = (id: string) => db().rpc<PromoVisitorDetail>("admin_promo_visitor", { p_visit: id });
export const loadPromotionReport = (from: string, to: string) => db().rpc<PromotionReport>("admin_promotion_report", { p_from: from, p_to: to });

export function promotionReportCsv(report: PromotionReport) {
  const quote = (value: unknown) => `"${String(value ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
  const rows: unknown[][] = [["From (Ghana)", report.from, "To (Ghana)", report.to], ["Group", "Label", "Visitors", "Signup starts", "Accounts created", "Confirmed accounts", "Checkouts", "Buyers", "Visit to buyer %", "Paid orders", "Delivered", "Pending", "Cancelled", "Refunded", "Sales GHS", "Discount GHS"]];
  for (const [group, list] of [["Total", [{ ...report.totals, label: "All" }]], ["Day", report.daily], ["Source/campaign", report.sources]] as const) {
    for (const row of list) rows.push([group,row.label,row.visitors,row.signup_starts,row.accounts,row.confirmed_accounts,row.checkouts,row.buyers,conversionRate(row.buyers,row.visitors),row.paid_orders,row.delivered,row.pending,row.cancelled,row.refunded,row.sales,row.discount]);
  }
  return rows.map(row => row.map(quote).join(",")).join("\r\n");
}