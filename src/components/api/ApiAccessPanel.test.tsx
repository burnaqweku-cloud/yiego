import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const calls: Array<[string, unknown]> = [];
let account: unknown = { status: "none" };
// Thenable-only stand-ins, like real supabase-js calls (no .catch/.finally).
const thenable = (value: unknown) => ({ then: (ok: (v: unknown) => unknown) => Promise.resolve(ok(value)) });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { schema: () => ({ rpc: (fn: string, args: unknown) => {
    calls.push([fn, args]);
    if (fn === "my_api_account") return thenable({ data: account, error: null });
    if (fn === "my_api_new_key") return thenable({ data: { key: "dy_live_" + "a".repeat(48), mode: "live" }, error: null });
    if (fn === "my_api_set_webhook") return thenable({ data: { url: (args as { p_url: string | null }).p_url, new_secret: false }, error: null });
    if (fn === "my_api_webhook_secret") return thenable({ data: "whsec_" + "b".repeat(48), error: null });
    if (fn === "my_api_test_webhook") return thenable({ data: 7, error: null });
    if (fn === "my_api_set_allowed_ips") return thenable({ data: (args as { p_ips: string[] }).p_ips, error: null });
    return thenable({ data: { status: "pending" }, error: null });
  } }) },
}));
vi.mock("@/store/wallet", () => ({ useWallet: () => ({ balance: 52.5 }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import ApiAccessPanel from "./ApiAccessPanel";

const show = async () => { await act(async () => { render(<MemoryRouter><ApiAccessPanel variant="agent" onTopUp={() => {}} /></MemoryRouter>); }); };
const ACTIVE = {
  status: "active", name: "Kofi Data Hub",
  keys: [{ id: "k1", mode: "live", hint: "dy_live_8f3a…c41e", created_at: new Date().toISOString(), last_used_at: null }],
  today: { orders: 3, spent: 25.5, delivered: 2 },
  orders: [{ reference: "YG-1", your_reference: "KDH-1", status: "processing", network: "MTN", size_gb: 2, phone: "0241234567", price: 8.5, created_at: new Date().toISOString() }],
  prices: [{ id: "mtn-1", network: "MTN", size_gb: 1, price: 4, available: true }, { id: "tel-10", network: "Telecel", size_gb: 10, price: 36, available: false }],
};

describe("ApiAccessPanel", () => {
  beforeEach(() => { calls.length = 0; });

  it("offers the application form to someone without API access, and sends it", async () => {
    account = { status: "none" };
    await show();
    expect(screen.getByText("Apply for API access")).toBeTruthy();
    const apply = screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("e.g. Kofi Data Hub"), { target: { value: "Kofi Data Hub" } });
    fireEvent.change(screen.getByPlaceholderText("024 123 4567"), { target: { value: "024 123 4567" } });
    expect(apply.disabled).toBe(false);
    await act(async () => { fireEvent.click(apply); });
    expect(calls).toContainEqual(["my_api_apply", { p_name: "Kofi Data Hub", p_phone: "0241234567", p_website: null, p_note: null }]);
  });

  it("tells a pending applicant to wait, with no keys", async () => {
    account = { status: "pending", name: "Kofi Data Hub", applied_at: new Date().toISOString() };
    await show();
    expect(screen.getByText("We're checking your application")).toBeTruthy();
    expect(screen.queryByText("Your keys")).toBeNull();
  });

  it("shows balance, keys, orders and prices to an active seller", async () => {
    account = ACTIVE;
    await show();
    expect(screen.getByText("GH₵52.50")).toBeTruthy();
    expect(screen.getByText("dy_live_8f3a…c41e")).toBeTruthy();
    expect(screen.getByText("No key yet")).toBeTruthy();
    expect(screen.getByText("Delivering")).toBeTruthy();
    expect(screen.getByText("2GB → 024****567")).toBeTruthy();
    expect(screen.queryByText("tel-10")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "All bundles" }));
    expect(screen.getByText("Telecel")).toBeTruthy();
    expect(screen.getByText("not now")).toBeTruthy();
  });

  it("shows a new key once after replacing", async () => {
    account = ACTIVE;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await show();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Replace" })); });
    expect(calls).toContainEqual(["my_api_new_key", { p_mode: "live" }]);
    expect(screen.getByText("dy_live_" + "a".repeat(48))).toBeTruthy();
    expect(screen.getByText(/We only show it once/)).toBeTruthy();
  });

  it("saves a webhook address, shows the secret and sends a test event", async () => {
    account = { ...ACTIVE, webhook: { url: "https://kofi.com/hook", secret_hint: "whsec_bbbb…bbbb", deliveries: [{ id: 3, event: "order.delivered", test: false, status: "failed", attempts: 8, last_status: 500, last_error: "Your server answered 500", created_at: new Date().toISOString(), delivered_at: null, next_attempt_at: null, reference: "YG-1" }] }, allowed_ips: null };
    await show();
    expect(screen.getByText("Webhooks")).toBeTruthy();
    expect(screen.getByText("Gave up")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Show/ })); });
    expect(screen.getByText("whsec_" + "b".repeat(48))).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Send a test event/ })); });
    expect(calls).toContainEqual(["my_api_test_webhook", {}]);
    fireEvent.change(screen.getByLabelText("Your webhook address (https)"), { target: { value: "https://kofi.com/new-hook" } });
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]); });
    expect(calls).toContainEqual(["my_api_set_webhook", { p_url: "https://kofi.com/new-hook" }]);
  });

  it("locks the live key to the addresses typed", async () => {
    account = { ...ACTIVE, webhook: { url: null, secret_hint: null, deliveries: [] }, allowed_ips: null };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await show();
    fireEvent.change(screen.getByPlaceholderText(/one address per line/), { target: { value: "41.66.12.34\n102.176.1.2" } });
    const saves = screen.getAllByRole("button", { name: "Save" });
    await act(async () => { fireEvent.click(saves[saves.length - 1]); });
    expect(calls).toContainEqual(["my_api_set_allowed_ips", { p_ips: ["41.66.12.34", "102.176.1.2"] }]);
  });
});
