import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { formatGHS } from "@/lib/format";
import { p1, useAgent } from "@/components/agent/AgentShell";
import ComingSoon from "@/components/agent/ComingSoon";

/* Prices for your agents — what the people selling under this agent pay per bundle. Like DataYego's own public
   price vs agent price: the parent's storefront price is for customers, this list is for their agents. A bundle
   with nothing set here falls back to the storefront price. */
interface Rowp { product_id: string; name: string; capacity_gb: number; network: string; our_agent_price: number; public_price: number; store_price: number; agent_price: number | null }
const short = (n: string) => n.replace(/^.*?—\s*/, "");

export default function AgentNetworkPrices() {
  const { networkOpen, reload } = useAgent();
  const [rows, setRows] = useState<Rowp[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [network, setNetwork] = useState<"MTN" | "Telecel" | "AirtelTigo">("MTN");
  const [busy, setBusy] = useState(false);
  const load = async () => { const { data } = await p1().rpc("my_network_prices", {}); const list = (data as Rowp[]) ?? []; setRows(list); setDraft(Object.fromEntries(list.map((r) => [r.product_id, r.agent_price != null ? Number(r.agent_price).toFixed(2) : ""]))); };
  useEffect(() => { void load(); }, []);
  const items = rows.filter((r) => r.network === network);

  const save = async (r: Rowp, value: number) => {
    const { error } = await p1().rpc("agent_set_network_price", { p_product_id: r.product_id, p_price: value });
    if (error) { const m = String(error.message); toast.error(m.startsWith("below_agent_price") ? `Can't go below your own cost of ${formatGHS(Number(m.split(":")[1]))}.` : m.replace(/_/g, " ")); return false; }
    return true;
  };
  const onBlur = async (r: Rowp) => {
    const raw = draft[r.product_id]; if (raw === undefined || raw === "") return;
    const v = Number(raw); if (!(v > 0)) return;
    if (v === Number(r.agent_price ?? -1)) return;
    if (await save(r, v)) { toast.success(`${short(r.name)}: your agents now pay ${formatGHS(v)} · you keep ${formatGHS(v - Number(r.our_agent_price))}`); void load(); void reload(); }
    else setDraft({ ...draft, [r.product_id]: r.agent_price != null ? Number(r.agent_price).toFixed(2) : "" });
  };
  const applyAll = async (mode: "plus" | "between") => {
    setBusy(true); let n = 0;
    for (const r of items) {
      const cost = Number(r.our_agent_price); const store = Number(r.store_price);
      const v = mode === "plus" ? Math.round((cost + (Number(r.capacity_gb) >= 10 ? 1 : 0.5)) * 100) / 100 : Math.max(cost, Math.round(((cost + store) / 2) * 100) / 100);
      if (await save(r, v)) n += 1;
    }
    setBusy(false); toast.success(`${n} ${network} agent prices set.`); void load(); void reload();
  };

  if (!networkOpen) return <ComingSoon title="Coming soon" blurb="Once you can recruit agents, you'll set the prices they pay here — separate from what your customers pay." />;
  return (
    <div className="space-y-3">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Your agents</p><h1 className="font-display text-[22px] font-semibold text-foreground">Prices for your agents</h1></div>
      <div className="flex items-start gap-2 rounded-2xl bg-primary/8 px-3.5 py-3 text-[12.5px] leading-5 text-muted-foreground"><Info size={15} className="mt-0.5 shrink-0 text-primary-glow" /><span>Your <b className="text-foreground">store price</b> is what customers pay on your storefront. The <b className="text-foreground">agent price</b> is what the agents selling under you pay — usually lower, so they have room to make a profit. You keep the difference between the agent price and your own cost. Leave a box empty and that bundle costs your agents the store price.</span></div>
      <div className="flex gap-2">{(["MTN", "Telecel", "AirtelTigo"] as const).map((n) => <button key={n} type="button" onClick={() => setNetwork(n)} className={`rounded-full px-4 py-1.5 text-[13px] font-medium ${network === n ? "bg-primary/15 text-primary-glow" : "border border-white/[0.08] text-muted-foreground"}`}>{n}</button>)}</div>
      <div className="flex flex-wrap gap-2 text-[12px]"><button type="button" disabled={busy} onClick={() => void applyAll("plus")} className="rounded-full border border-white/[0.1] px-3 py-1.5 text-muted-foreground">Set all: my cost + 0.50 (1.00 from 10GB)</button><button type="button" disabled={busy} onClick={() => void applyAll("between")} className="rounded-full border border-white/[0.1] px-3 py-1.5 text-muted-foreground">Set all: halfway between my cost and store price</button></div>
      <div className="onyx-panel rounded-2xl p-2">
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint-foreground"><span>Bundle</span><span className="text-right">My cost</span><span className="text-center">Agent price</span><span className="text-right">I keep</span></div>
        <ul className="divide-y divide-white/[0.06]">
          {items.map((r) => { const cost = Number(r.our_agent_price); const store = Number(r.store_price); const cur = draft[r.product_id] ? Number(draft[r.product_id]) : store; const keep = Math.max(0, cur - cost); const aboveStore = cur > store; return (
            <li key={r.product_id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 px-2 py-2.5">
              <div><p className="text-[14px] font-semibold text-foreground">{short(r.name)}</p><p className="text-[10.5px] text-faint-foreground">store price {formatGHS(store)}{r.agent_price == null ? " · not set, agents pay store price" : aboveStore ? " · above your store price" : ""}</p></div>
              <p className="text-right text-[13px] tabular-nums text-muted-foreground">{cost.toFixed(2)}</p>
              <input inputMode="decimal" aria-label={`Agent price for ${r.name}`} value={draft[r.product_id] ?? ""} placeholder={store.toFixed(2)} onChange={(e) => setDraft({ ...draft, [r.product_id]: e.target.value })} onBlur={() => void onBlur(r)} className={`onyx-field w-[76px] px-2 py-1.5 text-center text-[13.5px] font-semibold tabular-nums ${aboveStore ? "border-amber/50" : ""}`} />
              <p className={`text-right text-[13px] font-semibold tabular-nums ${keep > 0 ? "text-primary-glow" : "text-faint-foreground"}`}>+{keep.toFixed(2)}</p>
            </li>); })}
        </ul>
      </div>
      <p className="text-[11.5px] text-faint-foreground">Prices save when you tap away from the box. If you raise an agent price, any agent selling below it is moved up to it automatically. Your agents also earn their own markup on top.</p>
    </div>
  );
}
