import { describe, expect, it } from "vitest";
import { barPercent, dayLabel, lastSaleLabel, periodPhrase, saleFreshness } from "./networkSales";

const now = new Date("2026-11-23T11:00:00Z");

describe("lastSaleLabel", () => {
  it("says today and yesterday with the time", () => {
    expect(lastSaleLabel("2026-11-23T10:42:00Z", now)).toBe("Today, 10:42 am");
    expect(lastSaleLabel("2026-11-22T15:10:00Z", now)).toBe("Yesterday, 3:10 pm");
  });
  it("names the weekday inside a week, the date after, the year when it differs", () => {
    expect(lastSaleLabel("2026-11-19T09:00:00Z", now)).toBe("Thu 19 Nov");
    expect(lastSaleLabel("2026-10-02T09:00:00Z", now)).toBe("2 Oct");
    expect(lastSaleLabel("2025-10-02T09:00:00Z", now)).toBe("2 Oct 2025");
  });
  it("says so when there is none", () => expect(lastSaleLabel(null, now)).toBe("No sales yet"));
});

describe("saleFreshness", () => {
  it("sorts sales into today, this week, older and never", () => {
    expect(saleFreshness("2026-11-23T00:05:00Z", now)).toBe("today");
    expect(saleFreshness("2026-11-22T23:59:00Z", now)).toBe("week");
    expect(saleFreshness("2026-11-10T10:00:00Z", now)).toBe("older");
    expect(saleFreshness(null, now)).toBe("never");
  });
});

describe("small sums", () => {
  it("gives bars a share of the total, never invisible when they sold", () => {
    expect(barPercent(50, 200)).toBe(25);
    expect(barPercent(1, 1000)).toBe(4);
    expect(barPercent(0, 100)).toBe(0);
    expect(barPercent(10, 0)).toBe(0);
  });
  it("labels days and periods", () => {
    expect(dayLabel("2026-11-23", false)).toBe("Mon");
    expect(dayLabel("2026-11-23", true)).toBe("23");
    expect(periodPhrase("7d")).toBe("in the last 7 days");
  });
});
