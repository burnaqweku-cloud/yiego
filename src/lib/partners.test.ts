import { describe, expect, it, beforeEach } from "vitest";
import { capturePartnerCode, normalizePartnerCode, projectEarnings, savedPartnerCode } from "./partners";

describe("partner links", () => {
  beforeEach(() => localStorage.clear());
  it("remembers ?p=CODE upper-cased", () => { capturePartnerCode("?p=kofi12"); expect(savedPartnerCode()).toBe("KOFI12"); });
  it("forgets the code after 30 days", () => { capturePartnerCode("?p=KOFI12"); expect(savedPartnerCode(Date.now() + 31 * 86400000)).toBeNull(); });
  it("rejects junk codes", () => { expect(normalizePartnerCode("a")).toBeNull(); expect(normalizePartnerCode("<x>")).toBeNull(); });
  it("500 orders of 2 GB on Starter (0.44) = GH₵220", () => { expect(projectEarnings(0.44, 500)).toBe(220); });
});
