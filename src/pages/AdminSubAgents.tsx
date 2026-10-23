import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Network, Search, Settings, Store, UserCheck, Users } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Field, Money, Panel, Pill, Row, Rows, Segmented, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";

/* Sub-agents — agents recruited by a paid agent (the "parent"), free. The sub gets their own store and buys at the
   price the parent sets for agents; the parent earns that margin, DataYego earns its normal agent-price margin.
   This section is the admin's window into all of it: who runs a programme, who sells under whom, the applications
   funnel, and the master switch. */

type Tab = "overview" | "performance" | "parents" | "subs" | "applications" | "settings";
const TAB_PATH: Record<Tab, string> = { overview: "/admin/sub-agents", performance: "/admin/sub-agents/performance", parents: "/admin/sub-agents/parents", subs: "/admin/sub-agents/list", applications: "/admin/sub-agents/applications", settings: "/admin/sub-agents/settings" };
const TAB_TITLE: Record<Tab, string> = { overview: "Sub-agents", performance: "Performance", parents: "Parents", subs: "All sub-agents", applications: "Applications", settings: "Settings" };
type Period = "7d" | "30d" | "month" | "all";

interface Overview { tier: { enabled: boolean; allow: string[] } | null; parents: { programmes_on: number; with_subs: number; paused: number }; subs: { total: number; active: number; awaiting_payment: number; lapsed: number; suspended: number; new_in_period: number }; applications: { pending: number; approved: number; declined: number }; fees: { count: number; gross: number; to_parents: number; ours: number }; sales: { orders: number; amount: number; parent_margin: number; sub_margin: number; our_cost: number }; errors: number }
interface Parent { id: string; slug: string; store_name: string; status: string; paid_until: string | null; network_on: boolean; network_fee: number; network_auto_approve: boolean; network_paused_at: string | null; network_paused_reason: string | null; created_at: string; tier_open: boolean; subs_total: number; subs_active: number; pending_apps: number; fee_income: number; margin_income: number; sub_sales: number; sub_orders: number }
interface Sub { id: string; slug: string; store_name: string; status: string; paid_until: string | null; created_at: string; whatsapp: string | null; user_id: string; earnings_balance: number; parent_id: string; parent_slug: string; parent_name: string; parent_fee: number; email: string | null; orders: number; sales: number; parent_margin: number; own_margin: number; fees_paid: number; last_order_at: string | null }
interface Application { id: string; status: "pending" | "approved" | "declined"; applicant_name: string | null; applicant_email: string | null; applicant_phone: string | null; store_name: string; requested_slug: string; whatsapp: string | null; answers: Array<{ label: string; answer: string }> | null; decision_note: string | null; decided_at: string | null; agent_id: string | null; created_at: string; parent_id: string; parent_slug: string; parent_name: string; parent_fee: number; network_auto_approve: boolean; agent_slug: string | null }
interface AgentLite { id: string; slug: string; store_name: string; status: string }
interface SubPerf { id: string; slug: string; store_name: string; status: string; parent_id: string; parent_name: string; parent_slug: string; orders: number; delivered: number; sales: number; parent_margin: number; own_margin: number; last_order_at: string | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any; rpc: (f: string, a?: Record<string, unknown>) => any };
const periodFrom = (p: Period) => { const d = new Date(); if (p === "7d") d.setDate(d.getDate() - 7); else if (p === "30d") d.setDate(d.getDate() - 30); else if (p === "month") d.setDate(1); else return null; d.setHours(0, 0, 0, 0); return d.toISOString(); };
const statusTone = (s: string) => s === "active" ? "good" : s === "awaiting_payment" ? "warn" : s === "suspended" ? "bad" : "muted";
const readable = (s: string) => s.replace(/_/g, " ");
const err = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)).replace(/_/g, " ");

