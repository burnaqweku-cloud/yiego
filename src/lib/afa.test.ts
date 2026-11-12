import { describe, expect, it } from "vitest";
import { afaProblem, formatGhanaCard, latestBirth } from "@/lib/afa";

const good = { full_name: "Ama Serwaa Mensah", afa_phone: "024 123 4567", ghana_card: "GHA-123456789-0", dob: "1995-04-02", occupation: "Trader", region: "Ashanti", address: "Kumasi, Adum, near the post office" };
const today = new Date("2026-11-13T10:00:00Z");

describe("AFA form", () => {
  it("shapes a Ghana Card number however it is typed", () => {
    expect(formatGhanaCard("gha1234567890")).toBe("GHA-123456789-0");
    expect(formatGhanaCard("GHA-123456789-0")).toBe("GHA-123456789-0");
    expect(formatGhanaCard("1234")).toBe("GHA-1234");
    expect(formatGhanaCard("")).toBe("");
    expect(formatGhanaCard("GHA-12345678901234")).toBe("GHA-123456789-0");
  });
  it("accepts a complete form", () => { expect(afaProblem(good, today)).toBeNull(); });
  it("names the first thing that is wrong", () => {
    expect(afaProblem({ ...good, full_name: "Ama" }, today)).toMatch(/full name/);
    expect(afaProblem({ ...good, afa_phone: "12345" }, today)).toMatch(/MTN number/);
    expect(afaProblem({ ...good, ghana_card: "GHA-12345" }, today)).toMatch(/Ghana Card/);
    expect(afaProblem({ ...good, dob: "2015-01-01" }, today)).toMatch(/16 or older/);
    expect(afaProblem({ ...good, region: "" }, today)).toMatch(/region/);
    expect(afaProblem({ ...good, address: "x" }, today)).toMatch(/address/);
  });
  it("allows someone who turns 16 today and not a day younger", () => {
    expect(latestBirth(today)).toBe("2010-11-13");
    expect(afaProblem({ ...good, dob: "2010-11-13" }, today)).toBeNull();
    expect(afaProblem({ ...good, dob: "2010-11-14" }, today)).toMatch(/16 or older/);
  });
});
