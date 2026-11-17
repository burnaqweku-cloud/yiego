import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueOrder, SendResult } from "@/lib/mtn-verification-admin";

const orders: QueueOrder[] = Array.from({ length: 25 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, order_reference: `YG-T${String(i).padStart(9, "0")}`, phone: `05400000${String(i).padStart(2, "0")}`,
  bundle: "1GB", amount: 4.1, store_name: null, paid_at: "2026-10-20T10:00:00Z", held_since: "2026-10-20T10:00:00Z", days_waiting: 28,
  check_status: "approved", check_message: null, checked_at: "2026-11-17T09:26:00Z", supplier_purchase_id: null, send: null, dbh_cost: 3.95,
}));
const sendOrders = vi.fn<(ids: string[]) => Promise<{ ok: boolean; results: SendResult[] }>>();
vi.mock("@/lib/mtn-verification-admin", async (original) => ({
  ...(await original<typeof import("@/lib/mtn-verification-admin")>()),
  loadQueue: vi.fn(async () => orders),
  loadChecks: vi.fn(async () => []),
  loadDbhWallet: vi.fn(async () => ({ balance: 5000, checked_at: "2026-11-17T10:00:00Z" })),
  sendOrders: (ids: string[]) => sendOrders(ids),
}));
import AdminMtnVerification from "./AdminMtnVerification";

const sent = (ids: string[]) => ({ ok: true, results: ids.map((id) => ({ orderId: id, reference: id, outcome: "sent" as const, detail: "Sent to DBH" })) });

async function sendAll() {
  render(<MemoryRouter><AdminMtnVerification /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole("button", { name: "All" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  fireEvent.click(screen.getByRole("button", { name: /Send 25 orders/ }));
}

describe("MTN verification send", () => {
  beforeEach(() => { sendOrders.mockReset(); vi.spyOn(window, "confirm").mockReturnValue(true); });

  it("sends 10 at a time, one batch after another", async () => {
    sendOrders.mockImplementation(async (ids) => sent(ids));
    await sendAll();
    await waitFor(() => expect(sendOrders).toHaveBeenCalledTimes(3));
    expect(sendOrders.mock.calls.map((c) => c[0].length)).toEqual([10, 10, 5]);
    expect(new Set(sendOrders.mock.calls.flatMap((c) => c[0])).size).toBe(25);
  });

  it("stops at the first failed order and sends nothing after that batch", async () => {
    sendOrders.mockImplementationOnce(async (ids) => sent(ids)).mockImplementationOnce(async (ids) => ({ ok: true, results: ids.map((id, i) => ({ orderId: id, reference: id, outcome: i === 0 ? "failed" as const : "sent" as const, detail: i === 0 ? "DBH did not accept it: insufficient balance" : "Sent" })) }));
    await sendAll();
    await waitFor(() => expect(sendOrders).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 50));
    expect(sendOrders).toHaveBeenCalledTimes(2);
  });

  it("stops when a request itself fails", async () => {
    sendOrders.mockImplementationOnce(async () => { throw new Error("Request timed out"); });
    await sendAll();
    await waitFor(() => expect(sendOrders).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(sendOrders).toHaveBeenCalledTimes(1);
  });
});
