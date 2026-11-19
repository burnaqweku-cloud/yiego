import { describe, expect, it } from "vitest";
import { deliveryRange, rangeText } from "./deliveryRange";

const last = (tookMin: number) => ({ network: "MTN", gb: 1, phone: "054*****04", paidAt: 0, deliveredAt: tookMin * 60_000, ageSeconds: 7200 });
const speed = (longest?: number, extra: Record<string, unknown> = {}) => ({ window: "1h" as const, sample: 50, median_minutes: 227, at_least: true, ...(longest != null ? { longest_minutes: longest } : {}), ...extra });

describe("rangeText: hours and minutes, smaller first", () => {
  it("today's MTN: last delivered 4 hr 20 min, longest waiting 6 hr 27 min", () => expect(rangeText(260, 387.1)).toEqual({ from: "4 hr 20 min", to: "6 hr 27 min", text: "4 hr 20 min to 6 hr 27 min" }));
  it("puts the smaller first (deliveries restarting: the last delivered is the longer one)", () => expect(rangeText(380, 20)).toEqual({ from: "20 min", to: "6 hr 20 min", text: "20 min to 6 hr 20 min" }));
  it("one figure when both come to the same minute", () => expect(rangeText(387.2, 386.9).text).toBe("about 6 hr 27 min"));
  it("same hour: only the higher one", () => expect(rangeText(678, 696)).toEqual({ from: "11 hr 36 min", to: "11 hr 36 min", text: "about 11 hr 36 min" }));
  it("two figures again once the lower one is in another hour", () => expect(rangeText(310, 696).text).toBe("5 hr 10 min to 11 hr 36 min"));
  it("never a decimal: 11.3 hours is 11 hr 18 min", () => expect(rangeText(678, 760).text).toBe("11 hr 18 min to 12 hr 40 min"));
  it("whole hours say hours", () => expect(rangeText(240, 480).text).toBe("4 hours to 8 hours"));
  it("under an hour, same hour: the higher one", () => expect(rangeText(33, 47).text).toBe("about 47 min"));
  it("says 1 hour, not 1 hours", () => expect(rangeText(40, 60).text).toBe("40 min to 1 hour"));
  it("never a decimal point", () => {
    for (const [a, b] of [[61, 62], [35, 59], [90, 600], [31, 31], [125, 1000], [200, 601], [59.6, 60.4]]) expect(rangeText(a, b).text).not.toMatch(/\d\.\d/);
  });
});

describe("deliveryRange: last delivered order to the longest wait", () => {
  it("this morning: 4 hr 20 min to 6 hr 27 min", () => expect(deliveryRange("MTN", speed(387.1), last(260))?.text).toBe("4 hr 20 min to 6 hr 27 min"));
  it("ignores the middle figure", () => expect(deliveryRange("MTN", speed(387.1, { median_minutes: 5 }), last(260))?.text).toBe("4 hr 20 min to 6 hr 27 min"));
  it("nobody waiting: the last delivered alone", () => expect(deliveryRange("MTN", speed(), last(250))?.text).toBe("about 4 hr 10 min"));
  it("no delivery to read: the longest wait alone", () => expect(deliveryRange("MTN", speed(387.1), undefined)?.text).toBe("about 6 hr 27 min"));
  it("not slow when both are 30 minutes or less", () => expect(deliveryRange("MTN", speed(25), last(12))).toBeNull());
  it("slow when either is over 30 minutes", () => expect(deliveryRange("MTN", speed(95), last(12))?.text).toBe("12 min to 1 hr 35 min"));
  it("nothing while paused or before anything is measured", () => {
    expect(deliveryRange("MTN", undefined, last(260))).toBeNull();
    expect(deliveryRange("MTN", speed(364, { paused: true }), last(260))).toBeNull();
    expect(deliveryRange("MTN", { window: "none", sample: 0, median_minutes: 0 }, last(260))).toBeNull();
  });
});
