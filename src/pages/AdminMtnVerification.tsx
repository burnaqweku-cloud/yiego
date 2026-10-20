import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, RefreshCw, Search, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import CopyRef from "@/components/admin/CopyRef";
import { Panel, Pill, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { formatAdminDate } from "@/lib/admin-data";
import { CHECK_LABEL, checkAll, isApproved, loadChecks, loadDbhWallet, loadQueue, sendOrders, type CheckRun, type DbhWallet, type QueueOrder, type SendResult } from "@/lib/mtn-verification-admin";

const ghs = (n: number) => `GH₵${n.toFixed(2)}`;
// DBH cost of a set of orders; `exact` is false when any bundle has no DBH price on file (then it's a floor, not a total).
const costOf = (orders: QueueOrder[]) => ({ total: orders.reduce((s, o) => s + Number(o.dbh_cost ?? 0), 0), exact: orders.every((o) => o.dbh_cost != null) });

/* Admin → MTN verification → Queue. Two buttons do everything, and nothing happens without one of them:
   "Check all with DBH" asks which held numbers are approved; "Send selected" buys the ticked approved orders, once. */
export default function AdminMtnVerification() {
  const [queue, setQueue] = useState<QueueOrder[] | null>(null);
  const [lastCheck, setLastCheck] = useState<CheckRun | null>(null);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [wallet, setWallet] = useState<DbhWallet | null>(null);

  const load = async () => {
    try { const [q, c, w] = await Promise.all([loadQueue(), loadChecks(1), loadDbhWallet().catch(() => null)]); setQueue(q); setLastCheck(c[0] ?? null); setWallet(w); setSelected((s) => new Set([...s].filter((id) => q.some((o) => o.id === id && isApproved(o.check_status) && (!o.send || o.send.outcome === "refused" || o.send.outcome === "failed"))))); }
    catch (e) { toast.error((e as Error).message); setQueue([]); }
  };
  useEffect(() => { void load(); }, []);

  // Ready = approved and never sent, or a send that was refused/failed (nothing was bought, so it may go again).
  const canSend = (o: QueueOrder) => isApproved(o.check_status) && (!o.send || o.send.outcome === "refused" || o.send.outcome === "failed");
  const ready = useMemo(() => (queue ?? []).filter(canSend), [queue]);
  const waiting = useMemo(() => (queue ?? []).filter((o) => !canSend(o)), [queue]);
  const q = search.replace(/\D/g, "");
  const match = (o: QueueOrder) => !search.trim() || o.phone.includes(q) || o.order_reference.toLowerCase().includes(search.trim().toLowerCase());

  const runCheck = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const r = await checkAll();
      toast.success(`Checked ${r.numbers} numbers in ${r.batches} batch${r.batches === 1 ? "" : "es"}: ${r.approved} approved, ${r.notYet} not yet, ${r.blocked} blocked${r.unknown ? `, ${r.unknown} no answer` : ""}.${r.failedBatches.length ? ` Batch ${r.failedBatches.join(", ")} failed – run again.` : ""}`, { duration: 8000 });
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setChecking(false); }
  };
  const selectedOrders = useMemo(() => ready.filter((o) => selected.has(o.id)), [ready, selected]);
  const readyCost = useMemo(() => costOf(ready), [ready]);
  const selectedCost = useMemo(() => costOf(selectedOrders), [selectedOrders]);
  // Wallet short = the ticked orders cost more than DBH's last wallet reading. Send is blocked then; a part-send is worse than none.
  const walletShort = wallet?.balance != null && selectedCost.total > wallet.balance;

  const send = async () => {
    const ids = [...selected]; if (!ids.length || sending || walletShort) return;
    const orders = selectedOrders;
    if (!window.confirm(`Send ${orders.length} order${orders.length === 1 ? "" : "s"} to DataBundlesHub now? DBH will charge about ${ghs(selectedCost.total)}${selectedCost.exact ? "" : " (some bundles have no DBH price on file)"}. Each is sent once and cannot be sent from here again.`)) return;
    setSending(true);
    try { const r = await sendOrders(ids); setResults(r.results); const ok = r.results.filter((x) => x.outcome === "sent" || x.outcome === "adopted").length; toast[ok === r.results.length ? "success" : "message"](`${ok} of ${r.results.length} sent. ${r.results.length - ok ? "See the results below for the rest." : ""}`); setSelected(new Set()); await load(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSending(false); }
  };

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allReadyShown = ready.filter(match);
  // Pick the first N of the list (oldest wait first, same order as shown).
  const pick = (fraction: number) => setSelected(new Set(allReadyShown.slice(0, fraction >= 1 ? allReadyShown.length : Math.ceil(allReadyShown.length * fraction)).map((o) => o.id)));
  const pickBtn = (label: string, fraction: number) => <button key={label} type="button" onClick={() => pick(fraction)} className="rounded-md border border-white/[0.1] px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground">{label}</button>;

  return (
    <div className="space-y-5">
      <AdminPageHeader title="MTN verification" description="Orders held because MTN hasn't approved the number yet. Nothing here happens on its own: you check, you send." action={
        <button type="button" onClick={() => void load()} className="rounded-lg border border-white/[0.1] p-1.5 text-muted-foreground hover:text-foreground" aria-label="Refresh"><RefreshCw size={14} /></button>
      } />

      <StatGrid cols={4}>
        <Stat label="On hold" value={queue ? queue.length : "—"} icon={Clock} note="orders waiting for MTN" loading={!queue} />
        <Stat label="Ready to send" value={queue ? ready.length : "—"} tone={ready.length ? "good" : "muted"} icon={CheckCircle2} note="approved, not yet sent" loading={!queue} />
        <Stat label="Last check" value={lastCheck ? formatAdminDate(lastCheck.run_at).replace(/, /, " ") : "never"} note={lastCheck ? `${lastCheck.numbers} numbers · ${lastCheck.approved} approved${lastCheck.run_by ? ` · ${lastCheck.run_by}` : ""}` : "press Check all"} icon={ShieldCheck} loading={!queue} />
        <Stat label="Oldest wait" value={queue?.length ? `${Math.max(...queue.map((o) => o.days_waiting))} days` : "—"} tone={queue?.some((o) => o.days_waiting >= 7) ? "warn" : "default"} note="MTN usually takes a few days" loading={!queue} />
      </StatGrid>

      <Panel title="Step 1 · Check with DataBundlesHub" icon={ShieldCheck} note="batches of 100 numbers, sends nothing">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">Asks DBH which of the held numbers (and submitted numbers) MTN has approved. Safe to press as often as you like; it only reads.</p>
          <button type="button" disabled={checking || !queue} onClick={() => void runCheck()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] px-3.5 py-2 text-[12.5px] font-semibold text-foreground hover:bg-white/[0.04] disabled:opacity-50"><ShieldCheck size={14} />{checking ? "Checking…" : "Check all with DBH"}</button>
        </div>
      </Panel>

      <Panel title={`Step 2 · Send (${ready.length} ready)`} icon={Send} note="approved by MTN, not sent yet" action={ready.length ? <span className="flex items-center gap-1">{pickBtn("All", 1)}{pickBtn("Half", 0.5)}{pickBtn("Quarter", 0.25)}<button type="button" onClick={() => setSelected(new Set())} className="rounded-md border border-white/[0.1] px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground">None</button></span> : null}>
        {ready.length > 0 && (
          <div className={`mb-3 rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-relaxed ${walletShort ? "border-danger/30 bg-danger/[0.08] text-foreground" : "border-white/[0.08] bg-white/[0.03] text-muted-foreground"}`}>
            <span className="font-semibold text-foreground">DBH wallet {wallet?.balance == null ? "unknown" : ghs(wallet.balance)}</span>{wallet?.checked_at ? ` (read ${formatAdminDate(wallet.checked_at)})` : ""} · approved orders need {ghs(readyCost.total)}{readyCost.exact ? "" : "+"} · selected need <span className="font-semibold text-foreground">{ghs(selectedCost.total)}{selectedCost.exact ? "" : "+"}</span>
            {walletShort && <span className="block font-semibold text-ink-rose">Wallet is short by {ghs(selectedCost.total - (wallet?.balance ?? 0))}. Top up DBH or select fewer orders.</span>}
            {!readyCost.exact && <span className="block text-[11px] text-faint-foreground">"+" means a bundle here has no DBH price on file yet, so the real total is higher.</span>}
          </div>
        )}
        {queue === null ? <p className="py-5 text-center text-[12px] text-faint-foreground">Loading…</p> : ready.length === 0 ? <p className="py-5 text-center text-[12px] text-faint-foreground">No approved orders waiting. Run the check, then come back here.</p> : (
          <ul className="divide-y divide-white/[0.06]">
            {allReadyShown.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-2">
                <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="h-4 w-4 accent-primary" aria-label={`Select ${o.order_reference}`} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-foreground"><span className="font-mono font-semibold">{o.phone}</span><span className="font-semibold">{o.bundle}</span><Pill tone="good">Approved</Pill>{o.store_name && <Pill>{o.store_name}</Pill>}{o.supplier_purchase_id && <Pill tone="warn">has earlier DBH attempt {o.supplier_purchase_id}</Pill>}{o.send && <Pill tone="warn">last try {o.send.outcome}: {o.send.detail}</Pill>}</p>
                  <p className="text-[11px] text-faint-foreground"><CopyRef value={o.order_reference} /> · paid {ghs(Number(o.amount))} · DBH {o.dbh_cost == null ? "price unknown" : ghs(Number(o.dbh_cost))} · paid {formatAdminDate(o.paid_at)} · waiting {o.days_waiting} day{o.days_waiting === 1 ? "" : "s"}{o.checked_at ? ` · checked ${formatAdminDate(o.checked_at)}` : ""}</p>
                </div>
                <Link to={`/admin/orders?q=${encodeURIComponent(o.order_reference)}`} className="text-[11.5px] font-semibold text-primary-glow hover:underline">Order</Link>
              </li>
            ))}
          </ul>
        )}
        {ready.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
            <p className="text-[12px] text-muted-foreground">{selected.size} selected · customers paid {ghs(selectedOrders.reduce((s, o) => s + Number(o.amount), 0))} · DBH charges {ghs(selectedCost.total)}{selectedCost.exact ? "" : "+"}</p>
            <button type="button" disabled={!selected.size || sending || walletShort} onClick={() => void send()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[12.5px] font-semibold text-[#04120c] disabled:opacity-50"><Send size={14} />{sending ? "Sending…" : walletShort ? "Wallet too low" : selected.size ? `Send ${selected.size} order${selected.size === 1 ? "" : "s"} · ${ghs(selectedCost.total)}` : "Select orders to send"}</button>
          </div>
        )}
        <p className="mt-2 text-[11px] text-faint-foreground">Each order is locked before anything goes to DBH, so a double press, a second admin or a refresh can't send it twice. If DBH already holds the order, it's adopted instead of bought again. A number that got a bundle in the last 10 minutes is refused.</p>
      </Panel>

      {results && (
        <Panel title="Send results" icon={CheckCircle2} action={<button type="button" onClick={() => setResults(null)} className="text-[11.5px] text-muted-foreground hover:text-foreground">Dismiss</button>}>
          <ul className="divide-y divide-white/[0.06]">
            {results.map((r) => <li key={r.orderId} className="flex items-start gap-3 py-2 text-[12.5px]"><Pill tone={r.outcome === "sent" || r.outcome === "adopted" ? "good" : r.outcome === "refused" ? "warn" : "bad"}>{r.outcome}</Pill><span className="min-w-0"><span className="font-semibold text-foreground">{r.reference ?? r.orderId}</span><span className="block text-muted-foreground">{r.detail}</span></span></li>)}
          </ul>
          <Link to="/admin/mtn-verification/sent" className="mt-2 inline-block text-[11.5px] font-semibold text-primary-glow hover:underline">Follow delivery under Sent</Link>
        </Panel>
      )}

      <Panel title={`Still waiting (${waiting.length})`} icon={Clock} note="not approved yet, or already sent" action={
        <label className="flex items-center gap-2 rounded-lg border border-white/[0.1] px-2"><Search size={13} className="text-faint-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Number or order" className={`${inputCls} h-8 w-40 border-0 bg-transparent px-0`} /></label>
      }>
        {queue === null ? <p className="py-5 text-center text-[12px] text-faint-foreground">Loading…</p> : waiting.filter(match).length === 0 ? <p className="py-5 text-center text-[12px] text-faint-foreground">Nothing waiting.</p> : (
          <ul className="divide-y divide-white/[0.06]">
            {waiting.filter(match).map((o) => { const c = CHECK_LABEL(o.check_status); return (
              <li key={o.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-foreground"><span className="font-mono font-semibold">{o.phone}</span><span className="font-semibold">{o.bundle}</span><Pill tone={o.send ? "muted" : c.tone}>{o.send ? `Sent ${formatAdminDate(o.send.sent_at)} · ${o.send.outcome}` : c.text}</Pill>{o.store_name && <Pill>{o.store_name}</Pill>}</p>
                  <p className="truncate text-[11px] text-faint-foreground"><CopyRef value={o.order_reference} /> · GH₵{Number(o.amount).toFixed(2)} · waiting {o.days_waiting} day{o.days_waiting === 1 ? "" : "s"}{o.checked_at ? ` · checked ${formatAdminDate(o.checked_at)}` : " · never checked"}{o.check_message && !isApproved(o.check_status) ? ` · DBH: ${o.check_message}` : ""}</p>
                </div>
                <Link to={`/admin/orders?q=${encodeURIComponent(o.order_reference)}`} className="text-[11.5px] font-semibold text-primary-glow hover:underline">Order</Link>
              </li>); })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
