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
const paystack = vi.hoisted(() => ({ pending: 0, scheduled: 0 }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: async () => ({ error: null, data: {
  read_at: "2026-10-24T11:00:00.000Z",
  balance: { ok: true, items: [{ currency: "GHS", amount: 0 }] },
  totals: { ok: true, pending_transfers: paystack.pending, pending_by_currency: [{ currency: "GHS", amount: paystack.pending }] },
  settlements: [{ account: "main", ok: true, complete: true, not_yet_paid: paystack.scheduled ? [{ id: 1, status: "pending", currency: "GHS", gross: paystack.scheduled, fees: 0, net: paystack.scheduled, date: null }] : [] }],
} }) } } }));

describe("new finance expense recording", () => {
  beforeEach(() => {
    state.bank = 3400; paystack.pending = 0; paystack.scheduled = 0;
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
  it("uses Paystack's own held money (551.52 waiting + 1,485.18 scheduled) instead of our record", async () => {
    paystack.pending = 551.52; paystack.scheduled = 1485.18;
    render(<MemoryRouter><AdminNewFinance /></MemoryRouter>);
    // 3,400 bank + 2,036.70 Paystack − 2,400 capital = 3,036.70
    await waitFor(() => expect(screen.getByTestId("net-assets-profit").textContent).toMatch(/3,036\.70/));
  });
});