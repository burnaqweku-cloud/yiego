import { useState } from "react";
import { NETWORKS, type NetworkId } from "@/data/bundles";
import type { AgentPriceRow } from "@/lib/agentPriceList";

/* The whole agent price list on the agents' store page (owner, 22 Nov 2026). It wears the home page's price board
   (white board, network tabs with their colour dot) so it reads as the same prices, seen from the agent's side:
   what you pay, what customers pay, what you keep. Read-only: nothing here is bought. */

const NETWORK_CLASS: Record<NetworkId, string> = { mtn: "net-mtn", telecel: "net-telecel", at: "net-at" };
const money = (n: number) => n.toFixed(2);

export default function AgentPriceBoard({ rows }: { rows: AgentPriceRow[] | null }) {
  const [net, setNet] = useState<NetworkId>("mtn");
  const shown = (rows ?? []).filter((r) => r.network === net);
  const name = NETWORKS.find((n) => n.id === net)?.name ?? "";
  return (
    <div className={`board agent-board ${NETWORK_CLASS[net]}`}>
      <div className="board-tabs" role="tablist" aria-label="Network">
        {NETWORKS.map((n) => (
          <button key={n.id} type="button" role="tab" id={`agent-tab-${n.id}`} aria-selected={n.id === net} aria-controls="agent-board-panel"
            className={`board-tab ${NETWORK_CLASS[n.id]}`} onClick={() => setNet(n.id)}>
            <span className="dot" aria-hidden="true" />{n.name}
          </button>
        ))}
      </div>
      <div id="agent-board-panel" role="tabpanel" aria-labelledby={`agent-tab-${net}`}>
        <div className="agent-board-head" aria-hidden="true"><span>Bundle</span><span>You pay</span><span>You keep</span></div>
        {rows === null ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">Loading today's prices…</p>
          : shown.length === 0 ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">No {name} agent prices right now.</p>
          : <ul>
            {shown.map((r) => (
              <li key={`${r.network}${r.gb}${r.agent}`} className="agent-board-row" aria-label={`${name} ${r.size}: you pay GH₵${money(r.agent)}, customers pay GH₵${money(r.pub)}, you keep GH₵${money(r.keep)}`}>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-1.5"><span className="board-size">{r.size}</span>{r.paused && <span className="agent-paused">Paused now</span>}</span>
                  <span className="board-meta agent-board-meta block">Customers pay {money(r.pub)}</span>
                </span>
                <span className="board-price"><small>GH₵</small>{money(r.agent)}</span>
                <span className="agent-keep">+{money(r.keep)}</span>
              </li>
            ))}
          </ul>}
      </div>
      <p className="board-foot !block">You keep the difference when you sell at the customer price. Set your own price and keep more.</p>
    </div>
  );
}
