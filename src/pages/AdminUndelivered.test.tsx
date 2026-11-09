import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminUndelivered from "./AdminUndelivered";

const invoke = vi.fn();
const track = vi.fn(() => "event-id");
const order = {
  id: "order-1",
  order_reference: "YG-TEST000001",
  recipient_phone: "+233240000000",
  guest_email: null,
  amount: 4.1,
  cost_amount: 3.95,
  currency: "GHS",
  status: "failed_needs_review",
  payment_status: "succeeded",
  supplier_status: "failed",
  supplier_order_reference: "supplier-1",
  supplier_retry_after: null,
  supplier_retry_count: 0,
  failure_reason: "insufficient balance",
  admin_resolution_status: null,
  admin_resolution_reason: null,
  admin_resolution_updated_at: null,
  paid_at: "2026-11-09T09:00:00Z",
  created_at: "2026-11-09T08:59:00Z",
  updated_at: "2026-11-09T09:00:00Z",
  data_products: { name: "MTN Data — 1GB", capacity_gb: 1 },
  networks: { name: "MTN", code: "MTN" },
  suppliers: { code: "databundleshub", name: "Supplier", public_name: "Supplier" },
};

const query = {
  select: () => query,
  eq: () => query,
  gte: () => query,
  not: () => query,
  order: async () => ({ data: [order], error: null }),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
vi.mock("@/lib/admin-data", () => ({
  adminDatabase: () => ({ from: () => query }),
  formatAdminDate: () => "9 Nov, 9:00 am",
}));
vi.mock("@/components/admin/SupplierBadge", () => ({
  default: () => null,
  useFallbackOrigins: () => ({}),
}));
vi.mock("@/components/admin/RefundDialog", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPage() {
  return render(<MemoryRouter><AdminUndelivered /></MemoryRouter>);
}

async function markDelivered() {
  const [rowAction] = await screen.findAllByRole("button", { name: "Mark delivered" });
  fireEvent.click(rowAction);
  fireEvent.change(screen.getByPlaceholderText("How you know it was delivered"), { target: { value: "Supplier confirmed completion" } });
  const actions = screen.getAllByRole("button", { name: "Mark delivered" });
  fireEvent.click(actions[actions.length - 1]);
}

describe("delivered-bundle goal measurement", () => {
  beforeEach(() => {
    invoke.mockReset();
    track.mockClear();
    window.__lovableEvents = { track };
  });

  it("counts one bundle after a manual delivery confirmation succeeds", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    renderPage();
    await markDelivered();
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
    expect(track).toHaveBeenCalledWith("project.data_bundle_delivered", { network: "MTN", source: "manual" });
  });

  it("does not count a bundle when the delivery confirmation fails", async () => {
    invoke.mockResolvedValue({ data: { error: "Not allowed" }, error: null });
    renderPage();
    await markDelivered();
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(track).not.toHaveBeenCalled();
  });

  it("counts a supplier retry only when it returns delivered", async () => {
    invoke.mockResolvedValue({ data: { result: { status: "delivered" } }, error: null });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    fireEvent.click(screen.getByRole("button", { name: "Send again" }));
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
    expect(track).toHaveBeenCalledWith("project.data_bundle_delivered", { network: "MTN", source: "supplier_fulfillment" });
  });

  it("does not count a supplier retry that is still processing", async () => {
    invoke.mockResolvedValue({ data: { result: { status: "processing" } }, error: null });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    fireEvent.click(screen.getByRole("button", { name: "Send again" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(track).not.toHaveBeenCalled();
  });
});
