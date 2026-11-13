import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* The database client hands back thenables (.then only); the stand-ins below do the same. */
const thenable = <T,>(value: T): PromiseLike<T> => ({ then: (ok, bad) => Promise.resolve(value).then(ok, bad) });
const zero = { entered_number: 0, started_payment: 0, topup_amount: 0, service_orders: 0, service_sales: 0, service_profit: 0 };
const advert = (over: Record<string, unknown>) => ({ ...zero, id: "a", name: "Advert", place: "telegram", source: null, campaign: "tag", cost: 0, note: null, created_at: "2026-11-11T08:00:00Z", ended_at: null,
  visitors: 0, buyers: 0, orders_paid: 0, sales: 0, profit: 0, first_visit: null, last_visit: null, ...over });
const calls = vi.hoisted(() => ({ tracking: [] as unknown[][], saved: [] as unknown[] }));

vi.mock("@/lib/promotionAnalytics", () => ({
  conversionRate: () => 0,
  loadPromoVisitor: () => thenable({ data: null, error: null }),
  loadPromoTracking: (...args: unknown[]) => {
    calls.tracking.push(args);
    return thenable({ error: null, data: {
      from: null, to: null, started_at: null, detail_since: null, visitor_count: 0, visitors: [], platforms: [], campaigns: [], countries: [], devices: [], days: [], bundles: [],
      totals: { landed: 0, sessions: 0, opened_buy: 0, picked: 0, entered_number: 0, reached_pay: 0, started_payment: 0, buyers: 0, got_delivery: 0, orders_paid: 0, delivered: 0, refunded: 0, sales: 0, profit: 0, discount: 0, promo_orders: 0 },
      adverts: [
        advert({ id: "tg", name: "Telegram: Ghana Deals", campaign: "paid_telegram", cost: 5, visitors: 42, buyers: 13, orders_paid: 15, sales: 137.65, profit: 9.4, first_visit: "2026-11-11T09:00:00Z", last_visit: "2026-11-13T09:07:00Z" }),
        advert({ id: "meta", name: "Meta ads", place: "meta", campaign: "120253539246610206", cost: 60, visitors: 310, buyers: 9, orders_paid: 12, sales: 53.2, profit: 1.8, first_visit: "2026-11-10T09:00:00Z", last_visit: "2026-11-13T12:29:00Z" }),
        advert({ id: "news", name: "Ghana News Express", place: "news", source: "ghnewsexpress", campaign: null }),
      ],
      unnamed: [{ ...zero, source: "google", campaign: "google_ads", visitors: 9, buyers: 0, orders_paid: 0, sales: 0, profit: 0, first_visit: "2026-11-11T20:00:00Z", last_visit: "2026-11-11T21:00:00Z" },
        { ...zero, source: "direct", campaign: "unlabelled", visitors: 396, buyers: 1, orders_paid: 1, sales: 3.95, profit: 0, first_visit: null, last_visit: null }],
    } });
  },
}));
vi.mock("@/lib/promoAdverts", async (real) => ({
  ...(await real<typeof import("@/lib/promoAdverts")>()),
  saveAdvert: (input: unknown) => { calls.saved.push(input); return thenable({ error: null, data: advert({ id: "new", name: "Telegram: Second Channel", campaign: "telegram-second-channel" }) }); },
  endAdvert: () => thenable({ data: true, error: null }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import PromoAdverts from "./PromoAdverts";

const card = (name: string) => within(screen.getByText(name).closest("li") as HTMLElement);

describe("the Adverts page", () => {
  beforeEach(() => { calls.tracking.length = 0; calls.saved.length = 0; });

  it("shows every advert on its own, with what it brought and whether it paid for itself", async () => {
    render(<PromoAdverts />);
    await waitFor(() => expect(screen.getByText("Telegram: Ghana Deals")).toBeInTheDocument());
    expect(card("Telegram: Ghana Deals").getByText("13")).toBeInTheDocument();
    expect(card("Telegram: Ghana Deals").getByText("31.0% of visitors")).toBeInTheDocument();
    expect(card("Telegram: Ghana Deals").getByText(/Made .*4\.40 after paying for the advert/)).toBeInTheDocument();
    expect(card("Meta ads").getByText(/Lost .*58\.20 so far/)).toBeInTheDocument();
    expect(card("Ghana News Express").getByText(/nobody has tapped the link yet/)).toBeInTheDocument();
    expect(card("Ghana News Express").getByText(/Enter what you paid/)).toBeInTheDocument();
  });

  it("lists tagged links that have no name, and keeps the plain link apart", async () => {
    render(<PromoAdverts />);
    await waitFor(() => expect(screen.getByText("Links without a name")).toBeInTheDocument());
    expect(screen.getByText("google_ads")).toBeInTheDocument();
    expect(screen.getByText("396 visitors · 1 buyer · 1 paid order")).toBeInTheDocument();
  });

  it("adding an advert gives back its own links", async () => {
    render(<PromoAdverts />);
    await waitFor(() => expect(screen.getByText("Meta ads")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Add an advert/ }));
    fireEvent.change(screen.getByPlaceholderText("Telegram: channel name"), { target: { value: "Telegram: Second Channel" } });
    fireEvent.click(screen.getByRole("button", { name: "Save advert" }));
    await waitFor(() => expect(screen.getByText("Links for Telegram: Second Channel")).toBeInTheDocument());
    expect(calls.saved[0]).toMatchObject({ name: "Telegram: Second Channel", place: "telegram", cost: 0 });
    expect(screen.getByText(/datayego\.com\/shop\?promo=1.*utm_campaign=telegram-second-channel/)).toBeInTheDocument();
    expect(screen.getByText(/datayego\.com\/services\?promo=1.*utm_campaign=telegram-second-channel/)).toBeInTheDocument();
    expect(screen.getByText("https://datayego.com/go/telegram-second-channel")).toBeInTheDocument();
  });

  it("opening an advert asks for that advert's report alone", async () => {
    render(<PromoAdverts />);
    await waitFor(() => expect(screen.getByText("Meta ads")).toBeInTheDocument());
    fireEvent.click(card("Meta ads").getByRole("button", { name: /See everything/ }));
    await waitFor(() => expect(calls.tracking.some((c) => c[2] === "meta")).toBe(true));
    expect(screen.getByText("Meta ads")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /All adverts/ })).toBeInTheDocument();
  });
});
