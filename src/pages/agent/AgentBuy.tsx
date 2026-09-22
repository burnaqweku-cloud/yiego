import { useMemo, useState } from "react";
import { ShoppingBag } from "lucide-react";
import BuyDataFlow, { type AgentStoreContext, type BuyPreselect } from "@/components/flows/BuyDataFlow";
import { NETWORKS } from "@/data/bundles";
import { formatGHS } from "@/lib/format";
import { useAgent } from "@/components/agent/AgentShell";

/* The agent buys for themselves at the agent price — no markup, nothing
   goes to earnings, delivered like any order. */
export default function AgentBuy() {
  const { agent, products } = useAgent();
  const [open, setOpen] = useState(false); const [preselect, setPreselect] = useState<BuyPreselect | null>(null);
  const [network, setNetwork] = useState<"mtn" | "telecel" | "at">("mtn");
  // Price map at the agent price: the store checkout then charges exactly that.
  const ctx: AgentStoreContext = useMemo(() => ({ slug: agent.slug, name: agent.store_name, prices: Object.fromEntries(products.map((p) => [p.id, Number(p.agent_price ?? p.customer_price)])), self: true }), [agent, products]);
  const n = NETWORKS.find((x) => x.id === network)!;
  const prefix = network === "mtn" ? "mtn" : network === "telecel" ? "tel" : "at";
  const items = products.filter((p) => p.app_product_code?.startsWith(prefix) && !p.is_paused);
  return (
    <div className="space-y-3">
      <h1 className="font-display text-[22px] font-semibold text-foreground">Buy data</h1>
      <p className="text-[12.5px] text-muted-foreground">For yourself, family, anyone — at your <b className="text-foreground">agent price</b>. Pay with MoMo or card; no markup, nothing deducted.</p>
      <div className="flex gap-2">{NETWORKS.map((x) => <button key={x.id} type="button" onClick={() => setNetwork(x.id)} className={`rounded-full px-4 py-1.5 text-[13px] font-medium ${network === x.id ? "bg-primary/15 text-primary-glow" : "border border-white/[0.08] text-muted-foreground"}`}>{x.name}</button>)}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((p) => { const agentPrice = Number(p.agent_price ?? p.customer_price); const pub = Number(p.customer_price); return (
          <button key={p.id} type="button" onClick={() => { setPreselect({ kind: "bundle", networkId: n.id, productCode: p.app_product_code ?? p.id }); setOpen(true); }} className="onyx-panel group rounded-2xl p-3 text-left hover:border-primary/40">
            <p className="text-[18px] font-semibold text-foreground">{p.name.replace(/^.*?—\s*/, "")}</p>
            <p className="text-[11px] text-faint-foreground">{pub > agentPrice ? <>public {formatGHS(pub)} · <span className="text-primary-glow">save {formatGHS(pub - agentPrice)}</span></> : (p.validity ?? "No expiry")}</p>
            <p className="mt-2 flex items-center justify-between"><span className="text-[14px] font-semibold text-foreground">{formatGHS(agentPrice)}</span><span className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary-glow"><ShoppingBag size={11} className="mr-1 inline" />Buy</span></p>
          </button>); })}
      </div>
      <BuyDataFlow open={open} preselect={preselect} onClose={() => setOpen(false)} onAddMoney={() => undefined} agent={ctx} />
    </div>
  );
}
