/** Payment amounts are GHS major units; the intent may store a wallet base amount. */
export function matchesPayment(input: { amount: number; currency: string | null }, intent: { amount: unknown; currency: unknown; metadata?: Record<string, unknown> | null }): boolean {
  const expected = Number(intent.metadata?.chargedAmount ?? intent.amount);
  return Number.isFinite(input.amount) && Number.isFinite(expected) && expected > 0
    && Math.abs(Math.round(input.amount * 100) - Math.round(expected * 100)) <= 2
    && input.currency === intent.currency && intent.currency === "GHS";
}

/** Test payments must never credit a wallet, activate a plan or dispatch an order. */
export function isTestPayment(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.test === true;
}