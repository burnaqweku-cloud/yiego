import { advertisingAllowed, requiresAdvertisingConsent, visitorRegion } from "./tiktokConsent";

/* Google tag (Tag Manager container). Loaded on customer pages only, never in admin.
   Visitors in the consent countries (EEA, UK, Switzerland) never get it: the consent notice there
   names TikTok and Facebook only. Everyone else gets it unless their browser asks not to be tracked.
   Google receives pages visited and the amount of a confirmed order: no phone numbers, no emails. */

const CONTAINER_ID = "GTM-MLN34QZK";
const SCRIPT_ID = "datayego-google-tag";
const PURCHASES_KEY = "yiego_google_purchases_v1";

declare global { interface Window { dataLayer?: unknown[] } }

const inAdmin = () => window.location.pathname.startsWith("/admin");
export function googleAllowed(region: string): boolean {
  return !requiresAdvertisingConsent(region) && advertisingAllowed(region);
}

let loaded = false;
function install(): void {
  if (loaded || document.getElementById(SCRIPT_ID)) { loaded = true; return; }
  loaded = true;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  const script = document.createElement("script");
  script.id = SCRIPT_ID; script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${CONTAINER_ID}`;
  document.head.appendChild(script);
}

/** Called once the visitor's region is known, and again whenever their choice changes. */
export function applyGoogleTag(region: string): boolean {
  if (typeof window === "undefined" || inAdmin() || !googleAllowed(region)) return false;
  install();
  return true;
}

function sentBefore(reference: string): boolean {
  try {
    const seen = JSON.parse(localStorage.getItem(PURCHASES_KEY) ?? "[]") as string[];
    if (seen.includes(reference)) return true;
    localStorage.setItem(PURCHASES_KEY, JSON.stringify([...seen, reference].slice(-100)));
  } catch { /* without storage the same tab could report twice; Google also drops repeats of one transaction_id */ }
  return false;
}

export interface GooglePurchase { reference: string; network?: string; product?: string; value?: number }

/** Reports a confirmed data order once, in the standard "purchase" form Google Ads and Analytics both read. Top-ups never call this. */
export async function trackGooglePurchase(input: GooglePurchase): Promise<boolean> {
  const reference = input.reference.trim().toUpperCase();
  const value = Number(input.value);
  if (!reference || reference.length > 80 || !Number.isFinite(value) || value <= 0) return false;
  if (!applyGoogleTag(await visitorRegion()) || sentBefore(reference)) return false;
  const name = [input.network, input.product].filter(Boolean).join(" · ").replace(/\s+/g, " ").slice(0, 120) || "Data bundle";
  window.dataLayer?.push({ ecommerce: null });
  window.dataLayer?.push({
    event: "purchase",
    ecommerce: { transaction_id: reference, value, currency: "GHS", items: [{ item_id: name, item_name: name, item_category: input.network ?? "Data", price: value, quantity: 1 }] },
  });
  return true;
}
