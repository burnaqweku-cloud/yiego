import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { CreditCard, ExternalLink, Home, LogOut, Package, Settings, ShoppingBag, Tags, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import { loadPhase1Products, type Phase1Product } from "@/lib/phase1-api";
import { planQuote, type PlanQuote } from "@/lib/agents";
import { useAuth } from "@/store/auth-context";
import NotificationBell from "@/components/notifications/NotificationBell";

/* The agent app. Its own header, its own navigation (bottom bar on phones,
   sidebar on desktop), no public site chrome. Pages read shared data from
   AgentContext so each one stays small. */
export interface Agent { id: string; slug: string; store_name: string; tagline: string | null; status: string; paid_until: string | null; momo_number: string | null; momo_name: string | null; whatsapp: string | null; earnings_balance: number }
export interface AgentOrder { order_reference: string; recipient_phone: string; amount: number; agent_margin: number | null; status: string; paid_at: string | null; created_at: string; data_products: { name: string } | null; networks: { name: string } | null }
export interface AgentPayout { id: string; amount: number; fee: number; net: number; status: string; created_at: string; paid_at: string | null; note: string | null }
export interface Plan { payout_minimum: number; payout_fee_rate: number; payout_fee_minimum: number }
interface Ctx { agent: Agent; orders: AgentOrder[]; payouts: AgentPayout[]; products: Phase1Product[]; prices: Record<string, string>; setPrices: (p: Record<string, string>) => void; plan: Plan | null; quote: PlanQuote | null; storeUrl: string; reload: () => Promise<void> }
const AgentContext = createContext<Ctx | null>(null);
export const useAgent = () => { const c = useContext(AgentContext); if (!c) throw new Error("useAgent outside AgentShell"); return c; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const p1 = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");
export const fmt = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const NAV = [
  { to: "/agent", label: "Home", icon: Home, end: true },
  { to: "/agent/buy", label: "Buy data", icon: ShoppingBag },
  { to: "/agent/orders", label: "Orders", icon: Package },
  { to: "/agent/prices", label: "Prices", icon: Tags },
  { to: "/agent/earnings", label: "Earnings", icon: Wallet },
  { to: "/agent/store", label: "Store", icon: Settings },
];

export default function AgentShell() {
  const { user, isAuthenticated, signOut } = useAuth(); const navigate = useNavigate();
  const [agent, setAgent] = useState<Agent | null | undefined>(undefined);
  const [orders, setOrders] = useState<AgentOrder[]>([]); const [payouts, setPayouts] = useState<AgentPayout[]>([]);
  const [products, setProducts] = useState<Phase1Product[]>([]); const [prices, setPrices] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<Plan | null>(null); const [quote, setQuote] = useState<PlanQuote | null>(null);

  const reload = useCallback(async () => {
    if (!user) return;
    const [a, pr, q, s] = await Promise.all([p1().from("agents").select("id, slug, store_name, tagline, status, paid_until, momo_number, momo_name, whatsapp, earnings_balance").eq("user_id", user.id).maybeSingle(), loadPhase1Products(), planQuote(), p1().from("site_settings").select("value").eq("key", "agent_plan").maybeSingle()]);
    const g = (a.data as Agent | null) ?? null; setAgent(g); setProducts(pr.data ?? []); setQuote(q); setPlan(s.data?.value ?? null);
    if (g) {
      const [o, py, ap] = await Promise.all([
        p1().from("orders").select("order_reference, recipient_phone, amount, agent_margin, status, paid_at, created_at, data_products(name), networks(name)").eq("agent_id", g.id).eq("payment_status", "succeeded").order("paid_at", { ascending: false }).limit(300),
        p1().from("agent_payouts").select("*").eq("agent_id", g.id).order("created_at", { ascending: false }),
        p1().from("agent_prices").select("product_id, price").eq("agent_id", g.id),
      ]);
      setOrders(o.data ?? []); setPayouts(py.data ?? []);
      const map: Record<string, string> = {}; for (const r of ap.data ?? []) map[r.product_id] = Number(r.price).toFixed(2); setPrices(map);
    }
  }, [user]);
  useEffect(() => { if (!isAuthenticated) { navigate(`/auth?next=${encodeURIComponent("/agent")}`); return; } sessionStorage.removeItem("yg-agent-browse"); void reload(); }, [isAuthenticated, reload, navigate]);

  if (agent === undefined) return <div className="min-h-dvh bg-background" />;
  if (agent === null) return <div className="mk-wrap py-16 text-center"><p className="text-[16px] font-semibold text-foreground">You're not an agent yet</p><Link to="/agents" className="mt-4 inline-block text-[13px] text-primary-glow">Apply to be an agent</Link></div>;
  const storeUrl = `${window.location.origin}/s/${agent.slug}`;

  if (agent.status !== "active") return <PayScreen agent={agent} quote={quote} />;

  return (
    <AgentContext.Provider value={{ agent, orders, payouts, products, prices, setPrices, plan, quote, storeUrl, reload }}>
      <div className="onyx-canvas min-h-dvh">
        <div className="mx-auto flex max-w-5xl">
          {/* Desktop sidebar */}
          <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-white/[0.06] p-4 sm:flex">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Agent</p><p className="truncate text-[15px] font-semibold text-foreground">{agent.store_name}</p></div><NotificationBell /></div>
            <nav className="mt-6 flex flex-col gap-1">{NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] ${isActive ? "bg-primary/15 text-primary-glow" : "text-muted-foreground hover:bg-white/[0.04]"}`}><n.icon size={16} />{n.label}</NavLink>)}</nav>
            <div className="mt-auto space-y-1 text-[12.5px]">
              <a href={storeUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl px-3 py-2 text-muted-foreground hover:bg-white/[0.04]"><ExternalLink size={14} />View my store</a>
              <Link to="/" onClick={() => sessionStorage.setItem("yg-agent-browse", "1")} className="flex items-center gap-2 rounded-xl px-3 py-2 text-muted-foreground hover:bg-white/[0.04]"><Home size={14} />Visit DataYego</Link>
              <button type="button" onClick={() => void signOut().then(() => navigate("/")).catch(() => toast.error("Couldn't sign out."))} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-danger hover:bg-danger/[0.08]"><LogOut size={14} />Sign out</button>
            </div>
          </aside>
          <div className="min-w-0 flex-1">
            {/* Mobile header */}
            <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.06] bg-background/85 px-4 py-3 backdrop-blur sm:hidden">
              <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Agent</p><p className="truncate text-[15px] font-semibold text-foreground">{agent.store_name}</p></div>
              <div className="flex items-center gap-2"><span className="rounded-full bg-primary/12 px-2.5 py-1 text-[12px] font-semibold text-primary-glow">{formatGHS(Number(agent.earnings_balance))}</span><NotificationBell /><a href={storeUrl} target="_blank" rel="noreferrer" aria-label="View store" className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.1] text-muted-foreground"><ExternalLink size={14} /></a></div>
            </header>
            <main className="px-4 pb-24 pt-4 sm:px-8 sm:pb-10 sm:pt-8"><Outlet /></main>
          </div>
        </div>
        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-white/[0.08] bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[10.5px] ${isActive ? "text-primary-glow" : "text-muted-foreground"}`}><n.icon size={19} />{n.label}</NavLink>)}
        </nav>
      </div>
    </AgentContext.Provider>
  );
}

