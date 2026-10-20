import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp, RefreshCw, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminListPagination from "@/components/admin/AdminListPagination";
import { Panel, Pill, inputCls, type Tone } from "@/components/admin/ui";
import { formatAdminDate } from "@/lib/admin-data";
import { loadSmsMessages, requeueSms, SMS_DELIVERY_LABEL, SMS_KIND_LABEL, SMS_REASON_LABEL, SMS_STATUS_LABEL, type SmsDelivery, type SmsKind, type SmsMessage, type SmsStatus } from "@/lib/sms-admin";

/* Admin → SMS → Messages. Every text we tried to send, what happened to it, and the one safe action: re-queue. */
const statusTone = (m: SmsMessage): Tone => m.status === "failed" ? "bad" : m.status === "uncertain" ? "warn" : m.status === "skipped" ? "muted" : m.status === "sent" ? "good" : "default";
const deliveryTone = (d: SmsDelivery | null): Tone => d === "delivered" ? "good" : d === "not_delivered" || d === "failed" ? "bad" : d ? "muted" : "muted";
const selectCls = "h-9 rounded-lg border border-white/[0.1] bg-white/[0.03] px-2 text-[12.5px] text-foreground focus:border-primary/50 focus:outline-none";

export default function AdminSmsMessages() {
  const [params, setParams] = useSearchParams();
  const kind = (params.get("kind") ?? "") as SmsKind | "";
  const status = (params.get("status") ?? "") as SmsStatus | "";
  const delivery = (params.get("delivery") ?? "") as SmsDelivery | "none" | "";
  const [phone, setPhone] = useState(params.get("phone") ?? "");
  const from = params.get("from") ?? ""; const to = params.get("to") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1)); const pageSize = Math.min(200, Math.max(10, Number(params.get("size") ?? 30)));
  const [rows, setRows] = useState<SmsMessage[] | null>(null); const [total, setTotal] = useState(0);
  const [open, setOpen] = useState<string | null>(null); const [busy, setBusy] = useState<string | null>(null);

  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(params); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } if (!("page" in patch)) n.delete("page"); setParams(n, { replace: true }); };
  const load = useCallback(async () => {
    try { const r = await loadSmsMessages({ kind, status, delivery, phone: params.get("phone") ?? "", from, to, limit: pageSize, offset: (page - 1) * pageSize }); setRows(r.rows); setTotal(r.total); }
    catch (e) { toast.error((e as Error).message); setRows([]); }
  }, [kind, status, delivery, params, from, to, page, pageSize]);
  useEffect(() => { setRows(null); void load(); }, [load]);

  const requeue = async (m: SmsMessage) => {
    const warn = m.status === "uncertain"
      ? "Vynfy didn't answer when this was sent, so it MAY already have gone out. Only re-queue if the number is not in Vynfy's message history for that time. Re-queue now?"
      : "Send this text again? Vynfy refused it the first time, so it was never charged.";
    if (!window.confirm(warn)) return;
    setBusy(m.id);
    try { await requeueSms(m.id); toast.success("Re-queued. It goes out within a minute."); await load(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Messages" description="Every text, newest first. Status is what happened on our side; delivery is what the network reported back." action={
        <button type="button" onClick={() => { setRows(null); void load(); }} className="rounded-lg border border-white/[0.1] p-1.5 text-muted-foreground hover:text-foreground" aria-label="Refresh"><RefreshCw size={14} /></button>
      } />

      <Panel title="Filter" icon={Search}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <select value={kind} onChange={(e) => set({ kind: e.target.value })} className={selectCls} aria-label="Type"><option value="">All types</option>{(Object.keys(SMS_KIND_LABEL) as SmsKind[]).map((k) => <option key={k} value={k}>{SMS_KIND_LABEL[k]}</option>)}</select>
          <select value={status} onChange={(e) => set({ status: e.target.value })} className={selectCls} aria-label="Status"><option value="">Any status</option>{(Object.keys(SMS_STATUS_LABEL) as SmsStatus[]).map((k) => <option key={k} value={k}>{SMS_STATUS_LABEL[k]}</option>)}</select>
          <select value={delivery} onChange={(e) => set({ delivery: e.target.value })} className={selectCls} aria-label="Delivery"><option value="">Any delivery</option><option value="none">No report yet</option>{(Object.keys(SMS_DELIVERY_LABEL) as SmsDelivery[]).map((k) => <option key={k} value={k}>{SMS_DELIVERY_LABEL[k]}</option>)}</select>
          <form onSubmit={(e) => { e.preventDefault(); set({ phone }); }}><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" inputMode="tel" className={inputCls} aria-label="Phone number" /></form>
          <input type="date" value={from} onChange={(e) => set({ from: e.target.value })} className={selectCls} aria-label="From date" />
          <input type="date" value={to} onChange={(e) => set({ to: e.target.value })} className={selectCls} aria-label="To date" />
        </div>
        {(kind || status || delivery || params.get("phone") || from || to) && <button type="button" onClick={() => { setPhone(""); setParams(new URLSearchParams(), { replace: true }); }} className="mt-2 text-[11.5px] font-semibold text-primary-glow hover:underline">Clear filters</button>}
      </Panel>

      <Panel title={rows ? `${total.toLocaleString()} text${total === 1 ? "" : "s"}` : "Loading…"}>
        {rows === null ? <p className="py-6 text-center text-[12px] text-faint-foreground">Loading…</p> : rows.length === 0 ? <p className="py-6 text-center text-[12px] text-faint-foreground">No texts match.</p> : (
          <ul className="divide-y divide-white/[0.06]">
            {rows.map((m) => {
              const isOpen = open === m.id;
              return (
                <li key={m.id}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : m.id)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-white/[0.02]">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-foreground">
                        <span className="font-semibold tabular-nums">{m.phone}</span>
                        <Pill>{SMS_KIND_LABEL[m.kind]}</Pill>
                        <Pill tone={statusTone(m)}>{SMS_STATUS_LABEL[m.status]}</Pill>
                        {m.status === "sent" && <Pill tone={deliveryTone(m.delivery_status)}>{m.delivery_status ? SMS_DELIVERY_LABEL[m.delivery_status] : "No report yet"}</Pill>}
                      </p>
                      <p className="truncate text-[11px] text-faint-foreground">{m.order_reference}{m.store_name ? ` · ${m.store_name}` : ""} · {formatAdminDate(m.sent_at ?? m.created_at)}{m.reason && SMS_REASON_LABEL[m.reason] ? ` · ${SMS_REASON_LABEL[m.reason]}` : ""}</p>
                    </div>
                    {isOpen ? <ChevronUp size={14} className="text-faint-foreground" /> : <ChevronDown size={14} className="text-faint-foreground" />}
                  </button>
                  {isOpen && (
                    <div className="mb-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-[12.5px]">
                      {m.message ? <p className="rounded-lg bg-white/[0.04] p-2.5 leading-relaxed text-foreground">{m.message}</p> : <p className="text-faint-foreground">Text not stored (sent before 20 Oct 13:20).</p>}
                      <dl className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        <dt className="text-faint-foreground">Order</dt><dd><Link to={`/admin/orders?q=${encodeURIComponent(m.order_reference)}`} className="font-semibold text-primary-glow hover:underline">{m.order_reference}</Link></dd>
                        <dt className="text-faint-foreground">Queued</dt><dd>{formatAdminDate(m.created_at)}</dd>
                        <dt className="text-faint-foreground">Sent to Vynfy</dt><dd>{m.sent_at ? formatAdminDate(m.sent_at) : "—"}{m.attempts > 1 ? ` (attempt ${m.attempts})` : ""}</dd>
                        <dt className="text-faint-foreground">Vynfy task</dt><dd className="break-all">{m.provider_job_id ?? "—"}</dd>
                        <dt className="text-faint-foreground">Delivery</dt><dd>{m.delivery_status ? SMS_DELIVERY_LABEL[m.delivery_status] : "No report yet"}{m.delivery_checked_at ? ` · checked ${formatAdminDate(m.delivery_checked_at)}` : ""}{m.delivery_reason ? ` · ${m.delivery_reason}` : ""}</dd>
                        <dt className="text-faint-foreground">Why</dt><dd>{m.reason ? (SMS_REASON_LABEL[m.reason] || m.reason) : "—"}</dd>
                      </dl>
                      {m.requeueable && (
                        <button type="button" disabled={busy === m.id} onClick={() => void requeue(m)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 py-1.5 text-[12px] font-semibold text-foreground hover:bg-white/[0.04] disabled:opacity-50">
                          <RotateCcw size={13} />{busy === m.id ? "Re-queuing…" : "Re-queue this text"}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <AdminListPagination page={page} pageSize={pageSize} totalItems={total} onPageChange={(p) => set({ page: String(p) })} onPageSizeChange={(s) => set({ size: String(s), page: "" })} itemLabel="texts" />
      </Panel>
    </div>
  );
}
