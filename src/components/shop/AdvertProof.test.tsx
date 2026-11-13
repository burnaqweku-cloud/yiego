import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ proof: null as unknown, fromAdvert: true, loads: 0 }));
vi.mock("@/lib/advertProof", async (real) => ({
  ...(await real<typeof import("@/lib/advertProof")>()),
  cameFromAdvert: () => state.fromAdvert,
  loadProof: () => { state.loads += 1; return Promise.resolve(state.proof); },
}));
vi.mock("@/hooks/useContactSettings", () => ({ useContactSettings: () => ({ contact: null, loading: false, whatsappUrl: "https://wa.me/233209975451?text=Hello" }) }));
import AdvertProof from "./AdvertProof";

const reading = { delivered: 6767, today: 122, week: 1091, since: "2026-08-13", recent: [{ network: "MTN", gb: 5, phone: "055*****47", minutes: 3 }] };
const show = () => render(<MemoryRouter><AdvertProof /></MemoryRouter>);

describe("the proof card for advert visitors", () => {
  beforeEach(() => { state.proof = reading; state.fromAdvert = true; state.loads = 0; });

  it("shows how many orders were delivered, today's count, the latest delivery and what protects the buyer", async () => {
    show();
    await waitFor(() => expect(screen.getByText("6,767")).toBeInTheDocument());
    expect(screen.getByText(/orders delivered/)).toBeInTheDocument();
    expect(screen.getByText("122")).toBeInTheDocument();
    expect(screen.getByText("5GB MTN")).toBeInTheDocument();
    expect(screen.getByText("to 055*****47")).toBeInTheDocument();
    expect(screen.getByText("Delivered 3 min ago")).toBeInTheDocument();
    expect(screen.getByText("Paystack")).toBeInTheDocument();
    expect(screen.getByText("tracked")).toBeInTheDocument();
    expect(screen.queryByText(/refund|not delivered/i)).toBeNull();
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", "https://wa.me/233209975451?text=Hello");
  });

  it("is not shown to anyone who did not come from an advert, and does not even ask for the figures", async () => {
    state.fromAdvert = false;
    const { container } = show();
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
    expect(state.loads).toBe(0);
  });

  it("shows nothing rather than an empty or made-up card when the figures cannot be read", async () => {
    state.proof = null;
    const { container } = show();
    await waitFor(() => expect(state.loads).toBe(1));
    expect(container).toBeEmptyDOMElement();
  });

  it("leaves the delivery row out when nothing went out lately", async () => {
    state.proof = { ...reading, recent: [] };
    show();
    await waitFor(() => expect(screen.getByText("6,767")).toBeInTheDocument());
    expect(screen.queryByText(/Delivered/)).toBeNull();
  });
});
