import { expect, it } from "vitest";
import { DEFAULT_MAINTENANCE, maintenanceTransition } from "./maintenancePolicy";
it("creates a start notice using the maintenance reason and expected return", () => {
  const event = maintenanceTransition(DEFAULT_MAINTENANCE, { ...DEFAULT_MAINTENANCE, enabled: true, revision: "start", reason: "Supplier maintenance", eta: "4 PM Ghana time" });
  expect(event?.body).toBe("Supplier maintenance\n\n4 PM Ghana time");
  expect(event?.id).toBe("maintenance:start");
});
it("creates the owner's restored notice only on switch-off", () => {
  expect(maintenanceTransition({ ...DEFAULT_MAINTENANCE, enabled: true }, { ...DEFAULT_MAINTENANCE, revision: "end", restored_message: "We are back. Buy your data." })?.body).toBe("We are back. Buy your data.");
});
it("does not broadcast when editing details without switching state", () => {
  expect(maintenanceTransition(DEFAULT_MAINTENANCE, { ...DEFAULT_MAINTENANCE, reason: "Updated reason" })).toBeNull();
});