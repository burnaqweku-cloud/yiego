import { describe, expect, it, vi } from "vitest";
import { openShortLink, shortLinkTag, shortLinkTarget } from "./advertShortLink";
import { advertLink, advertShortLink } from "./promoAdverts";

describe("short advert links", () => {
  it("lead to the bundle list with the promo mark and the advert's tag", () => {
    const url = new URL(shortLinkTarget("/go/deals")!, "https://datayego.com");
    expect(url.pathname).toBe("/shop");
    expect(url.searchParams.get("promo")).toBe("1");
    expect(url.searchParams.get("utm_campaign")).toBe("deals");
    expect(url.searchParams.get("utm_medium")).toBe("paid");
  });
  it("count under the same advert as the long link (same tag, case ignored)", () => {
    const long = new URL(advertLink({ place: "whatsapp", source: null, campaign: "Deals" }));
    const short = new URL(shortLinkTarget(new URL(advertShortLink({ campaign: "Deals" })!).pathname)!, "https://datayego.com");
    expect(short.searchParams.get("utm_campaign")).toBe(long.searchParams.get("utm_campaign")!.toLowerCase());
  });
  it("work for a Meta campaign number and with a trailing slash", () => {
    expect(shortLinkTarget("/go/120253539246610206/")).toContain("utm_campaign=120253539246610206");
  });
  it("leave every other address alone", () => {
    for (const p of ["/", "/shop", "/go", "/go/", "/go/a/b", "/going/deals", "/go/has space", "/go/%3Cscript%3E", "/go/-dash-first"]) expect(shortLinkTarget(p)).toBeNull();
    expect(shortLinkTag("a tag")).toBeNull();
    expect(shortLinkTag(null)).toBeNull();
  });
  it("an advert known only by its source has no short link", () => {
    expect(advertShortLink({ campaign: null })).toBeNull();
    expect(advertShortLink({ campaign: "deals" })).toBe("https://datayego.com/go/deals");
  });

  const win = (hostname: string, pathname: string) => ({ location: { hostname, pathname } as Location, history: { replaceState: vi.fn() } as unknown as History });
  it("swap the address before the app starts, on the main site", () => {
    const w = win("datayego.com", "/go/deals");
    expect(openShortLink(w)).toBe(true);
    expect(w.history.replaceState).toHaveBeenCalledWith(null, "", "/shop?promo=1&utm_source=link&utm_medium=paid&utm_campaign=deals");
  });
  it("do nothing on an agent's store or on an ordinary address", () => {
    const store = win("kofi.datayego.com", "/go/deals");
    expect(openShortLink(store)).toBe(false);
    expect(store.history.replaceState).not.toHaveBeenCalled();
    expect(openShortLink(win("datayego.com", "/shop"))).toBe(false);
  });
});
