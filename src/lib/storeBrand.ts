/* What a store looks like, remembered on this device so its loading screen can show the store's own name and logo
   straight away on the next visit (the start-up script in index.html reads the same keys before the app loads).
   Keyed by where the store lives: its own address (buysell.datayego.com, a custom domain) or /s/<slug>. */
export interface StoreBrand { name: string; logo: string | null; template: "classic" | "market" | "studio"; accent: string | null }

type Where = Pick<Location, "hostname" | "pathname">;
export function storeBrandKey(where: Where = window.location): string {
  const slug = /^\/s\/([^/]+)/.exec(where.pathname)?.[1];
  return slug ? `yg-store-brand:slug:${slug.toLowerCase()}` : `yg-store-brand:host:${where.hostname.toLowerCase()}`;
}

/** Only what is safe to draw: a short name, an https logo, a known template, a #rrggbb colour. */
export function cleanStoreBrand(value: unknown): StoreBrand | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const name = typeof v.name === "string" ? v.name.trim().slice(0, 60) : "";
  if (!name) return null;
  return {
    name,
    logo: typeof v.logo === "string" && /^https:\/\//.test(v.logo) ? v.logo : null,
    template: v.template === "market" || v.template === "studio" ? v.template : "classic",
    accent: typeof v.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(v.accent) ? v.accent : null,
  };
}

export function readStoreBrand(where: Where = window.location): StoreBrand | null {
  try { const raw = localStorage.getItem(storeBrandKey(where)); return raw ? cleanStoreBrand(JSON.parse(raw)) : null; } catch { return null; }
}
export function saveStoreBrand(brand: StoreBrand, where: Where = window.location) {
  try { const clean = cleanStoreBrand(brand); if (clean) localStorage.setItem(storeBrandKey(where), JSON.stringify(clean)); } catch { /* storage may be unavailable */ }
}
export function forgetStoreBrand(where: Where = window.location) {
  try { localStorage.removeItem(storeBrandKey(where)); } catch { /* storage may be unavailable */ }
}
