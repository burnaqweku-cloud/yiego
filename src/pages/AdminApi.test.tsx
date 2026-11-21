import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Thenable-only stand-ins, like real supabase-js calls (no .catch/.finally).
const thenable = <T,>(value: T): PromiseLike<T> => ({ then: (ok, bad) => Promise.resolve(value).then(ok, bad) });
const state = vi.hoisted(() => ({ calls: [] as Array<[string, unknown]>, canAct: true }));
const CLIENTS = {
  enabled: true,
  clients: [
    { id: "c1", name: "Kofi Data Hub", status: "pending", phone: "0241234567", website: "kofi.com", note: "My website", created_at: new Date().toISOString(), approved_at: null, email: "kofi@x.com", account_name: "Kofi Mensah", agent: null, balance: 0, keys: [], orders: 0, orders_today: 0, delivered: 0, waiting: 0, sales: 0, sales_today: 0, last_order_at: null, requests_today: 0, special_prices: 0 },
    { id: "c2", name: "Ama Bundles", status: "active", phone: "0551234567", website: null, note: null, created_at: new Date().toISOString(), approved_at: new Date().toISOString(), email: "ama@x.com", account_name: "Ama", agent: { store: "Ama Store", slug: "ama", sub: false, status: "active" }, balance: 120, keys: [{ mode: "live", hint: "dy_live_ab12…ff00", created_at: new Date().toISOString(), last_used_at: null }], orders: 12, orders_today: 3, delivered: 10, waiting: 2, sales: 96, sales_today: 25.5, last_order_at: new Date().toISOString(), requests_today: 40, special_prices: 1 },
  ],
};
const PRICES = [{ product_id: "p1", id: "mtn-1", network: "MTN", size_gb: 1, cost: 3.95, supplier: "databundleshub", customer_price: 4.1, agent_price: 4, api_price: 4, special_price: null, available: true }];
vi.mock("@/lib/admin-data", () => ({
  formatAdminDate: (v: string) => v,
  adminDatabase: () => ({ rpc: (name: string, args: unknown) => {
    state.calls.push([name, args]);
    if (name === "admin_api_clients") return thenable({ data: CLIENTS, error: null });
    if (name === "admin_api_prices") return thenable({ data: PRICES, error: null });
    if (name === "admin_api_set_client_price") return thenable({ data: null, error: (args as { p_price: number }).p_price < 3.95 ? { message: "below_cost:3.95" } : null });
    return thenable({ data: "active", error: null });
  } }),
}));
vi.mock("@/hooks/useAdminAccess", () => ({ useAdminAccess: () => ({ canAct: state.canAct }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
import AdminApi from "./AdminApi";

const show = async (path = "/admin/api") => { await act(async () => { render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/admin/api" element={<AdminApi />} /><Route path="/admin/api/:section" element={<AdminApi />} /></Routes></MemoryRouter>); }); };

describe("Admin API customers", () => {
  beforeEach(() => { state.calls.length = 0; state.canAct = true; toast.success.mockReset(); toast.error.mockReset(); });

  it("opens on the waiting applications and approves one", async () => {
    await show();
    expect(screen.getByText("Waiting (1)")).toBeTruthy();
    fireEvent.click(screen.getByText("Kofi Data Hub"));
    expect(screen.getByText("My website")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Approve" })); });
    expect(state.calls).toContainEqual(["admin_api_set_status", { p_client: "c1", p_status: "active" }]);
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("approved"));
  });

  it("shows an active seller's figures and refuses a price below our cost", async () => {
    await show("/admin/api?c=c2");
    await waitFor(() => expect(screen.getByText("dy_live_ab12…ff00")).toBeTruthy());
    expect(screen.getByText("Their prices")).toBeTruthy();
    const box = await screen.findByLabelText("MTN 1GB price");
    fireEvent.change(box, { target: { value: "3.90" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("GH₵3.95"));
  });

  it("lets a view-only admin look but not act", async () => {
    state.canAct = false;
    await show("/admin/api?c=c1");
    expect((screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the standard price list and the switch", async () => {
    await show("/admin/api/prices");
    await waitFor(() => expect(screen.getByText("API switch")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Switch off" })).toBeTruthy();
    expect(screen.getByText(/1 bundle still uses the agent price/)).toBeTruthy();
  });
});
