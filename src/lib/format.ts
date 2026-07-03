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

/** Shown when the user hides their balance */
export const MASKED_BALANCE = "GH₵ ••••••";
