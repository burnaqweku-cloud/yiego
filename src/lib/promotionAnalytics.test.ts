import { describe, expect, it } from "vitest";
import { conversionRate, detectDevice, detectPlatform, promotionAdLink } from "./promotionAnalytics";

describe("promotion reporting rules", () => {
  it("measures visitor-to-buyer conversion with the visitor denominator", () => { expect(conversionRate(20, 200)).toBe(10); });
  it("measures signup completion separately from purchase conversion", () => { expect(conversionRate(15, 40)).toBe(37.5); });
  it("does not invent conversions when there are no visitors", () => { expect(conversionRate(0, 0)).toBe(0); });
  it("keeps TikTok source and campaign in the reusable promotion link", () => {
    const url = new URL(promotionAdLink("tiktok", "1GB October"));
    expect(url.pathname).toBe("/shop"); expect(url.searchParams.get("promo")).toBe("1"); expect(url.searchParams.get("utm_source")).toBe("tiktok"); expect(url.searchParams.get("utm_campaign")).toBe("1GB October"); expect(url.searchParams.get("utm_medium")).toBe("paid_social");
  });
});
describe("promo-link arrival detection", () => {
  const chrome = "Mozilla/5.0 (Linux; Android 13; TECNO KI5k) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
  it("reads a Meta ad click from the tag Meta adds to the plain promo link", () => {
    expect(detectPlatform("?promo=1&fbclid=IwAR0abc", "", chrome)).toEqual({ platform: "meta", click_id: "fbclid" });
  });
  it("reads a TikTok ad click from its tag", () => {
    expect(detectPlatform("?promo=1&ttclid=E.C.P.xyz", "", chrome)).toEqual({ platform: "tiktok", click_id: "ttclid" });
  });
  it("recognises the Facebook and Instagram in-app browsers when the link carries no tag", () => {
    expect(detectPlatform("?promo=1", "", `${chrome} [FB_IAB/FB4A;FBAV/440.0.0.31.105;]`).platform).toBe("meta");
    expect(detectPlatform("?promo=1", "", `${chrome} Instagram 300.0.0.29.110 Android`).platform).toBe("meta");
  });
  it("recognises the TikTok in-app browser and the referring site", () => {
    expect(detectPlatform("?promo=1", "", `${chrome} musical_ly_2023 BytedanceWebview/d8a21c6`).platform).toBe("tiktok");
    expect(detectPlatform("?promo=1", "https://www.tiktok.com/", chrome).platform).toBe("tiktok");
    expect(detectPlatform("?promo=1", "https://l.facebook.com/l.php", chrome).platform).toBe("meta");
  });
  it("keeps a named source and calls an untagged, unreferred arrival direct", () => {
    expect(detectPlatform("?promo=1&utm_source=tiktok", "", chrome).platform).toBe("tiktok");
    expect(detectPlatform("?promo=1", "", chrome)).toEqual({ platform: "direct", click_id: null });
    expect(detectPlatform("?promo=1", "https://example.org/page", chrome).platform).toBe("other");
  });
  it("describes the phone and browser in plain words", () => {
    expect(detectDevice(chrome, 360)).toEqual({ device: "mobile", os: "Android", browser: "Chrome" });
    expect(detectDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0", 390)).toEqual({ device: "mobile", os: "iOS", browser: "Instagram app" });
    expect(detectDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", 1440)).toEqual({ device: "desktop", os: "Windows", browser: "Chrome" });
  });
});
