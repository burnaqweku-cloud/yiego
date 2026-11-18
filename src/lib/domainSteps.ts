/* Where a paid domain stands on its way to an agent's store (Admin → Domains). Pure, so it is tested.
   Live means the main address (mbundle.shop) works: that is the one customers type. www alone is not enough. */
export interface CfHost { id?: string | null; status?: string | null; ssl?: string | null; problems?: unknown[] }
export type DomainStage = "not_connected" | "waiting_dns" | "waiting_ssl" | "www_only" | "live";

const works = (h?: CfHost | null) => h?.status === "active" && h?.ssl === "active";

export function domainStage(connected: boolean, hosts: { apex?: CfHost | null; www?: CfHost | null } | null | undefined, storeStatus?: string | null): DomainStage {
  if (!connected) return "not_connected";
  if (storeStatus === "active" || works(hosts?.apex)) return "live";
  if (works(hosts?.www)) return "www_only";
  if (hosts?.apex?.status === "active" || hosts?.www?.status === "active") return "waiting_ssl";
  return "waiting_dns";
}

export const STAGE_TEXT: Record<DomainStage, string> = {
  not_connected: "Not connected to the store yet",
  waiting_dns: "Waiting for the address to point to us (minutes to a few hours after you add the records)",
  waiting_ssl: "Address found: getting the secure padlock (usually a few minutes)",
  www_only: "www works, but the main address doesn't yet. Check the @ record at the registrar (use its ALIAS or CNAME flattening option if it won't take CNAME on @)",
  live: "Live: the store opens on this address",
};

/* "Completed" moves the price out of "paid, not yet completed" into profit; nothing else is booked. */
export const canComplete = (status: string) => status === "paid" || status === "registered";
