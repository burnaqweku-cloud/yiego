import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgePercent, Rocket, Search, Store, UserCheck } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Field, Money, Panel, Pill, Row, Rows, Segmented, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { supabase } from "@/integrations/supabase/client";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { useAuth } from "@/store/auth-context";

/* Agents — applications to review, active agents, promos and the launch switch.
   Nothing here is visible to customers until the switch is on. */

interface Application { id: string; user_id: string; full_name: string; phone: string; whatsapp: string | null; town: string | null; pitch: string | null; status: "pending" | "approved" | "declined"; decline_reason: string | null; created_at: string; reviewed_at: string | null }
interface Agent { id: string; user_id: string; slug: string; store_name: string; status: string; paid_until: string | null; earnings_balance: number; created_at: string }
interface Promo { id: string; name: string; percent_off: number; starts_at: string; ends_at: string | null; max_uses: number | null; uses: number; is_active: boolean }
interface Plan { monthly_price: number; payout_minimum: number; payout_fee_rate: number; payout_fee_minimum: number; popup_delay_seconds: number }
type Tab = "applications" | "agents" | "promos" | "launch";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

export default function AdminAgents() {
  const { user } = useAuth(); const actor = user?.id ?? "";
  const [tab, setTab] = useState<Tab>("applications");
  const [apps, setApps] = useState<Application[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [launched, setLaunched] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [emails, setEmails] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [appFilter, setAppFilter] = useState<"pending" | "all">("pending");
  const [declining, setDeclining] = useState<Application | null>(null); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const [editPromo, setEditPromo] = useState<Partial<Promo> | null>(null);
  const [planDraft, setPlanDraft] = useState<Plan | null>(null);

  const load = useCallback(async () => {
    const [a, g, p, s, r] = await Promise.all([
      db().from("agent_applications").select("*").order("created_at", { ascending: false }).limit(500),
      db().from("agents").select("id, user_id, slug, store_name, status, paid_until, earnings_balance, created_at").order("created_at", { ascending: false }),
      db().from("agent_promos").select("*").order("created_at", { ascending: false }),
      db().from("site_settings").select("key, value").in("key", ["agents_launched", "agent_plan"]),
      actor ? db().rpc("admin_role", { p_user: actor }) : Promise.resolve({ data: null, error: null }),
    ]);
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
  const visibleAgents = useMemo(() => agents.filter((g) => !q || g.store_name.toLowerCase().includes(q) || g.slug.includes(q) || (emails.get(g.user_id) ?? "").toLowerCase().includes(q)), [agents, q, emails]);
  const pending = apps.filter((a) => a.status === "pending").length;

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
      <AdminPageHeader title="Agents" description={launched ? "Live. Customers can see the apply page, popup and stores." : "Not launched. Nothing here is visible to customers yet."} action={<Pill tone={launched ? "good" : "warn"}>{launched ? "live" : "hidden"}</Pill>} />
      <StatGrid cols={4}>
        <Stat loading={loading} label="Applications waiting" value={String(pending)} tone={pending ? "warn" : "default"} icon={UserCheck} onClick={() => { setTab("applications"); setAppFilter("pending"); }} />
        <Stat loading={loading} label="Agents" value={String(agents.length)} note={`${agents.filter((g) => g.status === "active").length} active · ${agents.filter((g) => g.status === "awaiting_payment").length} not yet paid`} icon={Store} onClick={() => setTab("agents")} />
        <Stat loading={loading} label="Owed to agents" value={<Money value={agents.reduce((a, g) => a + Number(g.earnings_balance), 0)} />} note="earnings not yet paid out" tone="warn" />
        <Stat loading={loading} label="Monthly plan" value={plan ? formatGHS(plan.monthly_price) : "—"} note={promos.find((p) => p.is_active) ? `${promos.find((p) => p.is_active)?.percent_off}% promo running` : "no promo"} icon={BadgePercent} onClick={() => setTab("promos")} />
      </StatGrid>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: "applications", label: `Applications${pending ? ` (${pending})` : ""}` }, { value: "agents", label: "Agents" }, { value: "promos", label: "Plan & promos" }, { value: "launch", label: "Launch" }]} />
        {tab === "applications" && <Segmented<"pending" | "all"> value={appFilter} onChange={setAppFilter} options={[{ value: "pending", label: "Waiting" }, { value: "all", label: "All" }]} />}
        {(tab === "applications" || tab === "agents") && <label className="relative block flex-1 min-w-[200px]"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone, email, store" className={`${inputCls} pl-8`} /></label>}
      </div>

      {tab === "applications" && (
        <Panel title="Applications" note={appFilter === "pending" ? "waiting for review" : "all applications"}>
          <Rows empty={loading ? "Loading…" : appFilter === "pending" ? "No applications waiting." : "No applications yet."}>
            {visibleApps.map((a) => (
              <li key={a.id} className="py-2">
                <div className="flex items-start gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-foreground">{a.full_name} <Pill tone={a.status === "pending" ? "warn" : a.status === "approved" ? "good" : "muted"}>{a.status}</Pill></p>
                    <p className="text-[11px] text-faint-foreground">{a.phone}{a.whatsapp && a.whatsapp !== a.phone ? ` · WhatsApp ${a.whatsapp}` : ""}{a.town ? ` · ${a.town}` : ""} · {emails.get(a.user_id) ?? "—"} · applied {formatAdminDate(a.created_at)}</p>
                    {a.pitch && <p className="mt-0.5 text-[11.5px] text-muted-foreground">“{a.pitch}”</p>}
                    {a.decline_reason && <p className="mt-0.5 text-[11px] text-amber">Declined: {a.decline_reason}</p>}
                  </div>
                  {a.status === "pending" && <div className="flex gap-1.5"><Button size="sm" onClick={() => void review(a, true)} disabled={busy}>Approve</Button><Button size="sm" variant="quiet" onClick={() => { setDeclining(a); setReason(""); }}>Decline</Button></div>}
                </div>
              </li>))}
          </Rows>
        </Panel>
      )}

      {tab === "agents" && (
        <Panel title="Agents" note={`${visibleAgents.length} shown`}>
          <Rows empty={loading ? "Loading…" : "No agents yet — approve an application to create one."}>
            {visibleAgents.map((g) => <Row key={g.id} primary={<>{g.store_name} <Pill tone={g.status === "active" ? "good" : g.status === "awaiting_payment" ? "warn" : "muted"}>{g.status.replace(/_/g, " ")}</Pill></>} secondary={`/s/${g.slug} · ${emails.get(g.user_id) ?? "—"} · ${g.paid_until ? `paid until ${g.paid_until}` : "not paid yet"} · joined ${formatAdminDate(g.created_at)}`} right={formatGHS(Number(g.earnings_balance))} rightNote="earnings" />)}
          </Rows>
        </Panel>
      )}

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

      {tab === "launch" && (
        <Panel title="Launch switch" icon={Rocket} note={launched ? "agents are live" : "agents are hidden"}>
          <p className="text-[12.5px] text-muted-foreground">Turning this on does three things at once: public prices change to the pending list, the apply page and popup appear, and active agents' stores open. Turning it off hides everything again but leaves prices where they are.</p>
          <div className="mt-3 flex justify-end">{isMaster ? <Button onClick={() => void flip(!launched)} variant={launched ? "quiet" : "primary"}>{launched ? "Switch agents off" : "Launch agents"}</Button> : <p className="text-[12px] text-faint-foreground">Only the master admin can flip this.</p>}</div>
        </Panel>
      )}

      <Modal open={declining !== null} onClose={() => setDeclining(null)} label="Decline application">
        <div className="w-[min(92vw,400px)] p-5">
          <h2 className="text-[16px] font-semibold text-foreground">Decline {declining?.full_name}</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">They get an email. Add a reason if you want them to see one.</p>
          <div className="mt-3"><Field label="Reason (optional)"><input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} /></Field></div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="quiet" onClick={() => setDeclining(null)}>Cancel</Button><Button onClick={() => declining && void review(declining, false)} disabled={busy}>Decline</Button></div>
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
