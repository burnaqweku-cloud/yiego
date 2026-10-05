import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AppWindow, BarChart3, CreditCard, ExternalLink, Gift, Globe, Home, Network, LifeBuoy, LogOut, Megaphone, Menu, MessagesSquare, Package, PhoneForwarded, Settings, ShoppingBag, Tags, UserCog, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import { loadPhase1Products, type Phase1Product } from "@/lib/phase1-api";
import { planQuote, type PlanQuote } from "@/lib/agents";
import { AGENT_GROUPS, STAFF_GROUPS as STAFF_NAV, groupForPath, LEGACY_REDIRECTS } from "@/lib/agent-nav";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/store/auth-context";
import NotificationBell from "@/components/notifications/NotificationBell";
import PlanPicker from "@/components/agent/PlanPicker";
import { longDate, subscriptionOf, type SubInfo } from "@/components/agent/subscription";
import { X } from "lucide-react";

/* The agent app. Its own header, its own navigation (bottom bar on phones,
   sidebar on desktop), no public site chrome. Pages read shared data from
   AgentContext so each one stays small. */
export interface Agent { id: string; slug: string; store_name: string; tagline: string | null; status: string; paid_until: string | null; momo_number: string | null; momo_name: string | null; whatsapp: string | null; earnings_balance: number; template?: string; accent_color?: string | null; logo_url?: string | null; banner_url?: string | null; about_text?: string | null; hours_text?: string | null; store_notice?: string | null; contact_phone?: string | null; socials?: Record<string, string>; featured_product_ids?: string[]; faq?: Array<{ q: string; a: string }>; sale_alert_email?: boolean; support_whatsapp_url?: string | null; support_whatsapp_on?: boolean; support_chat_on?: boolean; support_ai_on?: boolean; custom_domain?: string | null; custom_domain_status?: string | null; email_domain?: string | null; email_domain_status?: "pending" | "verified" | "failed" | null; email_domain_records?: Array<{ type: string; name: string; value: string; ttl?: string; purpose?: string; status?: string }> | null; parent_agent_id?: string | null; network_on?: boolean; network_fee?: number; network_pitch?: string | null; network_auto_approve?: boolean; network_questions?: Array<{ id: string; label: string; type: "text" | "textarea" | "select" | "phone" | "email"; required: boolean; options: string[] }>; parent?: { store_name: string; slug: string; network_fee: number } | null }
export interface AgentOrder { order_reference: string; recipient_phone: string; amount: number; agent_margin: number | null; status: string; admin_resolution_status: string | null; paid_at: string | null; created_at: string; data_products: { name: string } | null; networks: { name: string } | null }
export interface AgentPayout { id: string; amount: number; fee: number; net: number; status: string; created_at: string; paid_at: string | null; note: string | null }
export interface Plan { payout_minimum: number; payout_fee_rate: number; payout_fee_minimum: number }
interface Ctx { role: "owner" | "staff"; unread: number; floors: Record<string, number>; isSub: boolean; agent: Agent; orders: AgentOrder[]; payouts: AgentPayout[]; products: Phase1Product[]; prices: Record<string, string>; setPrices: (p: Record<string, string>) => void; plan: Plan | null; quote: PlanQuote | null; storeUrl: string; reload: () => Promise<void>; sub: SubInfo; openRenew: () => void }
const AgentContext = createContext<Ctx | null>(null);
export const useAgent = () => { const c = useContext(AgentContext); if (!c) throw new Error("useAgent outside AgentShell"); return c; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const p1 = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");
export const fmt = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Agent-only navigation, grouped like the admin panel's. Nothing here reaches admin pages.


/* Two-tier menu: tap a group to open its pages; the group holding the current page opens by itself. */
function AgentNav({ groups, unread, onNavigate }: { groups: typeof AGENT_GROUPS; unread: number; onNavigate?: () => void }) {
  const location = useLocation();
  const active = groupForPath(location.pathname, groups);
  const [openId, setOpenId] = useState<string>(active?.id ?? "");
  useEffect(() => { if (active) setOpenId(active.id); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <nav className="flex flex-col gap-0.5">
      {groups.map((g) => {
        const single = g.pages.length === 1;
        if (single) { const p = g.pages[0]; return <NavLink key={g.id} to={p.to} end={p.end} onClick={onNavigate} className={({ isActive }) => `flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] ${isActive ? "bg-primary/15 text-primary-glow" : "text-foreground hover:bg-white/[0.04]"}`}><g.icon size={16} />{p.label}</NavLink>; }
        const open = openId === g.id; const holds = active?.id === g.id;
        return (
          <div key={g.id}>
            <button type="button" onClick={() => setOpenId(open ? "" : g.id)} aria-expanded={open} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13.5px] ${holds ? "text-foreground" : "text-foreground hover:bg-white/[0.04]"}`}><g.icon size={16} className={holds ? "text-primary-glow" : ""} /><span className="flex-1">{g.label}</span>{g.pages.some((p) => p.badge) && unread > 0 && !open && <span className="rounded-full bg-amber px-1.5 text-[10px] font-bold text-[#1a1200]">{unread}</span>}<ChevronDown size={14} className={`text-faint-foreground transition-transform ${open ? "rotate-180" : ""}`} /></button>
            {open && <div className="mb-1 ml-4 flex flex-col gap-0.5 border-l border-white/[0.08] pl-2">{g.pages.map((p) => <NavLink key={p.id} to={p.to} end={p.end} onClick={onNavigate} className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] ${isActive ? "bg-primary/15 text-primary-glow" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"}`}>{p.label}{p.badge && unread > 0 && <span className="ml-auto rounded-full bg-amber px-1.5 text-[10px] font-bold text-[#1a1200]">{unread}</span>}</NavLink>)}</div>}
          </div>
        );
      })}
    </nav>
  );
}

