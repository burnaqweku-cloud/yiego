import { afterEach, describe, expect, it } from "vitest";
import { agoLabel, boardRows, cameFromAdvert, networkMark, readProof, type ProofDelivery } from "./advertProof";

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

const d = (minutes: number, phone = `024*****${String(minutes).padStart(2, "0")}`): ProofDelivery => ({ network: "MTN", gb: 2, phone, minutes });

describe("a reading from the records", () => {
  it("keeps real, fresh deliveries, newest first, and drops what it cannot stand behind", () => {
    const raw = { delivered: 6767, recent: [d(9), { network: "MTN", gb: 5, phone: "055*****47", minutes: 3.4 }, { network: "", gb: 1, phone: "x", minutes: 1 }, { network: "MTN", gb: 0, phone: "024*****20", minutes: 2 }, d(75), "junk"] };
    expect(readProof(raw)).toEqual([{ network: "MTN", gb: 5, phone: "055*****47", minutes: 3 }, d(9)]);
  });
  it("shows no board when too little has gone out lately, or nothing can be read", () => {
    expect(readProof({ recent: [d(4)] })).toBeNull();
    expect(readProof({ recent: [d(90), d(120)] })).toBeNull();
    expect(readProof({ recent: [] })).toBeNull();
    expect(readProof(null)).toBeNull();
    expect(readProof("nope")).toBeNull();
  });
  it("never keeps more than eight", () => {
    expect(readProof({ recent: Array.from({ length: 20 }, (_, i) => d(i)) })).toHaveLength(8);
  });
});

describe("the board", () => {
  const rows = [d(1), d(2), d(3), d(4), d(5)];
  it("shows three at a time and walks down the list, then starts again", () => {
    expect(boardRows(rows, 0).map((r) => r.minutes)).toEqual([1, 2, 3]);
    expect(boardRows(rows, 1).map((r) => r.minutes)).toEqual([2, 3, 4]);
    expect(boardRows(rows, 4).map((r) => r.minutes)).toEqual([5, 1, 2]);
    expect(boardRows(rows, 5).map((r) => r.minutes)).toEqual([1, 2, 3]);
  });
  it("stands still when everything already fits", () => {
    expect(boardRows(rows.slice(0, 2), 7)).toEqual(rows.slice(0, 2));
  });
  it("says how long ago in plain words", () => {
    expect(agoLabel(0)).toBe("just now");
    expect(agoLabel(3)).toBe("3 min ago");
    expect(agoLabel(60)).toBe("1 hr ago");
  });
  it("marks each network in its own colour", () => {
    expect(networkMark("MTN")).toEqual({ text: "MTN", tone: "mtn" });
    expect(networkMark("Telecel")).toEqual({ text: "TEL", tone: "telecel" });
    expect(networkMark("AirtelTigo")).toEqual({ text: "AT", tone: "at" });
    expect(networkMark("Glo")).toEqual({ text: "GLO", tone: "other" });
  });
});
