import { describe, expect, it } from "vitest";
import { buttonLabel, isInAppLink, readDashboardMessages, whenLabel } from "./dashboardMessages";

describe("readDashboardMessages", () => {
  it("keeps well-formed messages and tidies the link", () => {
    const [m] = readDashboardMessages([{ id: "a", title: "T", body: "B", kind: "update", link_url: " /agent/domain/buy ", link_label: " ", starts_at: "2026-11-18T10:00:00Z" }]);
    expect(m.link_url).toBe("/agent/domain/buy"); expect(m.link_label).toBeNull();
  });
  it("drops anything that isn't a message", () => expect(readDashboardMessages([null, 3, { id: 1 }, { id: "x", title: "t" }])).toEqual([]));
  it("copes with a reply that isn't a list", () => expect(readDashboardMessages(null)).toEqual([]));
});

describe("isInAppLink", () => {
  it("opens our own pages in place", () => expect(isInAppLink("/agent/domain/buy")).toBe(true));
  it("sends other sites to a new tab", () => { expect(isInAppLink("https://wa.me/233")).toBe(false); expect(isInAppLink("//evil.example")).toBe(false); expect(isInAppLink(null)).toBe(false); });
});

describe("whenLabel", () => {
  const now = new Date("2026-11-18T20:00:00Z");
  it("says today and yesterday in Ghana time", () => {
    expect(whenLabel("2026-11-18T06:00:00Z", now)).toBe("today");
    expect(whenLabel("2026-11-17T23:30:00Z", now)).toBe("yesterday");
  });
  it("gives the date for older ones", () => expect(whenLabel("2026-11-12T10:00:00Z", now)).toBe("12 Nov"));
});

describe("buttonLabel", () => {
  it("uses the written text", () => expect(buttonLabel({ link_url: "/agent", link_label: "Get your domain" })).toBe("Get your domain"));
  it("falls back to Open", () => expect(buttonLabel({ link_url: "/agent", link_label: null })).toBe("Open"));
  it("has no button without a link", () => expect(buttonLabel({ link_url: null, link_label: "x" })).toBeNull());
});
