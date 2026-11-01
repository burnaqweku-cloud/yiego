export interface KoraBalance { currency: string; available: number; pending: number }

/** Provider balances are reported separately, not asserted to equal total unsettled collections. */
export function parseKoraBalances(data: unknown): KoraBalance[] | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const rows: KoraBalance[] = [];
  for (const [currency, value] of Object.entries(data)) {
    if (!/^[A-Z]{3}$/.test(currency) || !value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    const money = (v: unknown) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) ? Number(v) : NaN;
    const available = money(row.available_balance), pending = money(row.pending_balance);
    if (!Number.isFinite(available) || !Number.isFinite(pending) || available < 0 || pending < 0) return null;
    rows.push({ currency, available, pending });
  }
  return rows.length ? rows : null;
}

export function koraRefundState(status: unknown): "processing" | "success" | "failed" | "unknown" {
  return status === "processing" || status === "success" || status === "failed" ? status : "unknown";
}