export default function AdminSubAgents() {
  const location = useLocation(); const navigate = useNavigate();
  const tab = useMemo<Tab>(() => (Object.entries(TAB_PATH).find(([, p]) => location.pathname === p || (p !== "/admin/sub-agents" && location.pathname.startsWith(p)))?.[0] as Tab) ?? "overview", [location.pathname]);
  const [period, setPeriod] = useState<Period>("30d");
  const [loading, setLoading] = useState(true);
  const [ov, setOv] = useState<Overview | null>(null);
  const [parents, setParents] = useState<Parent[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [search, setSearch] = useState("");
  const [perf, setPerf] = useState<SubPerf[]>([]);

  const load = useCallback(async () => {
    const [o, p, s, a, al, pf] = await Promise.all([
      db().rpc("admin_network_overview", { p_from: periodFrom(period), p_to: null }),
      db().rpc("admin_network_parents"), db().rpc("admin_network_subs"), db().rpc("admin_network_applications", { p_status: null }),
      db().from("agents").select("id, slug, store_name, status").is("parent_agent_id", null).order("store_name"),
      db().rpc("admin_network_sub_performance", { p_from: periodFrom(period), p_to: null }),
    ]);
    const first = [o, p, s, a, pf].find((r) => r.error); if (first?.error) toast.error(err(first.error));
    setOv((o.data as Overview) ?? null); setParents((p.data as Parent[]) ?? []); setSubs((s.data as Sub[]) ?? []); setApps((a.data as Application[]) ?? []); setAgents((al.data as AgentLite[]) ?? []);
    setPerf((pf.data as SubPerf[]) ?? []);
    setLoading(false);
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  const q = search.trim().toLowerCase();
  const match = (...xs: Array<string | null | undefined>) => !q || xs.some((x) => (x ?? "").toLowerCase().includes(q));
  const setTab = (t: Tab) => navigate(TAB_PATH[t]);
  const act = async (label: string, fn: () => Promise<{ error?: { message: string } | null }>) => { const { error } = await fn(); if (error) { toast.error(err(error)); return false; } toast.success(label); void load(); return true; };

  return (
    <div className="space-y-5">
      <AdminPageHeader title={TAB_TITLE[tab]} description="Agents recruited by a paid agent, free. Subs get their own store and buy at the price the parent sets for agents; the parent keeps that margin, we keep our usual agent-price margin." />
      <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: "overview", label: "Overview" }, { value: "performance", label: "Performance" }, { value: "parents", label: "Parents" }, { value: "subs", label: "Sub-agents" }, { value: "applications", label: `Applications${ov?.applications.pending ? ` (${ov.applications.pending})` : ""}` }, { value: "settings", label: "Settings" }]} />

      {tab === "overview" && <OverviewTab ov={ov} loading={loading} period={period} setPeriod={setPeriod} parents={parents} subs={subs} onTab={setTab} />}
      {tab === "performance" && <PerformanceTab perf={perf} loading={loading} period={period} setPeriod={setPeriod} search={search} setSearch={setSearch} match={match} />}
      {tab === "parents" && <ParentsTab parents={parents} loading={loading} search={search} setSearch={setSearch} match={match} act={act} />}
      {tab === "subs" && <SubsTab subs={subs} agents={agents} loading={loading} search={search} setSearch={setSearch} match={match} act={act} />}
      {tab === "applications" && <ApplicationsTab apps={apps} loading={loading} search={search} setSearch={setSearch} match={match} />}
      {tab === "settings" && <SettingsTab ov={ov} agents={agents} act={act} />}
    </div>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────────────────────── */
function OverviewTab({ ov, loading, period, setPeriod, parents, subs, onTab }: { ov: Overview | null; loading: boolean; period: Period; setPeriod: (p: Period) => void; parents: Parent[]; subs: Sub[]; onTab: (t: Tab) => void }) {
  const on = ov?.tier?.enabled || (ov?.tier?.allow?.length ?? 0) > 0;
  const topParents = parents.slice().sort((a, b) => (b.fee_income + b.margin_income) - (a.fee_income + a.margin_income)).slice(0, 5);
  const recentSubs = subs.slice(0, 6);
  return (
    <>
      {!on && <p className="rounded-xl border border-amber/25 bg-amber/[0.06] px-3 py-2 text-[12px] text-amber">The feature is switched off. Agents see "Coming soon" on their Agents page. Turn it on for everyone, or for chosen agents, under Settings.</p>}
      {(ov?.errors ?? 0) > 0 && <p className="rounded-xl border border-danger/25 bg-danger/[0.06] px-3 py-2 text-[12px] text-danger"><AlertTriangle size={13} className="-mt-0.5 mr-1 inline" />{ov!.errors} background error{ov!.errors === 1 ? "" : "s"} in this period (margin posting). Check phase1.system_errors.</p>}
      <StatGrid cols={4}>
        <Stat loading={loading} label="Programmes open" value={ov?.parents.programmes_on ?? 0} note={`${ov?.parents.with_subs ?? 0} parent${ov?.parents.with_subs === 1 ? "" : "s"} with agents · ${ov?.parents.paused ?? 0} paused`} icon={Network} onClick={() => onTab("parents")} />
        <Stat loading={loading} label="Sub-agents" value={ov?.subs.total ?? 0} note={`${ov?.subs.active ?? 0} active · ${ov?.subs.awaiting_payment ?? 0} unpaid · ${ov?.subs.lapsed ?? 0} lapsed`} icon={Users} onClick={() => onTab("subs")} tone={ov?.subs.awaiting_payment ? "warn" : "default"} />
        <Stat loading={loading} label="Applications waiting" value={ov?.applications.pending ?? 0} note={`${ov?.applications.approved ?? 0} approved · ${ov?.applications.declined ?? 0} declined this period`} icon={UserCheck} onClick={() => onTab("applications")} tone={ov?.applications.pending ? "warn" : "default"} />
        <Stat loading={loading} label="New subs this period" value={ov?.subs.new_in_period ?? 0} icon={Store} tone="muted" />
      </StatGrid>
      <Segmented<Period> value={period} onChange={setPeriod} options={[{ value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "month", label: "This month" }, { value: "all", label: "All time" }]} />
      <div className="grid gap-3">
        <Panel title="Sales by sub-agents" icon={Store} note="delivered orders from sub stores">
          <StatGrid cols={3}>
            <Stat loading={loading} label="Sales" value={<Money value={ov?.sales.amount} />} note={`${ov?.sales.orders ?? 0} order${ov?.sales.orders === 1 ? "" : "s"}`} />
            <Stat loading={loading} label="Parents earned" value={<Money value={ov?.sales.parent_margin} />} note="margin between their price and ours" tone="muted" />
            <Stat loading={loading} label="Subs earned" value={<Money value={ov?.sales.sub_margin} />} note="their own markup" tone="muted" />
          </StatGrid>
          <p className="mt-2 text-[11px] text-faint-foreground">Our side of these orders is the normal agent-price margin: sales − parents' margin − subs' margin − bundle cost {ov ? `= ${formatGHS(Number(ov.sales.amount) - Number(ov.sales.parent_margin) - Number(ov.sales.sub_margin) - Number(ov.sales.our_cost))}` : ""}.</p>
        </Panel>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Top parents" icon={Network} action={<Button variant="ghost" size="sm" onClick={() => onTab("parents")}>All parents</Button>}>
          <Rows empty={loading ? "Loading…" : "No parent has a programme yet."}>{topParents.map((p) => <Row key={p.id} primary={<>{p.store_name} {p.network_paused_at ? <Pill tone="bad">paused by admin</Pill> : p.network_on ? <Pill tone="good">open</Pill> : <Pill>closed</Pill>}</>} secondary={`${p.subs_active}/${p.subs_total} active agents · ${p.pending_apps} waiting`} right={formatGHS(Number(p.margin_income))} rightNote="margin from agents" />)}</Rows>
        </Panel>
        <Panel title="Newest sub-agents" icon={Users} action={<Button variant="ghost" size="sm" onClick={() => onTab("subs")}>All sub-agents</Button>}>
          <Rows empty={loading ? "Loading…" : "No sub-agents yet."}>{recentSubs.map((s) => <Row key={s.id} primary={<>{s.store_name} <Pill tone={statusTone(s.status)}>{readable(s.status)}</Pill></>} secondary={`under ${s.parent_name} · joined ${formatAdminDate(s.created_at)}`} right={formatGHS(Number(s.sales))} rightNote={`${s.orders} orders`} />)}</Rows>
        </Panel>
      </div>
    </>
  );
}

/* ── Performance ──────────────────────────────────────────────────────────────────────────── */
function PerformanceTab({ perf, loading, period, setPeriod, search, setSearch, match }: { perf: SubPerf[]; loading: boolean; period: Period; setPeriod: (p: Period) => void; search: string; setSearch: (s: string) => void; match: (...xs: Array<string | null | undefined>) => boolean }) {
  const groups = useMemo(() => {
    const list = perf.filter((s) => match(s.store_name, s.slug, s.parent_name));
    const byParent = new Map<string, { parent_id: string; parent_name: string; parent_slug: string; subs: SubPerf[]; sales: number; orders: number; margin: number }>();
    for (const s of list) {
      const g = byParent.get(s.parent_id) ?? { parent_id: s.parent_id, parent_name: s.parent_name, parent_slug: s.parent_slug, subs: [], sales: 0, orders: 0, margin: 0 };
      g.subs.push(s); g.sales += Number(s.sales); g.orders += Number(s.orders); g.margin += Number(s.parent_margin);
      byParent.set(s.parent_id, g);
    }
    return [...byParent.values()].sort((a, b) => b.sales - a.sales);
  }, [perf, search]);
  const selling = perf.filter((s) => Number(s.orders) > 0).length;
  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Segmented<Period> value={period} onChange={setPeriod} options={[{ value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "month", label: "This month" }, { value: "all", label: "All time" }]} />
        <label className={`${inputCls} flex items-center gap-2 !py-1.5 sm:w-64`}><Search size={13} className="shrink-0 text-faint-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Store or parent" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none" /></label>
      </div>
      <StatGrid cols={3}>
        <Stat loading={loading} label="Sub-agents selling" value={selling} note={`of ${perf.length} total, this period`} icon={Store} />
        <Stat loading={loading} label="Sub-agent sales" value={<Money value={perf.reduce((a, s) => a + Number(s.sales), 0)} />} note={`${perf.reduce((a, s) => a + Number(s.orders), 0)} paid orders`} icon={Users} />
        <Stat loading={loading} label="Parents earned" value={<Money value={perf.reduce((a, s) => a + Number(s.parent_margin), 0)} />} note="margin on delivered orders" icon={Network} tone="muted" />
      </StatGrid>
      {loading ? <p className="text-[12.5px] text-muted-foreground">Loading…</p> : groups.length === 0 ? <p className="text-[12.5px] text-muted-foreground">No sub-agents match.</p> : groups.map((g) => (
        <Panel key={g.parent_id} title={g.parent_name} icon={Network} note={`${g.parent_slug}.datayego.com · ${g.subs.length} sub-agent${g.subs.length === 1 ? "" : "s"}`}
          action={<span className="text-[12px] text-muted-foreground">{g.orders} orders · <b className="text-foreground">{formatGHS(g.sales)}</b> sales · parent earned <b className="text-foreground">{formatGHS(g.margin)}</b></span>}>
          <Rows empty="No sub-agents.">{g.subs.sort((a, b) => Number(b.sales) - Number(a.sales)).map((s) => (
            <Row key={s.id} onClick={() => { window.location.href = `/admin/agents/${s.id}`; }}
              primary={<>{s.store_name} <span className="text-faint-foreground">· {s.slug}</span> <Pill tone={statusTone(s.status)}>{readable(s.status)}</Pill> {Number(s.orders) === 0 && <Pill tone="muted">no sales</Pill>}</>}
              secondary={`${s.orders} paid · ${s.delivered} delivered${s.last_order_at ? ` · last ${formatAdminDate(s.last_order_at)}` : ""} · their markup ${formatGHS(Number(s.own_margin))}`}
              right={formatGHS(Number(s.sales))} rightNote={`parent earned ${formatGHS(Number(s.parent_margin))}`} />
          ))}</Rows>
        </Panel>
      ))}
    </>
  );
}

/* ── Parents ──────────────────────────────────────────────────────────────────────────────── */
function ParentsTab({ parents, loading, search, setSearch, match, act }: { parents: Parent[]; loading: boolean; search: string; setSearch: (s: string) => void; match: (...xs: Array<string | null | undefined>) => boolean; act: (label: string, fn: () => Promise<{ error?: { message: string } | null }>) => Promise<boolean> }) {
  const [sel, setSel] = useState<Parent | null>(null); const [reason, setReason] = useState("");
  const list = parents.filter((p) => match(p.store_name, p.slug));
  const pause = async (p: Parent, on: boolean) => { if (on && !window.confirm(`Pause ${p.store_name}'s agent programme? Their Join page disappears and they can't reopen it until you unpause. Their existing agents keep selling.`)) return; await act(on ? "Programme paused." : "Programme reopened.", () => db().rpc("admin_network_pause", { p_parent: p.id, p_pause: on, p_reason: reason || null })); setSel(null); setReason(""); };
  return (
    <>
      <label className={`${inputCls} flex items-center gap-2 !py-1.5`}><Search size={13} className="shrink-0 text-faint-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search parents" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none" /></label>
      <Panel title="Parents" icon={Network} note="agents who run, or have run, a programme">
        <Rows empty={loading ? "Loading…" : "Nobody has opened a programme yet."}>{list.map((p) => (
          <Row key={p.id} onClick={() => setSel(p)} primary={<>{p.store_name} <span className="text-faint-foreground">· {p.slug}</span> {p.network_paused_at ? <Pill tone="bad">paused by admin</Pill> : p.network_on ? <Pill tone="good">open</Pill> : <Pill>closed</Pill>} {!p.tier_open && !p.network_paused_at && <Pill tone="warn">feature off for them</Pill>}</>}
            secondary={`${p.subs_active}/${p.subs_total} active agents · ${p.pending_apps} waiting${p.network_auto_approve ? " · auto-approve" : ""} · agents' sales ${formatGHS(Number(p.sub_sales))}`}
            right={formatGHS(Number(p.margin_income))} rightNote="margin from agents" />
        ))}</Rows>
      </Panel>
      <Modal open={!!sel} onClose={() => setSel(null)} label={sel?.store_name ?? "Parent"}>
        {sel && <div className="space-y-4 p-1">
          <div><h3 className="text-[16px] font-semibold text-foreground">{sel.store_name}</h3><p className="text-[12px] text-muted-foreground">{sel.slug}.datayego.com · plan {readable(sel.status)}{sel.paid_until ? ` until ${formatAdminDate(sel.paid_until)}` : ""}</p></div>
          <StatGrid cols={3}><Stat label="Agents" value={`${sel.subs_active}/${sel.subs_total}`} note="active / all" /><Stat label="Margin income" value={<Money value={sel.margin_income} />} note="on delivered agent orders" /><Stat label="Agents' sales" value={<Money value={sel.sub_sales} />} note={`${sel.sub_orders} orders`} /></StatGrid>
          <div className="grid gap-1 text-[12.5px] text-muted-foreground"><p>{sel.network_auto_approve ? "Approves applications automatically" : "Reviews each application"} · agents join free</p><p>Programme: <b className="text-foreground">{sel.network_paused_at ? `paused by admin on ${formatAdminDate(sel.network_paused_at)}${sel.network_paused_reason ? ` — ${sel.network_paused_reason}` : ""}` : sel.network_on ? "open to new agents" : "closed by the parent"}</b></p></div>
          {sel.network_paused_at
            ? <Button size="sm" onClick={() => void pause(sel, false)}>Unpause programme</Button>
            : <div className="space-y-2"><Field label="Reason (shown to nobody; for your records)"><input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="e.g. complaints from their agents" /></Field><Button size="sm" variant="ghost" onClick={() => void pause(sel, true)}>Pause programme</Button></div>}
          <Button size="sm" variant="ghost" onClick={() => { window.location.href = `/admin/agents/${sel.id}`; }}>Open agent record</Button>
        </div>}
      </Modal>
    </>
  );
}

/* ── Sub-agents ───────────────────────────────────────────────────────────────────────────── */
function SubsTab({ subs, agents, loading, search, setSearch, match, act }: { subs: Sub[]; agents: AgentLite[]; loading: boolean; search: string; setSearch: (s: string) => void; match: (...xs: Array<string | null | undefined>) => boolean; act: (label: string, fn: () => Promise<{ error?: { message: string } | null }>) => Promise<boolean> }) {
  const [filter, setFilter] = useState<"all" | "active" | "awaiting_payment" | "lapsed" | "suspended">("all");
  const [sel, setSel] = useState<Sub | null>(null); const [moveTo, setMoveTo] = useState("");
  const list = subs.filter((s) => (filter === "all" || (filter === "lapsed" ? ["lapsed", "paused"].includes(s.status) : s.status === filter)) && match(s.store_name, s.slug, s.parent_name, s.email, s.whatsapp));
  const close = () => { setSel(null); setMoveTo(""); };
  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Segmented<"all" | "active" | "awaiting_payment" | "lapsed" | "suspended"> value={filter} onChange={setFilter} options={[{ value: "all", label: `All (${subs.length})` }, { value: "active", label: "Active" }, { value: "awaiting_payment", label: "Unpaid" }, { value: "lapsed", label: "Lapsed" }, { value: "suspended", label: "Suspended" }]} />
        <label className={`${inputCls} flex items-center gap-2 !py-1.5 sm:w-64`}><Search size={13} className="shrink-0 text-faint-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Store, parent, email, phone" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none" /></label>
      </div>
      <Panel title="Sub-agents" icon={Users}>
        <Rows empty={loading ? "Loading…" : "No sub-agents match."}>{list.map((s) => (
          <Row key={s.id} onClick={() => setSel(s)} primary={<>{s.store_name} <span className="text-faint-foreground">· {s.slug}</span> <Pill tone={statusTone(s.status)}>{readable(s.status)}</Pill></>}
            secondary={`under ${s.parent_name} · ${s.orders} orders · joined ${formatAdminDate(s.created_at)}`}
            right={formatGHS(Number(s.sales))} rightNote={`parent earned ${formatGHS(Number(s.parent_margin))}`} />
        ))}</Rows>
      </Panel>
      <Modal open={!!sel} onClose={close} label={sel?.store_name ?? "Sub-agent"}>
        {sel && <div className="space-y-4 p-1">
          <div><h3 className="text-[16px] font-semibold text-foreground">{sel.store_name} <Pill tone={statusTone(sel.status)}>{readable(sel.status)}</Pill></h3><p className="text-[12px] text-muted-foreground">{sel.slug}.datayego.com · under <b>{sel.parent_name}</b> · free</p><p className="text-[12px] text-muted-foreground">{sel.email ?? "no email"}{sel.whatsapp ? ` · ${sel.whatsapp}` : ""} · joined {formatAdminDate(sel.created_at)}</p></div>
          <StatGrid cols={3}><Stat label="Sales" value={<Money value={sel.sales} />} note={`${sel.orders} orders`} /><Stat label="Their markup" value={<Money value={sel.own_margin} />} note={`balance ${formatGHS(Number(sel.earnings_balance))}`} /><Stat label="Parent earned" value={<Money value={sel.parent_margin} />} note="margin on their orders" /></StatGrid>
          {sel.last_order_at && <p className="text-[12px] text-muted-foreground">Last order {formatAdminDate(sel.last_order_at)}</p>}
          <div className="grid gap-3">
            <Field label="Move under another parent"><div className="flex gap-2"><select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className={inputCls}><option value="">choose…</option>{agents.filter((a) => a.id !== sel.parent_id && a.id !== sel.id).map((a) => <option key={a.id} value={a.id}>{a.store_name} ({a.slug})</option>)}</select><Button size="sm" disabled={!moveTo} onClick={() => { const t = agents.find((a) => a.id === moveTo); if (t && window.confirm(`Move ${sel.store_name} under ${t.store_name}? Their prices below ${t.store_name}'s prices are raised to match.`)) void act("Moved.", () => db().rpc("admin_network_move_sub", { p_sub: sel.id, p_new_parent: moveTo })).then((ok) => ok && close()); }}>Move</Button></div></Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {sel.status === "suspended"
              ? <Button size="sm" onClick={() => void act("Reactivated.", () => db().rpc("admin_network_set_sub_status", { p_sub: sel.id, p_status: "active" })).then((ok) => ok && close())}>Reactivate</Button>
              : <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Suspend ${sel.store_name}? Their store stops taking orders until you reactivate.`)) void act("Suspended.", () => db().rpc("admin_network_set_sub_status", { p_sub: sel.id, p_status: "suspended" })).then((ok) => ok && close()); }}>Suspend</Button>}
            <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Detach ${sel.store_name} from ${sel.parent_name}? They become an ordinary agent who must buy the DataYego plan to keep selling; prices below our agent price are raised.`)) void act("Detached.", () => db().rpc("admin_network_move_sub", { p_sub: sel.id, p_new_parent: null })).then((ok) => ok && close()); }}>Detach from parent</Button>
            <Button size="sm" variant="ghost" onClick={() => { window.location.href = `/admin/agents/${sel.id}`; }}>Open agent record</Button>
          </div>
        </div>}
      </Modal>
    </>
  );
}

