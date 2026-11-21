import { describe, expect, it } from "vitest";
import { agoLabel, apiSellerError, deliveryLabel, maskPhone, orderStatusLabel, parseIpList, type ApiWebhookDelivery } from "./apiAccess";

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

describe("webhook and key-lock helpers", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  const d = (over: Partial<ApiWebhookDelivery>): ApiWebhookDelivery => ({ id: 1, event: "order.delivered", test: false, status: "pending", attempts: 0, last_status: null, last_error: null, created_at: "2026-11-21T11:59:00Z", delivered_at: null, next_attempt_at: null, reference: "YG-1", ...over });
  it("says how each webhook went", () => {
    expect(deliveryLabel(d({ status: "delivered", last_status: 200 }), now)).toEqual({ text: "Delivered (200)", tone: "good" });
    expect(deliveryLabel(d({ status: "failed", attempts: 8 }), now).text).toBe("Gave up");
    expect(deliveryLabel(d({ attempts: 2, next_attempt_at: "2026-11-21T12:05:00Z" }), now).text).toBe("Retry 3 in 5 min");
    expect(deliveryLabel(d({ attempts: 0 }), now).text).toBe("Sending");
  });
  it("reads an IP list however it is typed", () => {
    expect(parseIpList("41.66.12.34\n 102.176.1.2, 2001:db8::1 ")).toEqual(["41.66.12.34", "102.176.1.2", "2001:db8::1"]);
    expect(parseIpList("  ")).toEqual([]);
  });
  it("turns refusals into plain words", () => {
    expect(apiSellerError("bad_url:The address must start with https://")).toBe("The address must start with https://");
    expect(apiSellerError("bad_ip:abc")).toContain("not an IP address");
    expect(apiSellerError("too_many_tests")).toContain("test events");
  });
});
