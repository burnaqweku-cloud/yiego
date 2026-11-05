import { supabase } from "@/integrations/supabase/client";
export function savedOrderToken(reference: string): string {
  try { return localStorage.getItem(`yiego_order_token_${reference}`) ?? ""; } catch { return ""; }
}
export function saveOrderToken(reference: string, token: string, phone?: string) {
  try {
    localStorage.setItem(`yiego_order_token_${reference}`, token);
    if (phone) localStorage.setItem(`yiego_unpaid_phone_${phone}`, reference);
    localStorage.setItem("yiego_latest_unpaid", reference);
  } catch { /* optional device memory */ }
}
export function savedUnpaidReference(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("233") && digits.length === 12 ? `0${digits.slice(3)}` : digits;
  try { return localStorage.getItem(`yiego_unpaid_phone_${local}`) ?? ""; } catch { return ""; }
}
export function latestUnpaidReference(): string {
  try { return localStorage.getItem("yiego_latest_unpaid") ?? ""; } catch { return ""; }
}
export function forgetUnpaidReference(reference: string) {
  try {
    for (const key of Object.keys(localStorage)) {
      if ((key.startsWith("yiego_unpaid_phone_") || key === "yiego_latest_unpaid") && localStorage.getItem(key) === reference) localStorage.removeItem(key);
    }
    localStorage.removeItem(`yiego_order_token_${reference}`);
  } catch { /* device memory is optional */ }
}
export class UnpaidOrderError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); }
}
export interface UnpaidDetails { reference: string; mine?: boolean; recipient: string; network: string; product: string; amount: number; createdAt: string; expiresAt: string | null; paymentUrl: string | null }
export async function unpaidOrderAction(action: "lookup" | "continue" | "cancel", reference: string, email = "") {
  const { data, error } = await supabase.functions.invoke<{ data?: UnpaidDetails; error?: string }>("unpaid-order-action", { body: { action, reference, email, managementToken: savedOrderToken(reference) } });
  if (error || data?.error) {
    const response = (error as { context?: Response } | null)?.context;
    let message = data?.error ?? "Unable to load this order. Please try again.";
    if (response) { try { const body = await response.clone().json(); message = body.error ?? message; } catch { /* no response body */ } }
    throw new UnpaidOrderError(message, response?.status);
  }
  if (!data?.data && action !== "cancel") throw new UnpaidOrderError("Could not load the order. Please try again.");
  return data?.data;
}