import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Receipt, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { RecordExpenseModal } from "@/components/admin/FinanceForms";
import { Money, Panel, Row, Rows, Segmented, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { useAuth } from "@/store/auth-context";

/* Expenses — every cedi the business spent on itself (API, registration, adverts…). Each one is an
   entry whose postings hit "other_expenses". They reduce net profit; they are not partner draws. */
interface Entry { id: string; created_by: string | null; kind: string; occurred_at: string; amount: number; note: string | null; reverses: string | null; postings: { account: string; amount: number }[] }
type Period = "all" | "7d" | "30d" | "month";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any; rpc: (f: string, a?: Record<string, unknown>) => any };
const periodFrom = (p: Period) => { const d = new Date(); if (p === "7d") d.setDate(d.getDate() - 7); else if (p === "30d") d.setDate(d.getDate() - 30); else if (p === "month") d.setDate(1); else return null; d.setHours(0, 0, 0, 0); return d; };

export default function AdminExpenses() {
  const { user } = useAuth(); const actorId = user?.id ?? ""; const navigate = useNavigate();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("all");
  const [search, setSearch] = useState("");
  const [recording, setRecording] = useState(false);
  const [admins, setAdmins] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    // Only entries that hit "other_expenses" (the ledger has thousands of other rows, so ask for exactly these).
    const { data: hits } = await db().from("finance_postings").select("entry_id").eq("account", "other_expenses").gt("amount", 0).limit(5000);
    const ids = [...new Set(((hits ?? []) as { entry_id: string }[]).map((h) => h.entry_id))];
    const [en, rev, who] = await Promise.all([
      ids.length ? db().from("finance_entries").select("id, created_by, kind, occurred_at, amount, note, reverses, postings:finance_postings(account, amount)").in("id", ids).order("occurred_at", { ascending: false }) : Promise.resolve({ data: [] }),
      ids.length ? db().from("finance_entries").select("reverses").in("reverses", ids) : Promise.resolve({ data: [] }),
      db().rpc("admin_user_labels", {}),
    ]);
    const reversed = new Set(((rev.data ?? []) as { reverses: string }[]).map((r) => r.reverses));
    setEntries(((en.data ?? []) as Entry[]).filter((e) => e.kind !== "reversal" && !reversed.has(e.id)));
    const labels: Record<string, string> = {}; for (const r of (who.data ?? []) as Array<{ user_id: string; label: string }>) labels[r.user_id] = r.label; setAdmins(labels);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const amountOf = (e: Entry) => e.postings.filter((p) => p.account === "other_expenses").reduce((a, p) => a + Number(p.amount), 0);
  const filtered = useMemo(() => {
    const from = periodFrom(period); const q = search.trim().toLowerCase();
    return entries.filter((e) => (!from || new Date(e.occurred_at) >= from) && (!q || (e.note ?? "").toLowerCase().includes(q)));
  }, [entries, period, search]);
  const total = filtered.reduce((a, e) => a + amountOf(e), 0);
  const allTime = entries.reduce((a, e) => a + amountOf(e), 0);

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Expenses" description="What the business spent on itself: subscriptions, registration, adverts. These come off profit before anything is shared." action={<div className="flex gap-2"><Link to="/admin/finance"><Button variant="ghost" size="sm"><ArrowLeft size={15} />Finance</Button></Link><Button size="sm" onClick={() => setRecording(true)}>Record expense</Button></div>} />
      <StatGrid cols={3}>
        <Stat loading={loading} label="Spent (this view)" value={<Money value={total} />} note={`${filtered.filter((e) => e.kind !== "referral_reward").length} expense${filtered.filter((e) => e.kind !== "referral_reward").length === 1 ? "" : "s"} + invite rewards`} icon={Receipt} tone="bad" />
        <Stat loading={loading} label="Spent since launch" value={<Money value={allTime} />} note={`${entries.filter((e) => e.kind !== "referral_reward").length} expenses + invite rewards`} tone="muted" />
        <Stat loading={loading} label="Largest" value={<Money value={filtered.reduce((m, e) => Math.max(m, amountOf(e)), 0)} />} note={filtered.length ? (filtered.slice().sort((a, b) => amountOf(b) - amountOf(a))[0].note ?? "") : ""} tone="muted" />
      </StatGrid>
      <Panel title="Every expense" icon={Receipt} action={<div className="flex flex-wrap items-center gap-2"><Segmented<Period> value={period} onChange={setPeriod} options={[{ value: "all", label: "All" }, { value: "month", label: "This month" }, { value: "30d", label: "30 days" }, { value: "7d", label: "7 days" }]} /><label className={`${inputCls} flex w-44 items-center gap-2 !py-1.5`}><Search size={13} className="shrink-0 text-faint-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none" /></label></div>}>
        <Rows empty={loading ? "Loading…" : "No expenses recorded."}>{(() => {
          // Automatic invite rewards roll up into one row that opens the Referrals page; everything else lists as is.
          const rewards = filtered.filter((e) => e.kind === "referral_reward"); const others = filtered.filter((e) => e.kind !== "referral_reward");
          const rows = others.map((e) => <Row key={e.id} primary={e.note ?? "Expense"} secondary={`${formatAdminDate(e.occurred_at)}${e.created_by ? ` · by ${admins[e.created_by] ?? "admin"}` : ""}`} right={formatGHS(amountOf(e))} tone="bad" />);
          if (rewards.length) rows.push(<Row key="referral_rewards" onClick={() => navigate("/admin/referrals")} primary="Invite rewards (automatic)" secondary={`${rewards.length} reward${rewards.length === 1 ? "" : "s"} paid as wallet credit · latest ${formatAdminDate(rewards[0].occurred_at)} · tap to open Referrals`} right={formatGHS(rewards.reduce((a, e) => a + amountOf(e), 0))} tone="bad" />);
          return rows;
        })()}</Rows>
      </Panel>
      <RecordExpenseModal open={recording} onClose={() => setRecording(false)} actorId={actorId} onDone={() => { setRecording(false); void load(); }} />
    </div>
  );
}
