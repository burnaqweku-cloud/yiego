import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const data = {
  can_edit: true, waiting: 0, registering: 1,
  totals: { sales: 0, cost: 0, margins: 0, orders: 0, sales_today: 32, profit_today: 3 },
  products: [
    { code: "checker-wassce", kind: "checker", name: "WASSCE Results Checker", customer_price: 20, agent_price: 19, is_active: true, low_stock_at: 5, left: 5, held: 0, stock_value: 85, sold: 0, sold_today: 0 },
    { code: "afa-mtn", kind: "afa", name: "MTN AFA Registration", customer_price: 12, agent_price: 11, is_active: true, low_stock_at: 0, left: 0, held: 0, stock_value: 0, sold: 0, sold_today: 1 },
  ],
  registrations: [{ id: "r1", reference: "SV-TEST000001", status: "processing", amount: 12, fee_amount: 0.48, cost_amount: null, phone: "0241234567", payment_method: "paystack", paid_at: "2026-11-13T06:00:00Z", delivered_at: null, details: { full_name: "Ama Mensah", afa_phone: "0241234567" }, step: "submitted", note: null, supplier: "otessdata", supplier_reference: null, step_at: "2026-11-13T06:00:00Z" }],
  orders: [{ id: "o1", reference: "SV-TEST000002", name: "WASSCE Results Checker", quantity: 1, amount: 20, fee_amount: 0.8, cost_amount: 17, phone: "0241234567", status: "delivered", payment_method: "paystack", agent_id: null, agent_margin: null, created_at: "2026-11-13T06:00:00Z", paid_at: "2026-11-13T06:00:00Z", delivered_at: "2026-11-13T06:00:00Z", sent: null }],
  batches: [{ id: "b1", name: "WASSCE Results Checker", quantity: 5, total_cost: 85, paid_from: "bank", note: null, created_at: "2026-11-12T19:45:00Z" }],
};
vi.mock("@/lib/services", async (original) => ({
  ...(await original<typeof import("@/lib/services")>()),
  loadAdminServices: vi.fn(async () => ({ data, error: null })),
  loadSmsSenders: vi.fn(async () => ({ data: { services_enabled: false, services_sender: "Dyservice", agents_enabled: false, agents_sender: "Dyverify", agent_approved_text: "" }, error: null })),
}));
import AdminServices from "./AdminServices";

const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/admin/services" element={<AdminServices />} /><Route path="/admin/services/:section" element={<AdminServices />} /></Routes></MemoryRouter>);

describe("DY Services admin pages", () => {
  it("overview: today's numbers, every service, and a way into each page", async () => {
    open("/admin/services");
    await waitFor(() => expect(screen.getByText("Stock and prices")).toBeTruthy());
    expect(screen.getByText("Sales today")).toBeTruthy();
    expect(screen.getByText(/WASSCE Results Checker/)).toBeTruthy();
    expect(screen.getByText(/MTN AFA Registration/)).toBeTruthy();
    expect(screen.getByText("Go to")).toBeTruthy();
    expect(screen.queryByText("Stock added")).toBeNull();
    expect(screen.queryByText("SV-TEST000002", { exact: false })).toBeNull();
  });
  it("result checkers: only checkers, with the batches added", async () => {
    open("/admin/services/checkers");
    await waitFor(() => expect(screen.getByText("Stock added")).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Result checkers" })).toBeTruthy();
    expect(screen.getAllByText(/WASSCE Results Checker/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/MTN AFA Registration/)).toBeNull();
    expect(screen.queryByText("Sales today")).toBeNull();
  });
  it("AFA: its price row and its registrations, no checkers", async () => {
    open("/admin/services/afa");
    await waitFor(() => expect(screen.getByText("Registrations")).toBeTruthy());
    expect(screen.getByText(/MTN AFA Registration/)).toBeTruthy();
    expect(screen.getByText(/Ama Mensah/)).toBeTruthy();
    expect(screen.queryByText(/WASSCE Results Checker/)).toBeNull();
  });
  it("orders: the paid orders only", async () => {
    open("/admin/services/orders");
    await waitFor(() => expect(screen.getByText(/SV-TEST000002/)).toBeTruthy());
    expect(screen.queryByText("Stock and prices")).toBeNull();
    expect(screen.queryByText("Stock added")).toBeNull();
  });
  it("an unknown address falls back to the overview", async () => {
    open("/admin/services/nothing-here");
    await waitFor(() => expect(screen.getByText("Go to")).toBeTruthy());
  });
});
