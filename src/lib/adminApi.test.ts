import { describe, expect, it } from "vitest";
import { apiAdminError, byNetwork, filterClients, marginOf, priceFor, readPrice, type AdminApiBundle, type AdminApiClient } from "./adminApi";

const b = (over: Partial<AdminApiBundle>): AdminApiBundle => ({ product_id: "p", id: "mtn-1", network: "MTN", size_gb: 1, cost: 3.95, supplier: "databundleshub", customer_price: 4.1, agent_price: 4, api_price: 4, special_price: null, available: true, ...over });

describe("admin API helpers", () => {
  it("a seller's own price beats the standard one; no price means not offered", () => {
    expect(priceFor(b({}))).toBe(4);
    expect(priceFor(b({ special_price: 3.98 }))).toBe(3.98);
    expect(priceFor(b({ api_price: null }))).toBeNull();
  });
  it("works out what we keep, to the pesewa", () => {
    expect(marginOf(4, 3.95)).toBe(0.05);
    expect(marginOf(8.5, 7.9)).toBe(0.6);
    expect(marginOf(null, 3.95)).toBeNull();
  });
  it("reads typed prices strictly", () => {
    expect(readPrice("4.2")).toBe(4.2);
    expect(readPrice(" 12 ")).toBe(12);
    expect(readPrice("")).toBeNull();
    expect(readPrice("0")).toBe("bad");
    expect(readPrice("4.205")).toBe("bad");
    expect(readPrice("abc")).toBe("bad");
    expect(readPrice("-1")).toBe("bad");
  });
  it("explains refusals in plain words", () => {
    expect(apiAdminError("below_cost:3.95")).toContain("GH₵3.95");
    expect(apiAdminError("admin_required")).toContain("master admin");
    expect(apiAdminError("only_pending")).toContain("waiting");
  });
  it("filters sellers and groups bundles in network order", () => {
    const c = (status: AdminApiClient["status"]) => ({ status } as AdminApiClient);
    expect(filterClients([c("pending"), c("active"), c("active")], "active")).toHaveLength(2);
    expect(filterClients([c("pending"), c("active")], "all")).toHaveLength(2);
    expect(byNetwork([b({ network: "AirtelTigo" }), b({ network: "MTN" })]).map(([n]) => n)).toEqual(["MTN", "AirtelTigo"]);
  });
});
