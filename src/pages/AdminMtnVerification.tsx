import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, RefreshCw, Search, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import CopyRef from "@/components/admin/CopyRef";
import { Panel, Pill, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { formatAdminDate } from "@/lib/admin-data";
import { CHECK_LABEL, checkAll, isApproved, loadChecks, loadQueue, sendOrders, type CheckRun, type QueueOrder, type SendResult } from "@/lib/mtn-verification-admin";

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

  const load = async () => {
    try { const [q, c] = await Promise.all([loadQueue(), loadChecks(1)]); setQueue(q); setLastCheck(c[0] ?? null); setSelected((s) => new Set([...s].filter((id) => q.some((o) => o.id === id && isApproved(o.check_status) && (!o.send || o.send.outcome === "refused" || o.send.outcome === "failed"))))); }
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
  const send = async () => {
    const ids = [...selected]; if (!ids.length || sending) return;
    const orders = ready.filter((o) => selected.has(o.id));
    const total = orders.reduce((s, o) => s + Number(o.amount), 0);
    if (!window.confirm(`Send ${orders.length} order${orders.length === 1 ? "" : "s"} to DataBundlesHub now (GH₵${total.toFixed(2)} of bundles)? Each is sent once and cannot be sent from here again.`)) return;
    setSending(true);
    try { const r = await sendOrders(ids); setResults(r.results); const ok = r.results.filter((x) => x.outcome === "sent" || x.outcome === "adopted").length; toast[ok === r.results.length ? "success" : "message"](`${ok} of ${r.results.length} sent. ${r.results.length - ok ? "See the results below for the rest." : ""}`); setSelected(new Set()); await load(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSending(false); }
  };

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allReadyShown = ready.filter(match);

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

      <Panel title={`Step 2 · Ready to send (${ready.length})`} icon={Send} note="approved by MTN, not sent yet" action={ready.length ? <button type="button" onClick={() => setSelected(selected.size === allReadyShown.length ? new Set() : new Set(allReadyShown.map((o) => o.id)))} className="text-[11.5px] font-semibold text-primary-glow hover:underline">{selected.size === allReadyShown.length && allReadyShown.length ? "Clear" : "Select all"}</button> : null}>
        {queue === null ? <p className="py-5 text-center text-[12px] text-faint-foreground">Loading…</p> : ready.length === 0 ? <p className="py-5 text-center text-[12px] text-faint-foreground">No approved orders waiting. Run the check, then come back here.</p> : (
          <ul className="divide-y divide-white/[0.06]">
            {allReadyShown.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-2">
                <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="h-4 w-4 accent-primary" aria-label={`Select ${o.order_reference}`} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-foreground"><span className="font-mono font-semibold">{o.phone}</span><span className="font-semibold">{o.bundle}</span><Pill tone="good">Approved</Pill>{o.store_name && <Pill>{o.store_name}</Pill>}{o.supplier_purchase_id && <Pill tone="warn">has earlier DBH attempt {o.supplier_purchase_id}</Pill>}{o.send && <Pill tone="warn">last try {o.send.outcome}: {o.send.detail}</Pill>}</p>
                  <p className="text-[11px] text-faint-foreground"><CopyRef value={o.order_reference} /> · GH₵{Number(o.amount).toFixed(2)} · paid {formatAdminDate(o.paid_at)} · waiting {o.days_waiting} day{o.days_waiting === 1 ? "" : "s"}{o.checked_at ? ` · checked ${formatAdminDate(o.checked_at)}` : ""}</p>
                </div>
                <Link to={`/admin/orders?q=${encodeURIComponent(o.order_reference)}`} className="text-[11.5px] font-semibold text-primary-glow hover:underline">Order</Link>
              </li>
            ))}
          </ul>
        )}
        {ready.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
            <p className="text-[12px] text-muted-foreground">{selected.size} selected · GH₵{ready.filter((o) => selected.has(o.id)).reduce((s, o) => s + Number(o.amount), 0).toFixed(2)}</p>
            <button type="button" disabled={!selected.size || sending} onClick={() => void send()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[12.5px] font-semibold text-[#04120c] disabled:opacity-50"><Send size={14} />{sending ? "Sending…" : `Send ${selected.size || ""} selected`}</button>
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
