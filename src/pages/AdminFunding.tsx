import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, PiggyBank, Search } from "lucide-react";
import { Link } from "react-router-dom";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { RecordTopupModal } from "@/components/admin/FinanceForms";
import { Money, Panel, Pill, Row, Rows, Segmented, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { useAuth } from "@/store/auth-context";

/* Money put in — every cedi that came from you rather than from customers:
   supplier top-ups (with their charges) and balances carried in at launch. */

interface Entry { id: string; kind: string; reference: string | null; occurred_at: string; amount: number; note: string | null; metadata: Record<string, unknown>; supplier_id: string | null; reverses: string | null; postings: { account: string; amount: number }[] }
interface Supplier { id: string; code: string; name: string; metadata: Record<string, unknown> | null }
type Period = "all" | "7d" | "30d" | "month";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any };

const periodFrom = (p: Period) => { const d = new Date(); if (p === "7d") d.setDate(d.getDate() - 7); else if (p === "30d") d.setDate(d.getDate() - 30); else if (p === "month") d.setDate(1); else return null; d.setHours(0, 0, 0, 0); return d; };

export default function AdminFunding() {
  const { user } = useAuth(); const actorId = user?.id ?? "";
  const [entries, setEntries] = useState<Entry[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplier, setSupplier] = useState<string>("all");
  const [period, setPeriod] = useState<Period>("all");
  const [search, setSearch] = useState("");
  const [recording, setRecording] = useState(false);

  const load = async () => {
    const [en, su] = await Promise.all([
      db().from("finance_entries").select("id, kind, reference, occurred_at, amount, note, metadata, supplier_id, reverses, postings:finance_postings(account, amount)").in("kind", ["supplier_topup", "opening_balance", "reversal"]).order("occurred_at", { ascending: false }).limit(500),
      db().from("suppliers").select("id, code, name, metadata").order("display_order"),
    ]);
    setEntries(en.data ?? []); setSuppliers(su.data ?? []); setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const reversedIds = useMemo(() => new Set(entries.filter((e) => e.reverses).map((e) => e.reverses as string)), [entries]);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);
  const live = useMemo(() => entries.filter((e) => e.kind !== "reversal" && !reversedIds.has(e.id) && e.postings.some((p) => p.account === "outside_funding" || p.account === "opening_balance")), [entries, reversedIds]);

  const filtered = useMemo(() => {
    const from = periodFrom(period); const q = search.trim().toLowerCase();
    return live.filter((e) => (supplier === "all" || e.supplier_id === supplier || (supplier === "other" && !e.supplier_id))
      && (!from || new Date(e.occurred_at) >= from)
      && (!q || (e.note ?? "").toLowerCase().includes(q) || (e.reference ?? "").toLowerCase().includes(q) || (supplierById.get(e.supplier_id ?? "")?.name ?? "").toLowerCase().includes(q)));
  }, [live, supplier, period, search, supplierById]);

  const feeOf = (e: Entry) => Number(e.postings.find((p) => p.account === "supplier_topup_fees")?.amount ?? 0);
  const intoOf = (e: Entry) => Number(e.postings.find((p) => p.account.startsWith("float_") || ["bank", "customer_wallets"].includes(p.account))?.amount ?? e.amount);
  const totals = useMemo(() => {
    const t = { topups: 0, fees: 0, carried: 0 };
    for (const e of filtered) { if (e.kind === "opening_balance") t.carried += Number(e.amount); else { t.topups += intoOf(e); t.fees += feeOf(e); } }
    return t;
  }, [filtered]);
  const bySupplier = useMemo(() => suppliers.map((s) => { const mine = filtered.filter((e) => e.supplier_id === s.id); return { s, topups: mine.filter((e) => e.kind !== "opening_balance").reduce((a, e) => a + intoOf(e), 0), fees: mine.reduce((a, e) => a + feeOf(e), 0), carried: mine.filter((e) => e.kind === "opening_balance").reduce((a, e) => a + Number(e.amount), 0), n: mine.length }; }).filter((x) => x.n > 0), [filtered, suppliers]);

  const exportCsv = () => {
    const rows = [["date", "type", "supplier", "amount", "fee", "total paid", "note"], ...filtered.map((e) => [e.occurred_at, e.kind === "opening_balance" ? "carried in" : "top-up", supplierById.get(e.supplier_id ?? "")?.name ?? "", intoOf(e).toFixed(2), feeOf(e).toFixed(2), (intoOf(e) + feeOf(e)).toFixed(2), (e.note ?? "").replace(/"/g, "'")])];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `datayego-money-put-in-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Money put in" description="Your own money into the business: supplier top-ups and what was already there at launch. Not customer money." action={<div className="flex gap-2"><Link to="/admin/finance"><Button variant="ghost" size="sm"><ArrowLeft size={14} />Finance</Button></Link><Button variant="ghost" size="sm" onClick={exportCsv}><Download size={14} />CSV</Button><Button size="sm" onClick={() => setRecording(true)}>Record top-up</Button></div>} />

      <StatGrid cols={3}>
        <Stat loading={loading} label="Top-ups" value={<Money value={totals.topups} />} note="into supplier floats" icon={PiggyBank} tone="good" />
        <Stat loading={loading} label="Charges on top-ups" value={<Money value={totals.fees} />} note="supplier fees, counted as a cost" />
        <Stat loading={loading} label="Carried in at launch" value={<Money value={totals.carried} />} note="already there on 12 Sept" tone="muted" />
      </StatGrid>

      {bySupplier.length > 0 && (
        <Panel title="By supplier" note="for the filter below">
          <Rows empty="">{bySupplier.map(({ s, topups, fees, carried, n }) => <Row key={s.id} primary={s.name} secondary={`${n} entr${n === 1 ? "y" : "ies"}${carried ? ` · ${formatGHS(carried)} carried in` : ""}${fees ? ` · ${formatGHS(fees)} charges` : ""}`} right={formatGHS(topups + carried)} rightNote="into float" />)}</Rows>
        </Panel>
      )}

      <Panel title="Every entry" note={`${filtered.length} shown`}>
        <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label className="relative block"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Note, supplier, reference" className={`${inputCls} pl-8`} /></label>
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={`${inputCls} w-auto`}><option value="all">All suppliers</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="other">Not a supplier</option></select>
          <Segmented<Period> value={period} onChange={setPeriod} options={[{ value: "all", label: "All" }, { value: "7d", label: "7d" }, { value: "30d", label: "30d" }, { value: "month", label: "Month" }]} />
        </div>
        <Rows empty={loading ? "Loading…" : "Nothing recorded for this filter."}>
          {filtered.map((e) => { const s = supplierById.get(e.supplier_id ?? ""); const fee = feeOf(e); const into = intoOf(e); const carried = e.kind === "opening_balance"; return (
            <Row key={e.id} primary={<>{s?.name ?? e.postings.find((p) => p.account !== "opening_balance" && p.account !== "outside_funding")?.account.replace(/_/g, " ") ?? "—"} <Pill tone={carried ? "muted" : "good"}>{carried ? "carried in" : "top-up"}</Pill></>}
              secondary={`${formatAdminDate(e.occurred_at)}${e.note ? ` · ${e.note}` : ""}`}
              right={formatGHS(into)} rightNote={fee ? `+ ${formatGHS(fee)} charge` : carried ? "at launch" : "no charge"} tone={carried ? "default" : "good"} />); })}
        </Rows>
      </Panel>

      <RecordTopupModal open={recording} onClose={() => setRecording(false)} actorId={actorId} suppliers={suppliers.map((s) => ({ code: s.code, name: s.name, fee_rate: Number(s.metadata?.topup_fee_rate ?? 0) }))} onDone={() => { setRecording(false); void load(); }} />
    </div>
  );
}