export default function AgentShell() {
  const [drawer, setDrawer] = useState(false);
  const { user, isAuthenticated, signOut } = useAuth(); const navigate = useNavigate();
  const [agent, setAgent] = useState<Agent | null | undefined>(undefined);
  const [renew, setRenew] = useState(false);
  const [orders, setOrders] = useState<AgentOrder[]>([]); const [payouts, setPayouts] = useState<AgentPayout[]>([]);
  const [products, setProducts] = useState<Phase1Product[]>([]); const [prices, setPrices] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<Plan | null>(null); const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [role, setRole] = useState<"owner" | "staff">("owner"); const [unread, setUnread] = useState(0); const [floors, setFloors] = useState<Record<string, number>>({});

  const reload = useCallback(async () => {
    if (!user) return;
    const [a, pr, q, s] = await Promise.all([p1().from("agents").select("id, slug, store_name, tagline, status, paid_until, momo_number, momo_name, whatsapp, earnings_balance, template, accent_color, logo_url, banner_url, about_text, hours_text, store_notice, contact_phone, socials, featured_product_ids, faq, sale_alert_email, support_whatsapp_url, support_whatsapp_on, support_chat_on, support_ai_on, custom_domain, custom_domain_status, email_domain, email_domain_status, email_domain_records, parent_agent_id, network_on, network_fee, network_pitch, network_auto_approve, network_questions, parent:parent_agent_id(store_name, slug, network_fee)").eq("user_id", user.id).maybeSingle(), loadPhase1Products(), planQuote(), p1().from("site_settings").select("value").eq("key", "agent_plan").maybeSingle()]);
    let g = (a.data as Agent | null) ?? null; let r: "owner" | "staff" = "owner";
    if (!g) {
      // Not an agent: maybe staff on someone's store.
      const { data: acc } = await p1().rpc("my_agent_access", {});
      if (acc?.role === "staff") {
        const { data: sa } = await p1().from("agents").select("id, slug, store_name, tagline, status, paid_until, whatsapp, template, accent_color, logo_url").eq("id", acc.agent_id).maybeSingle();
        if (sa) { g = { ...(sa as Agent), momo_number: null, momo_name: null, earnings_balance: 0 }; r = "staff"; }
      }
    }
    setRole(r); setAgent(g); setProducts(pr.data ?? []); setQuote(q); setPlan(s.data?.value ?? null);
    if (g && r === "owner") { const { data: fl } = await p1().rpc("my_price_floors", {}); setFloors((fl as Record<string, number>) ?? {}); }
    if (g && r === "staff") {
      const { data: so } = await p1().rpc("staff_store_orders", {}); setOrders((so as AgentOrder[]) ?? []); setPayouts([]); setPrices({});
    } else if (g) {
      const [o, py, ap] = await Promise.all([
        p1().from("orders").select("order_reference, recipient_phone, amount, agent_margin, status, admin_resolution_status, paid_at, created_at, data_products(name), networks(name)").eq("agent_id", g.id).eq("payment_status", "succeeded").order("paid_at", { ascending: false }).limit(300),
        p1().from("agent_payouts").select("*").eq("agent_id", g.id).order("created_at", { ascending: false }),
        p1().from("agent_prices").select("product_id, price").eq("agent_id", g.id),
      ]);
      setOrders(o.data ?? []); setPayouts(py.data ?? []);
      const map: Record<string, string> = {}; for (const r of ap.data ?? []) map[r.product_id] = Number(r.price).toFixed(2); setPrices(map);
    }
  }, [user]);
  useEffect(() => { if (!isAuthenticated) { navigate(`/auth?next=${encodeURIComponent("/agent")}`); return; } sessionStorage.removeItem("yg-agent-browse"); void reload(); }, [isAuthenticated, reload, navigate]);
  // Staff only ever see their store's customer pages. Anything else bounces to Support.
  const location = useLocation();
  useEffect(() => {
    if (role !== "staff" || !agent) return;
    const ok = ["/agent/support", "/agent/orders", "/agent/customers", "/agent/check-mtn", "/agent/help"];
    if (!ok.some((p) => location.pathname === p || location.pathname.startsWith(p + "/"))) navigate("/agent/support", { replace: true });
  }, [role, agent, location.pathname, navigate]);
  useEffect(() => { if (!agent) return; const tick = () => void p1().rpc("agent_inbox_unread", {}).then(({ data }) => setUnread(Number(data ?? 0))); tick(); const t = setInterval(tick, 20000); return () => clearInterval(t); }, [agent]);

  const legacy = LEGACY_REDIRECTS[location.pathname.replace(/\/$/, "")];
  useEffect(() => { if (legacy) navigate(legacy, { replace: true }); }, [legacy, navigate]);
  if (agent === undefined) return <div className="min-h-dvh bg-background" />;
  if (agent === null) return <div className="mk-wrap py-16 text-center"><p className="text-[16px] font-semibold text-foreground">You're not an agent yet</p><Link to="/agents" className="mt-4 inline-block text-[13px] text-primary-glow">Apply to be an agent</Link></div>;
  // The store's best address: their own domain once live, otherwise the free subdomain.
  const storeUrl = agent.custom_domain && agent.custom_domain_status === "active" ? `https://${agent.custom_domain}` : `https://${agent.slug}.datayego.com`;

  const sub = subscriptionOf(agent, quote?.grace_days ?? 1);
  const isSub = !!agent.parent_agent_id;
  if (role === "owner" && (sub.state === "unpaid" || sub.state === "suspended")) return isSub ? <NetworkPayScreen agent={agent} /> : <PayScreen agent={agent} quote={quote} />;

  return (
    <AgentContext.Provider value={{ role, unread, floors, isSub, agent, orders, payouts, products, prices, setPrices, plan, quote, storeUrl, reload, sub, openRenew: () => setRenew(true) }}>
      <div className="onyx-canvas min-h-dvh">
        <div className="mx-auto flex max-w-5xl">
          {/* Desktop sidebar */}
          <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-white/[0.06] p-4 sm:flex">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Agent</p><p className="truncate text-[15px] font-semibold text-foreground">{agent.store_name}</p></div><NotificationBell /></div>
            <div className="mt-6"><AgentNav groups={role === "staff" ? STAFF_NAV : AGENT_GROUPS.filter((g) => !g.parentOnly || !agent.parent_agent_id)} unread={unread} /></div>
            <div className="mt-auto space-y-1 text-[12.5px]">
              <a href={storeUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl px-3 py-2 text-muted-foreground hover:bg-white/[0.04]"><ExternalLink size={14} />View my store</a>
              <Link to="/" onClick={() => sessionStorage.setItem("yg-agent-browse", "1")} className="flex items-center gap-2 rounded-xl px-3 py-2 text-muted-foreground hover:bg-white/[0.04]"><Home size={14} />Visit DataYego</Link>
              <button type="button" onClick={() => void signOut().then(() => navigate("/")).catch(() => toast.error("Couldn't sign out."))} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-danger hover:bg-danger/[0.08]"><LogOut size={14} />Sign out</button>
            </div>
          </aside>
          <div className="min-w-0 flex-1">
            {/* Mobile header */}
            <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.06] bg-background/85 px-4 py-3 backdrop-blur sm:hidden">
              <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setDrawer(true)} aria-label="Menu" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.1] text-foreground"><Menu size={18} /></button><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Agent</p><p className="truncate text-[15px] font-semibold text-foreground">{agent.store_name}</p></div></div>
              <div className="flex items-center gap-2"><span className="rounded-full bg-primary/12 px-2.5 py-1 text-[12px] font-semibold text-primary-glow">{formatGHS(Number(agent.earnings_balance))}</span><NotificationBell /><a href={storeUrl} target="_blank" rel="noreferrer" aria-label="View store" className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.1] text-muted-foreground"><ExternalLink size={14} /></a></div>
            </header>
            <main className="px-4 pb-10 pt-4 sm:px-8 sm:pb-10 sm:pt-8">
              {sub.state === "grace" && <div className="mb-4 rounded-2xl border border-amber/40 bg-amber/10 p-3.5 text-[12.5px] text-foreground"><p className="font-semibold">Your plan ended on {longDate(sub.paidUntil)}.</p><p className="mt-0.5 text-muted-foreground">Renew by tonight ({longDate(sub.closesOn)}) to keep your store open. Nothing changes until then.</p><button type="button" onClick={() => setRenew(true)} className="onyx-btn-primary mt-2.5 px-4 py-2 text-[12.5px]">Renew now</button></div>}
              {sub.state === "lapsed" && <div className="mb-4 rounded-2xl border border-danger/40 bg-danger/10 p-3.5 text-[12.5px] text-foreground"><p className="font-semibold">Your store is closed.</p><p className="mt-0.5 text-muted-foreground">Customers can't order and agent prices are locked. Your balance and orders are safe — you can still withdraw. Renew to reopen instantly.</p><button type="button" onClick={() => setRenew(true)} className="onyx-btn-primary mt-2.5 px-4 py-2 text-[12.5px]">Renew now</button></div>}
              <Outlet />
            </main>
          </div>
        </div>
        {renew && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={() => setRenew(false)}>
            <div className="onyx-panel w-full max-w-md rounded-t-3xl p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between"><div><h2 className="text-[17px] font-semibold text-foreground">{sub.state === "active" ? "Extend your plan" : "Renew your plan"}</h2><p className="mt-0.5 text-[12px] text-muted-foreground">{sub.state === "active" ? `Paid until ${longDate(sub.paidUntil)} · ${sub.daysLeft} day${sub.daysLeft === 1 ? "" : "s"} left. Whatever you buy is added on.` : "Everything reopens the moment payment is confirmed."}</p></div><button type="button" onClick={() => setRenew(false)} aria-label="Close" className="text-muted-foreground"><X size={18} /></button></div>
              <div className="mt-4">{isSub ? <NetworkPayInline agent={agent} /> : <PlanPicker quote={quote} verb={sub.state === "active" ? "Extend" : "Renew"} extending={sub.state === "active"} />}</div>
            </div>
          </div>
        )}
        {/* Mobile bottom nav */}
        {/* Mobile drawer: same grouped navigation as the desktop sidebar */}
        {drawer && (
          <div className="fixed inset-0 z-50 sm:hidden" onClick={() => setDrawer(false)}>
            <div className="absolute inset-0 bg-black/60" />
            <aside className="absolute inset-y-0 left-0 flex w-[82%] max-w-[320px] flex-col bg-background p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Agent</p><p className="truncate text-[15px] font-semibold text-foreground">{agent.store_name}</p><p className="text-[12px] text-primary-glow">{formatGHS(Number(agent.earnings_balance))} earned</p></div><button type="button" onClick={() => setDrawer(false)} aria-label="Close menu" className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.1] text-muted-foreground"><X size={16} /></button></div>
              <div className="mt-5 flex-1 overflow-y-auto"><AgentNav groups={role === "staff" ? STAFF_NAV : AGENT_GROUPS.filter((g) => !g.parentOnly || !agent.parent_agent_id)} unread={unread} onNavigate={() => setDrawer(false)} /></div>
              <div className="mt-4 space-y-0.5 border-t border-white/[0.06] pt-3 text-[13px]">
                <a href={storeUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl px-3 py-2 text-muted-foreground"><ExternalLink size={14} />View my store</a>
                <Link to="/" onClick={() => { sessionStorage.setItem("yg-agent-browse", "1"); setDrawer(false); }} className="flex items-center gap-2 rounded-xl px-3 py-2 text-muted-foreground"><Home size={14} />Shop as a customer</Link>
                <button type="button" onClick={() => void signOut().then(() => navigate("/")).catch(() => toast.error("Could not sign out."))} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-danger"><LogOut size={14} />Sign out</button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </AgentContext.Provider>
  );
}

/* Sub-agents pay their parent's fee, not a DataYego plan. */
function NetworkPayScreen({ agent }: { agent: Agent }) {
  const [months, setMonths] = useState(1); const [coupon, setCoupon] = useState(""); const [busy, setBusy] = useState(false);
  const fee = Number(agent.parent?.network_fee ?? 0);
  const pay = async () => { setBusy(true); const { data, error } = await supabase.functions.invoke<{ authorizationUrl?: string; error?: string }>("network-pay", { body: { months, coupon: coupon.trim() || undefined } }); setBusy(false); if (error || data?.error || !data?.authorizationUrl) return toast.error(data?.error ?? error?.message ?? "Couldn't start payment."); window.location.assign(data.authorizationUrl); };
  return (
    <div className="onyx-canvas flex min-h-dvh items-center justify-center px-5 py-8">
      <div className="onyx-panel w-full max-w-md rounded-3xl p-6">
        <div className="text-center"><CreditCard size={28} className="mx-auto text-primary-glow" /><p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-glow">{agent.status === "suspended" ? "Suspended" : "Approved · awaiting payment"}</p><h1 className="mt-1 text-[20px] font-semibold text-foreground">{agent.status === "suspended" ? "This store is suspended" : `Open ${agent.store_name}`}</h1><p className="mt-1 text-[13px] text-muted-foreground">{agent.status === "suspended" ? `Contact ${agent.parent?.store_name ?? "your network"} to sort this out.` : `Your store is under ${agent.parent?.store_name ?? "a network"}. Pay the monthly fee and it opens straight away.`}</p></div>
        {agent.status !== "suspended" && (<div className="mt-5 space-y-3">
          <div className="grid grid-cols-3 gap-2">{[1, 3, 6].map((m) => <button key={m} type="button" onClick={() => setMonths(m)} className={`rounded-2xl border p-3 text-center ${months === m ? "border-primary-glow/50 bg-primary/10" : "border-white/[0.08]"}`}><p className="text-[13px] font-semibold text-foreground">{m} month{m > 1 ? "s" : ""}</p><p className="text-[12px] text-muted-foreground">{formatGHS(fee * m)}</p></button>)}</div>
          <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Coupon code (optional)" autoCapitalize="characters" className="onyx-field w-full" />
          <button type="button" disabled={busy} onClick={() => void pay()} className="onyx-btn-primary w-full py-3 text-[14px] disabled:opacity-60">{busy ? "Please wait…" : `Pay ${formatGHS(fee * months)} + 4% fee`}</button>
          <p className="text-center text-[11.5px] text-faint-foreground">Paid to {agent.parent?.store_name}. Coupons from {agent.parent?.store_name} are applied at payment.</p>
        </div>)}
        {agent.status !== "suspended" && <ul className="mt-5 space-y-2 text-left text-[13px] text-muted-foreground">
          {[["Your own online store", `${agent.store_name} at ${agent.slug}.datayego.com, with your logo, colours and pages.`], ["Your prices, your profit", `Buy at ${agent.parent?.store_name ?? "your network"}'s agent price, sell at yours, keep the difference on every sale.`], ["Nothing to deliver", "Payment, delivery and receipts run automatically. Your profit is paid to MoMo."], ["Support when you need it", `${agent.parent?.store_name ?? "Your network"} can see your support inbox and help you out.`]].map(([t, d]) => <li key={t} className="flex gap-2"><span className="mt-0.5 text-primary-glow">✓</span><span><b className="text-foreground">{t}.</b> {d}</span></li>)}
        </ul>}
        <Link to="/" className="mt-4 block text-center text-[12px] text-muted-foreground">Back</Link>
      </div>
    </div>
  );
}
function NetworkPayInline({ agent }: { agent: Agent }) {
  const [months, setMonths] = useState(1); const [coupon, setCoupon] = useState(""); const [busy, setBusy] = useState(false);
  const fee = Number(agent.parent?.network_fee ?? 0);
  if (!(fee > 0)) return <p className="text-[13px] text-muted-foreground">Your network doesn't charge a fee. Nothing to pay.</p>;
  const pay = async () => { setBusy(true); const { data, error } = await supabase.functions.invoke<{ authorizationUrl?: string; error?: string }>("network-pay", { body: { months, coupon: coupon.trim() || undefined } }); setBusy(false); if (error || data?.error || !data?.authorizationUrl) return toast.error(data?.error ?? error?.message ?? "Couldn't start payment."); window.location.assign(data.authorizationUrl); };
  return (<div className="space-y-3">
    <div className="grid grid-cols-3 gap-2">{[1, 3, 6].map((m) => <button key={m} type="button" onClick={() => setMonths(m)} className={`rounded-2xl border p-3 text-center ${months === m ? "border-primary-glow/50 bg-primary/10" : "border-white/[0.08]"}`}><p className="text-[13px] font-semibold text-foreground">{m} month{m > 1 ? "s" : ""}</p><p className="text-[12px] text-muted-foreground">{formatGHS(fee * m)}</p></button>)}</div>
    <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Coupon code (optional)" autoCapitalize="characters" className="onyx-field w-full" />
    <button type="button" disabled={busy} onClick={() => void pay()} className="onyx-btn-primary w-full py-3 text-[14px] disabled:opacity-60">{busy ? "Please wait…" : `Pay ${formatGHS(fee * months)} + 4% fee to ${agent.parent?.store_name ?? "your network"}`}</button>
  </div>);
}
function PayScreen({ agent, quote }: { agent: Agent; quote: PlanQuote | null }) {
  const suspended = agent.status === "suspended";
  return (
    <div className="onyx-canvas flex min-h-dvh items-center justify-center px-5 py-8">
      <div className="onyx-panel w-full max-w-md rounded-3xl p-6">
        <div className="text-center">
          <CreditCard size={28} className="mx-auto text-primary-glow" />
          <h1 className="mt-3 text-[20px] font-semibold text-foreground">{suspended ? "This account is suspended" : "One step left"}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{suspended ? "Contact DataYego support to sort this out." : "You're approved. Pick a plan and your store opens straight away."}</p>
        </div>
        {!suspended && <div className="mt-5"><PlanPicker quote={quote} /></div>}
        <ul className="mt-5 space-y-2 text-left text-[13px] text-muted-foreground">
          {[["Buy data cheaper", "MTN 2GB at 8.50 instead of 8.72, 10GB at 41.00 instead of 41.47 — for yourself or to sell."], ["Free online store", "Your own link. You set the prices and keep the profit on every sale."], ["No deposit needed", "Your customers pay through your store; your profit is saved for you and paid to MoMo from 20.00."], ["We do the rest", "Delivery, payment and support are handled by DataYego."]].map(([t, d]) => <li key={t} className="flex gap-2"><span className="mt-0.5 text-primary-glow">✓</span><span><b className="text-foreground">{t}.</b> {d}</span></li>)}
        </ul>
        <Link to="/" className="mt-4 block text-center text-[12px] text-muted-foreground">Back to DataYego</Link>
      </div>
    </div>
  );
}
