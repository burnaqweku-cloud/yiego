import { describe, expect, it } from "vitest";
import { advertError, advertFigures, advertLink, placeLabel, splitUnnamed, type UnnamedLink } from "./promoAdverts";

const zero = { visitors: 0, entered_number: 0, started_payment: 0, buyers: 0, orders_paid: 0, sales: 0, profit: 0, topup_amount: 0, service_orders: 0, service_sales: 0, service_profit: 0, first_visit: null, last_visit: null };

describe("an advert's own link", () => {
  it("carries the promo mark and the advert's tag, so its visitors are counted under it alone", () => {
    const link = new URL(advertLink({ place: "telegram", source: null, campaign: "telegram-ghana-deals" }));
    expect(link.origin + link.pathname).toBe("https://datayego.com/shop");
    expect(link.searchParams.get("promo")).toBe("1");
    expect(link.searchParams.get("utm_campaign")).toBe("telegram-ghana-deals");
    expect(link.searchParams.get("utm_source")).toBe("telegram");
  });
  it("can land on Services with the same tag", () => {
    const link = new URL(advertLink({ place: "news", source: null, campaign: "ghana-news" }, "services"));
    expect(link.pathname).toBe("/services");
    expect(link.searchParams.get("utm_campaign")).toBe("ghana-news");
  });
  it("uses the source for an advert known by its source", () => {
    const link = new URL(advertLink({ place: "news", source: "ghnewsexpress", campaign: null }));
    expect(link.searchParams.get("utm_source")).toBe("ghnewsexpress");
  });
  it("names the place in plain words", () => {
    expect(placeLabel("meta")).toBe("Meta ads (Facebook, Instagram)");
    expect(placeLabel("something-new")).toBe("Somewhere else");
  });
});

describe("what one advert brought", () => {
  it("adds data and services together", () => {
    const f = advertFigures({ ...zero, visitors: 42, buyers: 13, orders_paid: 15, sales: 137.65, profit: 9.4, service_orders: 2, service_sales: 40, service_profit: 6 });
    expect(f).toMatchObject({ orders: 17, sales: 177.65, profit: 15.4, buyerRate: 31 });
  });
  it("says whether it made or lost money only once a cost is entered", () => {
    expect(advertFigures({ ...zero, buyers: 4, profit: 30 }).result).toBeNull();
    expect(advertFigures({ ...zero, buyers: 4, profit: 30, cost: 20 })).toMatchObject({ result: 10, costPerBuyer: 5 });
    expect(advertFigures({ ...zero, buyers: 0, profit: 0, cost: 50 })).toMatchObject({ result: -50, costPerBuyer: null });
  });
  it("reads missing or text figures as numbers (older reports, database numerics)", () => {
    const f = advertFigures({ visitors: "10" as unknown as number, buyers: "1" as unknown as number, sales: "4.10" as unknown as number, profit: "0.15" as unknown as number });
    expect(f).toMatchObject({ orders: 0, sales: 4.1, profit: 0.15, buyerRate: 10 });
  });
});

describe("links no advert owns", () => {
  const link = (source: string, campaign: string, visitors: number, buyers = 0, sales = 0): UnnamedLink => ({ ...zero, source, campaign, visitors, buyers, sales, orders_paid: buyers });
  it("keeps tagged links to be named, and adds up the plain link", () => {
    const { tagged, plain } = splitUnnamed([link("google", "google_ads", 9), link("direct", "unlabelled", 241, 1, 3.95), link("www.tiktok.com", "unlabelled", 34)]);
    expect(tagged.map((l) => l.campaign)).toEqual(["google_ads"]);
    expect(plain).toEqual({ visitors: 275, buyers: 1, orders: 1, sales: 3.95 });
  });
  it("copes with nothing", () => {
    expect(splitUnnamed(undefined)).toEqual({ tagged: [], plain: { visitors: 0, buyers: 0, orders: 0, sales: 0 } });
  });
});

describe("advert errors", () => {
  it("turns the server's words into a plain sentence", () => {
    expect(advertError("advert_name_required")).toMatch(/name/);
    expect(advertError("advert_tag_taken")).toMatch(/already has a name/);
    expect(advertError(undefined)).toMatch(/try again/);
  });
});
