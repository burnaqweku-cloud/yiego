import { describe, expect, it } from "vitest";
import { canMarkSupplierCredit, creditMatches, type SupplierCredit } from "./supplierCredit";
const order = { id: "one", status: "failed_needs_review", payment_status: "succeeded", supplier_order_reference: "TRX-PDATFZSKHD-1792678927", supplier_purchase_id: "808195", suppliers: { code: "databundleshub" } };
const credit: SupplierCredit = { confirmed: true, note: "7.9 credited for two 3.95 orders", at: "2026-10-22T15:54:00Z", supplierCode: "databundleshub", supplierReference: order.supplier_order_reference, purchaseId: "808195" };
describe("private supplier credit confirmations", () => {
  it("allows paid needs-review orders without changing their status", () => {
    expect(canMarkSupplierCredit(order)).toBe(true); expect(order.status).toBe("failed_needs_review");
  });
  it("does not mark already customer-refunded orders", () => { expect(canMarkSupplierCredit({ ...order, status: "refunded", payment_status: "refunded" })).toBe(false); });
  it("does not mark unpaid orders", () => { expect(canMarkSupplierCredit({ ...order, payment_status: "pending" })).toBe(false); });
  it("requires explicit completed credit rather than review status", () => { expect(creditMatches(order)).toBe(false); expect(creditMatches(order, credit)).toBe(true); });
  it("does not carry confirmation over to a new supplier attempt", () => { expect(creditMatches({ ...order, supplier_purchase_id: "new" }, credit)).toBe(false); });
  it("does not carry confirmation over to another supplier", () => { expect(creditMatches({ ...order, suppliers: { code: "other" } }, credit)).toBe(false); });
  it("clearing confirmation removes the marker", () => { expect(creditMatches(order, { ...credit, confirmed: false })).toBe(false); });
});