/* ── Applications ─────────────────────────────────────────────────────────────────────────── */
function ApplicationsTab({ apps, loading, search, setSearch, match }: { apps: Application[]; loading: boolean; search: string; setSearch: (s: string) => void; match: (...xs: Array<string | null | undefined>) => boolean }) {
  const [filter, setFilter] = useState<"pending" | "approved" | "declined" | "all">("pending");
  const [sel, setSel] = useState<Application | null>(null);
  const list = apps.filter((a) => (filter === "all" || a.status === filter) && match(a.applicant_name, a.applicant_email, a.store_name, a.requested_slug, a.parent_name));
  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Segmented<"pending" | "approved" | "declined" | "all"> value={filter} onChange={setFilter} options={[{ value: "pending", label: `Waiting (${apps.filter((a) => a.status === "pending").length})` }, { value: "approved", label: "Approved" }, { value: "declined", label: "Declined" }, { value: "all", label: "All" }]} />
        <label className={`${inputCls} flex items-center gap-2 !py-1.5 sm:w-64`}><Search size={13} className="shrink-0 text-faint-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, store, parent" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none" /></label>
      </div>
      <Panel title="Applications" icon={UserCheck} note="parents decide these; this is a read-only view">
        <Rows empty={loading ? "Loading…" : "No applications."}>{list.map((a) => (
          <Row key={a.id} onClick={() => setSel(a)} primary={<>{a.applicant_name ?? a.applicant_email ?? "Applicant"} → <b>{a.store_name}</b> <Pill tone={a.status === "approved" ? "good" : a.status === "declined" ? "bad" : "warn"}>{a.status}</Pill></>}
            secondary={`to ${a.parent_name} · ${formatAdminDate(a.created_at)}${a.decided_at ? ` · decided ${formatAdminDate(a.decided_at)}` : ""}${a.network_auto_approve ? " · auto-approve on" : ""}`} right={a.agent_slug ? `${a.agent_slug}.datayego.com` : undefined} />
        ))}</Rows>
      </Panel>
      <Modal open={!!sel} onClose={() => setSel(null)} label="Application">
        {sel && <div className="space-y-3 p-1">
          <div><h3 className="text-[16px] font-semibold text-foreground">{sel.applicant_name ?? "Applicant"} <Pill tone={sel.status === "approved" ? "good" : sel.status === "declined" ? "bad" : "warn"}>{sel.status}</Pill></h3><p className="text-[12px] text-muted-foreground">{sel.applicant_email ?? ""}{sel.applicant_phone ? ` · ${sel.applicant_phone}` : ""}{sel.whatsapp ? ` · WhatsApp ${sel.whatsapp}` : ""}</p></div>
          <p className="text-[12.5px] text-muted-foreground">Wants <b className="text-foreground">{sel.store_name}</b> ({sel.requested_slug}) under <b className="text-foreground">{sel.parent_name}</b> · applied {formatAdminDate(sel.created_at)}</p>
          {(sel.answers ?? []).filter((x) => x.answer).map((x, i) => <div key={i} className="rounded-lg border border-white/[0.07] p-2 text-[12.5px]"><p className="text-faint-foreground">{x.label}</p><p className="text-foreground">{x.answer}</p></div>)}
          {sel.decision_note && <p className="text-[12.5px] text-muted-foreground">Parent's note: <i>{sel.decision_note}</i></p>}
          {sel.agent_slug && <p className="text-[12.5px] text-muted-foreground">Store opened: <b className="text-foreground">{sel.agent_slug}.datayego.com</b></p>}
        </div>}
      </Modal>
    </>
  );
}

