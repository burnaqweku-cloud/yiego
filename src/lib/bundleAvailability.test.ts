import { describe, expect, it } from "vitest";
import { applyNetworkAvailability } from "./bundleAvailability";

const products = [
  { id: "tel1", app_product_code: "tel1", name: "Telecel 1GB", validity: null, customer_price: 5, network_id: "tel", is_paused: false },
  { id: "at1", app_product_code: "at1", name: "AT 1GB", validity: null, customer_price: 5, network_id: "at", is_paused: false },
  { id: "mtn1", app_product_code: "mtn1", name: "MTN 1GB", validity: null, customer_price: 5, network_id: "mtn", is_paused: false },
];
const networks = [
  { id: "tel", code: "telecel", name: "Telecel", is_paused: true, pause_reason: null },
  { id: "at", code: "airteltigo", name: "AirtelTigo", is_paused: true, pause_reason: null },
  { id: "mtn", code: "mtn", name: "MTN", is_paused: false, pause_reason: null },
];
describe("network purchase availability", () => {
  it("blocks Telecel bundles when Telecel is paused", () => {
    expect(applyNetworkAvailability(products, networks)[0].is_paused).toBe(true);
  });
  it("blocks AirtelTigo bundles when AirtelTigo is paused", () => {
    expect(applyNetworkAvailability(products, networks)[1].is_paused).toBe(true);
  });
  it("leaves available MTN bundles available", () => {
    expect(applyNetworkAvailability(products, networks)[2].is_paused).toBe(false);
  });
  it("preserves individual bundle pauses on an available network", () => {
    expect(applyNetworkAvailability([{ ...products[2], is_paused: true }], networks)[0].is_paused).toBe(true);
  });
  it("cannot allow purchases when network availability is unknown", () => {
    expect(applyNetworkAvailability(products, []).every(p => p.is_paused)).toBe(true);
  });
});