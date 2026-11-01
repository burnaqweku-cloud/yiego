import { supabase } from "@/integrations/supabase/client";
import { maintenanceTransition, parseMaintenance, type MaintenanceAnnouncement, type MaintenanceSettings } from "./maintenancePolicy";
import { invalidate } from "./requestCache";

// Stored beside the existing publicly readable plan settings, never in browser storage.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");
export async function loadMaintenance(): Promise<MaintenanceSettings> {
  const { data, error } = await db().from("site_settings").select("value").eq("key", "agent_plan").maybeSingle();
  if (error) throw new Error("Could not check service availability.");
  return parseMaintenance(data?.value?.maintenance);
}
export async function saveMaintenance(userId: string, settings: MaintenanceSettings) {
  // Preserve every plan, price, payout and promotion field.
  const { data, error } = await db().from("site_settings").select("value").eq("key", "agent_plan").single();
  if (error) throw new Error("Could not load the current settings. Nothing was changed.");
  const next = { ...parseMaintenance(settings), revision: new Date().toISOString() };
  const transition = maintenanceTransition(parseMaintenance(data.value?.maintenance), next);
  const previous = Array.isArray(data.value?.maintenance_announcements) ? data.value.maintenance_announcements : [];
  const announcements = transition ? [{ ...transition, starts_at: next.revision }, ...previous].slice(0, 20) : previous;
  const saved = await db().rpc("admin_set_site_setting", { p_actor: userId, p_key: "agent_plan", p_value: { ...data.value, maintenance: next, maintenance_announcements: announcements } });
  if (saved.error) throw new Error("Could not save maintenance. Use the master administrator account with two-factor verification.");
  window.dispatchEvent(new Event("yego:maintenance-refresh"));
  invalidate("ann:");
  window.dispatchEvent(new Event("yego:announcements-refresh"));
  return next;
}

export async function loadMaintenanceAnnouncements(): Promise<MaintenanceAnnouncement[]> {
  const { data, error } = await db().from("site_settings").select("value").eq("key", "agent_plan").maybeSingle();
  if (error) throw new Error("Could not load maintenance announcements.");
  const list: unknown[] = Array.isArray(data?.value?.maintenance_announcements) ? data.value.maintenance_announcements : [];
  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const a = item as Record<string, unknown>;
    return typeof a.id === "string" && a.id.startsWith("maintenance:") && typeof a.title === "string" && typeof a.body === "string" && typeof a.starts_at === "string" && (a.kind === "warning" || a.kind === "notice") ? [a as unknown as MaintenanceAnnouncement] : [];
  });
}