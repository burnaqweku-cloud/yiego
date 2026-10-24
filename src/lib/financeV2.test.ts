import { describe, expect, it } from "vitest";
import { financeProfit, paystackHeld } from "./financeV2";

const base = { bank: 1000, paystack: 2000, suppliers: [{ code: "dbh", name: "DBH", amount: 500 }], owed: [{ code: "w", name: "Wallets", amount: 300 }], capital: 2400 };
const p = (o: Partial<typeof base>) => financeProfit({ ...base, ...o }).profit;

describe("rebuilt finance profit", () => {
  it("adds bank, Paystack and suppliers, minus owed and capital", () => expect(p({})).toBe(800));
  it("top-up of 1,000 with 10 charge lowers profit by exactly 10", () => expect(p({ bank: 1000 - 1010, suppliers: [{ code: "dbh", name: "DBH", amount: 1500 }] })).toBe(790));
  it("business cost of 100 lowers profit by 100", () => expect(p({ bank: 900 })).toBe(700));
  it("returning 100 capital leaves profit unchanged", () => expect(p({ bank: 900, capital: 2300 })).toBe(800));
  it("partner putting in 500 leaves profit unchanged", () => expect(p({ bank: 1500, capital: 2900 })).toBe(800));
  it("agent payout of 21 (20 sent) raises profit by the 1 fee", () => expect(p({ bank: 980, owed: [{ code: "w", name: "Wallets", amount: 279 }] })).toBe(801));
  it("wallet refund of 10 moves debt only, bank unchanged", () => expect(p({ owed: [{ code: "w", name: "Wallets", amount: 310 }] })).toBe(790));
});

const reading = (refunds: { ok: boolean; items: { id: number; status: string; amount: number; deducted: number }[] } | undefined) => ({
  read_at: new Date().toISOString(),
  balance: { ok: true, items: [] },
  totals: { ok: true, pending_transfers: 896.94, pending_by_currency: [{ currency: "GHS", amount: 896.94 }] },
  settlements: [{ account: "main" as const, ok: true, complete: true, not_yet_paid: [{ id: 1, status: "pending", currency: "GHS", gross: 1500, fees: 50, net: 1450, date: null }] }],
  refunds_not_fully_deducted: refunds,
});

describe("Paystack held money", () => {
  it("counts scheduled payout after charges plus not yet scheduled, minus refunds not taken back", () => {
    const held = paystackHeld(reading({ ok: true, items: [{ id: 9, status: "processed", amount: 18.72, deducted: 0 }] }))!;
    expect(held.scheduledNet).toBe(1450);
    expect(held.scheduledFees).toBe(50);
    expect(held.total).toBe(2328.22);
  });
  it("a Paystack refund not yet taken back leaves profit unchanged (owed and Paystack both drop)", () => {
    const before = financeProfit({ ...base, paystack: 2000, owed: [{ code: "o", name: "Owed", amount: 318 }] }).profit;
    const after = financeProfit({ ...base, paystack: 2000 - 18, owed: [{ code: "o", name: "Owed", amount: 300 }] }).profit;
    expect(after).toBe(before);
  });
  it("shows no figure if the refund reading is missing", () => expect(paystackHeld(reading(undefined))).toBeNull());
});
