import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calculator, Landmark, RefreshCw, Store } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Field, Money, Panel, Row, Rows, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { RecordPartnerCapitalModal, RecordTopupModal } from "@/components/admin/FinanceForms";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { useAuth } from "@/store/auth-context";

/* Master balance — the pot: money partners put in + payouts received
   − top-ups paid (charges included). It is the cash in the account.
   Partner money and payouts raise it; every top-up lowers it.
   Net worth — the fuller picture, kept underneath:
     bank + Paystack pending + supplier balances − owed to customers.
   Supplier figures are what the suppliers themselves report: DataMartGH and
   InstantDataGH from their balance endpoint (every 10 min), DataBundlesHub
   from the receipt of the latest order sent. Each shows when it was read.
   Calculate lets you override with what you see on their site. */

interface Overview { start: string; cash: { bank: number; paystack_transit: number; supplier_float: Record<string, number> }; owed: { customer_wallets: number; undelivered: number; undelivered_count: number; refunds_due: number }; funding: { outside: number; carried_in: number } }
interface Supplier { id: string; code: string; name: string; balance: number | null; last_balance_checked_at: string | null; confirmed_balance: number | null; confirmed_at: string | null }
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
  const [pot, setPot] = useState<{ partner_money: number; payouts: number; topups: number; pot: number } | null>(null);
  const [adding, setAdding] = useState(false); const [topping, setTopping] = useState(false);

  const load = useCallback(async () => {
    const [ov, su, last, potRes] = await Promise.all([
      db().rpc("finance_overview", { p_from: null, p_to: null }),
      db().from("suppliers").select("id, code, name, balance, last_balance_checked_at, confirmed_balance, confirmed_at").order("display_order"),
      db().from("supplier_balance_readings").select("observed_at").eq("source", "admin").order("observed_at", { ascending: false }).limit(1).maybeSingle(),
      db().rpc("finance_pot", {}),
    ]);
    setPot((potRes.data as typeof pot) ?? null);
    setO((ov.data as Overview) ?? null); const list: Supplier[] = su.data ?? []; setSuppliers(list);
    setStated(Object.fromEntries(list.map((s) => [s.code, s.confirmed_balance == null ? "" : Number(s.confirmed_balance).toFixed(2)])));
    setLastConfirmed(list.reduce<string | null>((a, s) => (s.confirmed_at && (!a || s.confirmed_at < a) ? s.confirmed_at : a), null) ?? last.data?.observed_at ?? null); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const bank = Number(o?.cash.bank ?? 0), atPaystack = Number(o?.cash.paystack_transit ?? 0);
  const owed = Number(o?.owed.customer_wallets ?? 0) + Number(o?.owed.undelivered ?? 0) + Number(o?.owed.refunds_due ?? 0);
  const booksFloat = (code: string) => Number(o?.cash.supplier_float?.[code] ?? 0);
  const confirmedFloat = (code: string) => Number(suppliers.find((s) => s.code === code)?.confirmed_balance ?? booksFloat(code));
  const statedFloat = (code: string) => { const n = Number(stated[code]); return Number.isFinite(n) && stated[code] !== "" ? n : null; };
  const diffs = useMemo(() => suppliers.map((s) => ({ s, books: confirmedFloat(s.code), typed: statedFloat(s.code) })).filter((x) => x.typed != null && Math.abs(x.typed - x.books) >= 0.01), [suppliers, stated, o]); // eslint-disable-line react-hooks/exhaustive-deps
  const suppliersTotal = suppliers.reduce((a, s) => a + confirmedFloat(s.code), 0);
  const staleHours = lastConfirmed ? (Date.now() - +new Date(lastConfirmed)) / 3600000 : Infinity;
  const partnerMoney = Number(pot?.partner_money ?? 0), payouts = Number(pot?.payouts ?? 0), topups = Number(pot?.topups ?? 0);
  const master = Number(pot?.pot ?? 0);
  const netWorth = master + atPaystack + suppliersTotal - owed;
  const made = netWorth - partnerMoney;

  const calculate = async () => {
    setBusy(true);
    for (const s of suppliers) {
      const typed = statedFloat(s.code); if (typed == null) continue;
      const { error } = await db().rpc("finance_confirm_supplier_balance", { p_actor: actor, p_supplier_code: s.code, p_balance: typed });
      if (error) { toast.error(`${s.name}: ${error.message}`); setBusy(false); return; }
    }
    toast.success("Master balance calculated with your supplier figures.");
    setBusy(false); void load();
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Master balance" description="The pot: money partners put in, plus every Paystack payout, minus every top-up. It's the cash in the account." action={<div className="flex gap-2"><Link to="/admin/finance"><Button variant="ghost" size="sm"><ArrowLeft size={14} />Finance</Button></Link><Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={14} /></Button><Button variant="soft" size="sm" onClick={() => setAdding(true)}>Partner put in</Button><Button size="sm" onClick={() => setTopping(true)}>Record top-up</Button></div>} />

      <Panel title="Master balance" icon={Landmark} note={lastConfirmed ? `suppliers as reported ${formatAdminDate(lastConfirmed)}` : "waiting for supplier readings"}>
        {staleHours > 24 && <p className="mb-2 text-[11.5px] text-amber">One supplier hasn't reported for {Math.floor(staleHours / 24)} day{Math.floor(staleHours / 24) === 1 ? "" : "s"} — check its site and Calculate if it differs.</p>}
        <p className={`text-[30px] font-semibold leading-none tabular-nums ${master >= 0 ? "text-ink-emerald" : "text-ink-rose"}`}>{loading ? "…" : formatGHS(master)}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] tabular-nums">
          <span className="text-ink-emerald">Partners put in {formatGHS(partnerMoney)}</span><span className="text-faint-foreground">+</span>
          <span className="text-ink-emerald">Payouts received {formatGHS(payouts)}</span><span className="text-faint-foreground">−</span>
          <span className="text-ink-rose">Top-ups paid {formatGHS(topups)}</span>
        </p>
        <p className="mt-1.5 text-[12px] text-muted-foreground">Cash in the account now. {atPaystack > 0 ? `${formatGHS(atPaystack)} more is on its way from Paystack.` : ""}</p>
        <p className="mt-2 text-[12px] text-muted-foreground">Net worth {formatGHS(netWorth)} <span className="text-faint-foreground">(pot + Paystack {formatGHS(atPaystack)} + suppliers {formatGHS(suppliersTotal)} − customers' money {formatGHS(owed)})</span> · <span className={made >= 0 ? "text-ink-emerald" : "text-ink-rose"}>{made >= 0 ? "made" : "lost"} {formatGHS(Math.abs(made))}</span></p>
      </Panel>

      <StatGrid cols={3}>
        <Stat loading={loading} label="Payouts received" value={<Money value={payouts} tone="good" />} note="what Paystack has sent us" tone="good" />
        <Stat loading={loading} label="Held by Paystack" value={<Money value={atPaystack} tone="bad" />} note="paid by customers, not yet sent to us" tone="bad" />
        <Stat loading={loading} label="At suppliers" value={<Money value={suppliersTotal} />} note="as the suppliers report it" icon={Store} tone="warn" />
      </StatGrid>

      <Panel title="Override" icon={Calculator} note="only if a supplier's site shows something different">
        <div className="grid gap-2 sm:grid-cols-3">
          {suppliers.map((s) => <Field key={s.code} label={`${s.name} · reported ${formatGHS(confirmedFloat(s.code))}${s.confirmed_at ? ` at ${formatAdminDate(s.confirmed_at)}` : ""}`}><input inputMode="decimal" value={stated[s.code] ?? ""} onChange={(e) => setStated((x) => ({ ...x, [s.code]: e.target.value }))} placeholder="0.00" className={inputCls} /></Field>)}
        </div>
        {diffs.length > 0 && (
          <Rows empty="">{diffs.map((d) => <Row key={d.s.code} primary={d.s.name} secondary={`books ${formatGHS(d.books)} → you say ${formatGHS(d.typed ?? 0)}`} right={`${(d.typed ?? 0) - d.books >= 0 ? "+" : "−"}${formatGHS(Math.abs((d.typed ?? 0) - d.books))}`} rightNote="books will move" tone={(d.typed ?? 0) - d.books < 0 ? "bad" : "good"} />)}</Rows>
        )}
        <p className="mt-2 text-[11px] text-faint-foreground">DataMartGH and InstantDataGH are read from their balance endpoint every 10 minutes; DataBundlesHub from the receipt of the latest order sent. If a site shows something else, type it and Calculate — your figure wins until the next reading.</p>
        <div className="mt-3 flex justify-end"><Button onClick={() => void calculate()} disabled={busy || loading}>{busy ? "Calculating…" : "Calculate"}</Button></div>
      </Panel>

      <Panel title="How it's made up">
        <Rows empty="">
          <Row primary="Partners put in" secondary="fresh money from partners' own pockets, starting with the first 800" right={formatGHS(partnerMoney)} tone="good" />
          <Row primary="Payouts received" secondary="every Paystack payout since launch, after their fees" right={`+ ${formatGHS(payouts)}`} tone="good" />
          <Row primary="Top-ups paid" secondary="every top-up to a supplier, charges included" right={`− ${formatGHS(topups)}`} tone="bad" />
          <Row primary="Master balance" secondary="the pot: cash in the account now" right={formatGHS(master)} tone={master >= 0 ? "good" : "bad"} />
          <Row primary="Held by Paystack" secondary="paid by customers, arriving with the next payout" right={`+ ${formatGHS(atPaystack)}`} tone="muted" />
          <Row primary="At suppliers" secondary={suppliers.map((s) => `${s.name} ${formatGHS(confirmedFloat(s.code))}`).join(" · ")} right={`+ ${formatGHS(suppliersTotal)}`} tone="warn" />
          <Row primary="Customers' money we hold" secondary={`wallets ${formatGHS(Number(o?.owed.customer_wallets ?? 0))} · paid, not delivered ${formatGHS(Number(o?.owed.undelivered ?? 0))} · refunds ${formatGHS(Number(o?.owed.refunds_due ?? 0))}`} right={`− ${formatGHS(owed)}`} tone="muted" />
          <Row primary="Net worth" secondary="everything that's ours, wherever it sits" right={formatGHS(netWorth)} tone={netWorth >= 0 ? "good" : "bad"} />
          <Row primary={made >= 0 ? "Made" : "Lost"} secondary="net worth minus what partners put in" right={formatGHS(Math.abs(made))} tone={made >= 0 ? "good" : "bad"} />
        </Rows>
      </Panel>
      <RecordPartnerCapitalModal open={adding} onClose={() => setAdding(false)} actorId={actor} onDone={() => void load()} />
      <RecordTopupModal open={topping} onClose={() => setTopping(false)} actorId={actor} suppliers={suppliers.map((s) => ({ code: s.code, name: s.name, fee_rate: 0 }))} onDone={() => void load()} />
    </div>
  );
}
