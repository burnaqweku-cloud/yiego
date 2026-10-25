import { describe, expect, it } from "vitest";
import { estimateProfitAfterPendingFees, financeProfit, paystackHeld, profitIfAllDeliver } from "./financeV2";

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
    const held = paystackHeld(reading({ ok: true, items: [{ id: 9, status: "processed", amount: 18.72, deducted: 0 }] }));
    if (!held) throw new Error("Expected complete holdings");
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
  it("moves the 18.72 refund into the scheduled deduction without counting it twice", () => {
    const before = reading({ ok: true, items: [{ id: 9, status: "processed", amount: 18.72, deducted: 0 }] });
    const after = reading({ ok: true, items: [] });
    after.settlements[0].not_yet_paid[0].net -= 18.72;
    expect(paystackHeld(after)?.total).toBe(paystackHeld(before)?.total);
    expect(paystackHeld(after)?.refundsNotTakenBack).toBe(0);
  });
});

describe("display-only pending fee estimate", () => {
  it("subtracts 1.30 pending fees from 350 to show 348.70", () => {
    expect(estimateProfitAfterPendingFees(350, 65)).toEqual({ pendingFees: 1.3, profit: 348.7 });
  });
  it("rounds 2% of the combined 8.52 balance to 0.17 as an estimate", () => {
    expect(estimateProfitAfterPendingFees(350, 8.52)).toEqual({ pendingFees: 0.17, profit: 349.83 });
  });
  it("leaves profit unchanged when nothing is unscheduled", () => {
    expect(estimateProfitAfterPendingFees(350, 0).profit).toBe(350);
  });
  it("does not change main profit or deduct scheduled deductions and refunds again", () => {
    const held = paystackHeld(reading({ ok: true, items: [{ id: 9, status: "processed", amount: 18.72, deducted: 0 }] }));
    if (!held) throw new Error("Expected complete holdings");
    const main = financeProfit({ ...base, paystack: held.total });
    expect(main.profit).toBe(1128.22);
    expect(estimateProfitAfterPendingFees(main.profit, held.notYetScheduled)).toEqual({ pendingFees: 17.94, profit: 1110.28 });
    expect(main.profit).toBe(1128.22);
  });
});

const queued = (extra = {}) => ({ amount: 100, cost_amount: 90, status: "processing", supplier_purchase_id: "123", supplier_status: "pending", supplier_cost_in_assets: true, ...extra });

describe("display-only profit if all orders deliver", () => {
  it("reaches the owner's 500 example without subtracting an already charged cost twice", () => {
    expect(profitIfAllDeliver(400, [queued()]).profit).toBe(500);
    expect(profitIfAllDeliver(500, []).profit).toBe(500);
  });
  it("stays at 500 across partial and final delivery", () => {
    expect(profitIfAllDeliver(350, [queued(), queued({ amount: 50, cost_amount: 45 })]).profit).toBe(500);
    expect(profitIfAllDeliver(450, [queued({ amount: 50, cost_amount: 45 })]).profit).toBe(500);
    expect(profitIfAllDeliver(500, []).profit).toBe(500);
  });
  it("deducts cost once for the book-float fallback", () => {
    expect(profitIfAllDeliver(490, [queued({ supplier_cost_in_assets: false })]).profit).toBe(500);
  });
  it("creates both agent and parent debts on simulated delivery", () => {
    expect(profitIfAllDeliver(400, [queued({ agent_margin: 4, parent_margin: 2 })]).profit).toBe(494);
  });
  it("releases deferred checkout fees just as actual delivery does", () => {
    expect(profitIfAllDeliver(399.84, [queued({ pending_fee: 0.16 })]).profit).toBe(500);
  });
  it("does not count unsent paid orders", () => {
    expect(profitIfAllDeliver(400, [queued({ status: "paid", supplier_purchase_id: null })]).counted).toBe(0);
  });
  it("keeps verification holds out even with a supplier purchase id", () => {
    const result = profitIfAllDeliver(400, [queued({ admin_resolution_status: "awaiting_verification" })]);
    expect(result.profit).toBe(400); expect(result.verification).toBe(1);
  });
  it("keeps rejected orders out even with an old supplier purchase id", () => {
    expect(profitIfAllDeliver(400, [queued({ supplier_status: "rejected" })]).counted).toBe(0);
  });
  it("keeps review and wrong-network orders out", () => {
    const result = profitIfAllDeliver(400, [queued({ status: "failed_needs_review" }), queued({ admin_resolution_status: "wrong_network" })]);
    expect(result.counted).toBe(0); expect(result.review).toBe(1); expect(result.wrongNetwork).toBe(1);
  });
  it("does not guess missing supplier costs", () => {
    const result = profitIfAllDeliver(400, [queued({ cost_amount: null })]);
    expect(result.profit).toBe(400); expect(result.missingCost).toBe(1);
  });
  it("tracks refunds in current main profit and converges when no queue remains", () => {
    expect(profitIfAllDeliver(399.8, [queued()]).profit).toBe(499.8);
    expect(profitIfAllDeliver(499.8, []).profit).toBe(499.8);
  });
  it("does not change the main profit", () => {
    const main = financeProfit({ ...base, paystack: 500 });
    const before = main.profit;
    profitIfAllDeliver(main.profit, [queued()]);
    expect(main.profit).toBe(before);
  });
});
