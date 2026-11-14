import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/bootstrap", () => ({ bootstrapOnce: () => Promise.resolve() }));
vi.mock("@/lib/phase1-api", () => ({ loadPhase1Networks: () => Promise.resolve({ data: [] }) }));
const state = vi.hoisted(() => ({ raw: {} as unknown, wallet: { balance: 24.5, isRealWallet: true, hasWallet: true, loading: false }, opened: 0 }));
vi.mock("@/lib/latestDelivery", async (real) => {
  const actual = await real<typeof import("@/lib/latestDelivery")>();
  return { ...actual, loadLatest: () => Promise.resolve(actual.readLatest(state.raw)) };
});
vi.mock("@/store/wallet", () => ({ useWallet: () => state.wallet }));
vi.mock("@/store/flows", () => ({ useFlows: () => ({ openAddMoney: () => { state.opened += 1; } }) }));
vi.mock("@/hooks/useCountUp", () => ({ useCountUp: (n: number) => n }));
import type { NetworkSpeed } from "@/hooks/useDeliverySpeed";
import { moneyParts } from "@/lib/format";
import WalletCard from "./WalletCard";

const paid = new Date(2026, 10, 14, 13, 57, 40); const landed = new Date(2026, 10, 14, 14, 8, 2);
const mtn = { gb: 2, phone: "024*****51", paid_at: paid.toISOString(), delivered_at: landed.toISOString(), age_seconds: 200 };
const quick: NetworkSpeed = { window: "1h", sample: 9, median_minutes: 10 };

describe("the wallet card at the top of the shop", () => {
  beforeEach(() => { state.raw = { MTN: mtn }; state.wallet = { balance: 24.5, isRealWallet: true, hasWallet: true, loading: false }; state.opened = 0; });

  it("is one card: the balance, Add money, and the latest delivery inside it", async () => {
    const { container } = render(<WalletCard network="MTN" speed={quick} />);
    expect(screen.getByText("Your wallet")).toBeInTheDocument();
    expect(container.querySelector(".yg-latest__money")).toHaveTextContent("24.50");
    await waitFor(() => expect(screen.getByText("Latest MTN delivery")).toBeInTheDocument());
    expect(screen.getByText("10 minutes")).toBeInTheDocument();
    expect(screen.getByText("to 024*****51")).toBeInTheDocument();
    expect(screen.getByText("Paid").parentElement).toHaveTextContent("1:57PM");
    expect(screen.getByText("Delivered").parentElement).toHaveTextContent("2:08PM");
    expect(screen.getByText("about 10 minutes")).toBeInTheDocument();
    expect(container.querySelectorAll(".yg-latest")).toHaveLength(1);
  });

  it("opens the top-up from Add money", () => {
    render(<WalletCard network="MTN" speed={quick} />);
    fireEvent.click(screen.getByRole("button", { name: /Add money/ }));
    expect(state.opened).toBe(1);
  });

  it("hides and shows the balance", () => {
    const { container } = render(<WalletCard network="MTN" speed={quick} />);
    fireEvent.click(screen.getByRole("button", { name: "Hide balance" }));
    expect(container.querySelector(".yg-latest__money")).not.toHaveTextContent("24.50");
    fireEvent.click(screen.getByRole("button", { name: "Show balance" }));
    expect(container.querySelector(".yg-latest__money")).toHaveTextContent("24.50");
  });

  it("keeps the wallet and drops the delivery while the network is slow", async () => {
    const { container } = render(<WalletCard network="MTN" speed={{ ...quick, median_minutes: 84 }} />);
    await Promise.resolve(); await Promise.resolve();
    expect(screen.getByText("Your wallet")).toBeInTheDocument();
    expect(screen.queryByText(/Latest MTN delivery/)).not.toBeInTheDocument();
    expect(container.querySelector(".yg-latest--bare")).not.toBeNull();
  });

  it("does not offer Add money before the wallet is ready, and says when it is not live", () => {
    state.wallet = { balance: 0, isRealWallet: false, hasWallet: false, loading: false };
    render(<WalletCard network="MTN" speed={quick} />);
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
