import { describe, expect, it } from "vitest";
import { boughtOn, deliveredAgo, readLastDelivered, tookSlow } from "./adminLastDelivered";

const raw = {
  MTN: { id: "o1", reference: "YG-C14C19A292", gb: 1, phone: "0536553680", paid_at: "2026-11-23T09:39:31Z", delivered_at: "2026-11-23T12:24:05Z", supplier: "DataBundlesHub", store: null, api: false, amount: 4.1 },
  AirtelTigo: { id: "o2", reference: "YG-AA9213C36F", gb: "1.00", phone: "0278396285", paid_at: "2026-11-23T11:21:02Z", delivered_at: "2026-11-23T11:27:05Z", supplier: "InstantDataGH", store: "Ida's Data Store", api: false, amount: "3.80" },
  Telecel: { reference: "YG-X", paid_at: "not a date", delivered_at: "2026-11-23T11:27:05Z" },
};

describe("readLastDelivered", () => {
  const all = readLastDelivered(raw);
  it("reads each network's order and drops one it cannot place in time", () => {
    expect(Object.keys(all).sort()).toEqual(["AirtelTigo", "MTN"]);
    expect(all.AirtelTigo).toMatchObject({ gb: 1, amount: 3.8, store: "Ida's Data Store" });
  });
  it("marks a delivery slower than 30 minutes", () => { expect(tookSlow(all.MTN)).toBe(true); expect(tookSlow(all.AirtelTigo)).toBe(false); });
  it("says where it was bought", () => { expect(boughtOn(all.MTN)).toBe("Our site"); expect(boughtOn(all.AirtelTigo)).toBe("Ida's Data Store"); expect(boughtOn({ store: "X", api: true })).toBe("API"); });
  it("is empty for nothing", () => expect(readLastDelivered(null)).toEqual({}));
});

describe("deliveredAgo", () => {
  const at = Date.parse("2026-11-23T12:00:00Z");
  it("counts minutes and hours", () => {
    expect(deliveredAgo(at, at + 20_000)).toBe("just now");
    expect(deliveredAgo(at, at + 4 * 60_000)).toBe("4 min ago");
    expect(deliveredAgo(at, at + 65 * 60_000)).toBe("1 hr 5 min ago");
    expect(deliveredAgo(at, at + 120 * 60_000)).toBe("2 hr ago");
  });
  it("gives the date after a day", () => expect(deliveredAgo(at, at + 26 * 3600_000)).toBe("23 Nov, 12:00 pm"));
});
