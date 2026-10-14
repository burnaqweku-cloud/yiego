import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Receipt, Search } from "lucide-react";
import { Link } from "react-router-dom";
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
  const { user } = useAuth(); const actorId = user?.id ?? "";
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("all");
  const [search, setSearch] = useState("");
  const [recording, setRecording] = useState(false);
  const [admins, setAdmins] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [en, who] = await Promise.all([
      db().from("finance_entries").select("id, created_by, kind, occurred_at, amount, note, reverses, postings:finance_postings(account, amount)").order("occurred_at", { ascending: false }).limit(2000),
      db().rpc("admin_user_labels", {}),
    ]);
    const all = (en.data ?? []) as Entry[];
    const reversed = new Set(all.filter((e) => e.reverses).map((e) => e.reverses as string));
    setEntries(all.filter((e) => e.kind !== "reversal" && !reversed.has(e.id) && e.postings.some((p) => p.account === "other_expenses" && Number(p.amount) > 0)));
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
        <Stat loading={loading} label="Spent (this view)" value={<Money value={total} />} note={`${filtered.length} expense${filtered.length === 1 ? "" : "s"}`} icon={Receipt} tone="bad" />
        <Stat loading={loading} label="Spent since launch" value={<Money value={allTime} />} note={`${entries.length} in total`} tone="muted" />
        <Stat loading={loading} label="Largest" value={<Money value={filtered.reduce((m, e) => Math.max(m, amountOf(e)), 0)} />} note={filtered.length ? (filtered.slice().sort((a, b) => amountOf(b) - amountOf(a))[0].note ?? "") : ""} tone="muted" />
      </StatGrid>
      <Panel title="Every expense" icon={Receipt} action={<div className="flex flex-wrap items-center gap-2"><Segmented<Period> value={period} onChange={setPeriod} options={[{ value: "all", label: "All" }, { value: "month", label: "This month" }, { value: "30d", label: "30 days" }, { value: "7d", label: "7 days" }]} /><label className={`${inputCls} flex w-44 items-center gap-2 !py-1.5`}><Search size={13} className="shrink-0 text-faint-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none" /></label></div>}>
        <Rows empty={loading ? "Loading…" : "No expenses recorded."}>{filtered.map((e) => <Row key={e.id} primary={e.note ?? "Expense"} secondary={`${formatAdminDate(e.occurred_at)}${e.created_by ? ` · by ${admins[e.created_by] ?? "admin"}` : ""}`} right={formatGHS(amountOf(e))} tone="bad" />)}</Rows>
      </Panel>
      <RecordExpenseModal open={recording} onClose={() => setRecording(false)} actorId={actorId} onDone={() => { setRecording(false); void load(); }} />
    </div>
  );
}
