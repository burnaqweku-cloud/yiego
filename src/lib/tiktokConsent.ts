export const TIKTOK_CONSENT_STORAGE_KEY = "yiego_tiktok_ad_consent_v1";
export const TIKTOK_CONSENT_NOTICE_VERSION = "2026-11-09";
export const TIKTOK_CONSENT_NOTICE = "TikTok may receive your IP address, device and browser information, cookie or ad-click identifiers, pages visited, and confirmed data-order events with a unique order event ID and bundle description. TikTok uses this to measure DataYego advertising and successful payments. DataYego does not send TikTok your email, phone number, Mobile Money PIN, card details, or advanced-matching identifiers.";

export type AdvertisingChoice = "granted" | "denied";
export interface ConsentDecision {
  choice: AdvertisingChoice;
  region: string;
  decidedAt: string;
  noticeVersion: string;
}
export interface AdvertisingConsentRecord extends ConsentDecision {
  version: 1;
  visitorId: string;
  decisions: ConsentDecision[];
}

// EEA, UK and Switzerland. Unknown, Tor and unverifiable regions fail closed.
const CONSENT_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO", "GB", "CH",
]);

export function requiresAdvertisingConsent(region: string): boolean {
  const code = region.toUpperCase();
  return code === "XX" || code === "T1" || CONSENT_COUNTRIES.has(code);
}

export function globalPrivacyControlEnabled(): boolean {
  return typeof navigator !== "undefined" && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function advertisingAllowed(
  region: string,
  record: AdvertisingConsentRecord | null = readAdvertisingConsent(),
  gpc = globalPrivacyControlEnabled(),
): boolean {
  if (gpc || record?.choice === "denied") return false;
  if (record?.choice === "granted") return true;
  return !requiresAdvertisingConsent(region);
}

function validDecision(value: unknown): value is ConsentDecision {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ConsentDecision>;
  return (item.choice === "granted" || item.choice === "denied")
    && typeof item.region === "string" && typeof item.decidedAt === "string"
    && typeof item.noticeVersion === "string";
}

export function readAdvertisingConsent(): AdvertisingConsentRecord | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(TIKTOK_CONSENT_STORAGE_KEY) ?? "null") as Partial<AdvertisingConsentRecord> | null;
    if (!parsed || parsed.version !== 1 || typeof parsed.visitorId !== "string" || !validDecision(parsed)) return null;
    const decisions = Array.isArray(parsed.decisions) ? parsed.decisions.filter(validDecision).slice(-20) : [];
    return {
      ...parsed,
      choice: parsed.choice as AdvertisingChoice,
      region: (parsed.region as string).toUpperCase(),
      decidedAt: parsed.decidedAt as string,
      noticeVersion: parsed.noticeVersion as string,
      decisions,
    } as AdvertisingConsentRecord;
  } catch {
    return null;
  }
}

function visitorId(): string {
  try { return crypto.randomUUID(); } catch { return `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

export function saveAdvertisingConsent(choice: AdvertisingChoice, region: string): AdvertisingConsentRecord {
  const previous = readAdvertisingConsent();
  const decision: ConsentDecision = {
    choice,
    region: region.toUpperCase(),
    decidedAt: new Date().toISOString(),
    noticeVersion: TIKTOK_CONSENT_NOTICE_VERSION,
  };
  const record: AdvertisingConsentRecord = {
    version: 1,
    visitorId: previous?.visitorId ?? visitorId(),
    ...decision,
    decisions: [...(previous?.decisions ?? []), decision].slice(-20),
  };
  try { localStorage.setItem(TIKTOK_CONSENT_STORAGE_KEY, JSON.stringify(record)); } catch { /* storage disabled: this tab still applies the choice */ }
  return record;
}

export function consentReference(record: AdvertisingConsentRecord | null, region: string): string {
  return record ? `${record.visitorId}:${record.noticeVersion}:${record.decidedAt}` : `regional-default:${region.toUpperCase()}`;
}

/** Return the two-letter country, or XX whenever the trace cannot be trusted. */
export function parseCloudflareTrace(trace: string, pageHost: string): string {
  const fields = new Map(trace.split(/\r?\n/).map((line) => {
    const at = line.indexOf("=");
    return at < 0 ? [line, ""] : [line.slice(0, at), line.slice(at + 1)];
  }));
  const traceHost = (fields.get("h") ?? "").trim().toLowerCase();
  if (!traceHost || traceHost !== pageHost.trim().toLowerCase()) return "XX";
  const location = (fields.get("loc") ?? "XX").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(location) ? location : "XX";
}

let regionForThisVisit: Promise<string> | null = null;

async function lookupVisitorRegion(): Promise<string> {
  if (typeof window === "undefined") return "XX";
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch("/cdn-cgi/trace", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return "XX";
    return parseCloudflareTrace(await response.text(), window.location.host);
  } catch {
    return "XX";
  } finally {
    window.clearTimeout(timeout);
  }
}

/** One lookup per page visit; consent itself is read afresh for every send. */
export function visitorRegion(): Promise<string> {
  regionForThisVisit ??= lookupVisitorRegion();
  return regionForThisVisit;
}

export function resetVisitorRegionForTests(): void {
  regionForThisVisit = null;
}
