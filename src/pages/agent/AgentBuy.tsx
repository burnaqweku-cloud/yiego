import { useMemo, useState } from "react";
import { Lock, Plus, ShoppingBag, Wallet } from "lucide-react";
import BuyDataFlow, { type AgentStoreContext, type BuyPreselect } from "@/components/flows/BuyDataFlow";
import AddMoneyFlow from "@/components/flows/AddMoneyFlow";
import { useWallet } from "@/store/wallet";
import { NETWORKS } from "@/data/bundles";
import { formatGHS } from "@/lib/format";
import { useAgent } from "@/components/agent/AgentShell";

/* The agent buys for themselves at the agent price — no markup, nothing
   goes to earnings, delivered like any order. Paid from their wallet (the same
   wallet as on the main site; top-up only, never withdrawable) or by Paystack. */
export default function AgentBuy() {
  const { agent, products, sub, openRenew } = useAgent();
  const [open, setOpen] = useState(false); const [preselect, setPreselect] = useState<BuyPreselect | null>(null);
  const [topUp, setTopUp] = useState(false);
  const { balance } = useWallet();
  const [network, setNetwork] = useState<"mtn" | "telecel" | "at">("mtn");
  // Price map at the agent price: the store checkout then charges exactly that.
  const ctx: AgentStoreContext = useMemo(() => ({ slug: agent.slug, name: agent.store_name, prices: Object.fromEntries(products.map((p) => [p.id, Number(p.agent_price ?? p.customer_price)])), self: true }), [agent, products]);
  const n = NETWORKS.find((x) => x.id === network)!;
  const prefix = network === "mtn" ? "mtn" : network === "telecel" ? "tel" : "at";
  const items = products.filter((p) => p.app_product_code?.startsWith(prefix) && !p.is_paused);
  if (sub.state === "lapsed") return (
    <div className="space-y-3">
      <h1 className="font-display text-[22px] font-semibold text-foreground">Buy data</h1>
      <div className="onyx-panel rounded-3xl p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground"><Lock size={20} /></span>
        <p className="mt-3 text-[16px] font-semibold text-foreground">Agent prices are part of your plan</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Your plan has ended, so buying at agent price is paused. Renew and it's back instantly — along with your store.</p>
        <button type="button" onClick={openRenew} className="onyx-btn-primary mt-4 px-6 py-2.5 text-[13.5px]">Renew plan</button>
      </div>
    </div>
  );
  return (
    <div className="space-y-3">
      <h1 className="font-display text-[22px] font-semibold text-foreground">Buy data</h1>
      <p className="text-[12.5px] text-muted-foreground">For yourself, family, anyone — at your <b className="text-foreground">agent price</b>. Pay from your wallet (no fee) or with MoMo or card. No markup, nothing deducted from your earnings.</p>
      <div className="onyx-panel flex items-center gap-3 rounded-2xl p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary-glow"><Wallet size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Wallet balance</p>
          <p className="font-display text-[22px] font-semibold leading-tight text-foreground">{formatGHS(balance)}</p>
          <p className="text-[11.5px] text-faint-foreground">For buying data at agent price. Separate from your earnings and can't be withdrawn.</p>
        </div>
        <button type="button" onClick={() => setTopUp(true)} className="onyx-btn-primary shrink-0 !px-3.5 !py-2 !text-[13px]"><Plus size={14} className="mr-1 inline" />Top up</button>
      </div>
      <div className="flex gap-2">{NETWORKS.map((x) => <button key={x.id} type="button" onClick={() => setNetwork(x.id)} className={`rounded-full px-4 py-1.5 text-[13px] font-medium ${network === x.id ? "bg-primary/15 text-primary-glow" : "border border-white/[0.08] text-muted-foreground"}`}>{x.name}</button>)}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((p) => { const agentPrice = Number(p.agent_price ?? p.customer_price); const pub = Number(p.customer_price); return (
          <button key={p.id} type="button" onClick={() => { setPreselect({ kind: "bundle", networkId: n.id, productCode: p.app_product_code ?? p.id }); setOpen(true); }} className="onyx-panel group rounded-2xl p-3 text-left hover:border-primary/40">
            <p className="text-[18px] font-semibold text-foreground">{p.name.replace(/^.*?—\s*/, "")}</p>
            <p className="text-[11px] text-faint-foreground">{pub > agentPrice ? <>public {formatGHS(pub)} · <span className="text-primary-glow">save {formatGHS(pub - agentPrice)}</span></> : (p.validity ?? "No expiry")}</p>
            <p className="mt-2 flex items-center justify-between"><span className="text-[14px] font-semibold text-foreground">{formatGHS(agentPrice)}</span><span className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary-glow"><ShoppingBag size={11} className="mr-1 inline" />Buy</span></p>
          </button>); })}
      </div>
      <BuyDataFlow open={open} preselect={preselect} onClose={() => setOpen(false)} onAddMoney={() => { setOpen(false); setTopUp(true); }} agent={ctx} />
      <AddMoneyFlow open={topUp} onClose={() => setTopUp(false)} />
    </div>
  );
}
