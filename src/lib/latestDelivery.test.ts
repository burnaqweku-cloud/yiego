import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/bootstrap", () => ({ bootstrapOnce: () => Promise.resolve() }));
vi.mock("@/lib/phase1-api", () => ({ loadPhase1Networks: () => Promise.resolve({ data: [] }) }));
import type { NetworkSpeed } from "@/hooks/useDeliverySpeed";
import { clockParts, dayLabel, deliveryToShow, FRESH_HOURS, MAX_MINUTES, networkMark, readLatest, rightNow, tookLabel } from "./latestDelivery";

const at = (iso: string) => Date.parse(iso);
const row = (over: Record<string, unknown> = {}) => ({ gb: 1, phone: "055*****15", paid_at: "2026-11-14T13:03:15.9+00:00", delivered_at: "2026-11-14T13:20:07.4+00:00", age_seconds: 381, ...over });
const quick: NetworkSpeed = { window: "1h", sample: 5, median_minutes: 24.8 };
const quiet: NetworkSpeed = { window: "none", sample: 0, median_minutes: 0 };

describe("reading the latest deliveries", () => {
  it("keeps a real order, by network", () => {
    const all = readLatest({ MTN: row(), AirtelTigo: row({ gb: "1.00", phone: "027*****92" }) });
    expect(all.MTN).toEqual({ network: "MTN", gb: 1, phone: "055*****15", paidAt: at("2026-11-14T13:03:15.9Z"), deliveredAt: at("2026-11-14T13:20:07.4Z"), ageSeconds: 381 });
    expect(all.AirtelTigo.gb).toBe(1);
  });

  it("drops anything it cannot stand behind", () => {
    expect(readLatest(null)).toEqual({});
    expect(readLatest([row()])).toEqual({});
    expect(readLatest({ MTN: row({ phone: "0551234515" }) })).toEqual({});            // a whole number is never shown
    expect(readLatest({ MTN: row({ gb: 0 }) })).toEqual({});
    expect(readLatest({ MTN: row({ paid_at: "nonsense" }) })).toEqual({});
    expect(readLatest({ MTN: row({ delivered_at: "2026-11-14T13:00:00+00:00" }) })).toEqual({}); // landed before it was paid
    expect(readLatest({ MTN: row({ age_seconds: -5 }) })).toEqual({});
    expect(readLatest({ MTN: "x" })).toEqual({});
  });
});

describe("whether the delivery is shown", () => {
  const all = readLatest({ MTN: row() });

  it("shows a quick, recent delivery while the network is not slow", () => {
    expect(deliveryToShow(all, "MTN", quick)?.phone).toBe("055*****15");
    expect(deliveryToShow(all, "MTN", quiet)?.phone).toBe("055*****15");
  });

  it("waits for the live speed before showing anything", () => {
    expect(deliveryToShow(all, "MTN", undefined)).toBeNull();
  });

  it("steps aside when the network is slow or paused right now", () => {
    expect(deliveryToShow(all, "MTN", { ...quick, median_minutes: 31 })).toBeNull();
    expect(deliveryToShow(all, "MTN", { ...quick, median_minutes: 95, at_least: true })).toBeNull();
    expect(deliveryToShow(all, "MTN", { ...quiet, paused: true })).toBeNull();
  });

  it("never shows off a slow delivery", () => {
    const slow = readLatest({ MTN: row({ paid_at: "2026-11-14T12:49:00+00:00", delivered_at: "2026-11-14T13:20:01+00:00" }) });
    expect(deliveryToShow(slow, "MTN", quick)).toBeNull();
    const edge = readLatest({ MTN: row({ paid_at: "2026-11-14T12:50:07.4+00:00" }) });
    expect((edge.MTN.deliveredAt - edge.MTN.paidAt) / 60_000).toBe(MAX_MINUTES);
    expect(deliveryToShow(edge, "MTN", quick)).not.toBeNull();
  });

  it("drops a delivery from too long ago", () => {
    expect(deliveryToShow(readLatest({ MTN: row({ age_seconds: FRESH_HOURS * 3600 }) }), "MTN", quick)).not.toBeNull();
    expect(deliveryToShow(readLatest({ MTN: row({ age_seconds: FRESH_HOURS * 3600 + 1 }) }), "MTN", quick)).toBeNull();
  });

  it("shows nothing for a network with no delivery", () => {
    expect(deliveryToShow(all, "Telecel", quiet)).toBeNull();
  });
});

describe("the words on the card", () => {
  it("says how long it took the way a person would", () => {
    expect(tookLabel({ paidAt: 0, deliveredAt: 16.9 * 60_000 })).toBe("17 minutes");
    expect(tookLabel({ paidAt: 0, deliveredAt: 60_000 })).toBe("1 minute");
    expect(tookLabel({ paidAt: 0, deliveredAt: 35_000 })).toBe("1 minute");
    expect(tookLabel({ paidAt: 0, deliveredAt: 20_000 })).toBe("Under a minute");
  });

  it("splits the clock time so the period can be set small", () => {
    const local = new Date(2026, 10, 14, 13, 3, 15).getTime();
    expect(clockParts(local)).toEqual({ time: "1:03", period: "PM" });
    expect(clockParts(new Date(2026, 10, 14, 10, 45).getTime())).toEqual({ time: "10:45", period: "AM" });
  });

  it("names the day by the server's clock, not the phone's", () => {
    const evening = new Date(2026, 10, 14, 23, 50).getTime();
    expect(dayLabel({ deliveredAt: evening, ageSeconds: 5 * 60 })).toBe("Today");
    expect(dayLabel({ deliveredAt: evening, ageSeconds: 30 * 60 })).toBe("Yesterday");
  });

  it("describes right now in the catalogue's own words", () => {
    expect(rightNow(quick)).toBe("about 25 minutes");
    expect(rightNow(quiet)).toBe("delivering fast");
    expect(rightNow(undefined)).toBe("delivering fast");
  });

  it("marks each network", () => {
    expect(networkMark("MTN")).toEqual({ text: "MTN", tone: "mtn" });
    expect(networkMark("Telecel").tone).toBe("telecel");
    expect(networkMark("AirtelTigo")).toEqual({ text: "AT", tone: "at" });
  });
});
