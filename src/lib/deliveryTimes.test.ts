import { describe, expect, it } from "vitest";
import { DELIVERY_TIMES, deliveryTimesText, speedNetworks } from "./deliveryTimes";

const all = deliveryTimesText().join(" \n ");

describe("delivery times wording", () => {
  it("never names us, so it can sit in any agent's store", () => expect(all).not.toMatch(/data ?yego|yiego/i));
  it("says MTN verification can take a few weeks, never days", () => {
    expect(DELIVERY_TIMES.reasons.find((r) => r.key === "first_mtn")?.body).toMatch(/can take a few weeks/);
    expect(all).not.toMatch(/a few days|hours to days|shortly/i);
  });
  it("has no word about refunds or failed orders", () => expect(all).not.toMatch(/refund|fail/i));
  it("makes no promise we can't keep", () => expect(all).not.toMatch(/100\s?%|always deliver|guarantee|instant/i));
  it("keeps the three steps and four reasons", () => { expect(DELIVERY_TIMES.steps).toHaveLength(3); expect(DELIVERY_TIMES.reasons).toHaveLength(4); });
});

describe("speedNetworks", () => {
  it("puts the networks in the usual order", () => expect(speedNetworks(["AirtelTigo", "MTN", "Telecel"])).toEqual(["MTN", "Telecel", "AirtelTigo"]));
  it("keeps a network it doesn't know, at the end", () => expect(speedNetworks(["Glo", "MTN"])).toEqual(["MTN", "Glo"]));
  it("shows nothing when nothing is measured", () => expect(speedNetworks([])).toEqual([]));
});
