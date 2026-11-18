/* Where a paid domain stands on its way to an agent's store (Admin → Domains). Pure, so it is tested. */
export interface CfHost { id?: string | null; status?: string | null; ssl?: string | null; problems?: unknown[] }
export type DomainStage = "not_connected" | "waiting_dns" | "waiting_ssl" | "live";

const works = (h?: CfHost | null) => h?.status === "active" && h?.ssl === "active";

export function domainStage(connected: boolean, hosts: { apex?: CfHost | null; www?: CfHost | null } | null | undefined, storeStatus?: string | null): DomainStage {
  if (!connected) return "not_connected";
  if (storeStatus === "active" || works(hosts?.apex) || works(hosts?.www)) return "live";
  if (hosts?.apex?.status === "active" || hosts?.www?.status === "active") return "waiting_ssl";
  return "waiting_dns";
}

export const STAGE_TEXT: Record<DomainStage, string> = {
  not_connected: "Not connected to the store yet",
  waiting_dns: "Waiting for the address to point to us (minutes to a few hours after you add the records)",
  waiting_ssl: "Address found: getting the secure padlock (usually a few minutes)",
  live: "Live: the store opens on this address",
};

/* "Completed" moves the price out of "paid, not yet completed" into profit; nothing else is booked. */
export const canComplete = (status: string) => status === "paid" || status === "registered";
