import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Money, Panel, Pill, Row, Rows, Segmented, Stat, StatGrid } from "@/components/admin/ui";
import { adminDatabase } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";

/* Read-only history behind the two Finance cards: supplier top-ups, and money moved in/out by the master admin
   (business costs, capital returned, capital put in). Reads existing ledger entries; never changes them. */

interface Entry { id: string; created_by: string | null; kind: string; occurred_at: string; amount: number; note: string | null; metadata: Record<string, unknown> | null; supplier_id: string | null; postings: { account: string; amount: number }[] }
type Filter = "all" | "spend" | "withdraw" | "capital_in";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any; rpc: (f: string, a?: Record<string, unknown>) => any };
const when = (v: string) => new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" }).format(new Date(v));
const post = (e: Entry, acc: string) => Number(e.postings.find((p) => p.account === acc)?.amount ?? 0);

export function moneyMoveType(e: Entry): Exclude<Filter, "all"> | "add" {
  if (e.kind === "partner_capital") return "capital_in";
  const k = String(e.metadata?.kind ?? "");
  if (k === "spend" || post(e, "other_expenses") > 0) return "spend";
  if (k === "add") return "add";
  return "withdraw";
}
const LABEL = { spend: "Business cost", withdraw: "Capital returned", capital_in: "Capital put in", add: "Added to bank" } as const;

export default function AdminFinanceHistory() {
  const { type } = useParams(); const topups = type === "topups";
  const [entries, setEntries] = useState<Entry[]>([]); const [undone, setUndone] = useState<Set<string>>(new Set());
  const [suppliers, setSuppliers] = useState<Record<string, string>>({}); const [admins, setAdmins] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true); const [error, setError] = useState(false); const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => { (async () => {
    setLoading(true); setError(false);
    const kinds = topups ? ["supplier_topup"] : ["master_adjustment", "partner_capital"];
    const [en, rev, su, who] = await Promise.all([
      db().from("finance_entries").select("id, created_by, kind, occurred_at, amount, note, metadata, supplier_id, postings:finance_postings(account, amount)").in("kind", kinds).order("occurred_at", { ascending: false }).limit(1000),
      db().from("finance_entries").select("reverses").not("reverses", "is", null).limit(5000),
      db().from("suppliers").select("id, name"),
      db().rpc("admin_user_labels", {}),
    ]);
    if (en.error) { setError(true); setLoading(false); return; }
    setEntries(en.data ?? []);
    setUndone(new Set(((rev.data ?? []) as { reverses: string }[]).map((r) => r.reverses)));
    setSuppliers(Object.fromEntries(((su.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name])));
    setAdmins(Object.fromEntries(((who.data ?? []) as { user_id: string; label: string }[]).map((r) => [r.user_id, r.label])));
    setLoading(false);
  })(); }, [topups]);

  const live = useMemo(() => entries.filter((e) => !undone.has(e.id)), [entries, undone]);
  const shown = useMemo(() => topups || filter === "all" ? live : live.filter((e) => moneyMoveType(e) === filter), [live, filter, topups]);
  const total = (f: (e: Entry) => boolean, v: (e: Entry) => number) => live.filter(f).reduce((a, e) => a + v(e), 0);
  const fee = (e: Entry) => post(e, "supplier_topup_fees");
  const into = (e: Entry) => Number(e.postings.find((p) => p.account.startsWith("float_"))?.amount ?? e.amount);
  const abs = (e: Entry) => Math.abs(Number(e.amount));

  return <div className="space-y-5">
    <AdminPageHeader title={topups ? "Top-up history" : "Money in & out history"} description={topups ? "Every supplier top-up, its charges and who recorded it." : "Business costs, capital returned and capital put in."} />
    {error && <div role="alert" className="border-l-2 border-danger bg-danger/10 p-4 text-sm text-danger">Records could not be loaded.</div>}
    {topups ? <StatGrid cols={3}>
      <Stat loading={loading} label="Topped up" value={<Money value={total(() => true, into)} />} note={`${live.length} top-ups`} />
      <Stat loading={loading} label="Charges" value={<Money value={total(() => true, fee)} />} />
      <Stat loading={loading} label="Total paid" value={<Money value={total(() => true, (e) => into(e) + fee(e))} />} />
    </StatGrid> : <StatGrid cols={3}>
      <Stat loading={loading} label="Business costs" value={<Money value={total((e) => moneyMoveType(e) === "spend", abs)} tone="bad" />} note="lowered profit" />
      <Stat loading={loading} label="Capital returned" value={<Money value={total((e) => moneyMoveType(e) === "withdraw", abs)} />} note="profit unchanged" />
      <Stat loading={loading} label="Capital put in" value={<Money value={total((e) => moneyMoveType(e) === "capital_in", abs)} tone="good" />} note="profit unchanged" />
    </StatGrid>}
    {!topups && <div className="max-w-xl"><Segmented<Filter> value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "spend", label: "Costs" }, { value: "withdraw", label: "Returned" }, { value: "capital_in", label: "Put in" }]} /></div>}
    <Panel title={`${shown.length} record${shown.length === 1 ? "" : "s"}`}>
      <Rows empty={loading ? "Loading…" : "Nothing recorded yet."}>
        {shown.map((e) => {
          const by = e.created_by ? admins[e.created_by] ?? "Admin" : "System";
          if (topups) return <Row key={e.id} primary={suppliers[e.supplier_id ?? ""] ?? "Supplier"} secondary={`${when(e.occurred_at)} · ${by}${e.note ? ` · ${e.note}` : ""}`}
            right={formatGHS(into(e))} rightNote={fee(e) ? `+ ${formatGHS(fee(e))} charges` : "no charges"} />;
          const t = moneyMoveType(e);
          return <Row key={e.id} primary={e.note || LABEL[t]} secondary={`${when(e.occurred_at)} · ${by}`}
            right={`${t === "capital_in" || t === "add" ? "+" : "−"}${formatGHS(abs(e))}`} rightNote={<Pill tone={t === "spend" ? "bad" : t === "capital_in" ? "good" : "muted"}>{LABEL[t]}</Pill>} />;
        })}
      </Rows>
    </Panel>
    {undone.size > 0 && <p className="text-xs text-muted-foreground">Records that were undone are left out.</p>}
  </div>;
}
