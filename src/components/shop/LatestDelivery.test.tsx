import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/bootstrap", () => ({ bootstrapOnce: () => Promise.resolve() }));
vi.mock("@/lib/phase1-api", () => ({ loadPhase1Networks: () => Promise.resolve({ data: [] }) }));
const state = vi.hoisted(() => ({ raw: {} as unknown, loads: 0 }));
vi.mock("@/lib/latestDelivery", async (real) => {
  const actual = await real<typeof import("@/lib/latestDelivery")>();
  return { ...actual, loadLatest: () => { state.loads += 1; return Promise.resolve(actual.readLatest(state.raw)); } };
});
import type { NetworkSpeed } from "@/hooks/useDeliverySpeed";
import LatestDelivery from "./LatestDelivery";

const paid = new Date(2026, 10, 14, 13, 3, 15); const landed = new Date(2026, 10, 14, 13, 20, 7);
const mtn = { gb: 1, phone: "055*****15", paid_at: paid.toISOString(), delivered_at: landed.toISOString(), age_seconds: 381 };
const quick: NetworkSpeed = { window: "1h", sample: 5, median_minutes: 24.8 };

describe("the latest-delivery card", () => {
  beforeEach(() => { state.raw = { MTN: mtn, AirtelTigo: { ...mtn, phone: "027*****92" } }; state.loads = 0; });

  it("shows the newest order: how long it took, when it was paid, when it landed, and the speed right now", async () => {
    render(<LatestDelivery network="MTN" speed={quick} />);
    await waitFor(() => expect(screen.getByText("Latest MTN delivery")).toBeInTheDocument());
    expect(screen.getByText("17 minutes")).toBeInTheDocument();
    expect(screen.getByText("to 055*****15")).toBeInTheDocument();
    expect(screen.getByText("1GB")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Paid").parentElement).toHaveTextContent("1:03PM");
    expect(screen.getByText("Delivered").parentElement).toHaveTextContent("1:20PM");
    expect(screen.getByText("MTN right now")).toBeInTheDocument();
    expect(screen.getByText("about 25 minutes")).toBeInTheDocument();
  });

  it("follows the network it is given", async () => {
    render(<LatestDelivery network="AirtelTigo" speed={{ window: "none", sample: 0, median_minutes: 0 }} />);
    await waitFor(() => expect(screen.getByText("Latest AirtelTigo delivery")).toBeInTheDocument());
    expect(screen.getByText("to 027*****92")).toBeInTheDocument();
    expect(screen.getByText("delivering fast")).toBeInTheDocument();
  });

  it("is not shown while the network is slow, or before the speed is known", async () => {
    const { container, rerender } = render(<LatestDelivery network="MTN" speed={{ ...quick, median_minutes: 84 }} />);
    await waitFor(() => expect(state.loads).toBe(1));
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
    rerender(<LatestDelivery network="MTN" speed={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is not shown for a network with nothing delivered lately", async () => {
    const { container } = render(<LatestDelivery network="Telecel" speed={{ window: "none", sample: 0, median_minutes: 0 }} />);
    await waitFor(() => expect(state.loads).toBe(1));
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows no totals and never talks about refunds or failure", async () => {
    const { container } = render(<LatestDelivery network="MTN" speed={quick} />);
    await waitFor(() => expect(screen.getByText("Latest MTN delivery")).toBeInTheDocument());
    expect(container.textContent).not.toMatch(/refund|not delivered|fail|orders delivered|since|customers/i);
  });
});
