import { supabase } from "@/integrations/supabase/client";

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
export const preparePromotionOrder = (productId: string, phone: string, prefixConfirmed: boolean) =>
  db().rpc<{ existing: boolean; orderId: string; orderReference: string; amount: number; recipientPhone: string; expiresAt: string }>("promotion_prepare_order", { p_product: productId, p_phone: phone, p_prefix_confirmed: prefixConfirmed });

/** Base prices are shown on offer cards; fees belong exclusively to checkout. */
export function promotionBasePrice(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 10000 && Math.abs(n * 100 - Math.round(n * 100)) < 0.000001 ? n : null;
}