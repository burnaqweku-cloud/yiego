import { describe, expect, it } from "vitest";
import { NEW_TAG_UNTIL, POPUP_UNTIL, cedis, isPopupPage, newTagLive, popupOwed, scopeOf } from "./servicesNews";

const base = { now: Date.UTC(2026, 10, 14), seen: false, onPopupPage: true, promoVisit: false, otherPopupThisVisit: false, nothingOnSale: false };

describe("the Services pop-up", () => {
  it("is owed to a new visitor on the home page or the bundle list", () => {
    expect(popupOwed(base)).toBe(true);
    expect(isPopupPage("/", false)).toBe(true);
    expect(isPopupPage("/shop", false)).toBe(true);
    expect(isPopupPage("/bundles/", true)).toBe(true);
  });
  it("never appears on checkout, tracking, services or account pages", () => {
    for (const p of ["/checkout", "/track-order", "/services", "/wallet", "/orders", "/shop/mtn"]) expect(isPopupPage(p, false)).toBe(false);
    for (const p of ["/track", "/services", "/sign-in", "/account", "/success"]) expect(isPopupPage(p, true)).toBe(false);
    expect(isPopupPage("/shop", true)).toBe(false);
  });
  it("shows once per device, and not in a visit that already had a pop-up", () => {
    expect(popupOwed({ ...base, seen: true })).toBe(false);
    expect(popupOwed({ ...base, otherPopupThisVisit: true })).toBe(false);
  });
  it("leaves alone a visitor who came from an advert, and a site with nothing on sale", () => {
    expect(popupOwed({ ...base, promoVisit: true })).toBe(false);
    expect(popupOwed({ ...base, nothingOnSale: true })).toBe(false);
  });
  it("retires itself after two weeks; the New tag after a month or once Services has been opened", () => {
    expect(popupOwed({ ...base, now: POPUP_UNTIL })).toBe(true);
    expect(popupOwed({ ...base, now: POPUP_UNTIL + 1 })).toBe(false);
    expect(newTagLive(POPUP_UNTIL + 1, false)).toBe(true);
    expect(newTagLive(NEW_TAG_UNTIL + 1, false)).toBe(false);
    expect(newTagLive(base.now, true)).toBe(false);
  });
  it("keeps each store's memory apart from the main site's", () => {
    expect(scopeOf()).toBe("main");
    expect(scopeOf("UrbanStore")).toBe("store:urbanstore");
  });
  it("writes prices the way the adverts do", () => {
    expect(cedis(20)).toBe("GH₵20");
    expect(cedis(12.5)).toBe("GH₵12.50");
  });
});
