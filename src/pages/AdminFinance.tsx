import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Banknote, Download, Landmark, PiggyBank, Receipt, RefreshCw, Store, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { ConfirmTopupModal, RecordExpenseModal, RecordPayoutModal, RecordTopupModal, ReverseEntryModal, type TopupCandidate } from "@/components/admin/FinanceForms";
import { InlineAction, Money, Panel, Pill, Row, Rows, Segmented, Stat, StatGrid, type Tone } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { useAuth } from "@/store/auth-context";

/* ═══════════════════════════════════════════════════════════════════════
   Finance — one page over the ledger.

   Balances (cash, owed) are always "right now". Profit obeys the period
   picker. Every list below is a view over phase1.finance_entries; the
   forms write through the audited finance_record_* functions.
   ═══════════════════════════════════════════════════════════════════════ */

type Period = "today" | "7d" | "30d" | "all";
const PERIODS: { value: Period; label: string }[] = [{ value: "today", label: "Today" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "all", label: "Since launch" }];
function periodFrom(p: Period): string | null {
  if (p === "all") return null;
  const d = new Date();
  if (p === "today") { d.setHours(0, 0, 0, 0); return d.toISOString(); }
  d.setDate(d.getDate() - (p === "7d" ? 7 : 30)); return d.toISOString();
}

interface Overview {
  start: string;
  cash: { bank: number; paystack_transit: number; supplier_float: Record<string, number> };
  owed: { customer_wallets: number; undelivered: number; undelivered_count: number; refunds_due: number };
  funding: { outside: number; carried_in: number };
  period: { revenue: number; fee_income: number; cost_of_bundles: number; paystack_fees: number; topup_fees: number; other_expenses: number; gross_profit: number; net: number; net_excluding_fee_passthrough: number };
  all_time: { cash_in: number; payouts_received: number; supplier_topups: number; delivered_revenue: number };
}
interface Entry { id: string; kind: string; reference: string | null; occurred_at: string; amount: number; source: string; note: string | null; metadata: Record<string, unknown>; supplier_id: string | null; reverses: string | null; created_at: string }
interface SupplierRow { id: string; code: string; name: string; balance: number | null; last_balance_checked_at: string | null; metadata: Record<string, unknown> | null }
interface CandidateRow { id: string; supplier_id: string; amount: number; balance_before: number; balance_after: number; detected_at: string; status: string }

