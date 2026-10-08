import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { adminDatabase } from "@/lib/admin-data";

/* Support inbox alerts for the admin shell: how many chats need a person right now (badge on the
   menu item) and a toast the moment a new escalation lands while an admin is in the panel. */
interface Needs { needs: number; escalated_open: number; latest_escalation: string | null }
let state: Needs = { needs: 0, escalated_open: 0, latest_escalation: null };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let lastSeenEscalation: string | null = null;
let started = false;

async function tick() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (adminDatabase() as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: any }> }).rpc("admin_support_needs", {});
    if (!data) return;
    const next: Needs = { needs: Number(data.needs ?? 0), escalated_open: Number(data.escalated_open ?? 0), latest_escalation: data.latest_escalation ?? null };
    if (started && next.latest_escalation && lastSeenEscalation && next.latest_escalation > lastSeenEscalation && !location.pathname.startsWith("/admin/support-inbox")) {
      toast.warning("The assistant handed a customer over to the team.", { description: "Open the Support inbox to reply.", action: { label: "Open", onClick: () => { location.assign("/admin/support-inbox"); } }, duration: 12000 });
    }
    lastSeenEscalation = next.latest_escalation ?? lastSeenEscalation;
    started = true;
    state = next; listeners.forEach((l) => l());
  } catch { /* quiet */ }
}
export function startSupportAlerts() { if (timer) return; void tick(); timer = setInterval(() => void tick(), 20_000); }
export function stopSupportAlerts() { if (timer) clearInterval(timer); timer = null; }
export function refreshSupportAlerts() { void tick(); }
export function useSupportNeeds() { return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state); }
