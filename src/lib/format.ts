const ghs = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "GH₵ 2,458.50" */
export function formatGHS(amount: number): string {
  return ghs.format(amount);
}

/** "+GH₵ 200.00" for credits, "-GH₵ 28.00" for debits */
export function formatSigned(amount: number): string {
  return (amount >= 0 ? "+" : "-") + formatGHS(Math.abs(amount));
}

/** Split a formatted amount into its currency symbol and digits,
 *  so the "GH₵" can be styled smaller than the number. */
export function formatAmountParts(amount: number): { symbol: string; value: string } {
  const s = formatGHS(amount);
  const i = s.indexOf(" ");
  return i === -1 ? { symbol: "", value: s } : { symbol: s.slice(0, i), value: s.slice(i + 1) };
}

/** "GH₵24.50" or "GHS 24.50" (phones differ) as the currency mark and the figure, so the mark can be set small. */
export function moneyParts(text: string): { symbol: string; value: string } {
  const m = text.match(/^(\D*?)\s*(-?\d.*)$/);
  return m ? { symbol: m[1].trim(), value: m[2] } : { symbol: "", value: text };
}

/** Shown when the user hides their balance */
export const MASKED_BALANCE = "GH₵ ••••••";
