import { describe, expect, it } from "vitest";
import { deliveryRange, rangeText } from "./deliveryRange";

const last = (tookMin: number) => ({ network: "MTN", gb: 1, phone: "054*****04", paidAt: 0, deliveredAt: tookMin * 60_000, ageSeconds: 7200 });
const speed = (longest?: number, extra: Record<string, unknown> = {}) => ({ window: "1h" as const, sample: 50, median_minutes: 227, at_least: true, ...(longest != null ? { longest_minutes: longest } : {}), ...extra });

describe("rangeText: whole hours, rounded, smaller first", () => {
  it("today's MTN: last delivered 4 hr 20 min, longest waiting 6 hr 4 min", () => expect(rangeText(260, 364)).toEqual({ from: "4 hours", to: "6 hours", text: "4 to 6 hours" }));
  it("puts the smaller first (deliveries restarting: the last delivered is the longer one)", () => expect(rangeText(380, 20)).toEqual({ from: "20 min", to: "6 hours", text: "20 min to 6 hours" }));
  it("one figure when both round the same", () => expect(rangeText(364, 380).text).toBe("about 6 hours"));
  it("minutes in fives under an hour", () => expect(rangeText(33, 47).text).toBe("35 to 45 min"));
  it("says 1 hour, not 1 hours", () => expect(rangeText(40, 70).text).toBe("40 min to 1 hour"));
  it("never decimals or minutes past the hour", () => {
    for (const [a, b] of [[61, 62], [35, 59], [90, 600], [31, 31], [125, 1000], [200, 601]]) expect(rangeText(a, b).text).not.toMatch(/\.|hr \d|hour \d/);
  });
});

describe("deliveryRange: last delivered order to the longest wait", () => {
  it("today: 4 to 6 hours", () => expect(deliveryRange("MTN", speed(364), last(260))?.text).toBe("4 to 6 hours"));
  it("ignores the middle figure", () => expect(deliveryRange("MTN", speed(364, { median_minutes: 5 }), last(260))?.text).toBe("4 to 6 hours"));
  it("nobody waiting: the last delivered alone", () => expect(deliveryRange("MTN", speed(), last(250))?.text).toBe("about 4 hours"));
  it("no delivery to read: the longest wait alone", () => expect(deliveryRange("MTN", speed(364), undefined)?.text).toBe("about 6 hours"));
  it("not slow when both are 30 minutes or less", () => expect(deliveryRange("MTN", speed(25), last(12))).toBeNull());
  it("slow when either is over 30 minutes", () => expect(deliveryRange("MTN", speed(95), last(12))?.text).toBe("10 min to 2 hours"));
  it("nothing while paused or before anything is measured", () => {
    expect(deliveryRange("MTN", undefined, last(260))).toBeNull();
    expect(deliveryRange("MTN", speed(364, { paused: true }), last(260))).toBeNull();
    expect(deliveryRange("MTN", { window: "none", sample: 0, median_minutes: 0 }, last(260))).toBeNull();
  });
});
