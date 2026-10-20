import { describe, it, expect } from "vitest";
import { buildOrderSms, eligibleSms, type OrderSmsRecord } from "../../supabase/functions/_shared/orderSmsTemplates";
const order: OrderSmsRecord = { order_reference: "YG-TEST", created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), status: "processing", payment_status: "succeeded", recipient_phone: "+233536529090", capacity_gb: 2, capacity_mb: null, network_name: "MTN", supplier_order_reference: "accepted", supplier_purchase_id: null, admin_resolution_status: null };
const fixed: OrderSmsRecord = { ...order, created_at: "2026-10-19T23:30:00Z" };
const store = { agent_slug: "kofi-data", store_name: "Kofi's Data Store" };
describe("Order SMS rules", () => {
  it("includes the actual order reference in both routine notifications", () => { for (const kind of ["purchase", "delivered"] as const) { const text = buildOrderSms({ ...fixed, order_reference: "YG-991AC1080A" }, kind); expect(text).toContain("Order ID: YG-991AC1080A"); expect(text).not.toContain("YG-TEST"); } });
  it("names DTYEGO and ends with the bare site domain for main-site orders", () => { for (const kind of ["purchase", "delivered", "verified"] as const) { const text = buildOrderSms(fixed, kind); expect(text).toContain("on DTYEGO"); expect(text.endsWith(" datayego.com")).toBe(true); expect(text).not.toContain("https://"); expect(text).not.toContain("MTN"); } });
  it("keeps store orders white-label: the store's name and its own address, never DataYego", () => {
    for (const kind of ["purchase", "delivered", "verified"] as const) {
      const text = buildOrderSms({ ...fixed, ...store }, kind);
      expect(text).toContain("on Kofi's Data Store"); expect(text.endsWith(" kofi-data.datayego.com")).toBe(true); expect(text).not.toContain("DTYEGO");
      expect(buildOrderSms({ ...fixed, ...store, store_domain: "kofidata.com" }, kind).endsWith(" kofidata.com")).toBe(true);
    }
  });
  it("writes sizes as 2G / 500MB", () => { expect(buildOrderSms(fixed, "purchase")).toContain("Your 2G is"); expect(buildOrderSms({ ...fixed, capacity_gb: null, capacity_mb: 500 }, "delivered")).toContain("Your 500MB order"); });
  it("keeps both routine texts to plain GSM text, one segment for a normal store, two at most", () => {
    for (const kind of ["purchase", "delivered"] as const) {
      const normal = buildOrderSms({ ...fixed, capacity_gb: 100, order_reference: "YG-991AC1080A", ...store }, kind);
      expect(normal.length).toBeLessThanOrEqual(160); expect(/^[\x20-\x7e]+$/.test(normal)).toBe(true);
      const long = buildOrderSms({ ...fixed, capacity_gb: 100, order_reference: "YG-991AC1080A", agent_slug: "a".repeat(40), store_name: "Ama Serwaa Boateng's Fast Data Store Kumasi" }, kind);
      expect(long.length).toBeLessThanOrEqual(306);
    }
    expect(buildOrderSms({ ...fixed, store_name: "Kofi’s Dätä", agent_slug: "kofi" }, "purchase")).toContain("on Kofi's Data");
  });
  it("does not notify unpaid purchases", () => { expect(eligibleSms({ ...order, payment_status: "pending" }, "purchase")).toBe(false); expect(eligibleSms(order, "purchase")).toBe(true); });
  it("only confirms actual delivered status", () => { expect(eligibleSms(order, "delivered")).toBe(false); expect(eligibleSms({ ...order, status: "delivered" }, "delivered")).toBe(true); });
  it("does not call a verification hold, an unsent order or a stale order on its way", () => {
    expect(eligibleSms({ ...order, admin_resolution_status: "awaiting_verification" }, "verified")).toBe(false);
    expect(eligibleSms({ ...order, supplier_order_reference: null }, "verified")).toBe(false);
    expect(eligibleSms(order, "verified")).toBe(true);
    expect(eligibleSms({ ...order, created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() }, "verified")).toBe(false);
    expect(eligibleSms({ ...order, created_at: "2026-09-01T00:00:00Z", status: "delivered" }, "verified")).toBe(true);
  });
  it("uses the real purchase date and time in Accra, not Lagos", () => { expect(buildOrderSms(fixed, "purchase")).toContain("19 Oct 23:30"); });
  it("uses the matching delivered or on-way verification variant", () => { expect(buildOrderSms(fixed, "verified")).toContain("2G from 19th October is on its way"); expect(buildOrderSms({ ...fixed, status: "delivered" }, "verified")).toContain("2G from 19th October is already delivered"); });
});
