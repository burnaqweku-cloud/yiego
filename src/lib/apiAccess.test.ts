import { describe, expect, it } from "vitest";
import { agoLabel, maskPhone, orderStatusLabel } from "./apiAccess";

describe("API page helpers", () => {
  it("names every order status in plain words", () => {
    expect(orderStatusLabel("delivered")).toEqual({ text: "Delivered", tone: "good" });
    expect(orderStatusLabel("processing").text).toBe("Delivering");
    expect(orderStatusLabel("queued").text).toBe("In line");
    expect(orderStatusLabel("verifying").text).toBe("MTN verifying");
    expect(orderStatusLabel("on_hold").text).toBe("Checking");
    expect(orderStatusLabel("refunded").tone).toBe("muted");
  });
  it("hides the middle of a number like the rest of the dashboard", () => {
    expect(maskPhone("0241234567")).toBe("024****567");
    expect(maskPhone("12")).toBe("12");
  });
  it("says how long ago in short words", () => {
    const now = Date.parse("2026-11-21T12:00:00Z");
    expect(agoLabel(null, now)).toBe("never");
    expect(agoLabel("2026-11-21T11:59:30Z", now)).toBe("just now");
    expect(agoLabel("2026-11-21T11:55:00Z", now)).toBe("5 min ago");
    expect(agoLabel("2026-11-21T09:00:00Z", now)).toBe("3 hr ago");
    expect(agoLabel("2026-11-20T10:00:00Z", now)).toBe("yesterday");
  });
});
