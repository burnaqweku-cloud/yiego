import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calculator, Landmark, RefreshCw, Store } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Field, Money, Panel, Row, Rows, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { useAuth } from "@/store/auth-context";

/* Master balance — the money in your hand right now: what Paystack has paid
   into the bank, minus what you have put in from your own pocket.
   Below it, the things that would change it, with the supplier balances
   typed in by hand because DBH can't be read and the rest can drift. */

interface Overview { start: string; cash: { bank: number; paystack_transit: number; supplier_float: Record<string, number> }; owed: { customer_wallets: number; undelivered: number; undelivered_count: number; refunds_due: number }; funding: { outside: number; carried_in: number } }
interface Supplier { id: string; code: string; name: string; balance: number | null; last_balance_checked_at: string | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

export default function AdminMasterBalance() {
  const { user } = useAuth(); const actor = user?.id ?? "";
  const [o, setO] = useState<Overview | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stated, setStated] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastConfirmed, setLastConfirmed] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [ov, su, last] = await Promise.all([
      db().rpc("finance_overview", { p_from: null, p_to: null }),
      db().from("suppliers").select("id, code, name, balance, last_balance_checked_at").order("display_order"),
      db().from("supplier_balance_readings").select("observed_at").eq("source", "admin").order("observed_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setO((ov.data as Overview) ?? null); const list: Supplier[] = su.data ?? []; setSuppliers(list);
    setStated(Object.fromEntries(list.map((s) => [s.code, s.balance == null ? "" : Number(s.balance).toFixed(2)])));
    setLastConfirmed(last.data?.observed_at ?? null); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const bank = Number(o?.cash.bank ?? 0), atPaystack = Number(o?.cash.paystack_transit ?? 0);
  const putIn = Number(o?.funding.outside ?? 0);
  const master = bank - putIn;
  const owed = Number(o?.owed.customer_wallets ?? 0) + Number(o?.owed.undelivered ?? 0) + Number(o?.owed.refunds_due ?? 0);
  const booksFloat = (code: string) => Number(o?.cash.supplier_float?.[code] ?? 0);
  const statedFloat = (code: string) => { const n = Number(stated[code]); return Number.isFinite(n) && stated[code] !== "" ? n : null; };
  const diffs = useMemo(() => suppliers.map((s) => ({ s, books: booksFloat(s.code), typed: statedFloat(s.code) })).filter((x) => x.typed != null && Math.abs(x.typed - x.books) >= 0.01), [suppliers, stated, o]); // eslint-disable-line react-hooks/exhaustive-deps
  const suppliersTotal = suppliers.reduce((a, s) => a + (statedFloat(s.code) ?? booksFloat(s.code)), 0);

  const calculate = async () => {
    if (diffs.length === 0) { toast.success("Books already match what you typed."); return; }
    setBusy(true);
    for (const d of diffs) {
      const { error } = await db().rpc("finance_set_supplier_float", { p_actor: actor, p_supplier_code: d.s.code, p_balance: d.typed, p_note: `Admin confirmed ${d.s.name} balance from the supplier's site` });
      if (error) { toast.error(`${d.s.name}: ${error.message}`); setBusy(false); return; }
    }
    toast.success(`Books updated for ${diffs.map((d) => d.s.name).join(", ")}.`);
    setBusy(false); void load();
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Master balance" description="Money in your hand right now: what Paystack has paid into the bank, minus what you put in from your own pocket." action={<div className="flex gap-2"><Link to="/admin/finance"><Button variant="ghost" size="sm"><ArrowLeft size={14} />Finance</Button></Link><Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={14} /></Button></div>} />

      <Panel title="Master balance" icon={Landmark} note={lastConfirmed ? `suppliers last confirmed ${formatAdminDate(lastConfirmed)}` : "suppliers not yet confirmed by hand"}>
        <p className={`text-[30px] font-semibold leading-none tabular-nums ${master >= 0 ? "text-ink-emerald" : "text-ink-rose"}`}>{loading ? "…" : formatGHS(master)}</p>
        <p className="mt-2 text-[12px] text-muted-foreground">bank {formatGHS(bank)} − put in {formatGHS(putIn)}</p>
      </Panel>

      <StatGrid cols={3}>
        <Stat loading={loading} label="Coming from Paystack" value={<Money value={atPaystack} tone="good" />} note="next payout; master balance rises by this" tone="good" />
        <Stat loading={loading} label="At suppliers" value={<Money value={suppliersTotal} />} note="yours, but committed to bundles" icon={Store} />
        <Stat loading={loading} label="Belongs to customers" value={<Money value={owed} />} note="inside the bank figure; wallets + undelivered + refunds" tone="warn" />
      </StatGrid>

      <Panel title="Confirm supplier balances" icon={Calculator} note="type what each supplier's site shows, then Calculate">
        <div className="grid gap-2 sm:grid-cols-3">
          {suppliers.map((s) => <Field key={s.code} label={`${s.name} · books say ${formatGHS(booksFloat(s.code))}`}><input inputMode="decimal" value={stated[s.code] ?? ""} onChange={(e) => setStated((x) => ({ ...x, [s.code]: e.target.value }))} placeholder="0.00" className={inputCls} /></Field>)}
        </div>
        {diffs.length > 0 && (
          <Rows empty="">{diffs.map((d) => <Row key={d.s.code} primary={d.s.name} secondary={`books ${formatGHS(d.books)} → you say ${formatGHS(d.typed ?? 0)}`} right={`${(d.typed ?? 0) - d.books >= 0 ? "+" : "−"}${formatGHS(Math.abs((d.typed ?? 0) - d.books))}`} rightNote="books will move" tone={(d.typed ?? 0) - d.books < 0 ? "bad" : "good"} />)}</Rows>
        )}
        <p className="mt-2 text-[11px] text-faint-foreground">Calculate moves each float to your figure and books the difference against cost of bundles, with a dated note. Orders still in flight at a supplier will show up here as a small gap until they're delivered — that's normal.</p>
        <div className="mt-3 flex justify-end"><Button onClick={() => void calculate()} disabled={busy || loading}>{busy ? "Updating…" : diffs.length ? `Calculate & update ${diffs.length}` : "Calculate"}</Button></div>
      </Panel>

      <Panel title="How it's made up">
        <Rows empty="">
          <Row primary="Received into bank" secondary="Paystack payouts since launch, plus what was there on 12 Sept" right={formatGHS(bank)} tone="good" />
          <Row primary="Put in from your pocket" secondary="top-ups and their charges since launch" right={`− ${formatGHS(putIn)}`} />
          <Row primary="Master balance" secondary="in your hand now" right={formatGHS(master)} tone={master >= 0 ? "good" : "bad"} />
          <Row primary="…of which customers' money" secondary={`wallets ${formatGHS(Number(o?.owed.customer_wallets ?? 0))} · undelivered ${formatGHS(Number(o?.owed.undelivered ?? 0))} · refunds ${formatGHS(Number(o?.owed.refunds_due ?? 0))}`} right={formatGHS(owed)} tone="warn" />
        </Rows>
      </Panel>
    </div>
  );
}
