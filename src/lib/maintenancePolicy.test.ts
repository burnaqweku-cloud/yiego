import { describe, expect, it } from "vitest";
import { maintenanceApplies, maintenanceBlocksRequest, parseMaintenance } from "./maintenancePolicy";

describe("maintenance rules", () => {
  it("exempts verified administrators only", () => {
    expect(maintenanceApplies(true, false, false)).toBe(true);
    expect(maintenanceApplies(true, true, true)).toBe(true);
    expect(maintenanceApplies(true, true, false)).toBe(false);
    expect(maintenanceApplies(false, false, false)).toBe(false);
  });
  it("blocks all new payment paths including guests and agent subscriptions", () => {
    for (const fn of ["create-guest-data-payment", "create-wallet-data-order", "create-wallet-deposit", "agent-subscribe", "domain-purchase"]) expect(maintenanceBlocksRequest(`/functions/v1/${fn}`, "POST")).toBe(true);
    for (const action of ["prepare", "pay_wallet", "pay_paystack", "cancel", "share"]) expect(maintenanceBlocksRequest("/functions/v1/order-payment-action", "POST", JSON.stringify({ action }))).toBe(true);
  });
  it("allows order tracking and already-paid reconciliation", () => {
    for (const fn of ["track-order", "reconcile-guest-order", "verify-wallet-deposit"]) expect(maintenanceBlocksRequest(`/functions/v1/${fn}`, "POST")).toBe(false);
    expect(maintenanceBlocksRequest("/rest/v1/rpc/track_by_phone", "POST")).toBe(false);
    expect(maintenanceBlocksRequest("/functions/v1/order-payment-action", "POST", { action: "list_pending" })).toBe(false);
  });
  it("allows sign-in, sign-out, account reads and order-history reads", () => {
    expect(maintenanceBlocksRequest("/auth/v1/token", "POST")).toBe(false);
    expect(maintenanceBlocksRequest("/auth/v1/logout", "POST")).toBe(false);
    expect(maintenanceBlocksRequest("/rest/v1/orders?select=*", "GET")).toBe(false);
    expect(maintenanceBlocksRequest("/rest/v1/rpc/my_agent_access", "POST")).toBe(false);
  });
  it("blocks withdrawals and account/business modifications", () => {
    for (const rpc of ["agent_request_payout", "agent_update_store", "agent_set_price", "order_fix_recipient"]) expect(maintenanceBlocksRequest(`/rest/v1/rpc/${rpc}`, "POST")).toBe(true);
    expect(maintenanceBlocksRequest("/rest/v1/profiles", "PATCH")).toBe(true);
    expect(maintenanceBlocksRequest("/storage/v1/object/logos", "POST")).toBe(true);
  });
  it("does not trust string enabled flags and normalizes editable content", () => {
    expect(parseMaintenance({ enabled: "true" }).enabled).toBe(false);
    expect(parseMaintenance({ enabled: true, reason: "  Supplier upgrade  " }).reason).toBe("Supplier upgrade");
    expect(parseMaintenance({ title: "x".repeat(200) }).title).toHaveLength(120);
  });
});