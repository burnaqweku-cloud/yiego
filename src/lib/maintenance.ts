import { supabase } from "@/integrations/supabase/client";
import { parseMaintenance, type MaintenanceSettings } from "./maintenancePolicy";

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
  const saved = await db().rpc("admin_set_site_setting", { p_actor: userId, p_key: "agent_plan", p_value: { ...data.value, maintenance: next } });
  if (saved.error) throw new Error("Could not save maintenance. Use the master administrator account with two-factor verification.");
  window.dispatchEvent(new Event("yego:maintenance-refresh"));
  return next;
}