import { describe, expect, it } from "vitest";
import { bundleSize } from "./bundleSize";

describe("bundleSize", () => {
  it("reads the product's GB", () => {
    expect(bundleSize({ data_products: { name: "MTN — 2GB", capacity_gb: 2 } })).toBe("2GB");
    expect(bundleSize({ data_products: { capacity_gb: "10.00" } })).toBe("10GB");
    expect(bundleSize({ data_products: { capacity_gb: 1.5 } })).toBe("1.5GB");
  });
  it("falls back to the name, and to nothing", () => {
    expect(bundleSize({ data_products: { name: "MTN — 5GB", capacity_gb: null } })).toBe("5GB");
    expect(bundleSize({ data_products: null })).toBe("");
  });
});
