import { describe, expect, it } from "vitest";
import { TEXT_PINS_MOST, serviceTexts } from "../../supabase/functions/service-pay/texts";

const pins = (n: number) => Array.from({ length: n }, (_, i) => ({ serial: `2652000${String(56763 + i).padStart(5, "0")}`, pin: `7UMCEA8FF${String(100 + i)}` }));
const order = (n: number, extra: object = {}) => ({ reference: "SV-AB12CD34EF", kind: "checker", phone: "0241234567", email: "ama@example.com", pins: pins(n), ...extra });
// Words the network drops from our sender name (tested 13 Nov 2026) or dropped in earlier tests.
const BLOCKED = /wassce|waec|bece|results? checker|\bdata\b|bundle|\bgb\b|\bmtn\b|telecel|airteltigo|https?:|\.org|\.com/i;

describe("the texts DY Services sends", () => {
  it("one checker: serial and PIN in the text", () => {
    expect(serviceTexts(order(1))).toEqual(["DY Services: your checker. S/N 265200056763 PIN 7UMCEA8FF100. Order SV-AB12CD34EF."]);
  });
  it("up to five checkers: every PIN in one text, numbered", () => {
    const [text, ...rest] = serviceTexts(order(5));
    expect(rest).toEqual([]);
    expect(text.startsWith("DY Services: your 5 checkers. 1) S/N 265200056763 PIN 7UMCEA8FF100 2) S/N 265200056764 PIN 7UMCEA8FF101")).toBe(true);
    expect(text.endsWith("5) S/N 265200056767 PIN 7UMCEA8FF104. Order SV-AB12CD34EF.")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(306); // two joined text messages at most
  });
  it("more than five: five to a text, numbering carries on, each text says which one it is", () => {
    const texts = serviceTexts(order(12));
    expect(texts.length).toBe(3);
    expect(texts[0]).toContain("your 12 checkers, text 1 of 3. 1) S/N");
    expect(texts[1]).toContain("text 2 of 3. 6) S/N");
    expect(texts[2]).toContain("text 3 of 3. 11) S/N");
    expect(texts[2]).toContain("12) S/N 265200056774 PIN 7UMCEA8FF111. Order SV-AB12CD34EF.");
    const all = texts.join(" ");
    for (const p of pins(12)) { expect(all).toContain(`S/N ${p.serial} PIN ${p.pin}`); }
    for (const t of texts) expect(t.length).toBeLessThanOrEqual(306);
  });
  it("sends every PIN up to the ceiling, and one pointer text above it", () => {
    expect(serviceTexts(order(TEXT_PINS_MOST)).length).toBe(10);
    expect(serviceTexts(order(TEXT_PINS_MOST + 1))).toEqual([`DY Services: your ${TEXT_PINS_MOST + 1} checkers are saved under order SV-AB12CD34EF. We have emailed them to you.`]);
    expect(serviceTexts(order(1000, { email: "0241234567@guest.datayego.com" }))).toEqual(["DY Services: your 1000 checkers are saved under order SV-AB12CD34EF. Open your order on our site to see them."]);
  });
  it("AFA: the number that was registered", () => {
    expect(serviceTexts({ reference: "SV-AB12CD34EF", kind: "afa", phone: "0201111111", pins: [], afa: { phone: "0241234567" } })).toEqual(["DY Services: 0241234567 is now registered on AFA. Order SV-AB12CD34EF."]);
  });
  it("never uses a word the network drops, and says nothing when there is nothing to send", () => {
    for (const n of [1, 2, 5, 6, 12, 50, 51]) for (const t of serviceTexts(order(n))) expect(BLOCKED.test(t), t).toBe(false);
    expect(serviceTexts(order(0))).toEqual([]);
  });
});
