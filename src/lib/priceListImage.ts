import type { Phase1Product } from "@/lib/phase1-api";

/* Draws a store-branded price list as a PNG (for WhatsApp status / groups). Pure canvas, no upload. */
export async function priceListImage(opts: { storeName: string; tagline?: string | null; link: string; accent?: string | null; products: Phase1Product[]; prices: Record<string, string | number> }): Promise<Blob> {
  const groups: Array<[string, string]> = [["MTN", "mtn"], ["Telecel", "tel"], ["AirtelTigo", "at"]];
  const rows = groups.map(([name, prefix]) => ({ name, items: opts.products.filter((p) => !p.is_paused && p.app_product_code?.startsWith(prefix)).sort((a, b) => Number(opts.prices[a.id] ?? a.customer_price) - Number(opts.prices[b.id] ?? b.customer_price)) })).filter((g) => g.items.length);
  const W = 1080, pad = 64, lineH = 58, head = 300;
  const H = head + rows.reduce((h, g) => h + 80 + g.items.length * lineH, 0) + 160;
  const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d")!;
  const accent = opts.accent && /^#[0-9a-fA-F]{6}$/.test(opts.accent) ? opts.accent : "#22c387";
  x.fillStyle = "#0b1512"; x.fillRect(0, 0, W, H);
  x.fillStyle = accent; x.fillRect(0, 0, W, 14);
  x.fillStyle = "#ffffff"; x.font = "800 56px Manrope, Arial, sans-serif"; x.fillText(opts.storeName, pad, 120);
  x.fillStyle = "#9fb3a9"; x.font = "500 28px Manrope, Arial, sans-serif"; x.fillText(opts.tagline || "MTN, Telecel & AirtelTigo data, delivered in minutes", pad, 170);
  x.fillStyle = accent; x.font = "700 30px Manrope, Arial, sans-serif"; x.fillText(opts.link.replace(/^https?:\/\//, ""), pad, 230);
  let y = head;
  for (const g of rows) {
    x.fillStyle = accent; x.font = "800 34px Manrope, Arial, sans-serif"; x.fillText(g.name, pad, y); y += 24;
    x.strokeStyle = "rgba(255,255,255,0.12)"; x.lineWidth = 2; x.beginPath(); x.moveTo(pad, y); x.lineTo(W - pad, y); x.stroke(); y += 44;
    for (const p of g.items) {
      const size = p.name.replace(/^.*?—\s*/, ""); const price = Number(opts.prices[p.id] ?? p.customer_price);
      x.fillStyle = "#ffffff"; x.font = "600 32px Manrope, Arial, sans-serif"; x.fillText(size, pad, y);
      x.fillStyle = "#9fb3a9"; x.font = "400 24px Manrope, Arial, sans-serif"; x.fillText(p.validity ?? "", pad + 180, y);
      x.fillStyle = "#ffffff"; x.font = "700 32px Manrope, Arial, sans-serif"; const t = `GHS ${price.toFixed(2)}`; x.fillText(t, W - pad - x.measureText(t).width, y);
      y += lineH;
    }
    y += 12;
  }
  x.fillStyle = "#6e8b7d"; x.font = "500 24px Manrope, Arial, sans-serif"; x.fillText(`Prices as of ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" })} · pay with MoMo or card`, pad, H - 70);
  return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
}
