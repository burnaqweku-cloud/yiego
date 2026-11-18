import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, RefreshCw } from "lucide-react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Field, Panel, Pill, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { canComplete, domainStage, STAGE_TEXT, type CfHost } from "@/lib/domainSteps";

/* Domains agents bought through us. Paystack's signal puts each paid one here by itself;
   you buy it, connect it to the store here, then press Completed (the price then counts as profit). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
type Hosts = { apex?: CfHost | null; www?: CfHost | null };
interface Row { id: string; domain: string; tld: string; price: number; status: string; created_at: string; paid_at: string | null; expires_at: string | null; connected_at: string | null; completed_at: string | null; cf_state: Hosts | null; agents: { store_name: string; slug: string; whatsapp: string | null; custom_domain: string | null; custom_domain_status: string | null } | null }
interface Tld { tld: string; price: number; cost_estimate: number | null; is_active: boolean }
const ORIGIN = "stores-origin.datayego.com";
const tone = (s: string) => s === "paid" ? "warn" : s === "registered" || s === "live" ? "good" : "muted";
const statusText = (s: string) => s === "paid" ? "paid, not completed" : s === "live" || s === "registered" ? "completed" : s;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errText = (m: string) => m.includes("store_has_other_domain") ? "This store already has a different domain connected." : m.includes("admin_required") ? "Admin two-step check needed. Sign in again." : m.replace(/_/g, " ");

export default function AdminDomains() {
  const [rows, setRows] = useState<Row[]>([]); const [tlds, setTlds] = useState<Tld[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Row | null>(null);
  const [refund, setRefund] = useState<Row | null>(null); const [reason, setReason] = useState("");
  const load = useCallback(async () => {
    const [o, t] = await Promise.all([db().from("domain_orders").select("*, agents(store_name, slug, whatsapp, custom_domain, custom_domain_status)").neq("status", "pending_payment").order("created_at", { ascending: false }).limit(200), db().from("domain_tld_prices").select("*").order("tld")]);
    setRows(o.data ?? []); setTlds(t.data ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Cloudflare answers a moment later: ask, wait, read the answer.
  const check = useCallback(async (r: Row, quiet = false) => {
    setBusy(r.id);
    const first = await db().rpc("admin_domain_refresh", { p_id: r.id });
    if (first.error) { setBusy(null); if (!quiet) toast.error(errText(first.error.message)); return; }
    await sleep(4000);
    const second = await db().rpc("admin_domain_refresh", { p_id: r.id });
    setBusy(null);
    if (second.error) { if (!quiet) toast.error(errText(second.error.message)); return; }
    const res = second.data as { live?: boolean; www_only?: boolean } | null;
    const live = res?.live;
    if (!quiet) toast[live ? "success" : "message"](live ? `${r.domain} is live.` : res?.www_only ? `www.${r.domain} works, but ${r.domain} on its own doesn't yet. Check the @ record.` : "Not live yet. Check again after the records have had time to spread.");
    void load();
  }, [load]);
  useEffect(() => { rows.filter((r) => r.status === "paid" && r.connected_at && r.agents?.custom_domain_status !== "active").forEach((r) => void check(r, true)); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const connect = async (r: Row) => {
    setBusy(r.id); const { error } = await db().rpc("admin_domain_connect", { p_id: r.id }); setBusy(null);
    if (error) return toast.error(errText(error.message));
    toast.success(`${r.domain} added to ${r.agents?.store_name ?? "the store"}. Checking…`); await load(); void check(r);
  };
  const complete = async () => {
    if (!done) return; setBusy(done.id);
    const { error } = await db().rpc("admin_domain_complete", { p_id: done.id }); setBusy(null);
    if (error) return toast.error(errText(error.message));
    toast.success(`${done.domain} completed. ${formatGHS(Number(done.price))} now counts as profit.`); setDone(null); void load();
  };
  const doRefund = async () => {
    if (!refund || !reason.trim()) return toast.error("Give a reason; the agent sees it.");
    const { error } = await db().rpc("admin_domain_refund", { p_id: refund.id, p_reason: reason.trim() });
    if (error) return toast.error(errText(error.message));
    toast.success(`${formatGHS(Number(refund.price))} returned to the agent's wallet.`); setRefund(null); setReason(""); void load();
  };
  const savePrice = async (t: Tld, price: string) => { const p = Number(price); if (!(p > 0)) return; await db().from("domain_tld_prices").update({ price: p }).eq("tld", t.tld); toast.success(`.${t.tld} now ${formatGHS(p)}/yr`); void load(); };
  const copy = (t: string) => { void navigator.clipboard.writeText(t); toast.success("Copied."); };
  const pending = rows.filter((r) => r.status === "paid");

  return (
    <div className="space-y-5">
      <AdminPageHeader eyebrow="Agents" title="Domains" description="Paid domains appear here by themselves. Buy each one, connect it to the agent's store, then press Completed." />
      <Panel title={`Paid, not completed (${pending.length})`}>
        {pending.length === 0 ? <p className="text-[13px] text-muted-foreground">Nothing waiting.</p> : (
          <ul className="divide-y divide-white/[0.06]">{pending.map((r) => {
            const stage = domainStage(!!r.connected_at, r.cf_state, r.agents?.custom_domain === r.domain ? r.agents?.custom_domain_status : null);
            const live = stage === "live"; const working = busy === r.id;
            return (
              <li key={r.id} className="space-y-3 py-4">
                <div>
                  <p className="text-[16px] font-semibold text-foreground">{r.domain}</p>
                  <p className="text-[12px] text-muted-foreground">{r.agents?.store_name} ({r.agents?.slug}){r.agents?.whatsapp ? ` · ${r.agents.whatsapp}` : ""} · paid {formatGHS(Number(r.price))} {r.paid_at ? formatAdminDate(r.paid_at) : ""}</p>
                </div>
                <ol className="space-y-3 text-[13px]">
                  <li><p className="font-semibold text-foreground">1. Buy {r.domain} and add these two records</p>
                    <div className="mt-1.5 grid grid-cols-[64px_44px_1fr] items-center gap-x-2 gap-y-1.5 rounded-xl border border-white/[0.07] p-2.5 text-[12.5px]">
                      <span className="text-faint-foreground">Type</span><span className="text-faint-foreground">Name</span><span className="text-faint-foreground">Value</span>
                      {["@", "www"].map((n) => <Fragment key={n}><span className="text-foreground">CNAME</span><span className="text-foreground">{n}</span><span className="flex min-w-0 items-center gap-1.5 break-all text-foreground">{ORIGIN}<button type="button" onClick={() => copy(ORIGIN)} aria-label="Copy" className="text-faint-foreground"><Copy size={13} /></button></span></Fragment>)}
                    </div>
                    <p className="mt-1 text-[11.5px] text-faint-foreground">If the registrar won't take CNAME on @, use its "ALIAS" or "CNAME flattening" option for @.</p>
                  </li>
                  <li><p className="font-semibold text-foreground">2. Connect it to the store</p>
                    {r.connected_at ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 text-[12.5px] ${live ? "text-primary" : "text-muted-foreground"}`}>{live && <Check size={14} />}{STAGE_TEXT[stage]}</span>
                        {!live && <Button size="sm" variant="quiet" disabled={working} onClick={() => void check(r)}><RefreshCw size={13} className={working ? "animate-spin" : ""} />{working ? "Checking…" : "Check now"}</Button>}
                      </div>
                    ) : <div className="mt-1.5"><Button size="sm" variant="soft" disabled={working} onClick={() => void connect(r)}>{working ? "Connecting…" : `Connect to ${r.agents?.store_name ?? "store"}`}</Button></div>}
                  </li>
                  <li><p className="font-semibold text-foreground">3. Completed</p>
                    <div className="mt-1.5 flex flex-wrap gap-2"><Button size="sm" disabled={working || !canComplete(r.status)} onClick={() => setDone(r)}>Completed</Button><Button size="sm" variant="quiet" onClick={() => { setRefund(r); setReason("Domain not available"); }}>Refund</Button></div>
                  </li>
                </ol>
              </li>
            );
          })}</ul>
        )}
      </Panel>
      <Panel title="Prices">
        <div className="grid gap-3 sm:grid-cols-2">{tlds.map((t) => <div key={t.tld} className="flex items-center gap-3 rounded-xl border border-white/[0.07] p-3"><span className="w-14 text-[14px] font-semibold text-foreground">.{t.tld}</span><input defaultValue={Number(t.price).toFixed(2)} onBlur={(e) => void savePrice(t, e.target.value)} inputMode="decimal" className={`${inputCls} w-28`} /><span className="text-[11.5px] text-faint-foreground">GHS / year</span></div>)}</div>
      </Panel>
      <Panel title="All domain orders">
        {rows.length === 0 ? <p className="text-[13px] text-muted-foreground">No domains bought yet.</p> : (
          <ul className="divide-y divide-white/[0.06]">{rows.map((r) => <li key={r.id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-[13.5px] font-semibold text-foreground">{r.domain} <Pill tone={tone(r.status)}>{statusText(r.status)}</Pill></p><p className="text-[11.5px] text-faint-foreground">{r.agents?.store_name} · {formatGHS(Number(r.price))}{r.expires_at ? ` · renews ${formatAdminDate(r.expires_at)}` : ""}</p></div><span className="shrink-0 text-[11px] text-faint-foreground">{formatAdminDate(r.created_at)}</span></li>)}</ul>
        )}
      </Panel>
      <Modal open={!!done} onClose={() => setDone(null)} label={done ? `Complete ${done.domain}?` : ""}>
        {done && <div className="space-y-3">
          {domainStage(!!done.connected_at, done.cf_state, done.agents?.custom_domain === done.domain ? done.agents?.custom_domain_status : null) !== "live" && <p className="rounded-xl bg-amber/10 p-2.5 text-[12.5px] text-amber">The store doesn't open on {done.domain} yet. Complete only if you're sure it's set up.</p>}
          <p className="text-[13px] text-muted-foreground">{formatGHS(Number(done.price))} leaves "Domains paid, not yet completed" and counts as profit. Nothing else is recorded: what you spent on the domain left your Kora or bank already.</p>
          <div className="flex justify-end gap-2"><Button variant="quiet" onClick={() => setDone(null)}>Cancel</Button><Button disabled={busy === done.id} onClick={() => void complete()}>Completed</Button></div>
        </div>}
      </Modal>
      <Modal open={!!refund} onClose={() => setRefund(null)} label={refund ? `Refund ${refund.domain}` : ""}>
        <div className="space-y-3">
          <Field label="Reason (the agent sees this)"><input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} /></Field>
          <p className="text-[11.5px] text-faint-foreground">{refund ? formatGHS(Number(refund.price)) : ""} goes back to the agent's wallet. The 4% fee is not returned, same as data refunds.</p>
          <div className="flex justify-end gap-2"><Button variant="quiet" onClick={() => setRefund(null)}>Cancel</Button><Button onClick={() => void doRefund()}>Refund to wallet</Button></div>
        </div>
      </Modal>
    </div>
  );
}
