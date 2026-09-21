import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BadgeCheck, Copy, CreditCard, ExternalLink, Package, Settings, Store, Tags, Wallet } from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { planQuote, type PlanQuote } from "@/lib/agents";
import { formatGHS } from "@/lib/format";
import { loadPhase1Products, type Phase1Product } from "@/lib/phase1-api";
import { useAuth } from "@/store/auth-context";

/* The agent's own dashboard: pay to enter; then earnings, orders, prices,
   share link, payouts and store settings. */
interface Agent { id: string; slug: string; store_name: string; tagline: string | null; status: string; paid_until: string | null; momo_number: string | null; momo_name: string | null; earnings_balance: number }
interface Order { order_reference: string; recipient_phone: string; amount: number; agent_margin: number | null; status: string; paid_at: string | null; created_at: string; data_products: { name: string } | null; networks: { name: string } | null }
interface Payout { id: string; amount: number; fee: number; net: number; status: string; created_at: string; paid_at: string | null; note: string | null }
type Tab = "home" | "orders" | "prices" | "payouts" | "store";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p1 = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");
const fmt = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function AgentDashboard() {
  const { user, isAuthenticated } = useAuth(); const navigate = useNavigate(); const [params] = useSearchParams();
  const [agent, setAgent] = useState<Agent | null | undefined>(undefined);
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [products, setProducts] = useState<Phase1Product[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<{ payout_minimum: number; payout_fee_rate: number; payout_fee_minimum: number } | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [busy, setBusy] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [storeForm, setStoreForm] = useState({ store_name: "", tagline: "", momo_number: "", momo_name: "" });

  const load = useCallback(async () => {
    if (!user) return;
    const [a, pr, q, s] = await Promise.all([p1().from("agents").select("id, slug, store_name, tagline, status, paid_until, momo_number, momo_name, earnings_balance").eq("user_id", user.id).maybeSingle(), loadPhase1Products(), planQuote(), p1().from("site_settings").select("value").eq("key", "agent_plan").maybeSingle()]);
    const g = (a.data as Agent | null) ?? null; setAgent(g); setProducts(pr.data ?? []); setQuote(q); setPlan(s.data?.value ?? null);
    if (g) {
      setStoreForm({ store_name: g.store_name, tagline: g.tagline ?? "", momo_number: g.momo_number ?? "", momo_name: g.momo_name ?? "" });
      const [o, py, ap] = await Promise.all([
        p1().from("orders").select("order_reference, recipient_phone, amount, agent_margin, status, paid_at, created_at, data_products(name), networks(name)").eq("agent_id", g.id).eq("payment_status", "succeeded").order("paid_at", { ascending: false }).limit(200),
        p1().from("agent_payouts").select("*").eq("agent_id", g.id).order("created_at", { ascending: false }),
        p1().from("agent_prices").select("product_id, price").eq("agent_id", g.id),
      ]);
      setOrders(o.data ?? []); setPayouts(py.data ?? []);
      const map: Record<string, string> = {}; for (const r of ap.data ?? []) map[r.product_id] = Number(r.price).toFixed(2); setPrices(map);
    }
  }, [user]);
  useEffect(() => { if (!isAuthenticated) { navigate(`/auth?next=${encodeURIComponent("/agent")}`); return; } sessionStorage.removeItem("yg-agent-browse"); void load(); }, [isAuthenticated, load, navigate]);
  useEffect(() => { if (params.get("paid") === "1") { toast.success("Payment received. Welcome in!"); setTimeout(() => void load(), 2500); } }, [params, load]);

  const storeUrl = agent ? `${window.location.origin}/s/${agent.slug}` : "";
  const today = useMemo(() => orders.filter((o) => o.paid_at && new Date(o.paid_at).toDateString() === new Date().toDateString()), [orders]);
  const earnedTotal = useMemo(() => orders.filter((o) => o.status === "delivered").reduce((a, o) => a + Number(o.agent_margin ?? 0), 0), [orders]);

  const pay = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke<{ error?: string; data?: { authorizationUrl: string } }>("agent-subscribe", { body: {} });
    setBusy(false);
    const err = data?.error ?? error?.message; if (err) return toast.error(err);
    if (data?.data?.authorizationUrl) window.location.href = data.data.authorizationUrl;
  };
  const savePrice = async (productId: string) => {
    const v = Number(prices[productId]); if (!(v > 0)) return;
    const { error } = await p1().rpc("agent_set_price", { p_product_id: productId, p_price: v });
    if (error) { const m = String(error.message); toast.error(m.startsWith("below_agent_price") ? `Can't go below ${formatGHS(Number(m.split(":")[1]))}` : m); return; }
    toast.success("Price saved.");
  };
  const requestPayout = async () => {
    const v = Number(payoutAmount); if (!(v > 0)) return;
    setBusy(true); const { data, error } = await p1().rpc("agent_request_payout", { p_amount: v }); setBusy(false);
    if (error) { const m = String(error.message); toast.error(m.includes("momo_number_missing") ? "Add your MoMo number under Store first." : m.startsWith("below_minimum") ? `Minimum is ${formatGHS(Number(m.split(":")[1]))}` : m.includes("insufficient") ? "Not enough earnings." : m.includes("already_pending") ? "You already have a payout waiting." : m); return; }
    toast.success(`Requested. You'll receive ${formatGHS(Number((data as { net: number }).net))} after the fee.`); setPayoutAmount(""); void load();
  };
  const saveStore = async () => {
    const { error } = await p1().rpc("agent_update_store", { p_store_name: storeForm.store_name, p_tagline: storeForm.tagline, p_momo_number: storeForm.momo_number, p_momo_name: storeForm.momo_name });
    if (error) return toast.error(error.message); toast.success("Saved."); void load();
  };

  if (agent === undefined) return null;
  if (agent === null) return <div className="mk-wrap py-16 text-center"><p className="text-[16px] font-semibold text-foreground">You're not an agent yet</p><p className="mt-1 text-[13px] text-muted-foreground">Apply first — it takes a minute.</p><Link to="/agents" className="mt-4 inline-block text-[13px] text-primary-glow">Apply to be an agent</Link></div>;

  if (agent.status === "awaiting_payment" || agent.status === "paused") return (
    <div className="mk-wrap py-10">
      <Seo path="/agent" title="Your agent plan" description="Pay your monthly agent fee." />
      <div className="onyx-panel mx-auto max-w-md rounded-2xl p-6 text-center">
        <CreditCard size={28} className="mx-auto text-primary-glow" />
        <h1 className="mt-3 text-[20px] font-semibold text-foreground">{agent.status === "paused" ? "Your store is paused" : "One step left"}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{agent.status === "paused" ? `Your month ended on ${agent.paid_until}. Pay to reopen your store — everything is exactly as you left it.` : "You're approved. Pay the monthly fee and your store opens straight away."}</p>
        {quote && <div className="mt-4"><p className="text-[28px] font-semibold text-foreground">{formatGHS(quote.pay_now)}<span className="text-[13px] font-normal text-muted-foreground"> / month</span></p>{quote.promo && <p className="text-[12px] text-primary-glow">{quote.promo.percent_off}% off with {quote.promo.name} · normally {formatGHS(quote.monthly)}</p>}</div>}
        <ul className="mt-4 space-y-2 text-left text-[13px] text-muted-foreground">
          {[["Agent prices on every bundle", "Buy well below what customers pay — e.g. MTN 1GB at 4.00 instead of 4.15, 10GB at 40.00 instead of 43.44."], ["Your own store link", "Set your prices, share the link, and keep the difference on every sale."], ["Nothing to prepay", "No stock, no deposits. Customers pay through the store; your earnings build up and pay out to MoMo."], ["We do the rest", "Delivery, payments and support are handled by DataYego."]].map(([t, d]) => <li key={t} className="flex gap-2"><span className="mt-0.5 text-primary-glow">✓</span><span><b className="text-foreground">{t}.</b> {d}</span></li>)}
        </ul>
        <Button className="mt-4 w-full" onClick={() => void pay()} disabled={busy}>{busy ? "Opening Paystack…" : "Pay with Paystack"}</Button>
        <p className="mt-3 text-[11px] text-faint-foreground">Card or mobile money. Your month starts the moment it's confirmed.</p>
      </div>
    </div>
  );

  return (
    <div className="mk-wrap py-5 sm:py-8">
      <Seo path="/agent" title={`${agent.store_name} · Agent dashboard`} description="Your DataYego agent dashboard." />
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-glow">Agent</p><h1 className="truncate font-display text-[22px] font-semibold text-foreground">{agent.store_name}</h1><p className="text-[12px] text-faint-foreground">Paid until {agent.paid_until}</p></div>
          <div className="flex shrink-0 gap-2">
            <Link to="/" onClick={() => sessionStorage.setItem("yg-agent-browse", "1")} className="rounded-full border border-white/[0.1] px-3 py-2 text-[12.5px] text-muted-foreground">Browse the site</Link>
            <a href={storeUrl} target="_blank" rel="noreferrer" className="onyx-btn-primary px-3 py-2 text-[12.5px]"><ExternalLink size={13} className="mr-1 inline" />My store</a>
          </div>
        </div>
        <div className="mt-4 flex gap-1 overflow-x-auto rounded-full border border-white/[0.08] p-1 text-[12.5px]">
          {([["home", "Home", Wallet], ["orders", "Orders", Package], ["prices", "Prices", Tags], ["payouts", "Payouts", CreditCard], ["store", "Store", Settings]] as [Tab, string, typeof Wallet][]).map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 ${tab === id ? "bg-primary/15 text-primary-glow" : "text-muted-foreground"}`}><Icon size={13} />{label}</button>)}
        </div>

        {tab === "home" && (<div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="onyx-panel rounded-2xl p-4"><p className="text-[11px] text-faint-foreground">Earnings balance</p><p className="mt-0.5 text-[22px] font-semibold text-foreground">{formatGHS(Number(agent.earnings_balance))}</p><p className="text-[11px] text-muted-foreground">withdraw from {formatGHS(plan?.payout_minimum ?? 20)}</p></div>
            <div className="onyx-panel rounded-2xl p-4"><p className="text-[11px] text-faint-foreground">Today</p><p className="mt-0.5 text-[22px] font-semibold text-foreground">{today.length}</p><p className="text-[11px] text-muted-foreground">{formatGHS(today.reduce((a, o) => a + Number(o.amount), 0))} in sales</p></div>
            <div className="onyx-panel rounded-2xl p-4"><p className="text-[11px] text-faint-foreground">Earned so far</p><p className="mt-0.5 text-[22px] font-semibold text-foreground">{formatGHS(earnedTotal)}</p><p className="text-[11px] text-muted-foreground">{orders.length} orders</p></div>
          </div>
          <div className="onyx-panel rounded-2xl p-4">
            <p className="text-[13px] font-semibold text-foreground">Share your store</p>
            <div className="mt-2 flex items-center gap-2"><input readOnly value={storeUrl} className="onyx-field flex-1 text-[12.5px]" /><Button variant="soft" size="sm" onClick={() => { void navigator.clipboard.writeText(storeUrl); toast.success("Link copied."); }}><Copy size={13} /></Button></div>
            <div className="mt-2 flex flex-wrap gap-2"><a className="text-[12.5px] text-primary-glow" href={`https://wa.me/?text=${encodeURIComponent(`Buy MTN, Telecel and AirtelTigo data from my store: ${storeUrl}`)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a><span className="text-faint-foreground">·</span><button type="button" className="text-[12.5px] text-primary-glow" onClick={() => { const list = products.filter((p) => !p.is_paused).map((p) => `${p.name}: GH₵ ${Number(prices[p.id] ?? p.customer_price).toFixed(2)}`).join("\n"); void navigator.clipboard.writeText(`${agent.store_name} — price list\n\n${list}\n\nOrder here: ${storeUrl}`); toast.success("Price list copied. Paste it anywhere."); }}>Copy price list</button></div>
          </div>
        </div>)}

        {tab === "orders" && (<div className="onyx-panel mt-4 rounded-2xl p-3"><ul className="divide-y divide-white/[0.06]">{orders.length === 0 && <li className="py-6 text-center text-[13px] text-muted-foreground">No orders yet. Share your link.</li>}{orders.map((o) => <li key={o.order_reference} className="flex items-center justify-between py-2.5"><div><p className="text-[13px] font-medium text-foreground">{o.networks?.name} {o.data_products?.name?.replace(/^.*?—\s*/, "")} → {o.recipient_phone}</p><p className="text-[11px] text-faint-foreground">{o.order_reference} · {fmt(o.paid_at ?? o.created_at)} · <span className={o.status === "delivered" ? "text-primary-glow" : o.status === "refunded" ? "text-danger" : "text-amber"}>{o.status.replace(/_/g, " ")}</span></p></div><div className="text-right"><p className="text-[13px] font-semibold text-foreground">{formatGHS(Number(o.amount))}</p><p className="text-[11px] text-primary-glow">+{formatGHS(Number(o.agent_margin ?? 0))}</p></div></li>)}</ul></div>)}

        {tab === "prices" && (<div className="mt-4 space-y-3">
          <p className="text-[12.5px] text-muted-foreground">You buy at the agent price. Set what your customers pay — never below it. Leave a bundle blank to sell at the public price.</p>
          <div className="onyx-panel rounded-2xl p-3"><ul className="divide-y divide-white/[0.06]">{products.filter((p) => !p.is_paused).map((p) => { const floor = Number(p.agent_price ?? p.customer_price); const current = Number(prices[p.id] ?? p.customer_price); return <li key={p.id} className="flex items-center gap-2 py-2"><div className="min-w-0 flex-1"><p className="text-[13px] font-medium text-foreground">{p.name}</p><p className="text-[11px] text-faint-foreground">agent price {formatGHS(floor)} · public {formatGHS(Number(p.customer_price))} · you earn <span className="text-primary-glow">{formatGHS(Math.max(0, current - floor))}</span></p></div><input inputMode="decimal" value={prices[p.id] ?? ""} placeholder={Number(p.customer_price).toFixed(2)} onChange={(e) => setPrices({ ...prices, [p.id]: e.target.value })} onBlur={() => void savePrice(p.id)} className="onyx-field w-24 text-right text-[13px]" /></li>; })}</ul></div>
        </div>)}

        {tab === "payouts" && (<div className="mt-4 space-y-3">
          <div className="onyx-panel rounded-2xl p-4">
            <p className="text-[13px] font-semibold text-foreground">Withdraw earnings</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Balance {formatGHS(Number(agent.earnings_balance))} · minimum {formatGHS(plan?.payout_minimum ?? 20)} · fee {((plan?.payout_fee_rate ?? 0.01) * 100).toFixed(0)}% (min {formatGHS(plan?.payout_fee_minimum ?? 0.5)}) · to {agent.momo_number ?? "— add your MoMo under Store"}</p>
            <div className="mt-2 flex gap-2"><input inputMode="decimal" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} placeholder="Amount" className="onyx-field flex-1" /><Button onClick={() => void requestPayout()} disabled={busy || !agent.momo_number}>Request</Button></div>
            {Number(payoutAmount) > 0 && plan && <p className="mt-1.5 text-[11.5px] text-faint-foreground">You'd receive {formatGHS(Number(payoutAmount) - Math.max(Number(payoutAmount) * plan.payout_fee_rate, plan.payout_fee_minimum))}.</p>}
          </div>
          <div className="onyx-panel rounded-2xl p-3"><ul className="divide-y divide-white/[0.06]">{payouts.length === 0 && <li className="py-5 text-center text-[13px] text-muted-foreground">No payouts yet.</li>}{payouts.map((p) => <li key={p.id} className="flex items-center justify-between py-2.5"><div><p className="text-[13px] text-foreground">{formatGHS(Number(p.amount))} <span className="text-faint-foreground">− fee {formatGHS(Number(p.fee))}</span></p><p className="text-[11px] text-faint-foreground">{fmt(p.created_at)}{p.note ? ` · ${p.note}` : ""}</p></div><span className={`text-[12px] font-semibold ${p.status === "paid" ? "text-primary-glow" : p.status === "rejected" ? "text-danger" : "text-amber"}`}>{p.status === "paid" ? `paid ${formatGHS(Number(p.net))}` : p.status}</span></li>)}</ul></div>
        </div>)}

        {tab === "store" && (<div className="onyx-panel mt-4 space-y-3 rounded-2xl p-4">
          <label className="block"><span className="mb-1 block text-[12px] text-muted-foreground">Store name</span><input value={storeForm.store_name} onChange={(e) => setStoreForm({ ...storeForm, store_name: e.target.value })} className="onyx-field w-full" /></label>
          <label className="block"><span className="mb-1 block text-[12px] text-muted-foreground">Tagline</span><input value={storeForm.tagline} onChange={(e) => setStoreForm({ ...storeForm, tagline: e.target.value })} placeholder="Fast data, fair prices" className="onyx-field w-full" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-[12px] text-muted-foreground">MoMo number (for payouts)</span><input inputMode="tel" value={storeForm.momo_number} onChange={(e) => setStoreForm({ ...storeForm, momo_number: e.target.value })} className="onyx-field w-full" /></label>
            <label className="block"><span className="mb-1 block text-[12px] text-muted-foreground">MoMo name</span><input value={storeForm.momo_name} onChange={(e) => setStoreForm({ ...storeForm, momo_name: e.target.value })} className="onyx-field w-full" /></label>
          </div>
          <p className="text-[11.5px] text-faint-foreground">Your store link is <b>/s/{agent.slug}</b>. <BadgeCheck size={12} className="inline text-primary-glow" /> Paid until {agent.paid_until}.</p>
          <div className="flex justify-end"><Button onClick={() => void saveStore()}>Save</Button></div>
        </div>)}
      </div>
    </div>
  );
}
