import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanStoreBrand, forgetStoreBrand, readStoreBrand, saveStoreBrand, storeBrandKey } from "@/lib/storeBrand";
import { isStoreHost } from "@/lib/storeHost";

const host = { hostname: "Urban.datayego.com", pathname: "/bundles" };
const path = { hostname: "datayego.com", pathname: "/s/Kofi/services" };

describe("a store's remembered name and logo", () => {
  beforeEach(() => localStorage.clear());
  it("is kept under the store's own address, or its /s/ link", () => {
    expect(storeBrandKey(host)).toBe("yg-store-brand:host:urban.datayego.com");
    expect(storeBrandKey(path)).toBe("yg-store-brand:slug:kofi");
    // A sub-agent's store on the parent's address is its own store, not the parent's.
    expect(storeBrandKey({ hostname: "urban.datayego.com", pathname: "/s/ama" })).toBe("yg-store-brand:slug:ama");
  });
  it("comes back as saved, per store", () => {
    saveStoreBrand({ name: "Urbanstore", logo: "https://cdn.example/logo.png", template: "market", accent: "#ff5533" }, host);
    expect(readStoreBrand(host)).toEqual({ name: "Urbanstore", logo: "https://cdn.example/logo.png", template: "market", accent: "#ff5533" });
    expect(readStoreBrand(path)).toBeNull();
    forgetStoreBrand(host);
    expect(readStoreBrand(host)).toBeNull();
  });
  it("only keeps what is safe to draw", () => {
    expect(cleanStoreBrand({ name: "  Shop  ", logo: "javascript:alert(1)", template: "weird", accent: "red" })).toEqual({ name: "Shop", logo: null, template: "classic", accent: null });
    expect(cleanStoreBrand({ name: "", logo: "https://x/y.png" })).toBeNull();
    expect(cleanStoreBrand("nonsense")).toBeNull();
    localStorage.setItem(storeBrandKey(host), "{not json");
    expect(readStoreBrand(host)).toBeNull();
  });
});

describe("the start-up screen in index.html", () => {
  const html = readFileSync("index.html", "utf8");
  it("treats the same addresses as the main site as the app does", () => {
    const list = /var main = \[([^\]]+)\]/.exec(html)?.[1].split(",").map((s) => s.trim().replace(/"/g, "")) ?? [];
    expect(list.length).toBeGreaterThan(3);
    for (const h of list) expect(isStoreHost(h)).toBe(false);
    for (const h of ["urban.datayego.com", "buysell.com", "demo.localhost"]) expect(isStoreHost(h)).toBe(true);
    expect(html).toContain("lovable\\.app|lovableproject\\.com|lovable\\.dev");
  });
  it("reads the same keys the app saves, and sits before the page markup", () => {
    expect(html).toContain('"yg-store-brand:slug:"');
    expect(html).toContain('"yg-store-brand:host:"');
    expect(html.indexOf('id="yg-boot"')).toBeGreaterThan(0);
    expect(html.indexOf('id="yg-boot"')).toBeLessThan(html.indexOf('<div id="root"></div>'));
    expect(html).toContain("html.yg-boot #root>*{display:none!important}");
  });
});
