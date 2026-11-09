import {
  advertisingAllowed,
  consentReference,
  readAdvertisingConsent,
  requiresAdvertisingConsent,
  visitorRegion,
} from "./tiktokConsent";

const PIXEL_ID = "1014898397527680";
const PIXEL_SCRIPT_ID = "datayego-meta-pixel";
const PAYMENTS_KEY = "yiego_meta_payment_events_v1";
/** First consent notice that named Facebook. Older acceptances covered TikTok only. */
export const META_MIN_NOTICE_VERSION = "2026-11-09b";

type FbqArgs = unknown[];
interface Fbq {
  (...args: FbqArgs): void;
  callMethod?: (...args: FbqArgs) => void;
  queue: FbqArgs[];
  push: Fbq;
  loaded: boolean;
  version: string;
}

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
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

/** Meta needs a consent-region acceptance given after Facebook was named in the notice. */
export function metaAllowed(region: string): boolean {
  if (!advertisingAllowed(region)) return false;
  const record = readAdvertisingConsent();
  if (requiresAdvertisingConsent(region) && record?.choice === "granted") {
    return record.noticeVersion >= META_MIN_NOTICE_VERSION;
  }
  return true;
}

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
  } catch { /* in-memory marker still prevents repeats in this tab */ }
}

function call(...args: FbqArgs): void {
  const fbq = window.fbq;
  if (!fbq) return;
  if (fbq.callMethod) fbq.callMethod.apply(fbq, args);
  else fbq.queue.push(args);
}

function installPixel(): void {
  if (!window.fbq) {
    const n = function (...args: FbqArgs) {
      if (n.callMethod) n.callMethod.apply(n, args); else n.queue.push(args);
    } as Fbq;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    window.fbq = n;
    if (!window._fbq) window._fbq = n;
  }
  if (document.getElementById(PIXEL_SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = PIXEL_SCRIPT_ID;
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  const first = document.getElementsByTagName("script")[0];
  if (first?.parentNode) first.parentNode.insertBefore(script, first);
  else document.head.appendChild(script);
  call("init", PIXEL_ID, {}, { agent: "lovable" });
}

let lastPath = "";
export function enableMetaPixel(): void {
  installPixel();
  if (!pixelEnabled) call("consent", "grant");
  pixelEnabled = true;
  const path = window.location.pathname + window.location.search;
  if (path !== lastPath) { lastPath = path; call("track", "PageView"); }
}

export function disableMetaPixel(): void {
  if (window.fbq) call("consent", "revoke");
  pixelEnabled = false;
}

export function applyMetaConsent(region: string): boolean {
  const allowed = metaAllowed(region);
  if (allowed) enableMetaPixel(); else disableMetaPixel();
  return allowed;
}

/** Report page views on in-app navigation while permitted. */
export function trackMetaPageView(region: string): void {
  if (pixelEnabled && metaAllowed(region)) enableMetaPixel();
}

export interface MetaPayment {
  reference: string;
  network?: string;
  product?: string;
  /** Actual order value in GHS as recorded on the order. */
  value?: number;
}

/** Report a confirmed data order once; blocked orders are never replayed. Top-ups never call this. */
export async function trackMetaPayment(input: MetaPayment): Promise<boolean> {
  const reference = input.reference.trim().toUpperCase();
  if (!reference || reference.length > 80 || paymentEvent(reference)) return false;
  savePaymentEvent(reference, { status: "pending", eventId: reference, recordedAt: new Date().toISOString() });
  const region = await visitorRegion();
  if (paymentEvent(reference)?.status !== "pending") return false;

  const block = () => {
    savePaymentEvent(reference, { status: "blocked", eventId: reference, region, recordedAt: new Date().toISOString() });
    disableMetaPixel();
    return false;
  };
  if (!metaAllowed(region)) return block();
  enableMetaPixel();
  if (!metaAllowed(region)) return block();

  const params: Record<string, unknown> = {
    content_type: "product",
    content_name: [input.network, input.product].filter(Boolean).join(" · ").replace(/\s+/g, " ").slice(0, 120) || "Data bundle",
    num_items: 1,
  };
  if (typeof input.value === "number" && Number.isFinite(input.value) && input.value > 0) {
    params.value = Math.round(input.value * 100) / 100;
    params.currency = "GHS";
  }
  call("track", "Purchase", params, { eventID: reference });
  savePaymentEvent(reference, {
    status: "sent",
    eventId: reference,
    region,
    consentReference: consentReference(readAdvertisingConsent(), region),
    recordedAt: new Date().toISOString(),
  });
  return true;
}

export function resetMetaPixelForTests(): void {
  memoryPayments.clear();
  pixelEnabled = false;
  lastPath = "";
  document.getElementById(PIXEL_SCRIPT_ID)?.remove();
  delete window.fbq;
  delete window._fbq;
}
