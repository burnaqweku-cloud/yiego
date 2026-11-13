import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { ADMIN_GROUPS, groupForPath, pageForPath } from "@/lib/admin-nav";

describe("admin menu", () => {
  it("gives DY Services its own group, not a line under Announcements", () => {
    const group = ADMIN_GROUPS.find((g) => g.label === "DY Services");
    expect(group?.pages.map((p) => p.label)).toEqual(["Overview", "Result checkers", "AFA registrations", "Orders & refunds", "Text messages"]);
    expect(ADMIN_GROUPS.find((g) => g.id === "announcements")?.pages.some((p) => p.to.startsWith("/admin/services"))).toBe(false);
  });
  it("finds the right page and group for every DY Services address", () => {
    expect(pageForPath("/admin/services")?.id).toBe("services");
    expect(pageForPath("/admin/services/")?.id).toBe("services");
    expect(pageForPath("/admin/services/checkers")?.id).toBe("service-checkers");
    expect(pageForPath("/admin/services/afa")?.id).toBe("service-afa");
    expect(pageForPath("/admin/services/orders")?.id).toBe("service-orders");
    expect(pageForPath("/admin/services/sms")?.id).toBe("service-sms");
    expect(groupForPath("/admin/services/afa")?.id).toBe("dy-services");
    expect(groupForPath("/admin/services")?.id).toBe("dy-services");
  });
  it("finds a group's first page at its exact address", () => {
    expect(pageForPath("/admin/sms")?.id).toBe("sms");
    expect(pageForPath("/admin/sms/messages")?.id).toBe("sms-messages");
    expect(pageForPath("/admin/mtn-verification")?.id).toBe("mtn-queue");
    expect(pageForPath("/admin")?.id).toBe("overview");
    expect(pageForPath("/admin/orders")?.id).toBe("orders");
  });
  it("has no two pages with the same id or address", () => {
    const pages = ADMIN_GROUPS.flatMap((g) => g.pages);
    expect(new Set(pages.map((p) => p.id)).size).toBe(pages.length);
    expect(new Set(pages.map((p) => p.to)).size).toBe(pages.length);
  });
});
