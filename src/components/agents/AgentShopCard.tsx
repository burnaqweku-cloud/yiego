import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Store } from "lucide-react";
import { agentsStatus, myAgentStatus, previewRequested } from "@/lib/agents";

/* Compact card under the wallet on the shop: the agent offer for customers,
   the dashboard shortcut for agents, or "pay to open" for approved-unpaid. */
export default function AgentShopCard() {
  const [state, setState] = useState<"hidden" | "offer" | "active" | "unpaid">("hidden");
  useEffect(() => { void agentsStatus().then(async ({ launched }) => { if (!(launched || previewRequested())) return; const me = await myAgentStatus(); setState(me?.is_agent ? (me.agent_status === "active" ? "active" : "unpaid") : "offer"); }); }, []);
  if (state === "hidden") return null;
  const copy = state === "active" ? { k: "Your store", t: "Open your agent dashboard", d: "Today's sales, earnings, prices and your share link.", cta: "Dashboard", to: "/agent" }
    : state === "unpaid" ? { k: "Agent", t: "Your store is ready to open", d: "Pay 3.00 for the month and start buying at agent prices.", cta: "Pay now", to: "/agent" }
    : { k: "Become an agent", t: "Start your own data business", d: "Buy data cheaper, get a free store, set your prices, withdraw profit to MoMo. No deposit. Only 3.00 a month.", cta: "Apply", to: "/agents" };
  return (
    <Link to={copy.to} className="group flex items-center gap-3 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/12 to-transparent px-4 py-3.5 transition-colors hover:border-primary/40">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary-glow"><Store size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary-glow">{copy.k}</span>
        <span className="block text-[14.5px] font-semibold text-foreground">{copy.t}</span>
        <span className="block text-[12px] leading-4 text-muted-foreground">{copy.d}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-primary-glow">{copy.cta}<ArrowRight size={14} className="mk-arrow" /></span>
    </Link>
  );
}
