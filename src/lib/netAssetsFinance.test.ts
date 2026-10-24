import { describe, expect, it } from "vitest";
import { calculateNetAssets, type FinanceBalance } from "./netAssetsFinance";

function fixture(bank = 3400): FinanceBalance[] {
  return [
    { code: "bank", name: "Bank", kind: "asset", balance: bank },
    { code: "paystack_transit", name: "Paystack", kind: "asset", balance: 0 },
    { code: "outside_funding", name: "Partner capital", kind: "funding", balance: 2400 },
    { code: "opening_balance", name: "Opening funds", kind: "funding", balance: 0 },
    ...["customer_wallets", "owed_deliveries", "refunds_due", "owed_to_agents"].map((code) => ({ code, name: code, kind: "liability", balance: 0 })),
  ];
}

describe("net-assets profit comparison", () => {
  it("reduces GH₵1,000 profit to GH₵700 when a GH₵300 subscription is paid once", () => {
    expect(calculateNetAssets(fixture(), []).profit).toBe(1000);
    const paid = fixture(3100);
    paid.push({ code: "other_expenses", name: "Recorded subscription", kind: "expense", balance: 300 });
    expect(calculateNetAssets(paid, []).profit).toBe(700);
  });
  it("reduces GH₵700 profit to GH₵200 for a GH₵500 business expense", () => {
    expect(calculateNetAssets(fixture(3100), []).profit).toBe(700);
    expect(calculateNetAssets(fixture(2600), []).profit).toBe(200);
  });
  it("keeps historical expense records without deducting them a second time", () => {
    const balances = fixture();
    balances.push({ code: "other_expenses", name: "Old expenses", kind: "expense", balance: 1611.5 });
    expect(calculateNetAssets(balances, []).profit).toBe(1000);
  });
  it("includes every debt, including agents, pending checkout fees and domains", () => {
    const balances = fixture();
    const agents = balances.find((balance) => balance.code === "owed_to_agents");
    if (agents) agents.balance = 336.84;
    balances.push({ code: "fees_pending", name: "Pending fees", kind: "liability", balance: 22.43 }, { code: "domains_pending", name: "Pending domains", kind: "liability", balance: 10 });
    expect(calculateNetAssets(balances, []).totalLiabilities).toBe(369.27);
    expect(calculateNetAssets(balances, []).profit).toBe(630.73);
  });
  it("uses reported supplier money rather than adding it on top of the book balance", () => {
    const balances = fixture();
    balances.push({ code: "float_supplier", name: "Supplier", kind: "asset", balance: 80 });
    const result = calculateNetAssets(balances, [{ code: "supplier", name: "Supplier", confirmed_balance: 100, confirmed_at: "2026-10-24T07:56:00Z" }]);
    expect(result.totalAssets).toBe(3500);
    expect(result.profit).toBe(1100);
  });
  it("subtracts additional Paystack deductions only once", () => {
    expect(calculateNetAssets(fixture(), [], 38.27).profit).toBe(961.73);
    expect(() => calculateNetAssets(fixture(), [], -1)).toThrow();
  });
  it("counts opening funds and later partner contributions as capital, not profit", () => {
    const balances = fixture(3962.7);
    for (const balance of balances) {
      if (balance.code === "outside_funding") balance.balance = 2900;
      if (balance.code === "opening_balance") balance.balance = 62.7;
    }
    expect(calculateNetAssets(balances, []).profit).toBe(1000);
  });
  it("partner drawings reduce cash and net capital equally, leaving earned profit unchanged", () => {
    const balances = fixture(3100);
    const capital = balances.find((balance) => balance.code === "outside_funding");
    if (capital) capital.balance = 2100;
    expect(calculateNetAssets(balances, []).profit).toBe(1000);
  });
  it("does not show a profit from an incomplete financial snapshot", () => {
    expect(() => calculateNetAssets(fixture().filter((balance) => balance.code !== "owed_to_agents"), [])).toThrow();
  });
});