import { useEffect, useMemo, useState } from "react";
import { Search, WalletCards } from "lucide-react";
import AdminListPagination from "@/components/admin/AdminListPagination";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Money, Panel, Pill, Row, Rows, Segmented, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { adminDatabase, formatAdminDate, readableStatus, type AdminLedgerRow } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";

type Dir = "all" | "credit" | "debit";

export default function AdminWallet() {
  const [entries, setEntries] = useState<AdminLedgerRow[]>([]);
  const [balanceTotal, setBalanceTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<Dir>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      adminDatabase().from<AdminLedgerRow>("wallet_ledger_entries").select("reference, amount, direction, type, created_at").order("created_at", { ascending: false }).limit(500),
      adminDatabase().from<{ balance: number }>("wallets").select("balance"),
    ]).then(([l, w]) => { if (!mounted) return; setEntries(l.data ?? []); setBalanceTotal((w.data ?? []).reduce((a, x) => a + Number(x.balance), 0)); setLoading(false); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => { setPage(1); }, [search, direction, pageSize]);

  const credits = useMemo(() => entries.filter((e) => e.direction === "credit").reduce((s, e) => s + Number(e.amount), 0), [entries]);
  const debits = useMemo(() => entries.filter((e) => e.direction === "debit").reduce((s, e) => s + Number(e.amount), 0), [entries]);
  const filtered = useMemo(() => { const q = search.trim().toLowerCase(); return entries.filter((e) => (direction === "all" || e.direction === direction) && (!q || e.reference.toLowerCase().includes(q) || e.type.toLowerCase().includes(q))); }, [entries, search, direction]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize)); const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Wallet activity" description="Customer deposits, order debits and other wallet movements." />
      <StatGrid cols={3}>
        <Stat loading={loading} label="Held by customers" value={<Money value={balanceTotal} />} note="what we owe wallet holders" icon={WalletCards} tone="warn" />
        <Stat loading={loading} label="Credits (last 500)" value={<Money value={credits} tone="good" />} tone="good" />
        <Stat loading={loading} label="Debits (last 500)" value={<Money value={debits} />} />
      </StatGrid>
      <Panel title="Entries" note={`${filtered.length} shown`}>
        <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_240px]">
          <label className="relative block"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Reference or type" className={`${inputCls} pl-8`} /></label>
          <Segmented<Dir> value={direction} onChange={setDirection} options={[{ value: "all", label: "All" }, { value: "credit", label: "Credits" }, { value: "debit", label: "Debits" }]} />
        </div>
        <Rows empty={loading ? "Loading…" : "No wallet activity matches."}>
          {visible.map((e) => <Row key={`${e.reference}-${e.created_at}`} primary={<span className="font-mono text-[12px]">{e.reference}</span>} secondary={`${readableStatus(e.type)} · ${formatAdminDate(e.created_at)}`} right={`${e.direction === "credit" ? "+" : "−"}${formatGHS(Number(e.amount))}`} rightNote={<Pill tone={e.direction === "credit" ? "good" : "muted"}>{e.direction}</Pill>} tone={e.direction === "credit" ? "good" : "default"} />)}
        </Rows>
        <AdminListPagination page={safePage} pageSize={pageSize} totalItems={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="entries" />
      </Panel>
    </div>
  );
}
