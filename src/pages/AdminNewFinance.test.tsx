import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminNewFinance from "./AdminNewFinance";

const state = vi.hoisted(() => ({ bank: 3400, rpc: vi.fn(), user: { id: "test-master" } }));
vi.mock("@/store/auth-context", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/components/ui/modal", () => ({ default: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null }));
vi.mock("@/lib/admin-data", () => ({ adminDatabase: () => ({
  rpc: state.rpc,
  from: (table: string) => {
    const data = table === "finance_balances" ? [
      { code: "bank", name: "Bank", kind: "asset", balance: state.bank },
      { code: "paystack_transit", name: "Paystack", kind: "asset", balance: 0 },
      { code: "outside_funding", name: "Capital", kind: "funding", balance: 2400 },
      { code: "opening_balance", name: "Opening", kind: "funding", balance: 0 },
      ...["customer_wallets", "owed_deliveries", "refunds_due", "owed_to_agents"].map((code) => ({ code, name: code, kind: "liability", balance: 0 })),
    ] : [];
    const chain = { select: () => chain, order: () => chain, in: () => chain, eq: () => chain, limit: () => chain, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
    return chain;
  },
}) }));

describe("new finance expense recording", () => {
  beforeEach(() => {
    state.bank = 3400;
    state.rpc.mockReset();
    state.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "admin_role") return { data: "master", error: null };
      if (fn === "finance_overview") return { data: { start: "2026-09-12T00:00:00Z", period: { net: 1000 } }, error: null };
      if (fn === "finance_master_adjust") { state.bank -= Number(args.p_amount); return { data: "recorded-expense", error: null }; }
      return { data: null, error: null };
    });
  });
  it("records the GH₵300 subscription once and reads back GH₵700 profit", async () => {
    render(<MemoryRouter><AdminNewFinance /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId("net-assets-profit").textContent).toMatch(/1,000\.00/));
    fireEvent.click(screen.getByRole("button", { name: "Business expense" }));
    fireEvent.change(screen.getByLabelText("Amount (GH₵)"), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("What was it for?"), { target: { value: "Business subscription" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm expense" }));
    await waitFor(() => expect(screen.getByTestId("net-assets-profit").textContent).toMatch(/700\.00/));
    expect(state.bank).toBe(3100);
    expect(state.rpc.mock.calls.filter(([fn]) => fn === "finance_master_adjust")).toEqual([["finance_master_adjust", { p_kind: "spend", p_amount: 300, p_reason: "Business subscription" }]]);
  });
});