/* ── Settings ─────────────────────────────────────────────────────────────────────────────── */
function SettingsTab({ ov, agents, act }: { ov: Overview | null; agents: AgentLite[]; act: (label: string, fn: () => Promise<{ error?: { message: string } | null }>) => Promise<boolean> }) {
  const [enabled, setEnabled] = useState(false); const [allow, setAllow] = useState<string[]>([]); const [pick, setPick] = useState("");
  useEffect(() => { setEnabled(!!ov?.tier?.enabled); setAllow(ov?.tier?.allow ?? []); }, [ov]);
  const save = () => { if (enabled && !window.confirm("Open the sub-agent feature to every active agent? Each one can then start a programme from their dashboard.")) return; void act("Settings saved.", () => db().rpc("admin_network_set_tier", { p_enabled: enabled, p_allow: allow })); };
  const name = (id: string) => { const a = agents.find((x) => x.id === id); return a ? `${a.store_name} (${a.slug})` : id; };
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="Master switch" icon={Settings}>
        <label className="flex items-start justify-between gap-3 py-1"><span><span className="block text-[13px] font-semibold text-foreground">Open to all agents</span><span className="block text-[11.5px] text-muted-foreground">Every active agent sees "Build your own network" and can start recruiting. Off = only the agents listed on the right.</span></span><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="mt-1 h-5 w-5" /></label>
        <div className="mt-3 rounded-lg border border-white/[0.07] p-2.5 text-[11.5px] text-muted-foreground">
          <p className="font-semibold text-foreground">How the money works</p>
          <p className="mt-1">Sub-agents join free — no monthly fee to the parent or to us.</p>
          <p className="mt-1">Orders: the sub sells at their price and buys at the price the parent set for agents; the parent earns that gap, we earn our usual agent-price margin. Subs never pay the DataYego plan.</p>
          <p className="mt-1">Sub-agents cannot recruit their own agents (one level only).</p>
        </div>
      </Panel>
      <Panel title="Allowed agents" icon={Users} note="who can run a programme while the switch is off">
        <div className="flex gap-2"><select value={pick} onChange={(e) => setPick(e.target.value)} className={inputCls}><option value="">choose an agent…</option>{agents.filter((a) => !allow.includes(a.id)).map((a) => <option key={a.id} value={a.id}>{a.store_name} ({a.slug}) · {readable(a.status)}</option>)}</select><Button size="sm" disabled={!pick} onClick={() => { setAllow([...allow, pick]); setPick(""); }}>Add</Button></div>
        <Rows empty="Nobody is on the list.">{allow.map((id) => <Row key={id} primary={name(id)} right={<button type="button" className="text-[11.5px] font-semibold text-danger hover:underline" onClick={() => setAllow(allow.filter((x) => x !== id))}>remove</button>} />)}</Rows>
        <div className="mt-3 flex justify-end"><Button size="sm" onClick={save}>Save settings</Button></div>
      </Panel>
    </div>
  );
}
