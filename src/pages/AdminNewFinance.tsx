import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Banknote, PiggyBank, Plus, RefreshCw, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Field, inputCls, Money, Pill, Stat, StatGrid } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { adminDatabase } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { calculateNetAssets, type FinanceBalance, type FinanceSupplier } from "@/lib/netAssetsFinance";
import { useAuth } from "@/store/auth-context";

interface Overview { start: string; period: { net: number } }
interface Expense { id: string; occurred_at: string; amount: number; kind: string; note: string | null; metadata: { kind?: string } }
interface Settlement { id: string; gross: number; net: number; fees: number; status: string; settlement_date: string }
interface Snapshot { balances: FinanceBalance[]; suppliers: FinanceSupplier[]; overview: Overview; expenses: Expense[]; settlements: Settlement[]; readAt: string }
// Existing protected finance services only; the comparison never rewrites history.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
const date = (value: string) => new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" }).format(new Date(value));

function AmountRow({ label, amount, note, strong = false }: { label: string; amount: number; note?: string; strong?: boolean }) {
  return <div className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-0">
    <div className="min-w-0"><p className={`${strong ? "font-semibold" : "font-medium"} text-sm text-foreground`}>{label}</p>{note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}</div>
    <Money value={amount} className="shrink-0 text-sm font-semibold" />
  </div>;
}

