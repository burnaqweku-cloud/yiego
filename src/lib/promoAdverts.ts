import { supabase } from "@/integrations/supabase/client";

/* Adverts: every paid advert has its own link and its own results (Admin → Promotions → Adverts).
   The database decides which visitor belongs to which advert (phase1.promotion_advert_of: the campaign tag on the
   link, or the source for an advert known by its source). This file holds the link an advert hands out and the
   sums shown for it, so both can be tested. */

export type AdvertPlace = "telegram" | "meta" | "whatsapp" | "tiktok" | "google" | "news" | "other";
/** Where an advert runs. `source` is what its link says, so the visit is recognised as coming from that place. */
export const ADVERT_PLACES: { value: AdvertPlace; label: string; source: string }[] = [
  { value: "telegram", label: "Telegram channel", source: "telegram" },
  { value: "meta", label: "Meta ads (Facebook, Instagram)", source: "facebook" },
  { value: "whatsapp", label: "WhatsApp", source: "whatsapp" },
  { value: "tiktok", label: "TikTok", source: "tiktok" },
  { value: "google", label: "Google", source: "google" },
  { value: "news", label: "News site or blog", source: "news" },
  { value: "other", label: "Somewhere else", source: "advert" },
];
export const placeLabel = (place: string) => ADVERT_PLACES.find((p) => p.value === place)?.label ?? "Somewhere else";

export interface AdvertNumbers {
  visitors: number; entered_number: number; started_payment: number; buyers: number; orders_paid: number; sales: number; profit: number; topup_amount: number;
  service_orders: number; service_sales: number; service_profit: number; first_visit: string | null; last_visit: string | null;
}
export interface PromoAdvert extends AdvertNumbers {
  id: string; name: string; place: AdvertPlace; source: string | null; campaign: string | null; cost: number; note: string | null; created_at: string; ended_at: string | null;
}
/** A tagged link people are already clicking that nobody has named as an advert yet (or the plain link, campaign "unlabelled"). */
export interface UnnamedLink extends AdvertNumbers { source: string; campaign: string }

/** The link to hand over for an advert. `page` chooses where it lands: the bundle list, or Services (checkers and AFA). */
export function advertLink(advert: Pick<PromoAdvert, "place" | "source" | "campaign">, page: "shop" | "services" = "shop"): string {
  const url = new URL(`https://datayego.com/${page}`);
  url.searchParams.set("promo", "1");
  url.searchParams.set("utm_source", advert.source ?? ADVERT_PLACES.find((p) => p.value === advert.place)?.source ?? "advert");
  url.searchParams.set("utm_medium", "paid");
  url.searchParams.set("utm_campaign", advert.campaign ?? "advert");
  return url.toString();
}

const money = (n: number) => Math.round(n * 100) / 100;
export interface AdvertFigures { orders: number; sales: number; profit: number; buyerRate: number; cost: number; result: number | null; costPerBuyer: number | null }
/** What one advert brought, data and services together. `result` is profit minus what was paid for the advert
    (null until a cost is entered); profit is sales minus what we paid the supplier, before payment fees. */
export function advertFigures(a: Partial<AdvertNumbers> & { cost?: number | null }): AdvertFigures {
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const cost = money(n(a.cost)); const buyers = n(a.buyers); const visitors = n(a.visitors);
  const profit = money(n(a.profit) + n(a.service_profit));
  return {
    orders: n(a.orders_paid) + n(a.service_orders), sales: money(n(a.sales) + n(a.service_sales)), profit, cost,
    buyerRate: visitors > 0 ? Math.round((buyers / visitors) * 1000) / 10 : 0,
    result: cost > 0 ? money(profit - cost) : null,
    costPerBuyer: cost > 0 && buyers > 0 ? money(cost / buyers) : null,
  };
}

/** Splits what no advert owns: tagged links that could be named, and the plain link (everything with no campaign tag, added up). */
export function splitUnnamed(list: UnnamedLink[] | null | undefined): { tagged: UnnamedLink[]; plain: { visitors: number; buyers: number; orders: number; sales: number } } {
  const tagged: UnnamedLink[] = []; const plain = { visitors: 0, buyers: 0, orders: 0, sales: 0 };
  for (const l of list ?? []) {
    if (l.campaign && l.campaign.toLowerCase() !== "unlabelled") { tagged.push(l); continue; }
    const f = advertFigures(l);
    plain.visitors += Number(l.visitors) || 0; plain.buyers += Number(l.buyers) || 0; plain.orders += f.orders; plain.sales = money(plain.sales + f.sales);
  }
  return { tagged, plain };
}

interface Rpc { rpc<T>(name: string, args?: Record<string, unknown>): PromiseLike<{ data: T | null; error: { message?: string } | null }> }
const db = () => (supabase as unknown as { schema(name: string): Rpc }).schema("phase1");

export interface AdvertInput { id?: string; name: string; place: AdvertPlace; cost: number; /** Naming a link that is already out: its tags. */ source?: string; campaign?: string }
export const saveAdvert = (a: AdvertInput) => db().rpc<PromoAdvert>("admin_promo_advert_save", {
  p_id: a.id ?? null, p_name: a.name, p_place: a.place, p_cost: a.cost, ...(a.id ? {} : a.campaign || a.source ? { p_source: a.source ?? null, p_campaign: a.campaign ?? null } : {}),
});
export const endAdvert = (id: string, ended: boolean) => db().rpc<boolean>("admin_promo_advert_end", { p_id: id, p_ended: ended });

/** A plain sentence for whatever the server said. */
export function advertError(message: string | null | undefined): string {
  const m = message ?? "";
  return m.includes("advert_name_required") ? "Give the advert a name (up to 80 letters)."
    : m.includes("advert_cost_invalid") ? "Enter what you paid as a number. Leave it at 0 if you don't know yet."
    : m.includes("advert_tag_taken") ? "That link already has a name. Refresh the page."
    : m.includes("advert_not_found") ? "That advert is no longer there. Refresh the page."
    : m.includes("admin_required") ? "Sign in as an admin to change adverts."
    : "Couldn't save right now. Please try again.";
}
