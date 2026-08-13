// Paystack payment fee — a flat 4% on money moving through Paystack (card /
// mobile money). Never applied to spending an existing wallet balance. The
// customer receives the full base value and pays the fee on top.
// Keep PAYSTACK_FEE_RATE in step with src/lib/fees.ts.
export const PAYSTACK_FEE_RATE = 0.04;

export function paystackFee(base: number): number {
  return Math.round(base * PAYSTACK_FEE_RATE * 100) / 100;
}

export function paystackTotal(base: number): number {
  return Math.round((base + paystackFee(base)) * 100) / 100;
}
