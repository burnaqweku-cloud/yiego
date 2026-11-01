import { describe, expect, it } from "vitest";
import { maintenanceError } from "../../supabase/functions/_shared/maintenance";

const db = (enabled: boolean, admin = false, error = false) => ({ from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: { maintenance: { enabled, blocked_message: "Paused for maintenance" } } }, error: error ? {} : null }), eq: () => ({ maybeSingle: async () => ({ data: table === "admin_users" && admin ? { user_id: "admin" } : null }) }) }) }) }) });
const token = (aal: string) => `header.${btoa(JSON.stringify({ sub: "admin", aal }))}.signature`;
describe("server maintenance guard", () => {
  it("allows ordinary purchases when maintenance is off", async () => expect(await maintenanceError(db(false), null)).toBeNull());
  it("blocks guests and ordinary customers", async () => {
    expect(await maintenanceError(db(true), null)).toBe("Paused for maintenance");
    expect(await maintenanceError(db(true), "customer", token("aal2"))).toBe("Paused for maintenance");
  });
  it("requires a verified caller, active administrator and AAL2", async () => {
    expect(await maintenanceError(db(true, true), "admin", token("aal2"))).toBeNull();
    expect(await maintenanceError(db(true, true), "admin", token("aal1"))).toBe("Paused for maintenance");
    expect(await maintenanceError(db(true, false), "admin", token("aal2"))).toBe("Paused for maintenance");
    expect(await maintenanceError(db(true, true), "admin")).toBe("Paused for maintenance");
  });
  it("fails closed if settings cannot be checked", async () => expect(await maintenanceError(db(false, false, true), null)).toContain("Could not check"));
});