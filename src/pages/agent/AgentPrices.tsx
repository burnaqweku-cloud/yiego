import { toast } from "sonner";
import { formatGHS } from "@/lib/format";
import { p1, useAgent } from "@/components/agent/AgentShell";

export default function AgentPrices() {
  const { products, prices, setPrices } = useAgent();
  const save = async (productId: string) => {
    const v = Number(prices[productId]); if (!(v > 0)) return;
    const { error } = await p1().rpc("agent_set_price", { p_product_id: productId, p_price: v });
    if (error) { const m = String(error.message); toast.error(m.startsWith("below_agent_price") ? `Can't go below ${formatGHS(Number(m.split(":")[1]))}` : m); return; }
    toast.success("Price saved.");
  };
  const groups = ["MTN", "Telecel", "AirtelTigo"].map((n) => ({ n, items: products.filter((p) => !p.is_paused && p.name.startsWith(n)) }));
  return (
    <div className="space-y-3">
      <h1 className="font-display text-[22px] font-semibold text-foreground">Prices</h1>
      <p className="text-[12.5px] text-muted-foreground">You buy at the agent price. Set what your customers pay — never below it. Leave blank to sell at the public price. Saves when you tap away.</p>
      {groups.map(({ n, items }) => items.length > 0 && (
        <div key={n} className="onyx-panel rounded-2xl p-3">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{n}</p>
          <ul className="mt-1 divide-y divide-white/[0.06]">{items.map((p) => { const floor = Number(p.agent_price ?? p.customer_price); const current = Number(prices[p.id] ?? p.customer_price); return <li key={p.id} className="flex items-center gap-2 py-2"><div className="min-w-0 flex-1"><p className="text-[13.5px] font-medium text-foreground">{p.name.replace(/^.*?—\s*/, "")}</p><p className="text-[11px] text-faint-foreground">you pay {formatGHS(floor)} · public {formatGHS(Number(p.customer_price))} · <span className="text-primary-glow">profit {formatGHS(Math.max(0, current - floor))}</span></p></div><input inputMode="decimal" value={prices[p.id] ?? ""} placeholder={Number(p.customer_price).toFixed(2)} onChange={(e) => setPrices({ ...prices, [p.id]: e.target.value })} onBlur={() => void save(p.id)} className="onyx-field w-24 text-right text-[13px]" /></li>; })}</ul>
        </div>))}
    </div>
  );
}