const KIND_LABEL: Record<string, string> = { order_paid: "Order paid", order_delivered: "Order delivered", order_refunded: "Order refunded", wallet_deposit: "Wallet deposit", paystack_payout: "Paystack payout", supplier_topup: "Supplier top-up", expense: "Expense", reversal: "Reversal", opening_balance: "Carried in" };
const KIND_TONE: Record<string, Tone> = { order_paid: "good", wallet_deposit: "good", paystack_payout: "good", order_delivered: "default", supplier_topup: "default", order_refunded: "warn", expense: "bad", reversal: "muted", opening_balance: "muted" };
type LedgerFilter = "all" | "money_in" | "payouts" | "topups" | "expenses" | "corrections";
const LEDGER_FILTERS: { value: LedgerFilter; label: string; kinds: string[] | null }[] = [
  { value: "all", label: "All", kinds: null }, { value: "money_in", label: "Money in", kinds: ["order_paid", "wallet_deposit"] }, { value: "payouts", label: "Payouts", kinds: ["paystack_payout"] },
  { value: "topups", label: "Top-ups", kinds: ["supplier_topup"] }, { value: "expenses", label: "Expenses", kinds: ["expense", "order_refunded"] }, { value: "corrections", label: "Corrections", kinds: ["reversal", "opening_balance"] },
];
const SUPPLIER_LABEL: Record<string, string> = { databundleshub: "DBH", datamartgh: "DataMartGH", instantdatagh: "InstantData" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

export default function AdminFinance() {
  const { user } = useAuth();
  const actorId = user?.id ?? "";
  const [period, setPeriod] = useState<Period>("all");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>("all");
  const [ledgerLimit, setLedgerLimit] = useState(30);
  const [modal, setModal] = useState<"topup" | "payout" | "expense" | null>(null);
  const [confirming, setConfirming] = useState<TopupCandidate | null>(null);
  const [reversing, setReversing] = useState<Entry | null>(null);

  const load = useCallback(async () => {
    const [ov, en, su, ca] = await Promise.all([
      db().rpc("finance_overview", { p_from: periodFrom(period), p_to: null }),
      db().from("finance_entries").select("id, kind, reference, occurred_at, amount, source, note, metadata, supplier_id, reverses, created_at").order("occurred_at", { ascending: false }).limit(400),
      db().from("suppliers").select("id, code, name, balance, last_balance_checked_at, metadata").order("display_order"),
      db().from("supplier_topup_candidates").select("id, supplier_id, amount, balance_before, balance_after, detected_at, status").eq("status", "pending").order("detected_at", { ascending: false }),
    ]);
    if (ov.error) toast.error(ov.error.message);
    setOverview((ov.data as Overview) ?? null); setEntries(en.data ?? []); setSuppliers(su.data ?? []); setCandidates(ca.data ?? []); setLoading(false);
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);
  const reversedIds = useMemo(() => new Set(entries.filter((e) => e.reverses).map((e) => e.reverses as string)), [entries]);
  const live = useCallback((e: Entry) => e.kind !== "reversal" && !reversedIds.has(e.id), [reversedIds]);
  const payouts = useMemo(() => entries.filter((e) => e.kind === "paystack_payout" && live(e)).slice(0, 8), [entries, live]);
  const topups = useMemo(() => entries.filter((e) => e.kind === "supplier_topup" && live(e)).slice(0, 8), [entries, live]);
  const ledger = useMemo(() => { const f = LEDGER_FILTERS.find((x) => x.value === ledgerFilter)!; return entries.filter((e) => !f.kinds || f.kinds.includes(e.kind)); }, [entries, ledgerFilter]);
  const supplierOptions = useMemo(() => suppliers.map((s) => ({ code: s.code, name: s.name, fee_rate: Number(s.metadata?.topup_fee_rate ?? 0) })), [suppliers]);
  const candidateFor = (c: CandidateRow): TopupCandidate | null => { const s = supplierById.get(c.supplier_id); return s ? { id: c.id, supplier_code: s.code, supplier_name: s.name, amount: Number(c.amount), balance_before: Number(c.balance_before), balance_after: Number(c.balance_after), detected_at: c.detected_at, fee_rate: Number(s.metadata?.topup_fee_rate ?? 0) } : null; };

  const exportCsv = () => {
    const head = ["date", "kind", "reference", "amount", "source", "note"];
    const rows = ledger.map((e) => [e.occurred_at, e.kind, e.reference ?? "", e.amount, e.source, (e.note ?? "").replace(/"/g, "'")]);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `datayego-ledger-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const o = overview; const p = o?.period; const float = o?.cash.supplier_float ?? {};
  const floatTotal = Object.values(float).reduce((a, b) => a + Number(b), 0);
  const cashTotal = Number(o?.cash.bank ?? 0) + Number(o?.cash.paystack_transit ?? 0) + floatTotal;
  const owedTotal = Number(o?.owed.customer_wallets ?? 0) + Number(o?.owed.undelivered ?? 0) + Number(o?.owed.refunds_due ?? 0);

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Finance" description={o ? `Official books since ${new Date(o.start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}. Balances are live; profit follows the period.` : "Loading the books…"}
        action={<div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={15} /></Button><Button size="sm" onClick={() => setModal("topup")}>Record top-up</Button></div>} />

      {candidates.length > 0 && (
        <Panel title={`${candidates.length} top-up${candidates.length > 1 ? "s" : ""} detected`} icon={Store} note="tap to confirm or dismiss">
          <Rows empty="">{candidates.map((c) => { const s = supplierById.get(c.supplier_id); return <Row key={c.id} primary={`${s?.name ?? "Supplier"} balance rose by ${formatGHS(Number(c.amount))}`} secondary={`${formatGHS(Number(c.balance_before))} → ${formatGHS(Number(c.balance_after))} · ${formatAdminDate(c.detected_at)}`} right="Confirm" tone="good" onClick={() => setConfirming(candidateFor(c))} />; })}</Rows>
        </Panel>
      )}

      <Panel title="Where the money is" icon={Landmark} note={`total ${formatGHS(cashTotal)}`}>
        <StatGrid>
          <Stat loading={loading} label="Bank" value={<Money value={o?.cash.bank} />} note="Paystack payouts received" icon={Banknote} tone="good" />
          <Stat loading={loading} label="At Paystack" value={<Money value={o?.cash.paystack_transit} />} note="paid by customers, not yet paid out" icon={PiggyBank} />
          {suppliers.map((s) => (
            <Stat key={s.code} loading={loading} label={`${s.name} float`} value={<Money value={float[s.code]} />} icon={Store}
              note={s.balance == null ? "not connected yet" : Math.abs(Number(s.balance) - Number(float[s.code] ?? 0)) < 1 ? `supplier agrees · ${formatAdminDate(s.last_balance_checked_at ?? "")}` : `supplier says ${formatGHS(Number(s.balance))}`} />
          ))}
        </StatGrid>
      </Panel>

      <Panel title="What we owe" icon={Wallet} note={`total ${formatGHS(owedTotal)}`}>
        <StatGrid>
          <Stat loading={loading} label="Customer wallets" value={<Money value={o?.owed.customer_wallets} />} note="balances customers hold" to="/admin/wallet" />
          <Stat loading={loading} label="Paid, not delivered" value={<Money value={o?.owed.undelivered} />} note={`${o?.owed.undelivered_count ?? 0} orders`} tone={Number(o?.owed.undelivered_count) > 0 ? "warn" : "default"} to="/admin/orders" />
          <Stat loading={loading} label="Refunds owed" value={<Money value={o?.owed.refunds_due} />} note="refunded orders, money not yet returned" tone={Number(o?.owed.refunds_due) > 0 ? "bad" : "default"} />
          <Stat loading={loading} label="Money put in" value={<Money value={o?.funding.outside} />} note={`top-ups + charges · ${formatGHS(Number(o?.funding.carried_in ?? 0))} carried in from before launch`} />
        </StatGrid>
      </Panel>

      <Panel title="Profit" icon={Receipt} action={<div className="w-[220px] sm:w-[300px]"><Segmented<Period> value={period} onChange={setPeriod} options={PERIODS} /></div>}>
        <StatGrid>
          <Stat loading={loading} label="Bundles sold (delivered)" value={<Money value={p?.revenue} />} />
          <Stat loading={loading} label="Bundle cost" value={<Money value={p?.cost_of_bundles} />} />
          <Stat loading={loading} label="Margin on bundles" value={<Money value={p?.gross_profit} tone={Number(p?.gross_profit) < 0 ? "bad" : "default"} />} note="sales minus supplier cost" />
          <Stat loading={loading} label="4% checkout fee collected" value={<Money value={p?.fee_income} />} note="charged on top of the price" tone="good" />
          <Stat loading={loading} label="Paystack fees" value={<Money value={p?.paystack_fees} />} tone="muted" />
          <Stat loading={loading} label="Top-up charges + expenses" value={<Money value={Number(p?.topup_fees ?? 0) + Number(p?.other_expenses ?? 0)} />} tone="muted" />
        </StatGrid>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Stat loading={loading} label="Net profit" value={<Money value={p?.net} tone={Number(p?.net) < 0 ? "bad" : "good"} />} note="everything in, everything out" tone={Number(p?.net) < 0 ? "bad" : "good"} />
          <Stat loading={loading} label="Net without the 4% fee" value={<Money value={p?.net_excluding_fee_passthrough} tone={Number(p?.net_excluding_fee_passthrough) < 0 ? "bad" : "default"} />} note="what the bundles alone earn" />
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Paystack payouts" icon={ArrowDownToLine} action={<InlineAction onClick={() => setModal("payout")}>Record manually</InlineAction>}>
          <Rows empty="No payouts yet.">{payouts.map((e) => <Row key={e.id} primary={formatAdminDate(e.occurred_at)} secondary={e.source === "auto" ? `from Paystack · fees ${formatGHS(Number(e.metadata?.fees ?? 0))}` : e.note ?? "recorded by hand"} right={formatGHS(Number(e.amount))} rightNote={<Pill tone={e.source === "auto" ? "good" : "muted"}>{e.source === "auto" ? "auto" : "manual"}</Pill>} tone="good" />)}</Rows>
        </Panel>
        <Panel title="Supplier top-ups" icon={ArrowUpFromLine} action={<InlineAction onClick={() => setModal("topup")}>Record</InlineAction>}>
          <Rows empty="No top-ups recorded.">{topups.map((e) => { const s = e.supplier_id ? supplierById.get(e.supplier_id) : null; return <Row key={e.id} primary={`${s?.name ?? "Supplier"} · ${formatAdminDate(e.occurred_at)}`} secondary={`charge ${formatGHS(Number(e.metadata?.fee ?? 0))} · ${e.metadata?.paid_from === "bank" ? "from bank" : "from outside"}${e.note ? ` · ${e.note}` : ""}`} right={formatGHS(Number(e.amount))} rightNote={<Pill tone={e.source === "seed" ? "muted" : "default"}>{e.source === "seed" ? "opening" : "recorded"}</Pill>} />; })}</Rows>
        </Panel>
      </div>

      <Panel title="Ledger" icon={Receipt} action={<div className="flex gap-1"><Button variant="quiet" size="sm" onClick={() => setModal("expense")}>Expense</Button><Button variant="quiet" size="sm" onClick={exportCsv} aria-label="Export CSV"><Download size={15} /></Button></div>}>
        <Segmented<LedgerFilter> value={ledgerFilter} onChange={(v) => { setLedgerFilter(v); setLedgerLimit(30); }} options={LEDGER_FILTERS.map(({ value, label }) => ({ value, label }))} />
        <div className="mt-2">
          <Rows empty="Nothing in this view.">
            {ledger.slice(0, ledgerLimit).map((e) => {
              const undone = reversedIds.has(e.id);
              const sup = e.supplier_id ? SUPPLIER_LABEL[supplierById.get(e.supplier_id)?.code ?? ""] : null;
              const via = e.metadata?.via ? ` · ${e.metadata.via}` : "";
              const canReverse = !undone && e.kind !== "reversal" && ["supplier_topup", "paystack_payout", "expense", "opening_balance"].includes(e.kind) && e.source !== "auto";
              return (
                <Row key={e.id}
                  primary={<span className={undone ? "line-through opacity-60" : ""}>{KIND_LABEL[e.kind] ?? e.kind}{e.reference && !e.reference.startsWith("seed:") && !e.reference.startsWith("paystack:") ? ` · ${e.reference}` : ""}{sup ? ` · ${sup}` : ""}{via}</span>}
                  secondary={<>{formatAdminDate(e.occurred_at)}{e.note ? ` · ${e.note}` : ""}{canReverse && <> · <button type="button" onClick={() => setReversing(e)} className="inline-flex items-center gap-1 text-primary-glow"><Undo2 size={11} />reverse</button></>}</>}
                  right={<span className={undone ? "line-through opacity-60" : ""}>{formatGHS(Number(e.amount))}</span>} rightNote={undone ? "reversed" : e.source === "auto" ? "auto" : e.source}
                  tone={undone ? "muted" : KIND_TONE[e.kind] ?? "default"} />
              );
            })}
          </Rows>
          {ledger.length > ledgerLimit && <button type="button" onClick={() => setLedgerLimit((n) => n + 50)} className="mt-2 w-full py-2 text-[12.5px] font-semibold text-primary-glow">Show {Math.min(50, ledger.length - ledgerLimit)} more</button>}
        </div>
      </Panel>

      <RecordTopupModal open={modal === "topup"} onClose={() => setModal(null)} actorId={actorId} suppliers={supplierOptions} onDone={load} />
      <RecordPayoutModal open={modal === "payout"} onClose={() => setModal(null)} actorId={actorId} onDone={load} />
      <RecordExpenseModal open={modal === "expense"} onClose={() => setModal(null)} actorId={actorId} onDone={load} />
      <ConfirmTopupModal open={confirming !== null} onClose={() => setConfirming(null)} actorId={actorId} candidate={confirming} onDone={load} />
      <ReverseEntryModal open={reversing !== null} onClose={() => setReversing(null)} actorId={actorId} entry={reversing ? { id: reversing.id, kind: reversing.kind, amount: Number(reversing.amount), reference: reversing.reference } : null} onDone={load} />
    </div>
  );
}
