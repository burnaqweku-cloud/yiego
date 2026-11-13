import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { settled } from "@/lib/settled";

/* The real database client hands back "thenables": objects with .then() and nothing else. These mocks do the same,
   on purpose: with ordinary Promises a stray .catch() would pass here and break the live page. */
const thenable = <T,>(value: T, fail = false): PromiseLike<T> => ({ then: (ok, bad) => (fail ? Promise.reject<T>(new Error("boom")) : Promise.resolve(value)).then(ok, bad) });
const chain = <T,>(value: T) => { const c: Record<string, unknown> = { ...thenable(value) }; for (const m of ["select", "gte", "order", "limit", "neq"]) c[m] = () => c; return c; };
const state = vi.hoisted(() => ({ profitFails: false, profitNever: false }));

vi.mock("@/components/admin/AppStatsCard", () => ({ default: () => null }));
vi.mock("@/components/admin/SupplierBadge", () => ({ default: () => null, useFallbackOrigins: () => ({}) }));
vi.mock("@/lib/admin-data", () => ({
  formatAdminDate: (v: string) => v,
  readableStatus: (v: string) => v,
  adminDatabase: () => ({
    from: (table: string) => chain({ data: table === "suppliers" ? [{ code: "datasika", name: "DataSika", balance: 250 }] : [] }),
    rpc: (name: string) => {
      if (name === "admin_overview_counts") return thenable({ data: { paid: 7, delivered: 5, in_flight: 2, failed: 0, verification: 0, wrong_network: 0, cooldown: 0 } });
      if (name === "finance_overview") return thenable({ data: { period: { revenue: 63.35 }, owed: { undelivered: 8.2, undelivered_count: 2 }, cash: { supplier_float: {} } } });
      if (name === "admin_orders_profit") return state.profitNever ? { then: () => new Promise(() => undefined) } : thenable({ data: { profit: 5.2, paystack_charges: 1.37, kora_charges: 0, other_charges: 0 } }, state.profitFails);
      return thenable({ data: null });
    },
  }),
}));
import Admin from "./Admin";

const show = () => render(<MemoryRouter><Admin /></MemoryRouter>);
const tile = (label: string) => screen.getByText(label).closest("a, div")?.parentElement?.textContent ?? "";

describe("admin Overview", () => {
  beforeEach(() => { state.profitFails = false; state.profitNever = false; });

  it("shows the day's numbers (the database client has no .catch(), like the real one)", async () => {
    show();
    await waitFor(() => expect(tile("Paid orders")).toContain("7"));
    expect(tile("Paid orders")).toContain("71% delivered");
    await waitFor(() => expect(tile("Order profit")).toContain("5.20"));
  });

  it("still shows everything else when the profit figure fails", async () => {
    state.profitFails = true;
    show();
    await waitFor(() => expect(tile("Paid orders")).toContain("7"));
    expect(screen.getByText("DataSika")).toBeInTheDocument();
  });

  it("does not wait for the profit figure before showing the rest", async () => {
    state.profitNever = true;
    show();
    await waitFor(() => expect(tile("Paid orders")).toContain("7"));
    expect(tile("In progress")).toContain("2");
  });
});

describe("settled", () => {
  it("gives the answer, or the fallback when the call fails, and never rejects", async () => {
    expect(await settled(thenable({ data: 1 }), { data: 0 })).toEqual({ data: 1 });
    expect(await settled(thenable({ data: 1 }, true), { data: 0 })).toEqual({ data: 0 });
  });
});
