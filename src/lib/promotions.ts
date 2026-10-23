import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { promoTouch, trackPromotion } from "@/lib/promotionAnalytics";

export interface PromotionOffer {
  product_id: string;
  product_code: string | null;
  name: string;
  network: "mtn" | "telecel" | "at";
  validity: string | null;
  normal_price: number;
  price: number;
  enabled: boolean;
  available: boolean;
}
export interface Promotion {
  title: string;
  blurb: string;
  active: boolean;
  eligible: boolean;
  reason: "sign_in" | "already_purchased" | "pending" | "eligible";
  pending_reference: string | null;
  offers: PromotionOffer[];
}
export interface PromotionAdmin extends Promotion {
  paid_orders: number;
  pending_orders: number;
  sales: number;
  discount: number;
}
interface RpcClient {
  rpc<T>(name: string, args?: Record<string, unknown>): PromiseLike<{ data: T | null; error: { message: string } | null }>;
}
const db = () => (supabase as unknown as { schema(name: string): RpcClient }).schema("phase1");
export const loadPromotion = () => db().rpc<Promotion>("promotion_public");
export const loadPromotionAdmin = () => db().rpc<PromotionAdmin>("admin_promotion_overview");
export const savePromotion = (title: string, blurb: string, active: boolean, offers: Pick<PromotionOffer, "product_id" | "price" | "enabled">[]) =>
  db().rpc("admin_promotion_save", { p_title: title, p_blurb: blurb, p_active: active, p_offers: offers });
export const preparePromotionOrder = (productId: string, phone: string, prefixConfirmed: boolean) => {
  const touch = promoTouch();
  return db().rpc<{ existing: boolean; orderId: string; orderReference: string; amount: number; recipientPhone: string; expiresAt: string }>("promotion_prepare_order", { p_product: productId, p_phone: phone, p_prefix_confirmed: prefixConfirmed, p_visit: touch?.id ?? null, p_token: touch?.token ?? null });
};
/** Guests: the server checks device + number and returns a short-lived token the normal guest checkout prices through. */
export const claimGuestPromotion = (productId: string, phone: string) => {
  const touch = promoTouch();
  if (!touch) return Promise.resolve({ data: { eligible: false } as { eligible: boolean; token?: string; price?: number; reason?: string }, error: null });
  return db().rpc<{ eligible: boolean; token?: string; price?: number; reason?: string }>("promotion_guest_claim", { p_visit: touch.id, p_token: touch.token, p_product: productId, p_phone: phone });
};

/* ── Promotion link pricing on the main site ─────────────────────────
 * Arriving with ?promo in the URL records this browser as a link visit. While that
 * visit is valid and the server says this device/account has not used the offer,
 * the main shop shows the promotion prices as its normal prices. Everyone else
 * sees normal prices; nobody is blocked. The server re-checks everything at checkout. */
let promoPrices: Record<string, number> = {};
let promoKey: string | null = null;
let promoLoading: Promise<void> | null = null;
const listeners = new Set<(p: Record<string, number>) => void>();
const isPromoLanding = () => { try { return new URLSearchParams(window.location.search).has("promo"); } catch { return false; } };
let landingTracked = false;

export function refreshPromoPrices(userKey: string | null = promoKey) {
  promoKey = userKey;
  promoLoading = (async () => {
    if (!landingTracked && isPromoLanding()) { landingTracked = true; await trackPromotion("visit"); }
    const touch = promoTouch();
    let next: Record<string, number> = {};
    if (touch) {
      const { data } = await db().rpc<{ eligible: boolean; offers: { product_id: string; price: number }[] }>("promotion_prices", { p_visit: touch.id, p_token: touch.token });
      if (data?.eligible) for (const o of data.offers) { const n = promotionBasePrice(o.price); if (n != null) next[o.product_id] = n; }
    }
    promoPrices = next;
    listeners.forEach((fn) => fn(next));
  })().catch(() => { /* normal prices on any failure */ });
  return promoLoading;
}

/** Product id -> promotion price for this shopper; empty means normal prices. */
export function usePromoPrices(userId: string | null | undefined, enabled = true): Record<string, number> {
  const [prices, setPrices] = useState(promoPrices);
  useEffect(() => {
    if (!enabled) { setPrices({}); return; }
    listeners.add(setPrices);
    const key = userId ?? "guest";
    if (promoKey !== key || !promoLoading || (!landingTracked && isPromoLanding())) void refreshPromoPrices(key); else setPrices(promoPrices);
    return () => { listeners.delete(setPrices); };
  }, [userId, enabled]);
  return enabled ? prices : {};
}

/** Base prices are shown on offer cards; fees belong exclusively to checkout. */
export function promotionBasePrice(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 10000 && Math.abs(n * 100 - Math.round(n * 100)) < 0.000001 ? n : null;
}