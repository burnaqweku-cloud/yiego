/** The bundle an order bought, as "2GB" (owner, 21 Nov 2026: the admin order card had no size). From the product's
    GB, else from its name ("MTN — 2GB" -> "2GB"); empty when neither is known. */
export function bundleSize(order: { data_products?: { name?: string | null; capacity_gb?: number | string | null } | null }): string {
  const gb = Number(order.data_products?.capacity_gb);
  if (Number.isFinite(gb) && gb > 0) return `${Number.isInteger(gb) ? gb : Number(gb.toFixed(2))}GB`;
  return (order.data_products?.name ?? "").replace(/^.*?—\s*/, "").trim();
}
