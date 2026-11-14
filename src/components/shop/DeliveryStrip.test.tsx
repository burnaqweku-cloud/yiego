import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/bootstrap", () => ({ bootstrapOnce: () => Promise.resolve() }));
vi.mock("@/lib/phase1-api", () => ({ loadPhase1Networks: () => Promise.resolve({ data: [] }) }));
const state = vi.hoisted(() => ({ raw: {} as unknown }));
vi.mock("@/lib/latestDelivery", async (real) => {
  const actual = await real<typeof import("@/lib/latestDelivery")>();
  return { ...actual, loadLatest: () => Promise.resolve(actual.readFeed(state.raw)) };
});
import type { NetworkSpeed } from "@/hooks/useDeliverySpeed";
import { DeliveryStrip } from "./LatestDelivery";

const paid = new Date(2026, 10, 14, 13, 57, 40); const landed = new Date(2026, 10, 14, 14, 8, 2);
const mtn = { gb: 2, phone: "024*****51", paid_at: paid.toISOString(), delivered_at: landed.toISOString(), age_seconds: 200 };
const quick: NetworkSpeed = { window: "1h", sample: 9, median_minutes: 10 };

describe("the small latest-delivery board on the home page", () => {
  beforeEach(() => { state.raw = { MTN: mtn }; });

  it("shows which order, how long it took, and its two times", async () => {
    const { container } = render(<DeliveryStrip network="MTN" speed={quick} />);
    await waitFor(() => expect(screen.getByText("Latest MTN delivery")).toBeInTheDocument());
    expect(screen.getByText("10 minutes")).toBeInTheDocument();
    expect(screen.getByText("to 024*****51")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(container.querySelector(".yg-strip__trip")).toHaveTextContent("Paid 1:57PM");
    expect(container.querySelector(".yg-strip__trip")).toHaveTextContent("Delivered 2:08PM");
    expect(container.textContent).not.toMatch(/refund|fail|orders delivered|customers/i);
  });

  it("is not there while the network is slow or has nothing recent", async () => {
    const { container, rerender } = render(<DeliveryStrip network="MTN" speed={{ ...quick, median_minutes: 84 }} />);
    await Promise.resolve(); await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
    rerender(<DeliveryStrip network="Telecel" speed={{ window: "none", sample: 0, median_minutes: 0 }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
