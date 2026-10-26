import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, History, Minus, Receipt, PiggyBank, Plus, RefreshCw, Store, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Field, inputCls, Money, Panel, Stat, StatGrid } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { RecordPartnerCapitalModal, RecordTopupModal } from "@/components/admin/FinanceForms";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { estimateProfitAfterPendingFees, financeProfit, isHealthyInFlight, profitIfAllDeliver, type InFlightOrder, type Line } from "@/lib/financeV2";
import { usePaystackHeld } from "@/lib/usePaystackHeld";
import { useAuth } from "@/store/auth-context";

interface Balance { code: string; name: string; kind: string; balance: number | string }
interface Supplier { id: string; code: string; name: string; confirmed_balance: number | null; confirmed_at: string | null; metadata?: { topup_fee_rate?: number } | null }
type QueuedOrder = InFlightOrder & { order_reference: string; supplier_id: string | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
const when = (v: string) => new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" }).format(new Date(v));

export default function AdminFinanceV2() {
  const { user } = useAuth(); const actor = user?.id ?? "";
  const [balances, setBalances] = useState<Balance[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isMaster, setIsMaster] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [topup, setTopup] = useState(false); const [putIn, setPutIn] = useState(false); const [out, setOut] = useState(false);
  const [inFlight, setInFlight] = useState<InFlightOrder[]>([]);
  const [inFlightReady, setInFlightReady] = useState(false);
  const ps = usePaystackHeld(!!user);

  const load = useCallback(async () => {
    setLoading(true); setFailed(false); setInFlightReady(false);
    const [b, s, role, f] = await Promise.all([
      db().from("finance_balances").select("code, name, kind, balance").order("sort_order"),
      db().from("suppliers").select("id, code, name, confirmed_balance, confirmed_at, metadata").order("display_order"),
      actor ? db().rpc("admin_role", { p_user: actor }) : Promise.resolve({ data: null, error: null }),
      // Everything paid and not finished yet; financeV2 picks out the healthy ones and reports the rest as not counted.
      (async () => {
        const rows: QueuedOrder[] = [];
        for (let offset = 0; ; offset += 500) {
          const page = await db().from("orders").select("order_reference, supplier_id, amount, cost_amount, agent_margin, parent_margin, status, admin_resolution_status, supplier_purchase_id, supplier_order_reference, supplier_status").eq("payment_status", "succeeded").not("status", "in", '("delivered","cancelled","refunded")').order("id").range(offset, offset + 499);
          if (page.error) return { data: null, error: page.error };
          rows.push(...(page.data ?? []));
          if ((page.data ?? []).length < 500) return { data: rows, error: null };
        }
      })(),
    ]);
    const supplierRows = (s.data ?? []) as Supplier[];
    const queued = await Promise.all(((f.data ?? []) as QueuedOrder[]).map(async (order) => {
      if (!isHealthyInFlight(order)) return order;
      const fee = await db().rpc("order_fee_pending", { p_reference: order.order_reference });
      const supplier = supplierRows.find((x) => x.id === order.supplier_id);
      return { ...order, pending_fee: Number(fee.data ?? 0), supplier_cost_in_assets: supplier?.confirmed_balance != null, readingFailed: Boolean(fee.error || !supplier || !Number.isFinite(Number(fee.data))) };
    }));
    setInFlight(queued);
    setInFlightReady(!f.error && !s.error && !queued.some((o) => "readingFailed" in o && o.readingFailed));
    if (b.error || s.error || !b.data?.length || !b.data.some((x: Balance) => x.code === "bank") || !b.data.some((x: Balance) => x.code === "outside_funding")) { setFailed(true); setBalances(null); }
    else { setBalances(b.data); setSuppliers(s.data ?? []); }
    setIsMaster(role.data === "master"); setLoading(false);
  }, [actor]);
  useEffect(() => { void load(); }, [load]);
  const refresh = () => { void load(); void ps.load(); };

  const view = useMemo(() => {
    if (!balances || !ps.held) return null;
    const num = (code: string) => Number(balances.find((x) => x.code === code)?.balance ?? 0);
    const supplierLines: (Line & { reportedAt: string | null; reported: boolean })[] = suppliers.map((s) => ({
      code: s.code, name: s.name, amount: s.confirmed_balance != null ? Number(s.confirmed_balance) : num(`float_${s.code}`), reportedAt: s.confirmed_at, reported: s.confirmed_balance != null,
    }));
    const owed: Line[] = balances.filter((x) => x.kind === "liability").map((x) => ({ code: x.code, name: x.name, amount: Number(x.balance) }));
    const bank = num("bank"), capital = num("outside_funding");
    return { bank, capital, supplierLines, owed, ...financeProfit({ bank, paystack: ps.held.total, suppliers: supplierLines, owed, capital }) };
  }, [balances, suppliers, ps.held]);

  return <div className="space-y-6">
    <AdminPageHeader title="Finance" description={ps.reading ? `Paystack read ${when(ps.reading.read_at)}` : "Bank, Paystack, suppliers, debts and profit."}
      action={<div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={refresh} aria-label="Refresh"><RefreshCw size={14} className={loading || ps.loading ? "animate-spin" : ""} /></Button>
        {isMaster && <Button size="sm" onClick={() => setTopup(true)}>Record top-up</Button>}
        {isMaster && <Button variant="soft" size="sm" onClick={() => setOut(true)}><Minus size={14} />Take money out</Button>}
        {isMaster && <Button variant="soft" size="sm" onClick={() => setPutIn(true)}><Plus size={14} />Partner put in</Button>}
      </div>} />

    {failed && <div role="alert" className="border-l-2 border-danger bg-danger/10 p-4 text-sm text-danger">Our records could not be loaded, so no totals are shown.</div>}
    {!failed && !view && <div role="status" className="flex flex-wrap items-center gap-3 text-sm">
      {loading || ps.loading ? <span className="text-muted-foreground">Loading balances and asking Paystack…</span>
        : <><span className="text-danger">Paystack's figure could not be fully read, so no totals are shown.</span><Button variant="ghost" size="sm" onClick={() => void ps.load()}><RefreshCw size={14} />Try again</Button></>}
    </div>}

    {view && ps.held && <>
      <StatGrid cols={3}>
        <Stat label="Money at bank" value={<Money value={view.bank} />} icon={Banknote} tone="good" note="Master balance" to="/admin/finance/master" />
        <Stat label="Money at Paystack" value={<Money value={ps.held.total} />} icon={PiggyBank} note="From Paystack · tap for details" to="/admin/finance-v2/paystack" />
        <Stat label="At suppliers" value={<Money value={view.supplierTotal} />} icon={Store} tone="warn" note={`${view.supplierLines.length} suppliers`} />
        <Stat label="Money we owe" value={<Money value={view.owedTotal} />} icon={Wallet} tone="bad" />
        <Stat label="Profit" value={<Money value={view.profit} />} icon={TrendingUp} tone={view.profit >= 0 ? "good" : "bad"} note={(() => {
          const all = profitIfAllDeliver(view.profit, inFlight);
          const notCounted = [all.verification ? `${all.verification} waiting on verification` : "", all.review ? `${all.review} under review` : "", all.wrongNetwork ? `${all.wrongNetwork} wrong network` : ""].filter(Boolean);
          return <>
            <span className="block">after {formatGHS(view.capital)} capital</span>
            {!inFlightReady ? <span className="mt-1 block">Delivery-ahead figure unavailable</span> : <>
            {all.counted > 0
              ? <span className="mt-1 block break-words">If all {all.counted} in-progress order{all.counted === 1 ? "" : "s"} deliver: <span className="font-medium tabular-nums text-foreground">{formatGHS(all.profit)}</span></span>
              : <span className="mt-1 block break-words">No healthy queued orders counted: <span className="font-medium tabular-nums text-foreground">{formatGHS(all.profit)}</span></span>}
            {all.missingCost > 0 && <span className="block text-faint-foreground">{all.missingCost} without recorded cost not counted</span>}
            {notCounted.length > 0 && <span className="block text-faint-foreground">{notCounted.join(" · ")} not counted</span>}
            </>}
            <span className="mt-1 block break-words">Estimated profit after pending fees: <span className="font-medium tabular-nums text-foreground">{formatGHS(estimateProfitAfterPendingFees(view.profit, ps.held.notYetScheduled).profit)}</span></span>
            <span className="block text-faint-foreground">2% of not-yet-scheduled money</span>
          </>;
        })()} />
      </StatGrid>
      <p className="break-words text-xs leading-5 tabular-nums text-muted-foreground">
        Bank {formatGHS(view.bank)} + Paystack {formatGHS(ps.held.total)} + suppliers {formatGHS(view.supplierTotal)} − owed {formatGHS(view.owedTotal)} − capital {formatGHS(view.capital)} = <span className="font-semibold text-foreground">{formatGHS(view.profit)}</span>
      </p>

      <Panel title="At suppliers" icon={Store} note={`total ${formatGHS(view.supplierTotal)}`}>
        <StatGrid cols={3}>{view.supplierLines.map((s) => {
          const tone = s.amount < 30 ? "bad" : s.amount < 80 ? "warn" : "default";
          return <Stat key={s.code} label={s.name} value={<Money value={s.amount} tone={tone} />} note={s.reported && s.reportedAt ? `reported ${formatAdminDate(s.reportedAt)}` : "not reported"} tone={tone} to={`/admin/finance/suppliers/${s.code}`} />;
        })}</StatGrid>
      </Panel>

      <section><h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><Wallet size={16} />Money we owe</h2>
        <StatGrid>{view.owed.map((l) => <Stat key={l.code} label={l.name} value={<Money value={l.amount} />} tone={l.amount > 0 ? "warn" : "default"}
          to={l.code === "customer_wallets" ? "/admin/wallet" : l.code === "owed_to_agents" ? "/admin/agents/payouts" : l.code === "owed_deliveries" ? "/admin/finance/undelivered" : undefined} />)}</StatGrid>
      </section>

      <section><h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><History size={16} />History</h2>
        <StatGrid cols={2}>
          <Stat label="Top-ups" value="View" icon={Store} note="Every supplier top-up with dates and charges" to="/admin/finance/history/topups" />
          <Stat label="Money in & out" value="View" icon={Receipt} note="Business costs, capital returned, capital put in" to="/admin/finance/history/money" />
        </StatGrid>
      </section>
    </>}

    <RecordTopupModal open={topup} onClose={() => setTopup(false)} actorId={actor} suppliers={suppliers.map((s) => ({ code: s.code, name: s.name, fee_rate: Number(s.metadata?.topup_fee_rate ?? 0) }))} onDone={() => void load()} />
    <RecordPartnerCapitalModal open={putIn} onClose={() => setPutIn(false)} actorId={actor} onDone={() => void load()} />
    <TakeOutModal open={out} onClose={() => setOut(false)} onDone={() => void load()} profit={view?.profit ?? null} />
  </div>;
}

function TakeOutModal({ open, onClose, onDone, profit }: { open: boolean; onClose: () => void; onDone: () => void; profit: number | null }) {
  const [kind, setKind] = useState<"spend" | "withdraw">("spend");
  const [amount, setAmount] = useState(""); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => {
    const v = Number(amount);
    if (!(v > 0) || reason.trim().length < 3) return toast.error("Enter the amount and what it was for.");
    setBusy(true);
    const { error } = await db().rpc("finance_master_adjust", { p_kind: kind, p_amount: v, p_reason: reason.trim() });
    setBusy(false);
    if (error) return toast.error("Not recorded. Refresh and check before trying again.");
    toast.success(kind === "spend" ? "Business cost recorded." : "Capital returned recorded.");
    setAmount(""); setReason(""); onDone(); onClose();
  };
  const v = Number(amount) || 0;
  return <Modal open={open} onClose={() => { if (!busy) onClose(); }} label="Take money out">
    <div className="w-[min(92vw,420px)] space-y-4 p-5"><h2 className="text-lg font-semibold">Take money out of the bank</h2>
      <div className="flex gap-2">{([["spend", "Business cost"], ["withdraw", "Return capital"]] as const).map(([k, label]) =>
        <button key={k} type="button" onClick={() => setKind(k)} className={`flex-1 rounded-xl border px-3 py-2 text-[13px] ${kind === k ? "border-primary/40 bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}>{label}</button>)}</div>
      <p className="text-xs leading-5 text-muted-foreground">{kind === "spend" ? "Subscriptions, SMS, tools and other costs. Bank and profit both go down." : "Money given back to partners. Bank and capital both go down, so profit stays the same."}</p>
      <Field label="Amount (GH₵)"><input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label={kind === "spend" ? "What was it for?" : "Who received it?"}><input className={inputCls} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {profit !== null && v > 0 && <p className="text-sm">Profit after this: <Money value={kind === "spend" ? profit - v : profit} /></p>}
      <div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={() => void submit()}>{busy ? "Saving…" : "Confirm"}</Button></div>
    </div>
  </Modal>;
}
