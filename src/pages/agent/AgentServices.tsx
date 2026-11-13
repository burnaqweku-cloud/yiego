import { useCallback, useEffect, useState } from "react";
import { Info, Lock } from "lucide-react";
import { toast } from "sonner";
import AfaSheet from "@/components/services/AfaSheet";
import BuySheet from "@/components/services/BuySheet";
import { Switch } from "@/components/ui/switch";
import { useAgent } from "@/components/agent/AgentShell";
import { formatGHS } from "@/lib/format";
import { loadAgentServices, servicesSendSms, setAgentService, type AgentServiceProduct, type AgentServices as Data, type ServiceProduct } from "@/lib/services";

/* Services an agent can sell besides data: result checkers and MTN AFA registration. For each one the agent
   sees what they pay us, sets what their store charges, and switches it on or off. The difference is their
   profit on every sale. They can also buy one for themselves at the agent price, from their wallet. */

const STATUS: Record<string, string> = { delivered: "delivered", processing: "in progress", paid_waiting_stock: "pending", refunded: "refunded" };

export default function AgentServices() {
  const { sub, openRenew, storeUrl } = useAgent();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [buying, setBuying] = useState<AgentServiceProduct | null>(null);
  const [sms, setSms] = useState(false);
  useEffect(() => { void servicesSendSms().then(setSms, () => undefined); }, []);

  const load = useCallback(async () => {
    const r = await loadAgentServices();
    if (r.error || !r.data) { setFailed(true); return; }
    setFailed(false); setData(r.data);
    setPrices(Object.fromEntries(r.data.products.map((p) => [p.code, Number(p.price).toFixed(2)])));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async (p: AgentServiceProduct, price: number, enabled: boolean) => {
    const r = await setAgentService(p.code, price, enabled);
    if (r.error) {
      const m = String(r.error.message ?? "");
      toast.error(m.includes("below_agent_price") ? `Can't go below the agent price of ${formatGHS(Number(p.agent_price))}.` : m.includes("price_too_high") ? "That price is too high." : "Couldn't save. Please try again.");
      setPrices((x) => ({ ...x, [p.code]: Number(p.price).toFixed(2) }));
      return;
    }
    toast.success(enabled ? `${p.name} is on sale in your store at ${formatGHS(price)}.` : `${p.name} is not shown in your store.`);
    void load();
  };
  const onBlur = (p: AgentServiceProduct) => {
    const v = Number(prices[p.code]);
    if (!(v > 0) || Math.abs(v - Number(p.price)) < 0.005) { setPrices((x) => ({ ...x, [p.code]: Number(p.price).toFixed(2) })); return; }
    void save(p, v, p.enabled);
  };

  if (sub.state === "lapsed") return (
    <div className="space-y-3">
      <h1 className="font-display text-[22px] font-semibold text-foreground">Services</h1>
      <div className="onyx-panel rounded-3xl p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground"><Lock size={20} /></span>
        <p className="mt-3 text-[16px] font-semibold text-foreground">Selling services is part of your plan</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Your plan has ended, so services are paused in your store. Renew and they're back at once.</p>
        <button type="button" onClick={openRenew} className="onyx-btn-primary mt-4 px-6 py-2.5 text-[13.5px]">Renew plan</button>
      </div>
    </div>
  );

  // Buying for yourself: the same sheets customers use, charged at the agent price from the wallet.
  const asProduct = (p: AgentServiceProduct): ServiceProduct => ({ code: p.code, kind: p.kind, name: p.name, blurb: p.blurb, price: Number(p.agent_price), in_stock: p.in_stock, left: 0 });
  return (
    <div className="space-y-3">
      <h1 className="font-display text-[22px] font-semibold text-foreground">Services</h1>
      <div className="flex items-start gap-2 rounded-2xl bg-primary/8 px-3.5 py-3 text-[12.5px] leading-5 text-muted-foreground"><Info size={15} className="mt-0.5 shrink-0 text-primary-glow" />
        <span>Result checkers and MTN AFA registration are <b className="text-foreground">already on sale in your store</b> at DataYego's price. The <b className="text-foreground">agent price</b> is what you pay, and the difference is your profit on every sale. Change <b className="text-foreground">your price</b> any time, or switch a service off. Customers find them under <b className="text-foreground">Services</b> in your store.</span></div>

      {failed ? <p role="alert" className="text-[13px] text-danger">Couldn't load your services. Pull down to refresh.</p> : !data ? <p className="text-[13px] text-muted-foreground">Loading…</p> : <>
        <div className="onyx-panel rounded-2xl p-2">
          <ul className="divide-y divide-white/[0.06]">
            {data.products.length === 0 && <li className="px-2 py-3 text-[13px] text-muted-foreground">No services are available right now.</li>}
            {data.products.map((p) => { const cur = Number(prices[p.code] ?? p.price); const profit = Math.max(0, cur - Number(p.agent_price)); return (
              <li key={p.code} className="space-y-2.5 px-2 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="text-[14.5px] font-semibold text-foreground">{p.name}</p>
                    <p className="text-[11.5px] text-faint-foreground">agent price {formatGHS(Number(p.agent_price))} · DataYego sells at {formatGHS(Number(p.customer_price))}</p></div>
                  <label className="flex shrink-0 items-center gap-2 text-[12px] text-muted-foreground">{p.enabled ? "On sale" : "Off"}
                    <Switch checked={p.enabled} onCheckedChange={(v) => void save(p, Number(prices[p.code]) > 0 ? Number(prices[p.code]) : Number(p.price), v)} aria-label={`Sell ${p.name} in your store`} /></label>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">Your price
                    <input inputMode="decimal" aria-label={`Your price for ${p.name}`} value={prices[p.code] ?? ""} onChange={(e) => setPrices({ ...prices, [p.code]: e.target.value.replace(/[^\d.]/g, "") })} onBlur={() => onBlur(p)} className="onyx-field w-[84px] px-2 py-1.5 text-center text-[13.5px] font-semibold tabular-nums" /></label>
                  <span className={`text-[13px] font-semibold tabular-nums ${profit > 0 ? "text-primary-glow" : "text-faint-foreground"}`}>profit +{profit.toFixed(2)}</span>
                  <button type="button" onClick={() => setBuying(p)} className="onyx-btn-ghost shrink-0 px-3.5 py-2 text-[12.5px]">Buy for myself</button>
                </div>
              </li>); })}
          </ul>
        </div>
        <p className="text-[11.5px] text-faint-foreground">Your price saves when you tap away from the box. Customers also pay a small checkout fee on top when they pay with mobile money or card; that doesn't touch your profit.{storeUrl ? <> Your store: <b className="text-foreground">{storeUrl.replace(/^https?:\/\//, "")}/services</b></> : null}</p>

        <div className="onyx-panel rounded-2xl p-4">
          <div className="flex items-baseline justify-between gap-3"><h2 className="text-[15px] font-semibold text-foreground">Service sales</h2><span className="text-[12.5px] text-muted-foreground">earned {formatGHS(Number(data.earned))}</span></div>
          {data.sales.length === 0 ? <p className="mt-2 text-[13px] text-muted-foreground">No service sales yet. Share your store link to get the first one.</p> : (
            <ul className="mt-2 divide-y divide-white/[0.06]">
              {data.sales.map((s) => (
                <li key={s.reference} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0"><p className="truncate text-[13.5px] font-semibold text-foreground">{s.quantity > 1 ? `${s.quantity} × ` : ""}{s.name}</p>
                    <p className="text-[11.5px] text-faint-foreground">{s.self ? "bought for yourself" : s.phone} · {new Date(s.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {STATUS[s.status] ?? s.status}</p></div>
                  <div className="shrink-0 text-right"><p className="text-[13px] tabular-nums text-foreground">{formatGHS(Number(s.amount))}</p>
                    {!s.self && <p className={`text-[11.5px] tabular-nums ${s.status === "delivered" ? "text-primary-glow" : "text-faint-foreground"}`}>{s.status === "delivered" ? "+" : "pending +"}{Number(s.margin ?? 0).toFixed(2)}</p>}</div>
                </li>))}
            </ul>)}
          <p className="mt-2 text-[11.5px] text-faint-foreground">Profit is added to your earnings when the order is delivered.</p>
        </div>
      </>}

      <BuySheet product={buying && buying.kind === "checker" ? asProduct(buying) : null} sms={sms} onClose={() => setBuying(null)} onBought={() => void load()} context={{ asAgent: true }} />
      <AfaSheet product={buying && buying.kind === "afa" ? asProduct(buying) : null} sms={sms} onClose={() => setBuying(null)} onBought={() => void load()} context={{ asAgent: true }} />
    </div>
  );
}
