import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/admin-data", () => ({ adminDatabase: () => ({}) }));
import { moneyMoveType } from "./AdminFinanceHistory";

const entry = (kind: string, metadata: Record<string, unknown> | null, postings: { account: string; amount: number }[]) =>
  ({ id: "x", created_by: null, kind, occurred_at: "2026-11-22T10:00:00Z", amount: 300, note: null, metadata, supplier_id: null, postings });

describe("moneyMoveType", () => {
  it("a move from Kora is its own type, never capital", () => {
    const e = entry("master_adjustment", { kind: "move_in", from: "kora_held", charge: 2 }, [{ account: "bank", amount: 300 }, { account: "kora_held", amount: -302 }, { account: "kora_fees", amount: 2 }]);
    expect(moneyMoveType(e)).toBe("move_in");
  });
  it("keeps the older types", () => {
    expect(moneyMoveType(entry("partner_capital", null, [{ account: "bank", amount: 10 }, { account: "outside_funding", amount: -10 }]))).toBe("capital_in");
    expect(moneyMoveType(entry("master_adjustment", { kind: "spend" }, [{ account: "bank", amount: -50 }, { account: "other_expenses", amount: 50 }]))).toBe("spend");
    expect(moneyMoveType(entry("master_adjustment", { kind: "withdraw" }, [{ account: "bank", amount: -50 }, { account: "outside_funding", amount: 50 }]))).toBe("withdraw");
    expect(moneyMoveType(entry("master_adjustment", { kind: "add" }, [{ account: "bank", amount: 50 }, { account: "outside_funding", amount: -50 }]))).toBe("add");
  });
});
