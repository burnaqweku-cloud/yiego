import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgePercent, Rocket, Search, Store, UserCheck } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Field, Money, Panel, Pill, Row, Rows, Segmented, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import AdminRecordModal from "@/components/admin/AdminRecordModal";
import { Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { useAuth } from "@/store/auth-context";

/* Agents — applications to review, active agents, promos and the launch switch.
   Nothing here is visible to customers until the switch is on. */

interface Application { id: string; user_id: string; full_name: string; phone: string; whatsapp: string | null; town: string | null; pitch: string | null; status: "pending" | "approved" | "declined"; decline_reason: string | null; created_at: string; reviewed_at: string | null }
interface Agent { id: string; user_id: string; slug: string; store_name: string; status: string; paid_until: string | null; earnings_balance: number; created_at: string }
interface AgentStats { orders: number; sales: number; own: number; earned: number }
interface Promo { id: string; name: string; percent_off: number; starts_at: string; ends_at: string | null; max_uses: number | null; uses: number; is_active: boolean }
interface Plan { monthly_price: number; payout_minimum: number; payout_fee_rate: number; payout_fee_minimum: number; popup_delay_seconds: number }
type Tab = "overview" | "applications" | "agents" | "subscriptions" | "payouts" | "promos" | "launch";
const TAB_PATH: Record<Tab, string> = { overview: "/admin/agents", applications: "/admin/agents/applications", agents: "/admin/agents/list", subscriptions: "/admin/agents/subscriptions", payouts: "/admin/agents/payouts", promos: "/admin/agents/plan", launch: "/admin/agents/launch" };
const TAB_TITLE: Record<Tab, string> = { overview: "Agents", applications: "Applications", agents: "All agents", subscriptions: "Subscriptions", payouts: "Payments", promos: "Plan & promos", launch: "Launch" };
interface Grant { id: string; agent_id: string; months: number; from_date: string; until_date: string; note: string | null; created_at: string }
interface SubPayment { provider_reference: string; amount: number; status: string; verified_at: string | null; created_at: string; user_id: string | null; metadata: { agent_id?: string; percent_off?: number } | null }
interface Payout { id: string; agent_id: string; amount: number; fee: number; net: number; momo_number: string; momo_name: string | null; status: string; note: string | null; created_at: string; paid_at: string | null; paid_reference: string | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

export default function AdminAgents() {
  const { user } = useAuth(); const actor = user?.id ?? "";
  const location = useLocation(); const navigate = useNavigate();
  const tab: Tab = (Object.entries(TAB_PATH).find(([, path]) => location.pathname === path)?.[0] as Tab) ?? "overview";
  const setTab = (t: Tab) => navigate(TAB_PATH[t]);
  const [subs, setSubs] = useState<SubPayment[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [agentStats, setAgentStats] = useState<Record<string, AgentStats>>({});
  const [making, setMaking] = useState(false); const [makeEmail, setMakeEmail] = useState(""); const [makeMonths, setMakeMonths] = useState("1"); const [makeNote, setMakeNote] = useState("");
  const [granting, setGranting] = useState<Agent | null>(null); const [grantMonths, setGrantMonths] = useState("1"); const [grantNote, setGrantNote] = useState("");
  const [apps, setApps] = useState<Application[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [paying, setPaying] = useState<Payout | null>(null); const [payRef, setPayRef] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [launched, setLaunched] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [emails, setEmails] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [appFilter, setAppFilter] = useState<"pending" | "all">("pending");
  const [declining, setDeclining] = useState<Application | null>(null); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<Application | null>(null);
  const [editPromo, setEditPromo] = useState<Partial<Promo> | null>(null);
  const [planDraft, setPlanDraft] = useState<Plan | null>(null);
  const [emailTest, setEmailTest] = useState<unknown>(null);

  const load = useCallback(async () => {
    const [a, g, p, s, r, po, sp, gr] = await Promise.all([
      db().from("agent_applications").select("*").order("created_at", { ascending: false }).limit(500),
      db().from("agents").select("id, user_id, slug, store_name, status, paid_until, earnings_balance, created_at").order("created_at", { ascending: false }),
      db().from("agent_promos").select("*").order("created_at", { ascending: false }),
      db().from("site_settings").select("key, value").in("key", ["agents_launched", "agent_plan"]),
      actor ? db().rpc("admin_role", { p_user: actor }) : Promise.resolve({ data: null, error: null }),
      db().from("agent_payouts").select("*").order("created_at", { ascending: false }).limit(300),
      db().from("payment_intents").select("provider_reference, amount, status, verified_at, created_at, user_id, metadata").eq("purpose", "agent_subscription").order("created_at", { ascending: false }).limit(300),
      db().from("agent_subscription_grants").select("*").order("created_at", { ascending: false }).limit(300),
    ]);
    setPayouts(po.data ?? []); setSubs(sp.data ?? []); setGrants(gr.data ?? []);
    const { data: ao } = await db().from("orders").select("agent_id, amount, agent_margin, status, user_id").not("agent_id", "is", null).eq("payment_status", "succeeded").limit(5000);
    const st: Record<string, AgentStats> = {}; const owner = new Map<string, string>((g.data ?? []).map((x: Agent) => [x.id, x.user_id]));
    for (const o of ao ?? []) { const k = o.agent_id as string; const self = o.user_id === owner.get(k) && Number(o.agent_margin ?? 0) === 0; st[k] ??= { orders: 0, sales: 0, own: 0, earned: 0 }; st[k].orders += 1; if (self) st[k].own += Number(o.amount); else { st[k].sales += Number(o.amount); if (o.status === "delivered") st[k].earned += Number(o.agent_margin ?? 0); } }
    setAgentStats(st);
    setApps(a.data ?? []); setAgents(g.data ?? []); setPromos(p.data ?? []);
    for (const row of s.data ?? []) { if (row.key === "agents_launched") setLaunched(Boolean(row.value)); if (row.key === "agent_plan") { setPlan(row.value); setPlanDraft(row.value); } }
    setIsMaster(r.data === "master");
    const ids = [...new Set([...(a.data ?? []).map((x: Application) => x.user_id), ...(g.data ?? []).map((x: Agent) => x.user_id)])];
    if (ids.length) { const pr = await db().from("profiles").select("id, email").in("id", ids); setEmails(new Map((pr.data ?? []).map((x: { id: string; email: string }) => [x.id, x.email]))); }
    setLoading(false);
  }, [actor]);
  useEffect(() => { void load(); }, [load]);

  const q = search.trim().toLowerCase();
  const visibleApps = useMemo(() => apps.filter((a) => (appFilter === "all" || a.status === "pending") && (!q || a.full_name.toLowerCase().includes(q) || a.phone.includes(q) || (emails.get(a.user_id) ?? "").toLowerCase().includes(q))), [apps, appFilter, q, emails]);
  type AgentFilter = "subscribed" | "sold" | "lapsed" | "unpaid" | "expiring" | "all";
  const [agentFilter, setAgentFilter] = useState<AgentFilter>("subscribed");
  const [agentSort, setAgentSort] = useState<"sales" | "recent" | "balance">("sales");
  const daysLeft = (g: Agent) => g.paid_until ? Math.ceil((+new Date(g.paid_until) - Date.now()) / 86400000) : null;
  const matchesFilter = (g: Agent) => {
    const st = agentStats[g.id]; const dl = daysLeft(g);
    switch (agentFilter) {
      case "subscribed": return g.status === "active";
      case "sold": return (st?.orders ?? 0) > 0;
      case "lapsed": return g.status !== "active" && (st?.orders ?? 0) > 0;
      case "unpaid": return g.status === "awaiting_payment";
      case "expiring": return g.status === "active" && dl != null && dl <= 7;
      default: return true;
    }
  };
  const counts = { subscribed: agents.filter((g) => g.status === "active").length, sold: agents.filter((g) => (agentStats[g.id]?.orders ?? 0) > 0).length, lapsed: agents.filter((g) => g.status !== "active" && (agentStats[g.id]?.orders ?? 0) > 0).length, unpaid: agents.filter((g) => g.status === "awaiting_payment").length, expiring: agents.filter((g) => { const d = daysLeft(g); return g.status === "active" && d != null && d <= 7; }).length, all: agents.length };
  const visibleAgents = useMemo(() => agents.filter((g) => matchesFilter(g) && (!q || g.store_name.toLowerCase().includes(q) || g.slug.includes(q) || (emails.get(g.user_id) ?? "").toLowerCase().includes(q))).sort((a, b) => agentSort === "sales" ? ((agentStats[b.id]?.sales ?? 0) + (agentStats[b.id]?.own ?? 0)) - ((agentStats[a.id]?.sales ?? 0) + (agentStats[a.id]?.own ?? 0)) : agentSort === "balance" ? Number(b.earnings_balance) - Number(a.earnings_balance) : b.created_at.localeCompare(a.created_at)), [agents, q, emails, agentFilter, agentSort, agentStats]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = apps.filter((a) => a.status === "pending").length;
  const payoutsWaiting = payouts.filter((p) => p.status === "requested" || p.status === "approved").length;
  const agentName = (id: string) => agents.find((g) => g.id === id)?.store_name ?? "—";
  const makeAgent = async () => {
    if (!makeEmail.trim()) return toast.error("Enter the account's email.");
    const { data, error } = await db().rpc("admin_make_agent", { p_actor: actor, p_email: makeEmail.trim(), p_months: Number(makeMonths), p_note: makeNote.trim() || null });
    if (error) return toast.error(error.message.includes("no_account") ? "No DataYego account with that email. They need to sign up first." : error.message.replace(/_/g, " "));
    const d = data as { slug: string; paid_until: string };
    toast.success(`Done. Store /s/${d.slug}, covered until ${d.paid_until}. Not booked as income.`); setMaking(false); setMakeEmail(""); setMakeNote(""); void load();
  };
  const grant = async () => {
    if (!granting) return;
    const { data, error } = await db().rpc("admin_grant_subscription", { p_actor: actor, p_agent_id: granting.id, p_months: Number(grantMonths), p_note: grantNote.trim() || null });
    if (error) return toast.error(error.message.replace(/_/g, " "));
    toast.success(`${granting.store_name} is covered until ${(data as { paid_until: string }).paid_until}. Not booked as income.`); setGranting(null); setGrantNote(""); void load();
  };
  const [payFilter, setPayFilter] = useState<"waiting" | "paid" | "rejected" | "all">("waiting");
  const [rejecting, setRejecting] = useState<Payout | null>(null); const [rejectNote, setRejectNote] = useState("");
  const settle = async (p: Payout, action: "approve" | "reject" | "paid", reference?: string, note?: string) => {
    const { data, error } = await supabase.functions.invoke<{ error?: string }>("agent-admin", { body: { action: "settle_payout", payoutId: p.id, settle: action, reference: reference ?? null, note: note ?? null } });
    const err = data?.error ?? error?.message; if (err) return toast.error(err.replace(/_/g, " "));
    toast.success(action === "paid" ? "Marked paid, booked, and the agent has been emailed." : action === "reject" ? "Rejected; earnings returned and the agent emailed." : "Approved."); setPaying(null); setPayRef(""); setRejecting(null); setRejectNote(""); void load();
  };
  const agentOf = (id: string) => agents.find((g) => g.id === id);
  const visiblePayouts = payouts.filter((p) => payFilter === "all" || (payFilter === "waiting" ? p.status === "requested" || p.status === "approved" : p.status === payFilter));
  const payTotals = { waiting: payouts.filter((p) => p.status === "requested" || p.status === "approved").reduce((a, p) => a + Number(p.net), 0), paid: payouts.filter((p) => p.status === "paid").reduce((a, p) => a + Number(p.net), 0), fees: payouts.filter((p) => p.status === "paid").reduce((a, p) => a + Number(p.fee), 0) };

  const review = async (app: Application, approve: boolean) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke<{ error?: string }>("agent-admin", { body: { action: "review_application", applicationId: app.id, approve, reason: approve ? null : reason.trim() || null } });
    setBusy(false);
    const err = data?.error ?? error?.message; if (err) return toast.error(err);
    toast.success(approve ? `${app.full_name} approved — email sent.` : `${app.full_name} declined — email sent.`);
    setDeclining(null); setReason(""); void load();
  };
  const savePromo = async () => {
    if (!editPromo?.name || !editPromo.percent_off) return toast.error("Name and percent are needed.");
    const { error } = await db().rpc("admin_save_promo", { p_actor: actor, p_id: editPromo.id ?? null, p_name: editPromo.name, p_percent: Number(editPromo.percent_off), p_starts: editPromo.starts_at ?? null, p_ends: editPromo.ends_at ?? null, p_max_uses: editPromo.max_uses ?? null, p_active: editPromo.is_active ?? true });
    if (error) return toast.error(error.message); toast.success("Promo saved."); setEditPromo(null); void load();
  };
  const savePlan = async () => {
    if (!planDraft) return;
    const { error } = await db().rpc("admin_set_site_setting", { p_actor: actor, p_key: "agent_plan", p_value: planDraft });
    if (error) return toast.error(error.message.replace(/_/g, " ")); toast.success("Plan settings saved."); void load();
  };
  const flip = async (on: boolean) => {
    if (!window.confirm(on ? "Launch agents now? Public prices change to the pending list and the popup, apply page and stores go live." : "Turn agents off? Stores and the apply page will hide. Public prices stay as they are.")) return;
    const { data, error } = await db().rpc("admin_launch_agents", { p_actor: actor, p_on: on });
    if (error) return toast.error(error.message.replace(/_/g, " "));
    const d = data as { prices_changed?: number }; toast.success(on ? `Agents launched. ${d.prices_changed ?? 0} public prices updated.` : "Agents switched off."); void load();
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title={TAB_TITLE[tab]} description={launched ? "Live. Customers can see the apply page, popup and stores." : "Not launched. Nothing here is visible to customers yet."} action={<Pill tone={launched ? "good" : "warn"}>{launched ? "live" : "hidden"}</Pill>} />
      {tab === "overview" && <StatGrid cols={4}>
        <Stat loading={loading} label="Applications waiting" value={String(pending)} tone={pending ? "warn" : "default"} icon={UserCheck} onClick={() => { setTab("applications"); setAppFilter("pending"); }} />
        <Stat loading={loading} label="Agents" value={String(agents.length)} note={`${agents.filter((g) => g.status === "active").length} active · ${agents.filter((g) => g.status === "awaiting_payment").length} not yet paid`} icon={Store} onClick={() => setTab("agents")} />
        <Stat loading={loading} label="Owed to agents" value={<Money value={agents.reduce((a, g) => a + Number(g.earnings_balance), 0)} />} note="earnings not yet paid out" tone="warn" />
        <Stat loading={loading} label="Monthly plan" value={plan ? formatGHS(plan.monthly_price) : "—"} note={promos.find((p) => p.is_active) ? `${promos.find((p) => p.is_active)?.percent_off}% promo running` : "no promo"} icon={BadgePercent} onClick={() => setTab("promos")} />
      </StatGrid>}
      {tab === "overview" && (
        <Panel title="Where things stand" note="tap a row">
          <Rows empty="">
            <Row onClick={() => setTab("applications")} primary="Applications" secondary={pending ? `${pending} waiting for a decision` : "nothing waiting"} right={String(apps.length)} rightNote="total" tone={pending ? "warn" : "default"} />
            <Row onClick={() => setTab("agents")} primary="Agents" secondary={`${agents.filter((g) => g.status === "active").length} active · ${agents.filter((g) => g.status === "paused").length} paused · ${agents.filter((g) => g.status === "awaiting_payment").length} not yet paid`} right={String(agents.length)} rightNote="total" />
            <Row onClick={() => setTab("subscriptions")} primary="Subscriptions" secondary={`${subs.filter((x) => x.status === "succeeded").length} payments · ${formatGHS(subs.filter((x) => x.status === "succeeded").reduce((a, x) => a + Number(x.amount), 0))} collected`} right={String(agents.filter((g) => g.paid_until && new Date(g.paid_until) <= new Date(Date.now() + 7 * 86400000)).length)} rightNote="expiring in 7 days" />
            <Row onClick={() => setTab("payouts")} primary="Payouts" secondary={payoutsWaiting ? `${payoutsWaiting} waiting to be paid` : "nothing waiting"} right={formatGHS(payouts.filter((p) => p.status === "paid").reduce((a, p) => a + Number(p.net), 0))} rightNote="paid out" tone={payoutsWaiting ? "warn" : "default"} />
            <Row onClick={() => setTab("promos")} primary="Plan & promos" secondary={plan ? `${formatGHS(plan.monthly_price)}/month · payout min ${formatGHS(plan.payout_minimum)} · fee ${(plan.payout_fee_rate * 100).toFixed(0)}%` : "—"} right={promos.find((p) => p.is_active) ? `${promos.find((p) => p.is_active)?.percent_off}% off` : "no promo"} />
            <Row onClick={() => setTab("launch")} primary="Launch" secondary={launched ? "agents are live" : "hidden from customers; admins can preview"} right={launched ? "live" : "off"} tone={launched ? "good" : "warn"} />
          </Rows>
        </Panel>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {tab === "applications" && <Segmented<"pending" | "all"> value={appFilter} onChange={setAppFilter} options={[{ value: "pending", label: "Waiting" }, { value: "all", label: "All" }]} />}
        {(tab === "applications" || tab === "agents") && <label className="relative block flex-1 min-w-[200px]"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone, email, store" className={`${inputCls} pl-8`} /></label>}
      </div>

      {tab === "applications" && (
        <Panel title="Applications" note={appFilter === "pending" ? "waiting for review" : "all applications"}>
          <Rows empty={loading ? "Loading…" : appFilter === "pending" ? "No applications waiting." : "No applications yet."}>
            {visibleApps.map((a) => (
              <li key={a.id} className="flex items-center gap-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-foreground">{a.full_name} <span className="font-normal text-faint-foreground">· {a.phone}{a.town ? ` · ${a.town}` : ""}</span></p>
                  <p className="truncate text-[11px] text-faint-foreground">{emails.get(a.user_id) ?? "—"} · {formatAdminDate(a.created_at)}</p>
                </div>
                <Pill tone={a.status === "pending" ? "warn" : a.status === "approved" ? "good" : "muted"}>{a.status}</Pill>
                <button type="button" aria-label="View" onClick={() => setViewing(a)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-muted-foreground hover:bg-white/[0.04]"><Eye size={14} /></button>
                {a.status === "pending" && <><Button size="sm" onClick={() => void review(a, true)} disabled={busy}>Approve</Button><Button size="sm" variant="quiet" onClick={() => { setDeclining(a); setReason(""); }}>Decline</Button></>}
              </li>))}
          </Rows>
        </Panel>
      )}

      {tab === "agents" && (
        <>
        <div className="flex flex-wrap gap-2">
          <Segmented<AgentFilter> value={agentFilter} onChange={setAgentFilter} options={[{ value: "subscribed", label: `On subscription (${counts.subscribed})` }, { value: "sold", label: `Have sold (${counts.sold})` }, { value: "expiring", label: `Expiring ≤7d (${counts.expiring})` }, { value: "unpaid", label: `Approved, unpaid (${counts.unpaid})` }, { value: "lapsed", label: `Lapsed, sold before (${counts.lapsed})` }, { value: "all", label: `All (${counts.all})` }]} />
          <Segmented<"sales" | "recent" | "balance"> value={agentSort} onChange={setAgentSort} options={[{ value: "sales", label: "Top sales" }, { value: "balance", label: "Balance" }, { value: "recent", label: "Newest" }]} />
        </div>
        <Panel title="Agents" note={`${visibleAgents.length} shown`} action={isMaster ? <Button size="sm" variant="soft" onClick={() => setMaking(true)}>Make someone an agent</Button> : undefined}>
          <Rows empty={loading ? "Loading…" : "No agents yet — approve an application to create one."}>
            {visibleAgents.map((g) => { const st = agentStats[g.id]; const dl = daysLeft(g); return (
              <li key={g.id} className="cursor-pointer py-2 hover:bg-white/[0.02]" onClick={() => navigate(`/admin/agents/${g.id}`)}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-foreground">{g.store_name} <span className="font-normal text-faint-foreground">· {emails.get(g.user_id) ?? "—"}</span></p>
                    <p className="truncate text-[11px] text-faint-foreground">{g.status === "active" ? (dl != null ? (dl < 0 ? `${-dl}d overdue` : dl === 0 ? "ends today" : `${dl}d left`) : "active") : g.status === "awaiting_payment" ? "approved, not paid" : g.status}{grants.some((x) => x.agent_id === g.id) ? " · free months" : ""} · joined {formatAdminDate(g.created_at)}</p>
                  </div>
                  <Pill tone={g.status === "active" ? (dl != null && dl <= 7 ? "warn" : "good") : g.status === "awaiting_payment" ? "warn" : "muted"}>{g.status === "active" ? "on plan" : g.status === "awaiting_payment" ? "unpaid" : g.status}</Pill>
                </div>
                <div className="mt-1.5 grid grid-cols-4 gap-2 text-[11px]">
                  <div><p className="text-faint-foreground">Orders</p><p className="font-semibold tabular-nums text-foreground">{st?.orders ?? 0}</p></div>
                  <div><p className="text-faint-foreground">Store sales</p><p className="font-semibold tabular-nums text-foreground">{formatGHS(st?.sales ?? 0)}</p></div>
                  <div><p className="text-faint-foreground">Own buys</p><p className="font-semibold tabular-nums text-foreground">{formatGHS(st?.own ?? 0)}</p></div>
                  <div><p className="text-faint-foreground">Balance</p><p className={`font-semibold tabular-nums ${Number(g.earnings_balance) > 0 ? "text-primary-glow" : "text-foreground"}`}>{formatGHS(Number(g.earnings_balance))}</p></div>
                </div>
              </li>); })}
          </Rows>
        </Panel>
        </>
      )}

      {tab === "subscriptions" && (<>
        <StatGrid cols={4}>
          <Stat loading={loading} label="Active" value={String(agents.filter((g) => g.status === "active").length)} tone="good" />
          <Stat loading={loading} label="Expiring in 7 days" value={String(agents.filter((g) => g.status === "active" && g.paid_until && new Date(g.paid_until) <= new Date(Date.now() + 7 * 86400000)).length)} note="reminders go out 3 days before and on the day" tone="warn" />
          <Stat loading={loading} label="Paused (unpaid)" value={String(agents.filter((g) => g.status === "paused").length)} note="store closed until they pay" />
          <Stat loading={loading} label="Collected" value={<Money value={subs.filter((x) => x.status === "succeeded").reduce((a, x) => a + Number(x.amount), 0)} />} note={`${subs.filter((x) => x.status === "succeeded").length} payments · ${subs.filter((x) => x.status === "succeeded" && Number(x.metadata?.percent_off ?? 0) > 0).length} on promo`} tone="good" />
        </StatGrid>
        <Panel title="Who's paid until when" note="active and paused agents">
          <Rows empty={loading ? "Loading…" : "No agents yet."}>
            {agents.filter((g) => g.status !== "awaiting_payment").sort((a, b) => (a.paid_until ?? "").localeCompare(b.paid_until ?? "")).map((g) => { const days = g.paid_until ? Math.ceil((+new Date(g.paid_until) - Date.now()) / 86400000) : null; return <Row key={g.id} primary={<>{g.store_name} <Pill tone={g.status === "active" ? "good" : "warn"}>{g.status}</Pill></>} secondary={`${emails.get(g.user_id) ?? "—"} · /s/${g.slug}`} right={g.paid_until ?? "—"} rightNote={days == null ? "" : days < 0 ? `${-days} days overdue` : days === 0 ? "ends today" : `${days} days left`} tone={days != null && days <= 3 ? "warn" : "default"} />; })}
          </Rows>
        </Panel>
        {grants.length > 0 && (
          <Panel title="Complimentary months" note="given by the master admin · not counted as income">
            <Rows empty="">{grants.map((x) => <Row key={x.id} primary={agents.find((g) => g.id === x.agent_id)?.store_name ?? "—"} secondary={`${x.from_date} → ${x.until_date} · ${formatAdminDate(x.created_at)}${x.note ? ` · ${x.note}` : ""}`} right={`${x.months} month${x.months === 1 ? "" : "s"}`} rightNote="free" tone="muted" />)}</Rows>
          </Panel>
        )}
        <Panel title="Payments" note="every subscription payment, newest first">
          <Rows empty={loading ? "Loading…" : "No payments yet."}>
            {subs.map((x) => <Row key={x.provider_reference} primary={<>{agents.find((g) => g.id === x.metadata?.agent_id)?.store_name ?? emails.get(x.user_id ?? "") ?? "—"} <Pill tone={x.status === "succeeded" ? "good" : x.status === "pending" ? "warn" : "muted"}>{x.status}</Pill></>} secondary={`${formatAdminDate(x.verified_at ?? x.created_at)} · ${x.provider_reference}${Number(x.metadata?.percent_off ?? 0) > 0 ? ` · ${x.metadata?.percent_off}% promo` : ""}`} right={formatGHS(Number(x.amount))} />)}
          </Rows>
        </Panel>
      </>)}

      {tab === "payouts" && (<>
        <StatGrid cols={3}>
          <Stat loading={loading} label="Waiting to be paid" value={<Money value={payTotals.waiting} />} note={`${payoutsWaiting} request${payoutsWaiting === 1 ? "" : "s"} · send by MoMo, then mark paid`} tone={payoutsWaiting ? "warn" : "default"} />
          <Stat loading={loading} label="Paid out (all time)" value={<Money value={payTotals.paid} />} note={`${payouts.filter((p) => p.status === "paid").length} payments`} tone="good" />
          <Stat loading={loading} label="Fees earned" value={<Money value={payTotals.fees} />} note="1% on each payout" tone="good" />
        </StatGrid>
        <Segmented<"waiting" | "paid" | "rejected" | "all"> value={payFilter} onChange={setPayFilter} options={[{ value: "waiting", label: `Waiting (${payoutsWaiting})` }, { value: "paid", label: "Paid" }, { value: "rejected", label: "Rejected" }, { value: "all", label: "All" }]} />
        <Panel title="Payment requests" note="tap a request for the agent's details">
          <Rows empty={loading ? "Loading…" : payFilter === "waiting" ? "Nothing waiting. Agents' withdrawal requests appear here." : "No payments here."}>
            {visiblePayouts.map((p) => { const g = agentOf(p.agent_id); return (
              <li key={p.id} className="py-2">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => g && navigate(`/admin/agents/${g.id}`)}>
                    <p className="text-[12.5px] font-semibold text-foreground">{g?.store_name ?? "—"} <Pill tone={p.status === "paid" ? "good" : p.status === "rejected" ? "muted" : "warn"}>{p.status === "requested" ? "waiting" : p.status}</Pill></p>
                    <p className="text-[11px] text-faint-foreground">{emails.get(g?.user_id ?? "") ?? "—"} · requested {formatAdminDate(p.created_at)}{p.paid_at ? ` · paid ${formatAdminDate(p.paid_at)}` : ""}{p.paid_reference ? ` · ref ${p.paid_reference}` : ""}{p.note ? ` · ${p.note}` : ""}</p>
                    <div className="mt-1.5 grid grid-cols-4 gap-2 text-[11px]">
                      <div><p className="text-faint-foreground">Requested</p><p className="font-semibold tabular-nums text-foreground">{formatGHS(Number(p.amount))}</p></div>
                      <div><p className="text-faint-foreground">Fee</p><p className="font-semibold tabular-nums text-foreground">{formatGHS(Number(p.fee))}</p></div>
                      <div><p className="text-faint-foreground">Send</p><p className="font-semibold tabular-nums text-primary-glow">{formatGHS(Number(p.net))}</p></div>
                      <div><p className="text-faint-foreground">To MoMo</p><p className="font-semibold tabular-nums text-foreground">{p.momo_number}</p><p className="truncate text-faint-foreground">{p.momo_name ?? ""}</p></div>
                    </div>
                  </div>
                  {(p.status === "requested" || p.status === "approved") && <div className="flex shrink-0 gap-1.5"><Button size="sm" onClick={() => { setPaying(p); setPayRef(""); }}>Mark paid</Button><Button size="sm" variant="quiet" onClick={() => { setRejecting(p); setRejectNote(""); }}>Reject</Button></div>}
                </div>
              </li>); })}
          </Rows>
        </Panel>
      </>)}

      {tab === "promos" && (<>
        <Panel title="Monthly plan" icon={BadgePercent} note="what agents pay and how payouts work">
          {planDraft && <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Monthly fee (GH₵)"><input inputMode="decimal" value={planDraft.monthly_price} onChange={(e) => setPlanDraft({ ...planDraft, monthly_price: Number(e.target.value) })} className={inputCls} /></Field>
            <Field label="Payout minimum (GH₵)"><input inputMode="decimal" value={planDraft.payout_minimum} onChange={(e) => setPlanDraft({ ...planDraft, payout_minimum: Number(e.target.value) })} className={inputCls} /></Field>
            <Field label="Payout fee (%)"><input inputMode="decimal" value={planDraft.payout_fee_rate * 100} onChange={(e) => setPlanDraft({ ...planDraft, payout_fee_rate: Number(e.target.value) / 100 })} className={inputCls} /></Field>
            <Field label="Payout fee minimum (GH₵)"><input inputMode="decimal" value={planDraft.payout_fee_minimum} onChange={(e) => setPlanDraft({ ...planDraft, payout_fee_minimum: Number(e.target.value) })} className={inputCls} /></Field>
            <Field label="Popup after (seconds)"><input inputMode="numeric" value={planDraft.popup_delay_seconds} onChange={(e) => setPlanDraft({ ...planDraft, popup_delay_seconds: Number(e.target.value) })} className={inputCls} /></Field>
          </div>}
          <div className="mt-3 flex justify-end"><Button size="sm" onClick={() => void savePlan()} disabled={!isMaster}>{isMaster ? "Save" : "Master admin only"}</Button></div>
        </Panel>
        <Panel title="Promos" note="percentage off the monthly fee">
          <Rows empty="No promos.">{promos.map((p) => <Row key={p.id} onClick={() => setEditPromo(p)} primary={<>{p.name} <Pill tone={p.is_active && (!p.ends_at || new Date(p.ends_at) > new Date()) ? "good" : "muted"}>{p.is_active ? "active" : "off"}</Pill></>} secondary={`${p.ends_at ? `ends ${formatAdminDate(p.ends_at)}` : "no end date"}${p.max_uses ? ` · ${p.uses}/${p.max_uses} used` : ` · ${p.uses} used`}`} right={`${p.percent_off}% off`} rightNote={plan ? `pays ${formatGHS(plan.monthly_price * (1 - p.percent_off / 100))}` : ""} />)}</Rows>
          <div className="mt-2 flex justify-end"><Button size="sm" variant="soft" onClick={() => setEditPromo({ name: "", percent_off: 40, is_active: true })}>New promo</Button></div>
        </Panel>
      </>)}

      {tab === "launch" && (<>
        <Panel title="Email check" note="sends a test to your own address and shows the mail service's reply">
          <div className="flex items-center justify-between gap-3"><p className="text-[12.5px] text-muted-foreground">Approval, decline and renewal emails all go through this. If it fails here, none of them are arriving.</p><Button size="sm" variant="soft" onClick={async () => { const { data, error } = await supabase.functions.invoke<{ resend?: unknown; hasKey?: boolean; from?: string; error?: string }>("agent-admin", { body: { action: "test_email" } }); setEmailTest(error ? { error: error.message } : data); }}>Send test</Button></div>
          {emailTest && <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-white/[0.03] p-2 text-[11px] text-muted-foreground">{JSON.stringify(emailTest, null, 2)}</pre>}
        </Panel>
        <Panel title="Launch switch" icon={Rocket} note={launched ? "agents are live" : "agents are hidden"}>
          <p className="text-[12.5px] text-muted-foreground">Turning this on does three things at once: public prices change to the pending list, the apply page and popup appear, and active agents' stores open. Turning it off hides everything again but leaves prices where they are.</p>
          <div className="mt-3 flex justify-end">{isMaster ? <Button onClick={() => void flip(!launched)} variant={launched ? "quiet" : "primary"}>{launched ? "Switch agents off" : "Launch agents"}</Button> : <p className="text-[12px] text-faint-foreground">Only the master admin can flip this.</p>}</div>
        </Panel>
      </>)}

      <AdminRecordModal open={viewing !== null} onClose={() => setViewing(null)} title={viewing?.full_name ?? "Application"} subtitle={viewing ? `${viewing.status} · applied ${formatAdminDate(viewing.created_at)}` : ""} fields={viewing ? [
        { label: "Phone", value: viewing.phone }, { label: "WhatsApp", value: viewing.whatsapp ?? "Same as phone" }, { label: "Email", value: emails.get(viewing.user_id) ?? "—" }, { label: "Town / area", value: viewing.town ?? "—" }, { label: "How they'll sell", value: viewing.pitch ?? "—" },
        ...(viewing.reviewed_at ? [{ label: "Reviewed", value: formatAdminDate(viewing.reviewed_at) }] : []), ...(viewing.decline_reason ? [{ label: "Decline reason", value: viewing.decline_reason }] : []),
      ] : []}>
        {viewing?.status === "pending" && <div className="flex justify-end gap-2"><Button variant="quiet" onClick={() => { setDeclining(viewing); setReason(""); setViewing(null); }}>Decline</Button><Button onClick={() => { void review(viewing, true); setViewing(null); }} disabled={busy}>Approve</Button></div>}
      </AdminRecordModal>
      <Modal open={declining !== null} onClose={() => setDeclining(null)} label="Decline application">
        <div className="w-[min(92vw,400px)] p-5">
          <h2 className="text-[16px] font-semibold text-foreground">Decline {declining?.full_name}</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">They get an email. Add a reason if you want them to see one.</p>
          <div className="mt-3"><Field label="Reason (optional)"><input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} /></Field></div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="quiet" onClick={() => setDeclining(null)}>Cancel</Button><Button onClick={() => declining && void review(declining, false)} disabled={busy}>Decline</Button></div>
        </div>
      </Modal>
      <Modal open={making} onClose={() => setMaking(false)} label="Make someone an agent">
        <div className="w-[min(92vw,400px)] p-5">
          <h2 className="text-[16px] font-semibold text-foreground">Make someone an agent</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Any DataYego account. They skip the application and get free months — recorded as complimentary, not as income. Their store opens straight away.</p>
          <div className="mt-3 grid gap-2">
            <Field label="Account email"><input inputMode="email" value={makeEmail} onChange={(e) => setMakeEmail(e.target.value)} placeholder="name@gmail.com" className={inputCls} /></Field>
            <Field label="Free months"><select value={makeMonths} onChange={(e) => setMakeMonths(e.target.value)} className={inputCls}><option value="1">1 month</option><option value="2">2 months</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">1 year</option></select></Field>
            <Field label="Note (optional)"><input value={makeNote} onChange={(e) => setMakeNote(e.target.value)} placeholder="e.g. partner, test account" className={inputCls} /></Field>
          </div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="quiet" onClick={() => setMaking(false)}>Cancel</Button><Button onClick={() => void makeAgent()}>Make agent</Button></div>
        </div>
      </Modal>
      <Modal open={granting !== null} onClose={() => setGranting(null)} label="Give months">
        <div className="w-[min(92vw,400px)] p-5">
          <h2 className="text-[16px] font-semibold text-foreground">Give {granting?.store_name} free months</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Extends their plan without a payment. It's recorded as complimentary, not as income, so Finance stays true.{granting?.paid_until ? ` Currently covered until ${granting.paid_until}; months add on from there.` : ""}</p>
          <div className="mt-3 grid gap-2">
            <Field label="How long"><select value={grantMonths} onChange={(e) => setGrantMonths(e.target.value)} className={inputCls}><option value="1">1 month</option><option value="2">2 months</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">1 year</option></select></Field>
            <Field label="Note (optional)"><input value={grantNote} onChange={(e) => setGrantNote(e.target.value)} placeholder="e.g. partner, early supporter" className={inputCls} /></Field>
          </div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="quiet" onClick={() => setGranting(null)}>Cancel</Button><Button onClick={() => void grant()}>Give</Button></div>
        </div>
      </Modal>
      <Modal open={rejecting !== null} onClose={() => setRejecting(null)} label="Reject payment">
        <div className="w-[min(92vw,400px)] p-5">
          <h2 className="text-[16px] font-semibold text-foreground">Reject · {rejecting ? formatGHS(Number(rejecting.amount)) : ""}</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">The money goes back to their earnings and they get an email. Say why so they can fix it.</p>
          <div className="mt-3"><Field label="Reason"><input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="e.g. MoMo number doesn't match the name" className={inputCls} /></Field></div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="quiet" onClick={() => setRejecting(null)}>Cancel</Button><Button onClick={() => rejecting && void settle(rejecting, "reject", undefined, rejectNote.trim() || undefined)}>Reject</Button></div>
        </div>
      </Modal>
      <Modal open={paying !== null} onClose={() => setPaying(null)} label="Mark payout paid">
        <div className="w-[min(92vw,400px)] p-5">
          <h2 className="text-[16px] font-semibold text-foreground">Mark paid · {paying ? formatGHS(Number(paying.net)) : ""}</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Only after you've actually sent <b className="text-foreground">{paying ? formatGHS(Number(paying.net)) : ""}</b> to <b className="text-foreground">{paying?.momo_number}</b>{paying?.momo_name ? ` (${paying.momo_name})` : ""}. This books it, takes it out of the pot, and emails the agent a receipt.</p>
          <div className="mt-3"><Field label="MoMo transaction reference (optional)"><input value={payRef} onChange={(e) => setPayRef(e.target.value)} className={inputCls} /></Field></div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="quiet" onClick={() => setPaying(null)}>Cancel</Button><Button onClick={() => paying && void settle(paying, "paid", payRef.trim() || undefined)}>Mark paid</Button></div>
        </div>
      </Modal>
      <Modal open={editPromo !== null} onClose={() => setEditPromo(null)} label="Promo">
        <div className="w-[min(92vw,400px)] p-5 space-y-2">
          <h2 className="text-[16px] font-semibold text-foreground">{editPromo?.id ? "Edit promo" : "New promo"}</h2>
          <Field label="Name"><input value={editPromo?.name ?? ""} onChange={(e) => setEditPromo({ ...editPromo, name: e.target.value })} className={inputCls} /></Field>
          <Field label="Percent off"><input inputMode="decimal" value={editPromo?.percent_off ?? ""} onChange={(e) => setEditPromo({ ...editPromo, percent_off: Number(e.target.value) })} className={inputCls} /></Field>
          <Field label="Ends (optional)"><input type="datetime-local" value={editPromo?.ends_at ? editPromo.ends_at.slice(0, 16) : ""} onChange={(e) => setEditPromo({ ...editPromo, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className={inputCls} /></Field>
          <Field label="Max uses (optional)"><input inputMode="numeric" value={editPromo?.max_uses ?? ""} onChange={(e) => setEditPromo({ ...editPromo, max_uses: e.target.value ? Number(e.target.value) : null })} className={inputCls} /></Field>
          <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={editPromo?.is_active ?? true} onChange={(e) => setEditPromo({ ...editPromo, is_active: e.target.checked })} /> Active</label>
          <div className="mt-3 flex justify-end gap-2"><Button variant="quiet" onClick={() => setEditPromo(null)}>Cancel</Button><Button onClick={() => void savePromo()}>Save</Button></div>
        </div>
      </Modal>
    </div>
  );
}
