import { describe, expect, it } from "vitest";
import { canManageUnpaidOrder, isCancellableUnpaid } from "../../supabase/functions/_shared/unpaidOrder";
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
});