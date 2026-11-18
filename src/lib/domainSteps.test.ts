import { describe, expect, it } from "vitest";
import { canComplete, domainStage } from "./domainSteps";

describe("domainStage", () => {
  it("is not connected until Connect is pressed", () => expect(domainStage(false, { apex: { status: "active", ssl: "active" } })).toBe("not_connected"));
  it("waits for DNS while Cloudflare still has the address pending", () => expect(domainStage(true, { apex: { status: "pending", ssl: "pending_validation" } })).toBe("waiting_dns"));
  it("waits for DNS before any reply", () => expect(domainStage(true, {})).toBe("waiting_dns"));
  it("waits for the padlock once the address points to us", () => expect(domainStage(true, { apex: { status: "active", ssl: "pending_validation" } })).toBe("waiting_ssl"));
  it("is live when the main address works", () => expect(domainStage(true, { apex: { status: "active", ssl: "active" } })).toBe("live"));
  it("is live when the main address works and www is still pending", () => expect(domainStage(true, { apex: { status: "active", ssl: "active" }, www: { status: "pending" } })).toBe("live"));
  it("is not live when only www works", () => expect(domainStage(true, { apex: { status: "pending" }, www: { status: "active", ssl: "active" } })).toBe("www_only"));
  it("is live when the store is already marked active", () => expect(domainStage(true, null, "active")).toBe("live"));
});

describe("canComplete", () => {
  it("allows a paid domain", () => expect(canComplete("paid")).toBe(true));
  it("never completes twice", () => expect(canComplete("live")).toBe(false));
  it("never completes a refunded one", () => expect(canComplete("refunded")).toBe(false));
});
