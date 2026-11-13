import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: null as unknown, fromAdvert: true, loads: 0 }));
vi.mock("@/lib/advertProof", async (real) => ({
  ...(await real<typeof import("@/lib/advertProof")>()),
  cameFromAdvert: () => state.fromAdvert,
  loadProof: () => { state.loads += 1; return Promise.resolve(state.rows); },
}));
vi.mock("@/hooks/useContactSettings", () => ({ useContactSettings: () => ({ contact: null, loading: false, whatsappUrl: "https://wa.me/233209975451?text=Hello" }) }));
import AdvertProof from "./AdvertProof";

const rows = [{ network: "MTN", gb: 5, phone: "055*****47", minutes: 2 }, { network: "Telecel", gb: 10, phone: "020*****63", minutes: 4 }];
const show = () => render(<MemoryRouter><AdvertProof /></MemoryRouter>);

describe("the proof card for advert visitors", () => {
  beforeEach(() => { state.rows = rows; state.fromAdvert = true; state.loads = 0; });

  it("shows the orders that have just gone out and what protects the buyer", async () => {
    show();
    await waitFor(() => expect(screen.getByText("Just delivered")).toBeInTheDocument());
    expect(screen.getByText("to 055*****47")).toBeInTheDocument();
    expect(screen.getByText("2 min ago")).toBeInTheDocument();
    expect(screen.getByText("10GB")).toBeInTheDocument();
    expect(screen.getByText("Paystack")).toBeInTheDocument();
    expect(screen.getByText("tracked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", "https://wa.me/233209975451?text=Hello");
  });

  it("shows no totals and never talks about refunds or failure", async () => {
    const { container } = show();
    await waitFor(() => expect(screen.getByText("Just delivered")).toBeInTheDocument());
    expect(container.textContent).not.toMatch(/refund|not delivered|orders delivered|since|today/i);
  });

  it("is not shown to anyone who did not come from an advert, and does not even ask for the figures", async () => {
    state.fromAdvert = false;
    const { container } = show();
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
    expect(state.loads).toBe(0);
  });

  it("is not shown at all when too little has gone out lately", async () => {
    state.rows = null;
    const { container } = show();
    await waitFor(() => expect(state.loads).toBe(1));
    expect(container).toBeEmptyDOMElement();
  });
});
