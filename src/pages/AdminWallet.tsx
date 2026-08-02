import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, WalletCards } from "lucide-react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { adminDatabase, formatAdminDate, readableStatus, type AdminLedgerRow } from "@/lib/admin-data";

export default function AdminWallet() {
  const [entries, setEntries] = useState<AdminLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    adminDatabase().from<AdminLedgerRow>("wallet_ledger_entries").select("reference, amount, direction, type, created_at").order("created_at", { ascending: false }).limit(50).then(({ data }) => {
      if (!mounted) return;
      setEntries(data ?? []);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const credits = useMemo(() => entries.filter((entry) => entry.direction === "credit").reduce((sum, entry) => sum + Number(entry.amount), 0), [entries]);
  const debits = useMemo(() => entries.filter((entry) => entry.direction === "debit").reduce((sum, entry) => sum + Number(entry.amount), 0), [entries]);

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Business" title="Wallet activity" description="A focused ledger view for customer deposits, order debits and other wallet movements." />
      <section className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent><p className="text-xs uppercase tracking-[0.14em] text-faint-foreground">Entries shown</p><p className="mt-2 font-display text-2xl font-semibold text-white">{loading ? "—" : entries.length}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs uppercase tracking-[0.14em] text-faint-foreground">Credits</p><p className="mt-2 font-display text-2xl font-semibold text-success">GH₵{credits.toFixed(2)}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs uppercase tracking-[0.14em] text-faint-foreground">Debits</p><p className="mt-2 font-display text-2xl font-semibold text-amber">GH₵{debits.toFixed(2)}</p></CardContent></Card>
      </section>
      <Card><CardContent>{!loading && entries.length === 0 ? <div className="grid min-h-72 place-items-center text-center"><div><WalletCards className="mx-auto text-faint-foreground" size={28} /><h2 className="mt-4 font-display text-xl font-semibold text-white">No wallet activity yet</h2><p className="mt-2 text-sm text-muted-foreground">Deposits and order debits will appear here.</p></div></div> : <div className="space-y-2">{entries.map((entry) => <div key={`${entry.reference}-${entry.created_at}`} className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${entry.direction === "credit" ? "bg-success/[0.1] text-success" : "bg-amber/[0.1] text-amber"}`}>{entry.direction === "credit" ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}</span><div className="min-w-0 flex-1"><p className="truncate font-semibold text-white">{entry.reference}</p><p className="mt-1 text-xs text-muted-foreground">{formatAdminDate(entry.created_at)}</p></div><div className="text-right"><p className={`font-display font-semibold ${entry.direction === "credit" ? "text-success" : "text-amber"}`}>{entry.direction === "credit" ? "+" : "−"}GH₵{Number(entry.amount).toFixed(2)}</p><Badge variant="neutral" className="mt-1">{readableStatus(entry.type)}</Badge></div></div>)}</div>}</CardContent></Card>
    </div>
  );
}
