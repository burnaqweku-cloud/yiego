import { describe, expect, it } from "vitest";
import { promotionBasePrice } from "./promotions";
import { paystackFee, paystackTotal } from "./fees";

describe("first-purchase promotion pricing", () => {
  it("keeps the requested 1GB offer at GHS 3.95 before checkout", () => {
    expect(promotionBasePrice("3.95")).toBe(3.95);
  });
  it("adds the usual 4% fee at Paystack checkout", () => {
    expect(paystackFee(3.95)).toBe(0.16);
    expect(paystackTotal(3.95)).toBe(4.11);
  });
  it("accepts changed per-bundle prices but refuses invalid money", () => {
    expect(promotionBasePrice("7.50")).toBe(7.5);
    expect(promotionBasePrice("3.951")).toBeNull();
    expect(promotionBasePrice(0)).toBeNull();
    expect(promotionBasePrice(-1)).toBeNull();
  });
});