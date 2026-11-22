import type { NetworkId } from "@/data/bundles";
import type { Phase1NetworkRow, Phase1Product } from "@/lib/phase1-api";

/* The full agent price list for people deciding to pay for a store (owner, 22 Nov 2026: approved applicants who
   have not paid should see every price they get, not four). Built from the live catalogue: what the agent pays,
   what the public pays, and the difference, which is what the agent keeps selling at the public price. */

export interface AgentPriceRow { network: NetworkId; gb: number; size: string; agent: number; pub: number; keep: number; paused: boolean }

const NET: Record<string, NetworkId> = { mtn: "mtn", telecel: "telecel", airteltigo: "at", at: "at" };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** "1GB", "1.5GB", "500MB". */
export function sizeLabel(gb: number) {
  if (gb > 0 && gb < 1) return `${Math.round(gb * 1000)}MB`;
  return `${Number.isInteger(gb) ? gb : Number(gb.toFixed(2))}GB`;
}

/** Every bundle with a real agent price below the public price, smallest first within each network. */
export function agentPriceRows(products: Phase1Product[], networks: Phase1NetworkRow[]): AgentPriceRow[] {
  const code = new Map(networks.map((n) => [n.id, NET[n.code]]));
  return products
    .map((p) => ({ p, network: code.get(p.network_id ?? ""), gb: Number(p.capacity_gb ?? 0), agent: Number(p.agent_price ?? 0), pub: Number(p.customer_price ?? 0) }))
    .filter((x): x is typeof x & { network: NetworkId } => Boolean(x.network) && x.gb > 0 && x.agent > 0 && x.agent < x.pub)
    .map(({ p, network, gb, agent, pub }) => ({ network, gb, size: sizeLabel(gb), agent: r2(agent), pub: r2(pub), keep: r2(pub - agent), paused: Boolean(p.is_paused) }))
    .sort((a, b) => a.network.localeCompare(b.network) || a.gb - b.gb || a.agent - b.agent);
}
