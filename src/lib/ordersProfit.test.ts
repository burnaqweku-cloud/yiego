import { describe, expect, it } from "vitest";
import { paymentCharges, profitParts, type OrdersProfit } from "@/lib/ordersProfit";

// 13 Nov 2026, the real figures for that morning: 11 delivered orders.
const today: OrdersProfit = { delivered: 11, sales: 63.35, supplier_cost: 55.3, agent_earnings: 4, parent_share: 0, partner_commission: 0, checkout_fees: 2.52, paystack_charges: 1.37, kora_charges: 0, other_charges: 0, no_cost_recorded: 0, no_charge_recorded: 0, profit: 5.2 };
const month: OrdersProfit = { delivered: 4087, sales: 40299.32, supplier_cost: 36078.34, agent_earnings: 1170.08, parent_share: 120.29, partner_commission: 0, checkout_fees: 1427.34, paystack_charges: 717.95, kora_charges: 44.15, other_charges: 0, no_cost_recorded: 0, no_charge_recorded: 0, profit: 3595.85 };
const total = (p: OrdersProfit) => Math.round(profitParts(p).reduce((a, x) => a + x.sign * x.amount, 0) * 100) / 100;

describe("profit on delivered orders", () => {
  it("is what is left after the supplier, the agents and the payment service", () => {
    expect(total(today)).toBe(5.2);
    expect(total(month)).toBe(3595.85);
  });
  it("takes the payment service's cut off, which the old figure did not", () => {
    // Old figure for that morning: 63.35 - 55.30 - 4.00 + 2.52 = 6.57.
    expect(Math.round((today.profit + paymentCharges(today)) * 100) / 100).toBe(6.57);
    expect(paymentCharges(month)).toBeCloseTo(762.1, 2);
  });
  it("lists only the lines that have money in them", () => {
    expect(profitParts(today).map((x) => x.label)).toEqual(["sales", "supplier cost", "agents' earnings", "checkout fees", "Paystack charges"]);
    expect(profitParts(month).map((x) => x.label)).toContain("parent agents' share");
    expect(profitParts(month).map((x) => x.label)).toContain("Kora charges");
    expect(profitParts({ ...today, sales: 0, supplier_cost: 0, agent_earnings: 0, checkout_fees: 0, paystack_charges: 0, profit: 0 }).map((x) => x.label)).toEqual(["sales", "supplier cost"]);
  });
});
