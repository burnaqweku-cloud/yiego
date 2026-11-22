import { useRef, useState } from "react";
import { ChevronDown, Tag } from "lucide-react";
import { NETWORKS, type NetworkId } from "@/data/bundles";
import type { AgentPriceRow } from "@/lib/agentPriceList";

/* The whole agent price list on the agents' store page (owner, 22 Nov 2026), closed until tapped: "click on it and
   it's now going to drop down all the price list", so the rest of the page is never pushed far away. Open, it wears
   the home page's price board (white board, network tabs with their colour dot): what you pay, what customers pay,
   what you keep. A "Hide prices" button at the foot closes it again without scrolling back up. Read-only. */

const NETWORK_CLASS: Record<NetworkId, string> = { mtn: "net-mtn", telecel: "net-telecel", at: "net-at" };
const money = (n: number) => n.toFixed(2);

export default function AgentPriceBoard({ rows, defaultOpen = false }: { rows: AgentPriceRow[] | null; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [net, setNet] = useState<NetworkId>("mtn");
  const top = useRef<HTMLDivElement>(null);
  const shown = (rows ?? []).filter((r) => r.network === net);
  const name = NETWORKS.find((n) => n.id === net)?.name ?? "";
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => { const el = top.current; if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start", behavior: "smooth" }); });
  };
  return (
    <div ref={top} className={`board agent-board scroll-mt-24 ${NETWORK_CLASS[net]}`}>
      <button type="button" className="agent-board-toggle" aria-expanded={open} aria-controls="agent-board-body" onClick={() => (open ? close() : setOpen(true))}>
        <span className="agent-board-icon" aria-hidden="true"><Tag size={18} /></span>
        <span className="min-w-0 flex-1 text-left">
          <span className="agent-board-title">See all prices you get as an agent</span>
          <span className="agent-board-sub">MTN, Telecel and AirtelTigo · what you pay and what you keep</span>
        </span>
        <span className="agent-board-chev" aria-hidden="true"><ChevronDown size={18} className={open ? "rotate-180" : ""} /></span>
      </button>
      {open && <div id="agent-board-body">
        <div className="board-tabs agent-board-tabs" role="tablist" aria-label="Network">
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
        <div className="board-foot !block">
          <p>You keep the difference when you sell at the customer price. Set your own price and keep more.</p>
          <button type="button" onClick={close} className="mt-2 inline-flex items-center gap-1 font-semibold text-foreground"><ChevronDown size={15} className="rotate-180" />Hide prices</button>
        </div>
      </div>}
    </div>
  );
}
