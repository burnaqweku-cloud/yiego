import { describe, expect, it } from "vitest";
import { canManageUnpaidOrder, isCancellableUnpaid } from "../../supabase/functions/_shared/unpaidOrder";
import { forgetUnpaidReference, latestUnpaidReference, saveOrderToken, savedOrderToken, savedUnpaidReference } from "./unpaidOrders";
describe("unpaid order cancellation", () => {
  it("allows awaiting-payment orders only", () => {
    expect(isCancellableUnpaid({ status: "awaiting_payment", payment_status: "pending" })).toBe(true);
    expect(isCancellableUnpaid({ status: "processing", payment_status: "pending" })).toBe(false);
  });
  it("never allows paid or refunded orders", () => {
    for (const payment_status of ["succeeded", "refunded"]) expect(isCancellableUnpaid({ status: "awaiting_payment", payment_status })).toBe(false);
    expect(isCancellableUnpaid({ status: "awaiting_payment", payment_status: "pending", paid_at: "2026-10-23" })).toBe(false);
  });
  it("protects account orders from another user or guest token", () => {
    expect(canManageUnpaidOrder({ user_id: "owner", management_token: "secret" }, "other", "secret", "")).toBe(false);
    expect(canManageUnpaidOrder({ user_id: "owner" }, "owner", "", "")).toBe(true);
  });
  it("requires guest checkout email or private device capability", () => {
    expect(canManageUnpaidOrder({ management_token: "secret" }, null, "", "")).toBe(false);
    expect(canManageUnpaidOrder({ management_token: "secret" }, null, "secret", "")).toBe(true);
    expect(canManageUnpaidOrder({ guest_email: "buyer@example.com" }, null, "", "Buyer@example.com")).toBe(true);
  });
  it("restores a previous unpaid checkout after returning on the same device", () => {
    localStorage.clear();
    saveOrderToken("YG-0123456789", "private-test-token", "0551234567");
    expect(latestUnpaidReference()).toBe("YG-0123456789");
    expect(savedUnpaidReference("+233551234567")).toBe("YG-0123456789");
    expect(savedOrderToken("YG-0123456789")).toBe("private-test-token");
  });
  it("clears only the cancelled order so another bundle can be selected", () => {
    localStorage.clear();
    saveOrderToken("YG-0123456789", "first-token", "0551234567");
    saveOrderToken("AG-9876543210", "second-token", "0541234567");
    forgetUnpaidReference("YG-0123456789");
    expect(savedUnpaidReference("0551234567")).toBe("");
    expect(savedOrderToken("YG-0123456789")).toBe("");
    expect(savedUnpaidReference("0541234567")).toBe("AG-9876543210");
    expect(latestUnpaidReference()).toBe("AG-9876543210");
  });
});