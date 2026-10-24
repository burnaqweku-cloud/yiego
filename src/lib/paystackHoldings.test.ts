import { describe, expect, it } from "vitest";
import { paystackComparison, type PaystackHoldings } from "./paystackHoldings";

function fixture(): PaystackHoldings {
  const payout = { id: 1, status: "pending", currency: "GHS", gross: 1523.45, fees: 0, net: 1485.18, date: null };
  return { read_at: "2026-10-24T10:00:00Z", balance: { ok: true, items: [{ currency: "GHS", amount: 0 }] }, totals: { ok: true, pending_transfers: 9999, pending_by_currency: [{ currency: "GHS", amount: 551.52 }, { currency: "NGN", amount: 9999 }] }, settlements: [{ account: "main", ok: true, complete: true, not_yet_paid: [payout] }, { account: "subaccount", ok: true, complete: true, not_yet_paid: [payout] }] };
}

describe("Paystack provider comparison", () => {
  it("reads GHS pending money rather than a mixed-currency scalar", () => {
    expect(paystackComparison(fixture()).pending).toBe(551.52);
  });
  it("counts a payout returned for both accounts only once", () => {
    expect(paystackComparison(fixture()).scheduledNet).toBe(1485.18);
  });
  it("does not turn a failed payout lookup into zero money", () => {
    const reading = fixture(); reading.settlements[0].ok = false;
    expect(paystackComparison(reading).scheduledNet).toBeNull();
  });
  it("does not assume currency when the provider omits GHS", () => {
    const reading = fixture(); reading.totals.pending_by_currency = null;
    expect(paystackComparison(reading).pending).toBeNull();
  });
  it("excludes failed settlements rather than treating them as scheduled", () => {
    const reading = fixture(); reading.settlements = [reading.settlements[0]]; reading.settlements[0].not_yet_paid[0].status = "failed";
    expect(paystackComparison(reading).scheduledNet).toBe(0);
  });
});