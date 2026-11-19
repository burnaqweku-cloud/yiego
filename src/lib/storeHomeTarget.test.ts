import { describe, expect, it } from "vitest";
import { storeHomeTarget } from "./storeHost";

const at = (url: string) => { const u = new URL(url); return { host: u.host, pathname: u.pathname, search: u.search, hash: u.hash }; };

describe("storeHomeTarget (datayego.com/s/<slug> jumps to the store's own address)", () => {
  it("takes a store with its own domain straight there, same page and query", () => {
    expect(storeHomeTarget("https://mbundle.shop", at("https://datayego.com/s/elikplim02/success?reference=AG-1"), "/s/elikplim02")).toBe("https://mbundle.shop/success?reference=AG-1");
    expect(storeHomeTarget("https://mbundle.shop", at("https://datayego.com/s/elikplim02"), "/s/elikplim02")).toBe("https://mbundle.shop/");
  });
  it("takes a sub-agent to its parent's domain", () => {
    expect(storeHomeTarget("https://mbundle.shop/s/nissdata", at("https://datayego.com/s/nissdata/track#x"), "/s/nissdata")).toBe("https://mbundle.shop/s/nissdata/track#x");
    expect(storeHomeTarget("https://mbundle.shop/s/nissdata", at("https://elikplim02.datayego.com/s/nissdata"), "/s/nissdata")).toBe("https://mbundle.shop/s/nissdata");
  });
  it("never jumps when already on that domain (no loop)", () => {
    expect(storeHomeTarget("https://mbundle.shop/s/nissdata", at("https://mbundle.shop/s/nissdata/success"), "/s/nissdata")).toBeNull();
    expect(storeHomeTarget("https://mbundle.shop", at("https://mbundle.shop/s/elikplim02"), "/s/elikplim02")).toBeNull();
  });
  it("stays put for a store with only its free address, or an answer that isn't an address", () => {
    for (const home of [null, undefined, "", "mbundle.shop", "http://mbundle.shop", "https://evil.example/x", "https://a.b/s/x?y", "javascript:alert(1)"])
      expect(storeHomeTarget(home as string | null, at("https://datayego.com/s/abc"), "/s/abc")).toBeNull();
  });
});