function PayScreen({ agent, quote }: { agent: Agent; quote: PlanQuote | null }) {
  const [busy, setBusy] = useState(false);
  const pay = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke<{ error?: string; data?: { authorizationUrl: string } }>("agent-subscribe", { body: {} });
    setBusy(false);
    const err = data?.error ?? error?.message; if (err) return toast.error(err);
    if (data?.data?.authorizationUrl) window.location.href = data.data.authorizationUrl;
  };
  return (
    <div className="onyx-canvas flex min-h-dvh items-center justify-center px-5">
      <div className="onyx-panel w-full max-w-md rounded-3xl p-6 text-center">
        <CreditCard size={28} className="mx-auto text-primary-glow" />
        <h1 className="mt-3 text-[20px] font-semibold text-foreground">{agent.status === "paused" ? "Your store is paused" : "One step left"}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{agent.status === "paused" ? `Your month ended on ${agent.paid_until}. Pay to reopen your store — everything is exactly as you left it.` : "You're approved. Pay the monthly fee and your store opens straight away."}</p>
        {quote && <div className="mt-4"><p className="text-[28px] font-semibold text-foreground">{formatGHS(quote.pay_now)}<span className="text-[13px] font-normal text-muted-foreground"> / month</span></p>{quote.promo && <p className="text-[12px] text-primary-glow">{quote.promo.percent_off}% off with {quote.promo.name} · normally {formatGHS(quote.monthly)}</p>}</div>}
        <ul className="mt-4 space-y-2 text-left text-[13px] text-muted-foreground">
          {[["Buy data cheaper", "MTN 1GB at 4.00 instead of 4.15, 10GB at 40.00 instead of 43.44 — for yourself or to sell."], ["Free online store", "Your own link. You set the prices and keep the profit on every sale."], ["No deposit needed", "Your customers pay through your store; your profit is saved for you and paid to MoMo from 20.00."], ["We do the rest", "Delivery, payment and support are handled by DataYego."]].map(([t, d]) => <li key={t} className="flex gap-2"><span className="mt-0.5 text-primary-glow">✓</span><span><b className="text-foreground">{t}.</b> {d}</span></li>)}
        </ul>
        <button type="button" className="onyx-btn-primary mt-5 w-full py-3 text-[14px]" onClick={() => void pay()} disabled={busy}>{busy ? "Opening Paystack…" : "Pay with Paystack"}</button>
        <p className="mt-3 text-[11px] text-faint-foreground">Card or mobile money. Your month starts the moment it's confirmed.</p>
        <Link to="/" className="mt-3 inline-block text-[12px] text-muted-foreground">Back to DataYego</Link>
      </div>
    </div>
  );
}
