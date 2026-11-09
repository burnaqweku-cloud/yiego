import {
  advertisingAllowed,
  consentReference,
  readAdvertisingConsent,
  visitorRegion,
} from "./tiktokConsent";

const PIXEL_ID = "DBOPTQJC77U4J2JR53N0";
const PIXEL_SCRIPT_ID = "datayego-tiktok-pixel";
const PAYMENTS_KEY = "yiego_tiktok_payment_events_v1";

interface TikTokQueue extends Array<unknown> {
  page?: () => void;
  track?: (event: string, parameters?: Record<string, unknown>, options?: { event_id: string }) => void;
  grantConsent?: () => void;
  revokeConsent?: () => void;
  enableCookie?: () => void;
  disableCookie?: () => void;
}

declare global {
  interface Window {
    TiktokAnalyticsObject?: string;
    ttq?: TikTokQueue;
  }
}

interface PaymentEventRecord {
  status: "pending" | "sent" | "blocked";
  eventId: string;
  region?: string;
  consentReference?: string;
  recordedAt: string;
}

const memoryPayments = new Map<string, PaymentEventRecord>();
let pixelEnabled = false;

function readPaymentEvents(): Record<string, PaymentEventRecord> {
  try {
    const parsed = JSON.parse(localStorage.getItem(PAYMENTS_KEY) ?? "{}") as Record<string, PaymentEventRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function paymentEvent(reference: string): PaymentEventRecord | null {
  return memoryPayments.get(reference) ?? readPaymentEvents()[reference] ?? null;
}

function savePaymentEvent(reference: string, record: PaymentEventRecord): void {
  memoryPayments.set(reference, record);
  try {
    const events = readPaymentEvents();
    events[reference] = record;
    const entries = Object.entries(events).sort(([, a], [, b]) => a.recordedAt.localeCompare(b.recordedAt)).slice(-100);
    localStorage.setItem(PAYMENTS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* the in-memory marker still prevents repeats in this tab */ }
}

function installPixel(): void {
  if (document.getElementById(PIXEL_SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = PIXEL_SCRIPT_ID;
  script.textContent = `!function (w, d, t) {
    w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=d.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=d.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
    ttq.load('${PIXEL_ID}');
  }(window, document, 'ttq');`;
  document.head.appendChild(script);
}

/** Enable only after the current region and fresh consent/opt-out state allow it. */
export function enableTikTokPixel(): void {
  if (pixelEnabled) return;
  installPixel();
  window.ttq?.grantConsent?.();
  window.ttq?.enableCookie?.();
  // TikTok's current pixel also follows SPA URL changes; do not add a second route observer.
  window.ttq?.page?.();
  pixelEnabled = true;
}

export function disableTikTokPixel(): void {
  window.ttq?.revokeConsent?.();
  window.ttq?.disableCookie?.();
  pixelEnabled = false;
}

export function applyTikTokConsent(region: string): boolean {
  const allowed = advertisingAllowed(region);
  if (allowed) enableTikTokPixel(); else disableTikTokPixel();
  return allowed;
}

export interface TikTokPayment {
  reference: string;
  network?: string;
  product?: string;
}

/**
 * Report a confirmed data order once. A blocked decision is retained forever on
 * this device so later acceptance never replays an event that was blocked when
 * the payment was confirmed. Wallet top-ups never call this function.
 */
export async function trackTikTokPayment(input: TikTokPayment): Promise<boolean> {
  const reference = input.reference.trim().toUpperCase();
  if (!reference || reference.length > 80 || paymentEvent(reference)) return false;

  // Claim before awaiting the region so a refresh/second call cannot send it again.
  savePaymentEvent(reference, { status: "pending", eventId: reference, recordedAt: new Date().toISOString() });
  const region = await visitorRegion();
  const existing = paymentEvent(reference);
  if (existing?.status !== "pending") return false;

  const block = () => {
    savePaymentEvent(reference, { status: "blocked", eventId: reference, region, recordedAt: new Date().toISOString() });
    disableTikTokPixel();
    return false;
  };
  if (!advertisingAllowed(region)) return block();

  enableTikTokPixel();
  // Consent can change in another tab while the region lookup is in flight.
  if (!advertisingAllowed(region)) return block();

  const description = [input.network, input.product].filter(Boolean).join(" · ").replace(/\s+/g, " ").slice(0, 120) || "Data bundle";
  window.ttq?.track?.(
    "CompletePayment",
    { content_type: "product", quantity: 1, description },
    { event_id: reference },
  );
  savePaymentEvent(reference, {
    status: "sent",
    eventId: reference,
    region,
    consentReference: consentReference(readAdvertisingConsent(), region),
    recordedAt: new Date().toISOString(),
  });
  return true;
}

export function resetTikTokPixelForTests(): void {
  memoryPayments.clear();
  pixelEnabled = false;
  document.getElementById(PIXEL_SCRIPT_ID)?.remove();
  delete window.ttq;
  delete window.TiktokAnalyticsObject;
}
