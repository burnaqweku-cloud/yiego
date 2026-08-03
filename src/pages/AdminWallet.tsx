import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Search, WalletCards } from "lucide-react";
import AdminListPagination from "@/components/admin/AdminListPagination";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminStatStrip from "@/components/admin/AdminStatStrip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { adminDatabase, formatAdminDate, readableStatus, type AdminLedgerRow } from "@/lib/admin-data";

export default function AdminWallet() {
  const [entries, setEntries] = useState<AdminLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    let mounted = true;
    adminDatabase().from<AdminLedgerRow>("wallet_ledger_entries").select("reference, amount, direction, type, created_at").order("created_at", { ascending: false }).limit(500).then(({ data }) => {
      if (!mounted) return;
      setEntries(data ?? []);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => { setPage(1); }, [search, direction, pageSize]);

  const credits = useMemo(() => entries.filter((entry) => entry.direction === "credit").reduce((sum, entry) => sum + Number(entry.amount), 0), [entries]);
  const debits = useMemo(() => entries.filter((entry) => entry.direction === "debit").reduce((sum, entry) => sum + Number(entry.amount), 0), [entries]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter((entry) => (direction === "all" || entry.direction === direction) && (!needle || entry.reference.toLowerCase().includes(needle) || entry.type.toLowerCase().includes(needle)));
  }, [direction, entries, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Business" title="Wallet activity" description="A focused ledger view for customer deposits, order debits and other wallet movements." />
    <AdminStatStrip loading={loading} items={[
      { label: "Entries", value: entries.length },
      { label: "Credits", value: `GH₵${credits.toFixed(2)}`, tone: "success" },
      { label: "Debits", value: `GH₵${debits.toFixed(2)}`, tone: "warning" },
    ]} />
    <Card><CardContent>
      <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_200px]"><label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3"><Search size={17} className="text-faint-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference or activity type" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint-foreground" /></label><select className="onyx-field" value={direction} onChange={(event) => setDirection(event.target.value)}><option value="all">All movements</option><option value="credit">Credits</option><option value="debit">Debits</option></select></div>
      {!loading && filtered.length === 0 ? <div className="grid min-h-72 place-items-center text-center"><div><WalletCards className="mx-auto text-faint-foreground" size={28} /><h2 className="mt-4 font-display text-xl font-semibold text-white">No wallet activity found</h2><p className="mt-2 text-sm text-muted-foreground">Change the search or movement filter.</p></div></div> : <div className="mt-5 space-y-2">{visible.map((entry) => <div key={`${entry.reference}-${entry.created_at}`} className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${entry.direction === "credit" ? "bg-success/[0.1] text-success" : "bg-amber/[0.1] text-amber"}`}>{entry.direction === "credit" ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}</span><div className="min-w-0 flex-1"><p className="truncate font-semibold text-white">{entry.reference}</p><p className="mt-1 text-xs text-muted-foreground">{formatAdminDate(entry.created_at)}</p></div><div className="text-right"><p className={`font-display font-semibold ${entry.direction === "credit" ? "text-success" : "text-amber"}`}>{entry.direction === "credit" ? "+" : "−"}GH₵{Number(entry.amount).toFixed(2)}</p><Badge variant="neutral" className="mt-1">{readableStatus(entry.type)}</Badge></div></div>)}</div>}
      <AdminListPagination page={safePage} pageSize={pageSize} totalItems={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="entries" />
    </CardContent></Card>
  </div>;
}
