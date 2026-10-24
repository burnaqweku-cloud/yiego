import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Minus, PiggyBank, Plus, RefreshCw, Store, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Field, inputCls, Money, Stat, StatGrid } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { RecordPartnerCapitalModal, RecordTopupModal } from "@/components/admin/FinanceForms";
import { adminDatabase } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { financeProfit, type Line } from "@/lib/financeV2";
import { usePaystackHeld } from "@/lib/usePaystackHeld";
import { useAuth } from "@/store/auth-context";

interface Balance { code: string; name: string; kind: string; balance: number | string }
interface Supplier { code: string; name: string; confirmed_balance: number | null; confirmed_at: string | null; metadata?: { topup_fee_rate?: number } | null }
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
  const ps = usePaystackHeld(!!user);

  const load = useCallback(async () => {
    setLoading(true); setFailed(false);
    const [b, s, role] = await Promise.all([
      db().from("finance_balances").select("code, name, kind, balance").order("sort_order"),
      db().from("suppliers").select("code, name, confirmed_balance, confirmed_at, metadata").order("display_order"),
      actor ? db().rpc("admin_role", { p_user: actor }) : Promise.resolve({ data: null, error: null }),
    ]);
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
        <Button size="sm" onClick={() => setTopup(true)}>Record top-up</Button>
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
        <Stat label="Profit" value={<Money value={view.profit} />} icon={TrendingUp} tone={view.profit >= 0 ? "good" : "bad"} note={`after ${formatGHS(view.capital)} capital`} />
      </StatGrid>
      <p className="break-words text-xs leading-5 tabular-nums text-muted-foreground">
        Bank {formatGHS(view.bank)} + Paystack {formatGHS(ps.held.total)} + suppliers {formatGHS(view.supplierTotal)} − owed {formatGHS(view.owedTotal)} − capital {formatGHS(view.capital)} = <span className="font-semibold text-foreground">{formatGHS(view.profit)}</span>
      </p>

      <section><h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><Store size={16} />At suppliers</h2>
        <StatGrid cols={3}>{view.supplierLines.map((s) => {
          const stale = !s.reported || !s.reportedAt || Date.now() - new Date(s.reportedAt).getTime() > 86400000;
          return <Stat key={s.code} label={s.name} value={<Money value={s.amount} />} tone={stale ? "warn" : "default"} note={s.reported && s.reportedAt ? `Reported ${when(s.reportedAt)}${stale ? " · may be out of date" : ""}` : "No reading yet · our record"} to={`/admin/finance/suppliers/${s.code}`} />;
        })}</StatGrid>
      </section>

      <section><h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><Wallet size={16} />Money we owe</h2>
        <StatGrid>{view.owed.map((l) => <Stat key={l.code} label={l.name} value={<Money value={l.amount} />} tone={l.amount > 0 ? "warn" : "default"}
          to={l.code === "customer_wallets" ? "/admin/wallet" : l.code === "owed_to_agents" ? "/admin/agents/payouts" : l.code === "owed_deliveries" ? "/admin/finance/undelivered" : undefined} />)}</StatGrid>
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
