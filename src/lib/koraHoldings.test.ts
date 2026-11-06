import { describe, expect, it } from "vitest";
import { koraHeld } from "./koraHoldings";
import { financeProfit } from "./financeV2";

const reading = (available = 40.75, pending = 34.04) => ({ configured: true, test: false, ok: true, items: [{ currency: "GHS", available, pending }] });
describe("Kora business cash", () => {
  it("counts screenshot pending 34.04 and available 40.75 as 74.79", () => expect(koraHeld(reading())?.total).toBe(74.79));
  it("moving pending into available leaves total assets unchanged", () => expect(koraHeld(reading(74.79, 0))?.total).toBe(74.79));
  it("20 withdrawn from 40.75 leaves 20.75 available and is deducted once", () => {
    const held = koraHeld(reading(20.75));
    expect(held?.available).toBe(20.75);
    expect(financeProfit({ bank: 0, paystack: 0, kora: held?.total, suppliers: [], owed: [], capital: 0 }).profit).toBe(54.79);
  });
  it("supplier funding preserves assets except the actual transfer fee", () => {
    const held = koraHeld(reading(20.25));
    expect(financeProfit({ bank: 0, paystack: 0, kora: held?.total, suppliers: [{ code: "supplier", name: "Supplier", amount: 20 }], owed: [], capital: 0 }).profit).toBe(74.29);
  });
  it("does not deduct a guessed processing fee from already net balances", () => expect(koraHeld(reading())?.pending).toBe(34.04));
  it("rejects missing GHS, test money and failed readings", () => {
    expect(koraHeld({ ...reading(), items: [] })).toBeNull();
    expect(koraHeld({ ...reading(), test: true })).toBeNull();
    expect(koraHeld({ ...reading(), ok: false })).toBeNull();
  });
});