import { beforeEach, describe, expect, it, vi } from "vitest";

async function setup(region: string) {
  vi.resetModules();
  const consent = await import("./tiktokConsent");
  consent.resetVisitorRegionForTests();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => `h=${window.location.host}\nloc=${region}` }));
  const pixel = await import("./metaPixel");
  pixel.resetMetaPixelForTests();
  return { consent, pixel };
}

const purchases = () => (window.fbq?.queue ?? []).filter((a) => a[0] === "track" && a[1] === "Purchase");

describe("Facebook Pixel confirmed-payment reporting", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    delete (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
  });

  it("initialises pixel 1014898397527680 and sends one Purchase with GHS value", async () => {
    const { pixel } = await setup("GH");
    expect(await pixel.trackMetaPayment({ reference: "yg-abc1", network: "MTN", product: "2GB", value: 7.9 })).toBe(true);
    expect(await pixel.trackMetaPayment({ reference: "YG-ABC1", value: 7.9 })).toBe(false);
    expect(window.fbq?.queue.find((a) => a[0] === "init")?.[1]).toBe("1014898397527680");
    expect(purchases()).toHaveLength(1);
    expect(purchases()[0][2]).toMatchObject({ value: 7.9, currency: "GHS" });
    expect(purchases()[0][3]).toEqual({ eventID: "YG-ABC1" });
  });

  it("never replays a payment blocked in a consent region", async () => {
    const { consent, pixel } = await setup("GB");
    expect(await pixel.trackMetaPayment({ reference: "YG-B1", value: 4 })).toBe(false);
    consent.saveAdvertisingConsent("granted", "GB");
    expect(await pixel.trackMetaPayment({ reference: "YG-B1", value: 4 })).toBe(false);
    expect(purchases()).toHaveLength(0);
  });

  it("ignores an older TikTok-only acceptance in consent regions", async () => {
    const { pixel } = await setup("GB");
    localStorage.setItem("yiego_tiktok_ad_consent_v1", JSON.stringify({ version: 1, visitorId: "v", choice: "granted", region: "GB", decidedAt: "2026-11-09T00:00:00Z", noticeVersion: "2026-11-09", decisions: [] }));
    expect(await pixel.trackMetaPayment({ reference: "YG-OLD1", value: 4 })).toBe(false);
  });

  it("does not send under Global Privacy Control", async () => {
    const { pixel } = await setup("GH");
    Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, value: true });
    expect(await pixel.trackMetaPayment({ reference: "YG-GPC", value: 4 })).toBe(false);
    expect(window.fbq).toBeUndefined();
  });
});
