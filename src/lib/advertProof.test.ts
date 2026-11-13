import { afterEach, describe, expect, it } from "vitest";
import { agoLabel, cameFromAdvert, networkMark, proofCount, readProof, recentCount, sinceLabel } from "./advertProof";

describe("who is shown the proof card", () => {
  afterEach(() => localStorage.clear());
  it("someone arriving on an advert's link", () => {
    expect(cameFromAdvert("?promo=1&utm_source=fb&utm_campaign=120253539246610206")).toBe(true);
  });
  it("the same person on a later visit, because the browser remembers the advert", () => {
    localStorage.setItem("yg-promotion-touch-v1", JSON.stringify({ id: "a", token: "b", at: 1 }));
    expect(cameFromAdvert("")).toBe(true);
  });
  it("nobody else", () => {
    expect(cameFromAdvert("")).toBe(false);
    expect(cameFromAdvert("?utm_source=fb")).toBe(false);
  });
});

describe("a reading from the records", () => {
  const raw = { delivered: 6767, today: 122, week: 1091, since: "2026-08-13", recent: [{ network: "MTN", gb: 5, phone: "055*****47", minutes: 3.4 }, { network: "", gb: 1, phone: "x", minutes: 1 }, { network: "MTN", gb: 0, phone: "024*****20", minutes: 2 }, "junk"] };
  it("keeps the real figures and drops rows it cannot stand behind", () => {
    expect(readProof(raw)).toEqual({ delivered: 6767, today: 122, week: 1091, since: "2026-08-13", recent: [{ network: "MTN", gb: 5, phone: "055*****47", minutes: 3 }] });
  });
  it("shows nothing at all without a count", () => {
    expect(readProof(null)).toBeNull();
    expect(readProof({ delivered: 0 })).toBeNull();
    expect(readProof({ delivered: "many" })).toBeNull();
    expect(readProof([])).toBeNull();
  });
  it("never shows more than eight deliveries", () => {
    const many = { delivered: 10, recent: Array.from({ length: 20 }, (_, i) => ({ network: "MTN", gb: 1, phone: "024*****00", minutes: i })) };
    expect(readProof(many)?.recent).toHaveLength(8);
  });
});

describe("the words on the card", () => {
  it("writes the count the way people read money", () => {
    expect(proofCount(6767)).toBe("6,767");
  });
  it("says since which month, adding the year once it has passed", () => {
    expect(sinceLabel("2026-08-13", new Date("2026-11-13T12:00:00Z"))).toBe("since August");
    expect(sinceLabel("2026-08-13", new Date("2027-01-02T12:00:00Z"))).toBe("since August 2026");
    expect(sinceLabel("")).toBe("");
    expect(sinceLabel("not a date")).toBe("");
  });
  it("shows today's count once the day has enough, the week's before that, and nothing when both are thin", () => {
    expect(recentCount({ today: 122, week: 1091 })).toMatchObject({ n: 122, when: "Today" });
    expect(recentCount({ today: 4, week: 1091 })).toMatchObject({ n: 1091, when: "This week" });
    expect(recentCount({ today: 0, week: 3 })).toBeNull();
  });
  it("says how long ago in plain words", () => {
    expect(agoLabel(0)).toBe("just now");
    expect(agoLabel(3)).toBe("3 min ago");
    expect(agoLabel(61)).toBe("1 hr ago");
    expect(agoLabel(150)).toBe("3 hrs ago");
  });
  it("marks each network in its own colour", () => {
    expect(networkMark("MTN")).toEqual({ text: "MTN", tone: "mtn" });
    expect(networkMark("Telecel")).toEqual({ text: "TEL", tone: "telecel" });
    expect(networkMark("AirtelTigo")).toEqual({ text: "AT", tone: "at" });
    expect(networkMark("Glo")).toEqual({ text: "GLO", tone: "other" });
  });
});
