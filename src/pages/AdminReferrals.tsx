import { useCallback, useEffect, useMemo, useState } from "react";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Panel, Pill, Rows, Segmented, Stat, StatGrid } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";

/* Referrals: who invited whom, what was paid, and anything the checks flagged. */
type RStatus = "pending" | "rewarded" | "flagged" | "void" | "reversed";
interface Ref { id: string; referrer_id: string; referred_id: string; status: RStatus; reward_amount: number; checks: Record<string, string>; agent_status: RStatus; agent_reward_amount: number; agent_checks: Record<string, string>; note: string | null; created_at: string; rewarded_at: string | null }
interface Person { id: string; email: string | null; full_name: string | null }
type Filter = "all" | "flagged" | "rewarded" | "pending";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }> };
const CHECK_LABEL: Record<string, string> = { device: "Device", recipient: "Number", payer: "Payer" };
const CHECK_TEXT: Record<string, string> = { ok: "ok", shared: "same device as referrer", seen_before: "used before", unknown: "not verifiable" };

export default function AdminReferrals() {
  const [rows, setRows] = useState<Ref[]>([]); const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [filter, setFilter] = useState<Filter>("all"); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const [r, p] = await Promise.all([db().from("referrals").select("*").order("created_at", { ascending: false }).limit(500), db().from("profiles").select("id, email, full_name")]);
    setRows(r.data ?? []); setPeople(new Map(((p.data ?? []) as Person[]).map((x) => [x.id, x]))); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (r: Ref, action: "approve" | "void" | "approve_agent" | "void_agent") => {
    const note = action.startsWith("void") ? window.prompt("Reason (the referrer won't see this)", "") ?? undefined : undefined;
    if (action.startsWith("void") && note === undefined) return;
    setBusy(r.id); const { error } = await db().rpc("admin_referral_action", { p_referral: r.id, p_action: action, p_note: note ?? null }); setBusy(null);
    if (error) return toast.error(error.message.replace(/_/g, " "));
    toast.success(action.startsWith("approve") ? "Reward paid to the referrer." : "Voided."); void load();
  };
  const visible = useMemo(() => rows.filter((r) => filter === "all" || r.status === filter || r.agent_status === filter), [rows, filter]);
  const who = (id: string) => { const p = people.get(id); return p?.full_name || p?.email || id.slice(0, 8); };
  const tone = (s: Ref["status"]) => s === "rewarded" ? "good" : s === "flagged" ? "bad" : s === "pending" ? "warn" : "muted";
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Referrals" description="Every invite that turned into an account. Rewards pay out on the friend's first delivered order; flagged ones failed a check and wait for you." />
      <StatGrid>
        <Stat loading={loading} label="Invited" value={rows.length} note="accounts created via a link" icon={Gift} />
        <Stat loading={loading} label="Rewarded" value={rows.filter((r) => r.status === "rewarded" || r.agent_status === "rewarded").length} note={formatGHS(rows.reduce((s, r) => s + (r.status === "rewarded" ? Number(r.reward_amount) : 0) + (r.agent_status === "rewarded" ? Number(r.agent_reward_amount) : 0), 0)) + " paid in credit"} tone="good" />
        <Stat loading={loading} label="Flagged" value={rows.filter((r) => r.status === "flagged" || r.agent_status === "flagged").length} note="failed a check · review" tone={rows.some((r) => r.status === "flagged" || r.agent_status === "flagged") ? "bad" : "default"} />
        <Stat loading={loading} label="Waiting" value={rows.filter((r) => r.status === "pending").length} note="no first order yet" tone="warn" />
      </StatGrid>
      <Segmented<Filter> value={filter} onChange={(v) => setFilter(v)} options={[{ value: "all", label: "All" }, { value: "flagged", label: "Flagged" }, { value: "rewarded", label: "Rewarded" }, { value: "pending", label: "Waiting" }]} />
      <Panel title="Invites">
        <Rows empty="Nothing here yet.">{visible.map((r) => (
          <li key={r.id} className="py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="truncate text-[13px] font-semibold text-foreground">{who(r.referred_id)}</p><p className="truncate text-[11.5px] text-faint-foreground">invited by {who(r.referrer_id)} · {formatAdminDate(r.created_at)}</p></div>
              <div className="flex shrink-0 flex-col items-end gap-1"><Pill tone={tone(r.status)}>data · {r.status}</Pill>{r.agent_status !== "pending" && <Pill tone={tone(r.agent_status)}>agent · {r.agent_status}</Pill>}</div>
            </div>
            {Object.keys(r.checks ?? {}).length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(r.checks).map(([k, v]) => <span key={k} className={`rounded-full px-2 py-0.5 text-[11px] ${v === "ok" ? "bg-white/[0.05] text-faint-foreground" : "bg-danger/15 text-danger"}`}>{CHECK_LABEL[k] ?? k}: {CHECK_TEXT[v] ?? v}</span>)}</div>}
            {Object.keys(r.agent_checks ?? {}).length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5"><span className="text-[11px] text-faint-foreground">agent:</span>{Object.entries(r.agent_checks).map(([k, v]) => <span key={k} className={`rounded-full px-2 py-0.5 text-[11px] ${v === "ok" ? "bg-white/[0.05] text-faint-foreground" : "bg-danger/15 text-danger"}`}>{CHECK_LABEL[k] ?? k}: {CHECK_TEXT[v] ?? v}</span>)}</div>}
            {r.note && <p className="mt-1 text-[11.5px] text-faint-foreground">{r.note}</p>}
            {(r.status === "flagged" || r.status === "pending" || r.status === "rewarded") && <div className="mt-2 flex gap-2">
              {r.status === "flagged" && <Button size="sm" disabled={busy === r.id} onClick={() => void act(r, "approve")}>Pay reward anyway</Button>}
              <Button size="sm" variant="quiet" disabled={busy === r.id} onClick={() => void act(r, "void")}>{r.status === "rewarded" ? "Take back GHS 1" : "Void data reward"}</Button>
              {r.agent_status === "flagged" && <Button size="sm" disabled={busy === r.id} onClick={() => void act(r, "approve_agent")}>Pay agent reward anyway</Button>}
              {r.agent_status === "rewarded" && <Button size="sm" variant="quiet" disabled={busy === r.id} onClick={() => void act(r, "void_agent")}>Take back GHS 5</Button>}
            </div>}
          </li>))}
        </Rows>
      </Panel>
    </div>
  );
}
