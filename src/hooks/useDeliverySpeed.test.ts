import { describe, expect, it } from "vitest";
import { speedLabel, speedPill } from "./useDeliverySpeed";

const s = (median_minutes: number, at_least = false) => ({ window: "1h" as const, sample: 5, median_minutes, at_least });

describe("speedLabel", () => {
  it("keeps short waits in minutes", () => { expect(speedLabel(s(6))).toBe("~6 min"); expect(speedLabel(s(0.4))).toBe("under a minute"); });
  it("says an hour or more in hours and minutes, never decimals", () => {
    expect(speedLabel(s(380, true))).toBe("over 6 hr 20 min");
    expect(speedLabel(s(60))).toBe("~1 hr");
    expect(speedLabel(s(95))).toBe("~1 hr 35 min");
  });
  it("puts it in the pill", () => expect(speedPill(s(380, true))?.text).toBe("MTN delivering in over 6 hr 20 min"));
});
