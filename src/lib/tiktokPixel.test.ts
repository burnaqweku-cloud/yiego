import { beforeEach, describe, expect, it, vi } from "vitest";

async function setup(region: string) {
  vi.resetModules();
  const consent = await import("./tiktokConsent");
  consent.resetVisitorRegionForTests();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => `h=${window.location.host}\nloc=${region}` }));
  const pixel = await import("./tiktokPixel");
  pixel.resetTikTokPixelForTests();
  return { consent, pixel };
}

describe("TikTok confirmed-payment reporting", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    document.head.querySelectorAll("#datayego-tiktok-pixel").forEach((node) => node.remove());
    delete window.ttq;
  });

  it("sends one CompletePayment with a stable event ID and no guessed monetary value", async () => {
    const { pixel } = await setup("GH");
    expect(await pixel.trackTikTokPayment({ reference: "yg-abc123", network: "MTN", product: "2GB" })).toBe(true);
    expect(await pixel.trackTikTokPayment({ reference: "YG-ABC123", network: "MTN", product: "2GB" })).toBe(false);
    const calls = (window.ttq ?? []).filter((entry): entry is [string, string, Record<string, unknown>, { event_id: string }] => Array.isArray(entry) && entry[0] === "track");
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("track");
    expect(calls[0][1]).toBe("CompletePayment");
    expect(calls[0][2]).toEqual({ content_type: "product", quantity: 1, description: "MTN · 2GB" });
    expect(calls[0][2]).not.toHaveProperty("value");
    expect(calls[0][2]).not.toHaveProperty("currency");
    expect(calls[0][3]).toEqual({ event_id: "YG-ABC123" });
  });

  it("never replays a payment that was blocked when it was confirmed", async () => {
    const { consent, pixel } = await setup("GB");
    expect(await pixel.trackTikTokPayment({ reference: "YG-BLOCKED1" })).toBe(false);
    expect(window.ttq?.track).toBeUndefined();
    consent.saveAdvertisingConsent("granted", "GB");
    expect(await pixel.trackTikTokPayment({ reference: "YG-BLOCKED1" })).toBe(false);
    expect((window.ttq ?? []).filter((entry) => Array.isArray(entry) && entry[0] === "track")).toHaveLength(0);
  });

  it("does not send when Global Privacy Control overrides acceptance", async () => {
    const { consent, pixel } = await setup("GH");
    consent.saveAdvertisingConsent("granted", "GH");
    Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, value: true });
    expect(await pixel.trackTikTokPayment({ reference: "YG-GPC1" })).toBe(false);
    expect((window.ttq ?? []).filter((entry) => Array.isArray(entry) && entry[0] === "track")).toHaveLength(0);
  });

  it("stores the region and consent reference with a permitted conversion", async () => {
    const { consent, pixel } = await setup("GB");
    consent.saveAdvertisingConsent("granted", "GB");
    await pixel.trackTikTokPayment({ reference: "YG-CONSENT1" });
    const events = JSON.parse(localStorage.getItem("yiego_tiktok_payment_events_v1") ?? "{}");
    expect(events["YG-CONSENT1"].region).toBe("GB");
    expect(events["YG-CONSENT1"].consentReference).toContain(consent.readAdvertisingConsent()?.visitorId);
  });
});
