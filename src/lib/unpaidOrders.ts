import { supabase } from "@/integrations/supabase/client";
export function savedOrderToken(reference: string): string {
  try { return localStorage.getItem(`yiego_order_token_${reference}`) ?? ""; } catch { return ""; }
}
export function saveOrderToken(reference: string, token: string, phone?: string) {
  try {
    localStorage.setItem(`yiego_order_token_${reference}`, token);
    if (phone) localStorage.setItem(`yiego_unpaid_phone_${phone}`, reference);
  } catch { /* optional device memory */ }
}
export function savedUnpaidReference(phone: string): string {
  try { return localStorage.getItem(`yiego_unpaid_phone_${phone}`) ?? ""; } catch { return ""; }
}
export interface UnpaidDetails { reference: string; recipient: string; network: string; product: string; amount: number; createdAt: string; expiresAt: string | null; paymentUrl: string | null }
export async function unpaidOrderAction(action: "lookup" | "continue" | "cancel", reference: string, email = "") {
  const { data, error } = await supabase.functions.invoke<{ data?: UnpaidDetails; error?: string }>("unpaid-order-action", { body: { action, reference, email, managementToken: savedOrderToken(reference) } });
  if (error || data?.error) throw new Error("Unable to manage this order. Use the account or email used at checkout, or ask support to help.");
  return data?.data;
}