import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Search, Users, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";
import AdminListPagination from "@/components/admin/AdminListPagination";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Money, Panel, Pill, Row, Rows, Segmented, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";

/* Customer wallets — who is holding what, and every movement behind it.
   Tap a customer to see only their history. */

interface Wallet { id: string; user_id: string; balance: number; status: string; updated_at: string; email: string | null; name: string | null }
interface Entry { id: string; wallet_id: string; user_id: string; direction: "credit" | "debit"; type: string; amount: number; balance_after: number; reference: string; note: string | null; created_at: string }
type Kind = "all" | "deposit" | "purchase" | "refund" | "adjustment";
type Period = "all" | "7d" | "30d" | "month";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any };
const periodFrom = (p: Period) => { const d = new Date(); if (p === "7d") d.setDate(d.getDate() - 7); else if (p === "30d") d.setDate(d.getDate() - 30); else if (p === "month") d.setDate(1); else return null; d.setHours(0, 0, 0, 0); return d; };
const TYPE_LABEL: Record<string, string> = { deposit: "Deposit", purchase: "Bundle bought", refund: "Refund", adjustment: "Adjustment" };

export default function AdminWallet() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [period, setPeriod] = useState<Period>("all");
  const [onlyFunded, setOnlyFunded] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      db().from("wallets").select("id, user_id, balance, status, updated_at").order("balance", { ascending: false }),
      db().from("profiles").select("id, email, full_name"),
      db().from("wallet_ledger_entries").select("id, wallet_id, user_id, direction, type, amount, balance_after, reference, note, created_at").order("created_at", { ascending: false }).limit(1000),
    ]).then(([w, p, l]) => {
      if (!mounted) return;
      const profile = new Map<string, { email: string | null; full_name: string | null }>((p.data ?? []).map((x: { id: string; email: string | null; full_name: string | null }) => [x.id, x]));
      setWallets((w.data ?? []).map((x: Omit<Wallet, "email" | "name">) => ({ ...x, email: profile.get(x.user_id)?.email ?? null, name: profile.get(x.user_id)?.full_name ?? null })));
      setEntries(l.data ?? []); setLoading(false);
    });
    return () => { mounted = false; };
  }, []);
  useEffect(() => { setPage(1); }, [search, kind, period, selected, pageSize]);

  const walletById = useMemo(() => new Map(wallets.map((w) => [w.id, w])), [wallets]);
  const held = useMemo(() => wallets.reduce((a, w) => a + Number(w.balance), 0), [wallets]);
  const q = search.trim().toLowerCase();
  const visibleWallets = useMemo(() => wallets.filter((w) => (!onlyFunded || Number(w.balance) !== 0) && (!q || (w.email ?? "").toLowerCase().includes(q) || (w.name ?? "").toLowerCase().includes(q))), [wallets, onlyFunded, q]);
  const filteredEntries = useMemo(() => {
    const from = periodFrom(period);
    return entries.filter((e) => (!selected || e.wallet_id === selected) && (kind === "all" || e.type === kind) && (!from || new Date(e.created_at) >= from)
      && (!q || e.reference.toLowerCase().includes(q) || (e.note ?? "").toLowerCase().includes(q) || (walletById.get(e.wallet_id)?.email ?? "").toLowerCase().includes(q)));
  }, [entries, selected, kind, period, q, walletById]);
  const deposits = useMemo(() => filteredEntries.filter((e) => e.type === "deposit" && e.direction === "credit").reduce((a, e) => a + Number(e.amount), 0), [filteredEntries]);
  const spent = useMemo(() => filteredEntries.filter((e) => e.type === "purchase" && e.direction === "debit").reduce((a, e) => a + Number(e.amount), 0), [filteredEntries]);
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize)); const safePage = Math.min(page, totalPages);
  const pageEntries = filteredEntries.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedWallet = selected ? walletById.get(selected) : null;

  const exportCsv = () => {
    const rows = [["date", "customer", "type", "direction", "amount", "balance after", "reference", "note"], ...filteredEntries.map((e) => [e.created_at, walletById.get(e.wallet_id)?.email ?? "", e.type, e.direction, Number(e.amount).toFixed(2), Number(e.balance_after).toFixed(2), e.reference, (e.note ?? "").replace(/"/g, "'")])];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")], { type: "text/csv" })); a.download = `datayego-wallets-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Customer wallets" description="Money customers have loaded and not yet spent. It's theirs; we hold it." action={<div className="flex gap-2"><Link to="/admin/finance"><Button variant="ghost" size="sm"><ArrowLeft size={14} />Finance</Button></Link><Button variant="ghost" size="sm" onClick={exportCsv}><Download size={14} />CSV</Button></div>} />

      <StatGrid cols={3}>
        <Stat loading={loading} label="Held for customers" value={<Money value={held} />} note={`${wallets.filter((w) => Number(w.balance) !== 0).length} wallets with money`} icon={WalletCards} tone="warn" />
        <Stat loading={loading} label="Deposits" value={<Money value={deposits} tone="good" />} note="for the filter below" tone="good" />
        <Stat loading={loading} label="Spent on bundles" value={<Money value={spent} />} note="for the filter below" />
      </StatGrid>

      <Panel title={selectedWallet ? `${selectedWallet.email ?? "Customer"}` : "Customers"} icon={Users} note={selectedWallet ? "tap the row to go back to everyone" : `${visibleWallets.length} shown`}>
        {!selectedWallet && (
          <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="relative block"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Email, name, reference" className={`${inputCls} pl-8`} /></label>
            <Segmented<"funded" | "everyone"> value={onlyFunded ? "funded" : "everyone"} onChange={(v) => setOnlyFunded(v === "funded")} options={[{ value: "funded", label: "With money" }, { value: "everyone", label: "Everyone" }]} />
          </div>
        )}
        <Rows empty={loading ? "Loading…" : "No wallets match."}>
          {(selectedWallet ? [selectedWallet] : visibleWallets).map((w) => <Row key={w.id} onClick={() => setSelected(selected === w.id ? null : w.id)} primary={<>{w.email ?? w.user_id.slice(0, 8)} {w.status !== "active" && <Pill tone="warn">{w.status}</Pill>}</>} secondary={`${w.name ?? "—"} · last movement ${formatAdminDate(w.updated_at)}`} right={formatGHS(Number(w.balance))} rightNote="balance" tone={Number(w.balance) > 0 ? "warn" : "default"} />)}
        </Rows>
      </Panel>

      <Panel title={selectedWallet ? "Their history" : "All movements"} note={`${filteredEntries.length} entries`}>
        <div className="mb-2 flex flex-wrap gap-2">
          <Segmented<Kind> value={kind} onChange={setKind} options={[{ value: "all", label: "All" }, { value: "deposit", label: "Deposits" }, { value: "purchase", label: "Bundles" }, { value: "refund", label: "Refunds" }, { value: "adjustment", label: "Adjustments" }]} />
          <Segmented<Period> value={period} onChange={setPeriod} options={[{ value: "all", label: "All time" }, { value: "7d", label: "7d" }, { value: "30d", label: "30d" }, { value: "month", label: "Month" }]} />
        </div>
        <Rows empty="No movements for this filter.">
          {pageEntries.map((e) => <Row key={e.id} primary={<>{TYPE_LABEL[e.type] ?? e.type}{!selectedWallet && <span className="ml-1.5 text-[11px] text-faint-foreground">{walletById.get(e.wallet_id)?.email ?? ""}</span>}</>} secondary={`${formatAdminDate(e.created_at)} · ${e.reference}${e.note ? ` · ${e.note}` : ""}`} right={`${e.direction === "credit" ? "+" : "−"}${formatGHS(Number(e.amount))}`} rightNote={`then ${formatGHS(Number(e.balance_after))}`} tone={e.direction === "credit" ? "good" : e.type === "adjustment" ? "warn" : "default"} />)}
        </Rows>
        <AdminListPagination page={safePage} pageSize={pageSize} totalItems={filteredEntries.length} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="entries" />
      </Panel>
    </div>
  );
}