export default function AdminNewFinance() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMaster, setIsMaster] = useState(false);
  const [deduction, setDeduction] = useState("0");
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [balances, suppliers, overview, expenses, settlements, role] = await Promise.all([
        db().from("finance_balances").select("code, name, kind, balance").order("sort_order"),
        db().from("suppliers").select("code, name, confirmed_balance, confirmed_at").order("display_order"),
        db().rpc("finance_overview", { p_from: null, p_to: null }),
        db().from("finance_live_entries").select("id, occurred_at, amount, kind, note, metadata").in("kind", ["expense", "master_adjustment"]).order("occurred_at", { ascending: false }).limit(20),
        db().from("paystack_settlements").select("id, gross, net, fees, status, settlement_date").eq("status", "pending").order("settlement_date", { ascending: false }).limit(20),
        user ? db().rpc("admin_role", { p_user: user.id }) : Promise.resolve({ data: null, error: null }),
      ]);
      if ([balances, suppliers, overview, expenses, settlements, role].some((result) => result.error) || !overview.data || !balances.data?.length) throw new Error("unavailable");
      calculateNetAssets(balances.data, suppliers.data ?? []);
      setIsMaster(role.data === "master");
      setSnapshot({ balances: balances.data, suppliers: suppliers.data ?? [], overview: overview.data as Overview, expenses: expenses.data ?? [], settlements: settlements.data ?? [], readAt: new Date().toISOString() });
    } catch {
      setSnapshot(null);
      setError("The complete finance records could not be loaded. No profit is shown until all balances are available.");
    } finally { setLoading(false); }
  }, [user]);
  useEffect(() => { void load(); }, [load]);
  const result = useMemo(() => {
    if (!snapshot) return null;
    try { return calculateNetAssets(snapshot.balances, snapshot.suppliers, Number(deduction || 0)); } catch { return null; }
  }, [snapshot, deduction]);
  const supplierLines = result?.assets.filter((line) => line.code.startsWith("float_")) ?? [];
  const uncertainSuppliers = supplierLines.filter((line) => line.source !== "reported" || !line.reportedAt || Date.now() - new Date(line.reportedAt).getTime() > 86400000);
  const difference = result && snapshot ? Math.round((result.profit - snapshot.overview.period.net) * 100) / 100 : null;
  const spend = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || reason.trim().length < 3) return toast.error("Enter a positive amount and what it was for.");
    if (!isMaster || !user) return;
    setBusy(true);
    try {
      const response = await db().rpc("finance_master_adjust", { p_kind: "spend", p_amount: value, p_reason: reason.trim() });
      if (response.error) throw new Error("unavailable");
      setOpen(false); setAmount(""); setReason(""); toast.success("Business expense recorded once."); await load();
    } catch { toast.error("The expense could not be confirmed. Refresh and check the records before trying again."); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <AdminPageHeader title="New Finance Page" description={snapshot ? `Since ${date(snapshot.overview.start).split(",")[0]} · updated ${date(snapshot.readAt)}` : "Current business money, debts and invested funds."}
      action={<div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" asChild><Link to="/admin/finance"><ArrowLeftRight size={14} />Current Finance</Link></Button><Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading} aria-label="Refresh finance"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></Button>{isMaster && <Button size="sm" onClick={() => setOpen(true)} disabled={!result || loading}><Plus size={14} />Business expense</Button>}</div>} />

    {error && <div role="alert" className="border-l-2 border-danger bg-danger/10 p-4 text-sm text-danger">{error}</div>}
    {loading && <p role="status" className="py-8 text-sm text-muted-foreground">Loading all balances…</p>}
    {!loading && snapshot && result && <>
      <section className="border-b border-border pb-6" aria-label="New profit calculation">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-medium text-muted-foreground">Total profit since start</h2><Pill tone="warn">Provisional · reconciliation needed</Pill></div>
        <p data-testid="net-assets-profit" className={`mt-3 break-words text-3xl font-semibold tabular-nums ${result.profit >= 0 ? "text-success" : "text-danger"}`}>{formatGHS(result.profit)}</p>
        <p className="mt-3 text-sm text-muted-foreground">Business money − everything owed − partner capital.</p>
        <div className="mt-5"><StatGrid cols={3}>
          <Stat label="Money after extra deductions" value={<Money value={result.totalAssets - result.deduction} />} icon={Banknote} tone="good" />
          <Stat label="Everything owed" value={<Money value={result.totalLiabilities} />} icon={Wallet} tone="warn" />
          <Stat label="Partner capital" value={<Money value={result.totalFunding} />} note="Same capital as Current Finance" />
        </StatGrid></div>
        <p className="mt-3 break-words text-xs leading-5 tabular-nums text-muted-foreground">{formatGHS(result.totalAssets - result.deduction)} − {formatGHS(result.totalLiabilities)} − {formatGHS(result.totalFunding)} = {formatGHS(result.profit)}</p>
      </section>

      <div className="border-l-2 border-amber bg-amber/10 p-4 text-sm text-foreground">
        <p className="flex items-center gap-2 font-medium"><AlertTriangle size={16} className="shrink-0 text-amber" />Balance checks outstanding</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Bank money is the recorded bank balance, not a live bank statement. Paystack is the recorded balance after deductions already booked; any unbooked deductions still need checking.</p>
        {uncertainSuppliers.length > 0 && <p className="mt-2 text-xs leading-5 text-muted-foreground">Supplier readings missing or over 24 hours old: {uncertainSuppliers.map((line) => line.name).join(", ")}.</p>}
      </div>

      <div className="space-y-6">
        <section><h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><Banknote size={16} className="text-primary-glow" />Where the money is</h2>
          <StatGrid>
            {result.assets.filter((line) => !line.code.startsWith("float_")).map((line) => <Stat key={line.code} label={line.code === "bank" ? "Bank / Master balance" : line.name} value={<Money value={line.amount} />} icon={line.code === "paystack_transit" ? PiggyBank : Banknote} tone={line.code === "bank" ? "good" : "default"} note={line.code === "paystack_transit" ? "After booked deductions · awaiting payout" : "Recorded balance"} to={line.code === "bank" ? "/admin/finance/master" : undefined} />)}
          </StatGrid>
          <h3 className="mb-2 mt-4 text-sm font-semibold text-muted-foreground">At suppliers · {formatGHS(supplierLines.reduce((total, line) => total + line.amount, 0))}</h3>
          <StatGrid cols={3}>
            {supplierLines.map((line) => <Stat key={line.code} label={line.name} value={<Money value={line.amount} />} tone={line.amount < 30 ? "bad" : line.amount < 80 ? "warn" : "default"} note={line.source === "reported" ? `Reported ${line.reportedAt ? date(line.reportedAt) : "date unavailable"}` : "Book estimate · reading unavailable"} to={`/admin/finance/suppliers/${line.code.slice(6)}`} />)}
          </StatGrid>
        </section>
        <section><h2 className="mb-3 text-base font-semibold">What we owe · {formatGHS(result.totalLiabilities)}</h2>
          <StatGrid>
            {result.liabilities.map((line) => <Stat key={line.code} label={line.name} value={<Money value={line.amount} />} tone={line.amount > 0 ? "warn" : "default"} to={line.code === "customer_wallets" ? "/admin/wallet" : line.code === "owed_to_agents" ? "/admin/agents/payouts" : line.code === "owed_deliveries" ? "/admin/finance/undelivered" : undefined} />)}
          </StatGrid>
        </section>
      </div>

      <section className="border-t border-border pt-5"><h2 className="text-base font-semibold">Paystack deductions not yet recorded</h2>
        <div className="mt-3 max-w-sm"><Field label="Additional deduction (GH₵)"><input className={inputCls} inputMode="decimal" type="number" min="0" step="0.01" value={deduction} onChange={(event) => setDeduction(event.target.value)} /></Field></div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Temporary comparison only; not saved. Enter only an amount confirmed as missing from the recorded Paystack balance. Leave at zero if unknown; the total remains provisional.</p>
        {snapshot.settlements.map((settlement) => <AmountRow key={settlement.id} label={`Pending payout · ${date(settlement.settlement_date)}`} amount={Number(settlement.net)} note={`Gross ${formatGHS(Number(settlement.gross))} · recorded fees ${formatGHS(Number(settlement.fees))}. Gross minus payout can also include refunds; it is not automatically another fee.`} />)}
      </section>

      <section className="border-t border-border pt-5"><h2 className="text-base font-semibold">Partner capital and comparison</h2>
        <div className="mt-3"><StatGrid>
          <Stat label="Partner capital" value={<Money value={result.totalFunding} />} to="/admin/finance/funding" />
          <Stat label="Business money after debts" value={<Money value={result.netWorth} />} />
          <Stat label="New profit" value={<Money value={result.profit} />} tone={result.profit < 0 ? "bad" : "good"} />
          <Stat label="Current Finance profit · since launch" value={<Money value={snapshot.overview.period.net} />} tone={snapshot.overview.period.net < 0 ? "bad" : "good"} to="/admin/finance" />
          {difference !== null && <Stat label="Difference to investigate" value={<Money value={difference} />} note="Not assumed to be timing or an error" tone="warn" />}
        </StatGrid></div>
      </section>

      <section className="border-t border-border pt-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">Existing spending records</h2><Button variant="ghost" size="sm" asChild><Link to="/admin/finance/expenses">All expense records</Link></Button></div>
        <p className="mt-2 text-xs text-muted-foreground">Retained for history. Paid expenses are already reflected in balances and are not subtracted again here.</p>
        {snapshot.expenses.filter((expense) => expense.kind === "expense" || expense.metadata?.kind === "spend").map((expense) => <AmountRow key={expense.id} label={expense.note ?? "Business expense"} amount={Math.abs(Number(expense.amount))} note={date(expense.occurred_at)} />)}
      </section>
    </>}
    {!loading && snapshot && !result && <p role="alert" className="text-sm text-danger">Enter a valid non-negative Paystack deduction to calculate profit.</p>}

    <Modal open={open} onClose={() => { if (!busy) setOpen(false); }} label="Record business expense">
      <div className="w-[min(92vw,420px)] space-y-4 p-5"><h2 className="text-lg font-semibold">Record business expense</h2>
        <Field label="Amount (GH₵)"><input className={inputCls} inputMode="decimal" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
        <Field label="What was it for?"><input className={inputCls} value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} /></Field>
        <p className="text-xs leading-5 text-muted-foreground">Paid from the business bank / Master balance. Record only a new expense that has not already been entered.</p>
        {result && Number(amount) > 0 && <p className="text-sm">Profit after this expense: <Money value={result.profit - Number(amount)} /></p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy} onClick={() => void spend()}>{busy ? "Recording…" : "Confirm expense"}</Button></div>
      </div>
    </Modal>
  </div>;
}