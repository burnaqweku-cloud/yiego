import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/bootstrap", () => ({ bootstrapOnce: () => Promise.resolve() }));
vi.mock("@/lib/phase1-api", () => ({ loadPhase1Networks: () => Promise.resolve({ data: [] }) }));
const state = vi.hoisted(() => ({ raw: {} as unknown, signedIn: false, wallet: { balance: 24.5, isRealWallet: true, hasWallet: true, loading: false }, opened: 0 }));
vi.mock("@/lib/latestDelivery", async (real) => {
  const actual = await real<typeof import("@/lib/latestDelivery")>();
  return { ...actual, loadLatest: () => Promise.resolve(actual.readLatest(state.raw)) };
});
vi.mock("@/store/auth-context", () => ({ useAuth: () => ({ isAuthenticated: state.signedIn }) }));
vi.mock("@/store/profile", () => ({ useProfile: () => ({ profile: { firstName: "Ama" } }) }));
vi.mock("@/store/wallet", () => ({ useWallet: () => state.wallet }));
vi.mock("@/store/flows", () => ({ useFlows: () => ({ openAddMoney: () => { state.opened += 1; } }) }));
vi.mock("@/hooks/useCountUp", () => ({ useCountUp: (n: number) => n }));
import type { NetworkSpeed } from "@/hooks/useDeliverySpeed";
import { moneyParts } from "@/lib/format";
import ShopBand from "./ShopBand";

const paid = new Date(2026, 10, 14, 13, 57, 40); const landed = new Date(2026, 10, 14, 14, 8, 2);
const mtn = { gb: 2, phone: "024*****51", paid_at: paid.toISOString(), delivered_at: landed.toISOString(), age_seconds: 200 };
const quick: NetworkSpeed = { window: "1h", sample: 9, median_minutes: 10 };
const quiet: NetworkSpeed = { window: "none", sample: 0, median_minutes: 0 };

describe("the band at the top of the shop", () => {
  beforeEach(() => { state.raw = { MTN: mtn, AirtelTigo: { ...mtn, phone: "027*****92" } }; state.signedIn = false; state.wallet = { balance: 24.5, isRealWallet: true, hasWallet: true, loading: false }; state.opened = 0; });

  it("names the page for a visitor and shows the newest delivery: how long, when paid, when it landed, the speed now", async () => {
    render(<ShopBand network="MTN" speed={quick} />);
    expect(screen.getByRole("heading", { level: 1, name: "Buy Ghana data online" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Latest MTN delivery")).toBeInTheDocument());
    expect(screen.getByText("10 minutes")).toBeInTheDocument();
    expect(screen.getByText("to 024*****51")).toBeInTheDocument();
    expect(screen.getByText("2GB")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Paid").parentElement).toHaveTextContent("1:57PM");
    expect(screen.getByText("Delivered").parentElement).toHaveTextContent("2:08PM");
    expect(screen.getByText("MTN right now")).toBeInTheDocument();
    expect(screen.getByText("about 10 minutes")).toBeInTheDocument();
    expect(screen.queryByText("Your wallet")).not.toBeInTheDocument();
  });

  it("follows the network it is given", async () => {
    render(<ShopBand network="AirtelTigo" speed={quiet} />);
    await waitFor(() => expect(screen.getByText("Latest AirtelTigo delivery")).toBeInTheDocument());
    expect(screen.getByText("to 027*****92")).toBeInTheDocument();
    expect(screen.getByText("delivering fast")).toBeInTheDocument();
  });

  it("carries no delivery while the network is slow, before the speed is known, or with nothing delivered lately", async () => {
    const { rerender } = render(<ShopBand network="MTN" speed={{ ...quick, median_minutes: 84 }} />);
    await Promise.resolve(); await Promise.resolve();
    expect(screen.getByText("Buy Ghana data online")).toBeInTheDocument();
    expect(screen.queryByText(/Latest MTN delivery/)).not.toBeInTheDocument();
    rerender(<ShopBand network="MTN" speed={undefined} />);
    expect(screen.queryByText(/Latest MTN delivery/)).not.toBeInTheDocument();
    rerender(<ShopBand network="Telecel" speed={quiet} />);
    expect(screen.queryByText(/Latest Telecel delivery/)).not.toBeInTheDocument();
  });

  it("shows no totals and never talks about refunds or failure", async () => {
    const { container } = render(<ShopBand network="MTN" speed={quick} />);
    await waitFor(() => expect(screen.getByText("Latest MTN delivery")).toBeInTheDocument());
    expect(container.textContent).not.toMatch(/refund|not delivered|fail|orders delivered|since|customers/i);
  });

  it("signed in, is one band: the greeting, the wallet with Add money, and the delivery inside it", async () => {
    state.signedIn = true;
    const { container } = render(<ShopBand network="MTN" speed={quick} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Good (morning|afternoon|evening), Ama/);
    expect(screen.getByText("Your wallet")).toBeInTheDocument();
    expect(container.querySelector(".yg-purse__money")).toHaveTextContent("24.50");
    await waitFor(() => expect(screen.getByText("Latest MTN delivery")).toBeInTheDocument());
    expect(container.querySelectorAll(".yg-band")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Add money/ }));
    expect(state.opened).toBe(1);
  });

  it("hides and shows the balance", () => {
    state.signedIn = true;
    const { container } = render(<ShopBand network="MTN" speed={quick} />);
    fireEvent.click(screen.getByRole("button", { name: "Hide balance" }));
    expect(container.querySelector(".yg-purse__money")).not.toHaveTextContent("24.50");
    fireEvent.click(screen.getByRole("button", { name: "Show balance" }));
    expect(container.querySelector(".yg-purse__money")).toHaveTextContent("24.50");
  });

  it("does not offer Add money before the wallet is ready, and says when it is not live", () => {
    state.signedIn = true; state.wallet = { balance: 0, isRealWallet: false, hasWallet: false, loading: false };
    render(<ShopBand network="MTN" speed={quick} />);
    expect(screen.getByRole("button", { name: /Add money/ })).toBeDisabled();
    expect(screen.getByText(/unavailable/)).toBeInTheDocument();
  });

  it("splits the currency mark from the figure however the phone writes it", () => {
    expect(moneyParts("GH₵24.50")).toEqual({ symbol: "GH₵", value: "24.50" });
    expect(moneyParts("GHS 1,234.50")).toEqual({ symbol: "GHS", value: "1,234.50" });
    expect(moneyParts("GHS 0.00")).toEqual({ symbol: "GHS", value: "0.00" });
    expect(moneyParts("24.50")).toEqual({ symbol: "", value: "24.50" });
  });
});
