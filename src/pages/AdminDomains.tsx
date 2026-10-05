import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Field, Panel, Pill, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";

/* Domains agents bought through us. You register them by hand, then mark them here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
interface Row { id: string; domain: string; tld: string; price: number; cost: number | null; status: string; created_at: string; paid_at: string | null; registered_at: string | null; expires_at: string | null; registrar: string | null; admin_note: string | null; agents: { store_name: string; slug: string; whatsapp: string | null } | null }
interface Tld { tld: string; price: number; cost_estimate: number | null; is_active: boolean }
const tone = (s: string) => s === "paid" ? "warn" : s === "registered" || s === "live" ? "good" : "muted";

export default function AdminDomains() {
  const [rows, setRows] = useState<Row[]>([]); const [tlds, setTlds] = useState<Tld[]>([]);
  const [reg, setReg] = useState<Row | null>(null); const [cost, setCost] = useState(""); const [registrar, setRegistrar] = useState("Hostinger"); const [note, setNote] = useState("");
  const [refund, setRefund] = useState<Row | null>(null); const [reason, setReason] = useState("");
  const load = useCallback(async () => {
    const [o, t] = await Promise.all([db().from("domain_orders").select("*, agents(store_name, slug, whatsapp)").neq("status", "pending_payment").order("created_at", { ascending: false }).limit(200), db().from("domain_tld_prices").select("*").order("tld")]);
    setRows(o.data ?? []); setTlds(t.data ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const markRegistered = async () => {
    if (!reg) return; const c = Number(cost); if (!(c >= 0)) return toast.error("Enter what you paid for it.");
    const { error } = await db().rpc("admin_domain_registered", { p_id: reg.id, p_cost: c, p_registrar: registrar.trim() || "registrar", p_note: note.trim() || null });
    if (error) return toast.error(error.message.replace(/_/g, " "));
    toast.success(`${reg.domain} marked registered and handed to ${reg.agents?.store_name ?? "the store"}.`); setReg(null); setCost(""); setNote(""); void load();
  };
  const doRefund = async () => {
    if (!refund || !reason.trim()) return toast.error("Give a reason; the agent sees it.");
    const { error } = await db().rpc("admin_domain_refund", { p_id: refund.id, p_reason: reason.trim() });
    if (error) return toast.error(error.message.replace(/_/g, " "));
    toast.success(`${formatGHS(Number(refund.price))} returned to the agent's wallet.`); setRefund(null); setReason(""); void load();
  };
  const savePrice = async (t: Tld, price: string) => { const p = Number(price); if (!(p > 0)) return; await db().from("domain_tld_prices").update({ price: p }).eq("tld", t.tld); toast.success(`.${t.tld} now ${formatGHS(p)}/yr`); void load(); };
  const pending = rows.filter((r) => r.status === "paid");
  return (
    <div className="space-y-5">
      <AdminPageHeader eyebrow="Agents" title="Domains" description="Domains agents bought through DataYego. Register each one at your registrar, point it at stores-origin.datayego.com, then mark it registered." />
      <Panel title={`To register (${pending.length})`}>
        {pending.length === 0 ? <p className="text-[13px] text-muted-foreground">Nothing waiting.</p> : (
          <ul className="divide-y divide-white/[0.06]">{pending.map((r) => <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[15px] font-semibold text-foreground">{r.domain}</p><p className="text-[12px] text-muted-foreground">{r.agents?.store_name} ({r.agents?.slug}){r.agents?.whatsapp ? ` · ${r.agents.whatsapp}` : ""} · paid {formatGHS(Number(r.price))} {r.paid_at ? formatAdminDate(r.paid_at) : ""}</p><p className="mt-1 text-[11.5px] text-faint-foreground">Buy it, add CNAME @ → stores-origin.datayego.com at the registrar, then mark registered.</p></div><div className="flex gap-2"><Button size="sm" variant="soft" onClick={() => { setReg(r); setCost(String(tlds.find((t) => t.tld === r.tld)?.cost_estimate ?? "")); }}>Mark registered</Button><Button size="sm" variant="quiet" onClick={() => { setRefund(r); setReason("Domain not available"); }}>Refund</Button></div></li>)}</ul>
        )}
      </Panel>
      <Panel title="Prices">
        <div className="grid gap-3 sm:grid-cols-2">{tlds.map((t) => <div key={t.tld} className="flex items-center gap-3 rounded-xl border border-white/[0.07] p-3"><span className="w-14 text-[14px] font-semibold text-foreground">.{t.tld}</span><input defaultValue={Number(t.price).toFixed(2)} onBlur={(e) => void savePrice(t, e.target.value)} inputMode="decimal" className={`${inputCls} w-28`} /><span className="text-[11.5px] text-faint-foreground">GHS / year · est. cost {t.cost_estimate ? formatGHS(Number(t.cost_estimate)) : "—"}</span></div>)}</div>
      </Panel>
      <Panel title="All domain orders">
        {rows.length === 0 ? <p className="text-[13px] text-muted-foreground">No domains bought yet.</p> : (
          <ul className="divide-y divide-white/[0.06]">{rows.map((r) => <li key={r.id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-[13.5px] font-semibold text-foreground">{r.domain} <Pill tone={tone(r.status)}>{r.status}</Pill></p><p className="text-[11.5px] text-faint-foreground">{r.agents?.store_name} · {formatGHS(Number(r.price))}{r.cost != null ? ` · cost ${formatGHS(Number(r.cost))} · margin ${formatGHS(Number(r.price) - Number(r.cost))}` : ""}{r.registrar ? ` · ${r.registrar}` : ""}{r.expires_at ? ` · renews ${formatAdminDate(r.expires_at)}` : ""}</p></div><span className="shrink-0 text-[11px] text-faint-foreground">{formatAdminDate(r.created_at)}</span></li>)}</ul>
        )}
      </Panel>
      <Modal open={!!reg} onClose={() => setReg(null)} label={reg ? `Registered ${reg.domain}` : ""}>
        <div className="space-y-3">
          <Field label="What you paid (GHS)"><input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" className={inputCls} /></Field>
          <Field label="Registrar"><input value={registrar} onChange={(e) => setRegistrar(e.target.value)} className={inputCls} /></Field>
          <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></Field>
          <p className="text-[11.5px] text-faint-foreground">This books the sale in finance (price as domain income, your cost from the bank) and connects the domain to the agent's store. SSL is issued automatically once the CNAME is seen.</p>
          <div className="flex justify-end gap-2"><Button variant="quiet" onClick={() => setReg(null)}>Cancel</Button><Button onClick={() => void markRegistered()}>Mark registered</Button></div>
        </div>
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
