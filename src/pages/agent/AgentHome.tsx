import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CalendarCheck, Copy, Lock, Share2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { formatGHS } from "@/lib/format";
import { fmt, useAgent } from "@/components/agent/AgentShell";
import { stageOf, toneClass } from "@/components/agent/orderStage";
import { longDate } from "@/components/agent/subscription";

export default function AgentHome() {
  const { agent, orders, products, prices, storeUrl, plan, reload, sub, openRenew } = useAgent();
  const [params] = useSearchParams();
  useEffect(() => { if (params.get("paid") === "1") { toast.success("Payment received. You're all set!"); setTimeout(() => void reload(), 2500); } }, [params, reload]);
  const today = useMemo(() => orders.filter((o) => o.paid_at && new Date(o.paid_at).toDateString() === new Date().toDateString()), [orders]);
  const week = useMemo(() => orders.filter((o) => o.paid_at && Date.now() - +new Date(o.paid_at) < 7 * 86400000), [orders]);
  const earned = (list: typeof orders) => list.filter((o) => o.status === "delivered").reduce((a, o) => a + Number(o.agent_margin ?? 0), 0);
  const pendingOrders = useMemo(() => orders.filter((o) => !["delivered", "refunded", "cancelled"].includes(o.status)), [orders]);
  const pending = pendingOrders.reduce((a, o) => a + Number(o.agent_margin ?? 0), 0);
  const priceList = () => { const list = products.filter((p) => !p.is_paused).map((p) => `${p.name}: GH₵ ${Number(prices[p.id] ?? p.store_default_price ?? p.customer_price).toFixed(2)}`).join("\n"); return `${agent.store_name} — price list\n\n${list}\n\nOrder here: ${storeUrl}`; };
  const share = async () => { const text = `Buy MTN, Telecel and AirtelTigo data from my store: ${storeUrl}`; if (navigator.share) { try { await navigator.share({ title: agent.store_name, text, url: storeUrl }); return; } catch { /* cancelled */ } } await navigator.clipboard.writeText(text); toast.success("Link copied."); };

  return (
    <div className="space-y-4">
      <div><p className="text-[12px] text-muted-foreground">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p><h1 className="font-display text-[24px] font-semibold text-foreground">Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}</h1></div>
      <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Earnings balance</p>
        <p className="mt-1 text-[34px] font-semibold leading-none text-foreground">{formatGHS(Number(agent.earnings_balance))}</p>
        <p className="mt-1.5 text-[11.5px] text-muted-foreground">Available now · withdraw from {formatGHS(plan?.payout_minimum ?? 20)} to MoMo</p>
        {pending > 0 && <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber/12 px-2.5 py-1 text-[11.5px] text-amber"><span className="h-1.5 w-1.5 rounded-full bg-amber" />{formatGHS(pending)} pending on {pendingOrders.length} order{pendingOrders.length === 1 ? "" : "s"} · released when delivered</p>}
        <div className="mt-4 flex gap-2"><Link to="/agent/earnings" className="onyx-btn-primary px-5 py-2.5 text-center text-[13px]">Withdraw</Link><button type="button" onClick={() => void share()} className="flex items-center gap-1.5 rounded-full border border-white/[0.14] px-4 py-2.5 text-[13px] text-foreground"><Share2 size={14} />Share store</button></div>
      </div>
      {sub.state === "lapsed"
        ? <Link to="/agent/buy" className="onyx-panel flex items-center gap-3 rounded-2xl p-4 opacity-80"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground"><Lock size={18} /></span><span className="min-w-0 flex-1"><span className="block text-[14.5px] font-semibold text-foreground">Agent prices locked</span><span className="block text-[12px] text-muted-foreground">Renew your plan to buy at agent price again.</span></span><ArrowRight size={16} className="text-muted-foreground" /></Link>
        : <Link to="/agent/buy" className="onyx-panel flex items-center gap-3 rounded-2xl p-4 hover:border-primary/40"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary-glow"><ShoppingBag size={20} /></span><span className="min-w-0 flex-1"><span className="block text-[14.5px] font-semibold text-foreground">Buy data at your agent price</span><span className="block text-[12px] text-muted-foreground">For yourself or anyone. Pay with MoMo or card.</span></span><ArrowRight size={16} className="text-primary-glow" /></Link>}
      <button type="button" onClick={openRenew} className="onyx-panel flex w-full items-center gap-3 rounded-2xl p-4 text-left hover:border-primary/40">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${sub.state === "active" ? "bg-primary/15 text-primary-glow" : "bg-amber/15 text-amber"}`}><CalendarCheck size={19} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold text-foreground">{sub.state === "active" ? `Plan active · ${sub.daysLeft} day${sub.daysLeft === 1 ? "" : "s"} left` : sub.state === "grace" ? "Plan ended · renew today" : "Plan ended"}</span>
          <span className="block text-[12px] text-muted-foreground">{sub.state === "active" ? `Paid until ${longDate(sub.paidUntil)}. Extend any time — 3 and 12-month plans cost less per month.` : "Tap to renew. Everything reopens the moment you pay."}</span>
        </span>
        <span className="text-[12.5px] font-semibold text-primary-glow">{sub.state === "active" ? "Extend" : "Renew"}</span>
      </button>
      <div className="grid grid-cols-3 gap-2">
        {[["Today", today.length, earned(today)], ["7 days", week.length, earned(week)], ["All time", orders.length, earned(orders)]].map(([l, n, e]) => <div key={String(l)} className="onyx-panel rounded-2xl p-3"><p className="text-[11px] text-faint-foreground">{String(l)}</p><p className="text-[20px] font-semibold text-foreground">{String(n)}</p><p className="text-[11px] text-primary-glow">+{formatGHS(Number(e))}</p></div>)}
      </div>
      <div className="onyx-panel rounded-2xl p-4">
        <p className="text-[13px] font-semibold text-foreground">Your store link</p>
        <div className="mt-2 flex items-center gap-2"><input readOnly value={storeUrl} className="onyx-field flex-1 text-[12.5px]" /><button type="button" onClick={() => { void navigator.clipboard.writeText(storeUrl); toast.success("Link copied."); }} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.1] text-muted-foreground"><Copy size={15} /></button></div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]"><a className="text-primary-glow" href={`https://wa.me/?text=${encodeURIComponent(`Buy MTN, Telecel and AirtelTigo data from my store: ${storeUrl}`)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a><button type="button" className="text-primary-glow" onClick={() => { void navigator.clipboard.writeText(priceList()); toast.success("Price list copied. Paste it anywhere."); }}>Copy price list</button></div>
      </div>
      <div className="onyx-panel rounded-2xl p-3">
        <div className="flex items-center justify-between px-1"><p className="text-[13px] font-semibold text-foreground">Latest orders</p><Link to="/agent/orders" className="text-[12px] text-primary-glow">All orders</Link></div>
        <ul className="mt-1 divide-y divide-white/[0.06]">{orders.length === 0 && <li className="py-6 text-center text-[13px] text-muted-foreground">No orders yet. Share your link.</li>}{orders.slice(0, 5).map((o) => <li key={o.order_reference} className="flex items-center justify-between py-2"><div><p className="text-[13px] font-medium text-foreground">{o.networks?.name} {o.data_products?.name?.replace(/^.*?—\s*/, "")} → {o.recipient_phone}</p><p className="text-[11px] text-faint-foreground">{fmt(o.paid_at ?? o.created_at)} · <span className={toneClass(stageOf(o).tone)}>{stageOf(o).label}</span></p></div><p className="text-[12.5px] font-semibold text-primary-glow">+{formatGHS(Number(o.agent_margin ?? 0))}</p></li>)}</ul>
      </div>
    </div>
  );
}
