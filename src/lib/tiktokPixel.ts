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
  methods?: string[];
  setAndDefer?: (target: Record<string, unknown>, method: string) => void;
  instance?: (pixelId: string) => TikTokQueue;
  load?: (pixelId: string, configuration?: Record<string, unknown>) => void;
  page?: () => void;
  track?: (event: string, parameters?: Record<string, unknown>, options?: { event_id: string }) => void;
  grantConsent?: () => void;
  revokeConsent?: () => void;
  enableCookie?: () => void;
  disableCookie?: () => void;
  _i?: Record<string, TikTokQueue>;
  _t?: Record<string, number>;
  _o?: Record<string, Record<string, unknown>>;
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
  window.TiktokAnalyticsObject = "ttq";
  const ttq = window.ttq = window.ttq ?? [];
  ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
  ttq.setAndDefer = (target, method) => {
    target[method] = (...args: unknown[]) => { (target as unknown as TikTokQueue).push([method, ...args]); };
  };
  for (const method of ttq.methods) ttq.setAndDefer(ttq as unknown as Record<string, unknown>, method);
  ttq.instance = (pixelId) => {
    const instance = ttq._i?.[pixelId] ?? [];
    for (const method of ttq.methods ?? []) ttq.setAndDefer?.(instance as unknown as Record<string, unknown>, method);
    return instance;
  };
  ttq.load = (pixelId, configuration = {}) => {
    ttq._i = ttq._i ?? {};
    ttq._i[pixelId] = [];
    ttq._t = { ...ttq._t, [pixelId]: Date.now() };
    ttq._o = { ...ttq._o, [pixelId]: configuration };
    const script = document.createElement("script");
    script.id = PIXEL_SCRIPT_ID;
    script.type = "text/javascript";
    script.async = true;
    script.src = `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${pixelId}&lib=ttq`;
    const firstScript = document.getElementsByTagName("script")[0];
    if (firstScript?.parentNode) firstScript.parentNode.insertBefore(script, firstScript);
    else document.head.appendChild(script);
  };
  ttq.load(PIXEL_ID);
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
