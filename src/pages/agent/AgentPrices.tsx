import { useState } from "react";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { formatGHS } from "@/lib/format";
import { p1, useAgent } from "@/components/agent/AgentShell";

/* Set selling prices, one network at a time. Every row says what the agent
   pays, what they're charging, and what they keep. */
export default function AgentPrices() {
  const { products, prices, setPrices, reload } = useAgent();
  const [network, setNetwork] = useState<"MTN" | "Telecel" | "AirtelTigo">("MTN");
  const [busy, setBusy] = useState(false);
  const items = products.filter((p) => !p.is_paused && p.name.startsWith(network));
  const floorOf = (p: typeof items[number]) => Number(p.agent_price ?? p.customer_price);
  const defaultOf = (p: typeof items[number]) => Number(p.store_default_price ?? p.customer_price);
  const currentOf = (p: typeof items[number]) => Number(prices[p.id] || defaultOf(p));

  const save = async (productId: string, value: number) => {
    const { error } = await p1().rpc("agent_set_price", { p_product_id: productId, p_price: value });
    if (error) { const m = String(error.message); toast.error(m.startsWith("below_agent_price") ? `Can't go below the agent price of ${formatGHS(Number(m.split(":")[1]))}.` : m); return false; }
    return true;
  };
  const onBlur = async (p: typeof items[number]) => {
    const raw = prices[p.id]; if (raw === undefined || raw === "") return;
    const v = Number(raw); if (!(v > 0)) return;
    if (await save(p.id, v)) toast.success(`${p.name.replace(/^.*?—\s*/, "")} saved · profit ${formatGHS(v - floorOf(p))}`);
    else setPrices({ ...prices, [p.id]: floorOf(p).toFixed(2) });
  };
  const applyAll = async (mode: "public" | "plus") => {
    setBusy(true); const next = { ...prices }; let n = 0;
    for (const p of items) { const v = mode === "public" ? defaultOf(p) : Math.round((floorOf(p) + (Number(p.capacity_gb) >= 10 ? 1 : 0.5)) * 100) / 100; if (await save(p.id, v)) { next[p.id] = v.toFixed(2); n += 1; } }
    setPrices(next); setBusy(false); toast.success(`${n} ${network} prices updated.`); void reload();
  };

  return (
    <div className="space-y-3">
      <h1 className="font-display text-[22px] font-semibold text-foreground">Your selling prices</h1>
      <div className="flex gap-2">{(["MTN", "Telecel", "AirtelTigo"] as const).map((n) => <button key={n} type="button" onClick={() => setNetwork(n)} className={`rounded-full px-4 py-1.5 text-[13px] font-medium ${network === n ? "bg-primary/15 text-primary-glow" : "border border-white/[0.08] text-muted-foreground"}`}>{n}</button>)}</div>
      <div className="flex items-start gap-2 rounded-2xl bg-primary/8 px-3.5 py-3 text-[12.5px] leading-5 text-muted-foreground"><Info size={15} className="mt-0.5 shrink-0 text-primary-glow" /><span>The <b className="text-foreground">agent price</b> is your special price. Your store starts at the <b className="text-foreground">default</b> price; type your own under <b className="text-foreground">Your price</b>. The difference from the agent price is your profit on every sale. Your price can't be lower than the agent price.</span></div>
      <div className="flex flex-wrap gap-2 text-[12px]"><button type="button" disabled={busy} onClick={() => void applyAll("plus")} className="rounded-full border border-white/[0.1] px-3 py-1.5 text-muted-foreground">Set all: agent price + 0.50 (1.00 from 10GB)</button><button type="button" disabled={busy} onClick={() => void applyAll("public")} className="rounded-full border border-white/[0.1] px-3 py-1.5 text-muted-foreground">Reset all to default</button></div>
      <div className="onyx-panel rounded-2xl p-2">
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint-foreground"><span>Bundle</span><span className="text-right">Agent price</span><span className="text-center">Your price</span><span className="text-right">Profit</span></div>
        <ul className="divide-y divide-white/[0.06]">
          {items.map((p) => { const floor = floorOf(p); const cur = currentOf(p); const profit = Math.max(0, cur - floor); return (
            <li key={p.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 px-2 py-2.5">
              <div><p className="text-[14px] font-semibold text-foreground">{p.name.replace(/^.*?—\s*/, "")}</p><p className="text-[10.5px] text-faint-foreground">default {formatGHS(defaultOf(p))} · DataYego {formatGHS(Number(p.customer_price))}</p></div>
              <p className="text-right text-[13px] tabular-nums text-muted-foreground">{floor.toFixed(2)}</p>
              <input inputMode="decimal" aria-label={`Your price for ${p.name}`} value={prices[p.id] ?? ""} placeholder={defaultOf(p).toFixed(2)} onChange={(e) => setPrices({ ...prices, [p.id]: e.target.value })} onBlur={() => void onBlur(p)} className="onyx-field w-[76px] px-2 py-1.5 text-center text-[13.5px] font-semibold tabular-nums" />
              <p className={`text-right text-[13px] font-semibold tabular-nums ${profit > 0 ? "text-primary-glow" : "text-faint-foreground"}`}>+{profit.toFixed(2)}</p>
            </li>); })}
        </ul>
      </div>
      <p className="text-[11.5px] text-faint-foreground">Prices save when you tap away from the box. Your customers also pay a small checkout fee to Paystack on top; that doesn't affect your profit.</p>
    </div>
  );
}
