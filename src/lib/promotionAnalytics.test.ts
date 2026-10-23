import { describe, expect, it } from "vitest";
import { conversionRate, promotionAdLink } from "./promotionAnalytics";

describe("promotion reporting rules", () => {
  it("measures visitor-to-buyer conversion with the visitor denominator", () => { expect(conversionRate(20, 200)).toBe(10); });
  it("measures signup completion separately from purchase conversion", () => { expect(conversionRate(15, 40)).toBe(37.5); });
  it("does not invent conversions when there are no visitors", () => { expect(conversionRate(0, 0)).toBe(0); });
  it("keeps TikTok source and campaign in the reusable promotion link", () => {
    const url = new URL(promotionAdLink("tiktok", "1GB October"));
    expect(url.pathname).toBe("/shop"); expect(url.searchParams.get("promo")).toBe("1"); expect(url.searchParams.get("utm_source")).toBe("tiktok"); expect(url.searchParams.get("utm_campaign")).toBe("1GB October"); expect(url.searchParams.get("utm_medium")).toBe("paid_social");
  });
});