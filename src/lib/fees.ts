/**
 * Paystack payment fee.
 *
 * A flat 4% applies to money moving through Paystack — card / mobile money —
 * whether that is a guest data purchase, a signed-in Paystack purchase, a
 * shared order paid by Paystack, or a wallet top-up. It never applies to
 * spending an existing wallet balance. The customer receives the full base
 * value (the bundle, or the round top-up amount) and pays the fee on top.
 *
 * Keep PAYSTACK_FEE_RATE in step with supabase/functions/_shared/fees.ts.
 */
export const PAYSTACK_FEE_RATE = 0.04;

/** The fee on a base amount, rounded to the pesewa. */
export function paystackFee(base: number): number {
  return Math.round(base * PAYSTACK_FEE_RATE * 100) / 100;
}

/** What the customer actually pays through Paystack: base + fee. */
export function paystackTotal(base: number): number {
  return Math.round((base + paystackFee(base)) * 100) / 100;
}
