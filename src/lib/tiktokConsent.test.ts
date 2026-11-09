import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  advertisingAllowed,
  parseCloudflareTrace,
  readAdvertisingConsent,
  requiresAdvertisingConsent,
  saveAdvertisingConsent,
  TIKTOK_CONSENT_NOTICE_VERSION,
  TIKTOK_CONSENT_STORAGE_KEY,
} from "./tiktokConsent";

describe("TikTok regional advertising consent", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("allows ordinary tracking in Ghana without showing a consent requirement", () => {
    expect(requiresAdvertisingConsent("GH")).toBe(false);
    expect(advertisingAllowed("GH", null, false)).toBe(true);
  });

  it("requires a choice in the EEA, UK and Switzerland", () => {
    for (const region of ["DE", "GB", "CH"]) {
      expect(requiresAdvertisingConsent(region)).toBe(true);
      expect(advertisingAllowed(region, null, false)).toBe(false);
    }
  });

  it("fails closed for unknown and Tor regions", () => {
    expect(advertisingAllowed("XX", null, false)).toBe(false);
    expect(advertisingAllowed("T1", null, false)).toBe(false);
  });

  it("honors a saved refusal even outside consent regions", () => {
    saveAdvertisingConsent("denied", "GB");
    expect(advertisingAllowed("GH", readAdvertisingConsent(), false)).toBe(false);
  });

  it("lets Global Privacy Control override saved acceptance", () => {
    saveAdvertisingConsent("granted", "GB");
    expect(advertisingAllowed("GB", readAdvertisingConsent(), true)).toBe(false);
  });

  it("rejects a trace rewritten by a different host", () => {
    expect(parseCloudflareTrace("h=example.com\nloc=GH", "datayego.com")).toBe("XX");
    expect(parseCloudflareTrace("h=datayego.com\nloc=GH", "datayego.com")).toBe("GH");
    expect(parseCloudflareTrace("h=datayego.com\nloc=T1", "datayego.com")).toBe("XX");
  });

  it("preserves acceptance evidence when consent is later withdrawn", () => {
    saveAdvertisingConsent("granted", "GB");
    const accepted = readAdvertisingConsent();
    saveAdvertisingConsent("denied", "GB");
    const withdrawn = readAdvertisingConsent();
    expect(withdrawn?.choice).toBe("denied");
    expect(withdrawn?.visitorId).toBe(accepted?.visitorId);
    expect(withdrawn?.decisions).toHaveLength(2);
    expect(withdrawn?.decisions[0]).toMatchObject({ choice: "granted", noticeVersion: TIKTOK_CONSENT_NOTICE_VERSION });
    expect(JSON.parse(localStorage.getItem(TIKTOK_CONSENT_STORAGE_KEY) ?? "{}").decisions).toHaveLength(2);
  });
});
