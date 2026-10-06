import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Clock3, Copy, Download, Info, MessageCircle, Search, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { formatGHS } from "@/lib/format";
import { type AgentOrder, useAgent } from "@/components/agent/AgentShell";
import { stageOf, toneClass } from "@/components/agent/orderStage";

/* The agent's orders: every paid order placed in their store, newest first.
   Period and stage filters, network chips, search, grouped by day, 20 at a time,
   tap a row for the details (Order ID, what the customer paid, your profit, the
   stage note) with copy and WhatsApp-the-customer. CSV export of what's shown. */

type Period = "today" | "7d" | "30d" | "all";
type Stage = "all" | "progress" | "delivered" | "verify" | "issue";
const PERIODS: Array<{ id: Period; label: string }> = [{ id: "today", label: "Today" }, { id: "7d", label: "7 days" }, { id: "30d", label: "30 days" }, { id: "all", label: "All time" }];
const STAGES: Array<{ id: Stage; label: string }> = [{ id: "all", label: "All" }, { id: "progress", label: "In progress" }, { id: "delivered", label: "Delivered" }, { id: "verify", label: "MTN verifying" }, { id: "issue", label: "Needs attention" }];
const PAGE = 20;

const when = (o: AgentOrder) => o.paid_at ?? o.created_at;
const stageId = (o: AgentOrder): Stage => {
  if (o.status === "delivered") return "delivered";
  if (o.admin_resolution_status === "awaiting_verification") return "verify";
  if (o.status === "refunded" || o.status === "cancelled" || o.status.startsWith("failed")) return "issue";
  return "progress";
};
const bundle = (o: AgentOrder) => `${o.networks?.name ?? ""} ${o.data_products?.name?.replace(/^.*?—\s*/, "") ?? ""}`.trim();
const dayKey = (d: string) => new Date(d).toDateString();
const dayLabel = (d: string) => {
  const dt = new Date(d); const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  if (dt.toDateString() === today.toDateString()) return "Today";
  if (dt.toDateString() === y.toDateString()) return "Yesterday";
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
};
const timeOf = (d: string) => new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const waLink = (phone: string) => `https://wa.me/233${phone.replace(/\D/g, "").replace(/^0/, "")}`;

export default function AgentOrders() {
  const { orders } = useAgent();
  const [period, setPeriod] = useState<Period>("all");
  const [stage, setStage] = useState<Stage>("all");
  const [network, setNetwork] = useState("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setShown(PAGE), [period, stage, network, q]);

  const networks = useMemo(() => Array.from(new Set(orders.map((o) => o.networks?.name).filter(Boolean))) as string[], [orders]);
  const since = useMemo(() => {
    if (period === "all") return 0;
    const d = new Date(); d.setHours(0, 0, 0, 0);
    if (period === "7d") d.setDate(d.getDate() - 6);
    if (period === "30d") d.setDate(d.getDate() - 29);
    return d.getTime();
  }, [period]);

  const inPeriod = useMemo(() => orders.filter((o) => new Date(when(o)).getTime() >= since), [orders, since]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inPeriod
      .filter((o) => stage === "all" || stageId(o) === stage)
      .filter((o) => network === "all" || o.networks?.name === network)
      .filter((o) => !needle || o.recipient_phone.includes(needle) || o.order_reference.toLowerCase().includes(needle) || bundle(o).toLowerCase().includes(needle))
      .sort((a, b) => when(b).localeCompare(when(a)));
  }, [inPeriod, stage, network, q]);

  // Period summary (independent of stage/network/search so it reads as "this period").
  const sum = useMemo(() => {
    const delivered = inPeriod.filter((o) => o.status === "delivered");
    const earned = delivered.reduce((a, o) => a + Number(o.agent_margin ?? 0), 0);
    const pending = inPeriod.filter((o) => stageId(o) === "progress" || stageId(o) === "verify").reduce((a, o) => a + Number(o.agent_margin ?? 0), 0);
    const sales = inPeriod.reduce((a, o) => a + Number(o.amount ?? 0), 0);
    return { orders: inPeriod.length, delivered: delivered.length, earned, pending, sales, verifying: inPeriod.filter((o) => stageId(o) === "verify").length, issues: inPeriod.filter((o) => stageId(o) === "issue").length };
  }, [inPeriod]);

  const visible = list.slice(0, shown);
  const groups = useMemo(() => {
    const out: Array<{ day: string; label: string; items: AgentOrder[] }> = [];
    for (const o of visible) { const k = dayKey(when(o)); const g = out[out.length - 1]; if (g && g.day === k) g.items.push(o); else out.push({ day: k, label: dayLabel(when(o)), items: [o] }); }
    return out;
  }, [visible]);

  const copy = async (v: string, what: string) => { try { await navigator.clipboard.writeText(v); toast.success(`${what} copied.`); } catch { toast.error("Couldn't copy."); } };
  const exportCsv = () => {
    const rows = [["Order ID", "Date", "Time", "Network", "Bundle", "Recipient", "Customer paid (GHS)", "Your profit (GHS)", "Status"], ...list.map((o) => [o.order_reference, new Date(when(o)).toLocaleDateString("en-GB"), timeOf(when(o)), o.networks?.name ?? "", o.data_products?.name?.replace(/^.*?—\s*/, "") ?? "", o.recipient_phone, Number(o.amount).toFixed(2), Number(o.agent_margin ?? 0).toFixed(2), stageOf(o).label])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `orders-${period}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const chip = (active: boolean) => `rounded-full px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition-colors ${active ? "bg-primary/20 text-primary-glow" : "border border-white/[0.08] text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div><h1 className="font-display text-[22px] font-semibold text-foreground">Orders</h1><p className="text-[12.5px] text-muted-foreground">Every paid order from your store, newest first.</p></div>
        {list.length > 0 && <button type="button" onClick={exportCsv} className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.1] px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"><Download size={13} />CSV</button>}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{PERIODS.map((p) => <button key={p.id} type="button" onClick={() => setPeriod(p.id)} className={chip(period === p.id)}>{p.label}</button>)}</div>

      <div className="grid grid-cols-3 gap-2">
        <div className="onyx-panel rounded-2xl p-3"><p className="text-[11px] text-muted-foreground">Orders</p><p className="mt-0.5 text-[20px] font-semibold leading-tight text-foreground">{sum.orders}</p><p className="text-[11px] text-faint-foreground">{sum.delivered} delivered</p></div>
        <div className="onyx-panel rounded-2xl p-3"><p className="text-[11px] text-muted-foreground">Sales</p><p className="mt-0.5 text-[20px] font-semibold leading-tight text-foreground">{formatGHS(sum.sales)}</p><p className="text-[11px] text-faint-foreground">paid by customers</p></div>
        <div className="onyx-panel rounded-2xl p-3"><p className="text-[11px] text-muted-foreground">Your profit</p><p className="mt-0.5 text-[20px] font-semibold leading-tight text-primary-glow">{formatGHS(sum.earned)}</p><p className="text-[11px] text-faint-foreground">{sum.pending > 0 ? `+${formatGHS(sum.pending)} pending` : "on delivered orders"}</p></div>
      </div>

      {(sum.verifying > 0 || sum.issues > 0) && (
        <div className="flex flex-wrap gap-2 text-[12px]">
          {sum.verifying > 0 && <button type="button" onClick={() => setStage("verify")} className="flex items-center gap-1.5 rounded-full bg-amber/10 px-3 py-1.5 text-amber"><Clock3 size={13} />{sum.verifying} being verified by MTN</button>}
          {sum.issues > 0 && <button type="button" onClick={() => setStage("issue")} className="flex items-center gap-1.5 rounded-full bg-danger/10 px-3 py-1.5 text-danger"><ShieldAlert size={13} />{sum.issues} need attention</button>}
        </div>
      )}

      <label className="relative block"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order ID, phone number or bundle" className="onyx-field w-full pl-9 pr-9" />{q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground"><X size={14} /></button>}</label>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STAGES.map((s) => <button key={s.id} type="button" onClick={() => setStage(s.id)} className={chip(stage === s.id)}>{s.label}</button>)}
        {networks.length > 1 && <><span className="mx-1 w-px shrink-0 bg-white/[0.08]" />{["all", ...networks].map((n) => <button key={n} type="button" onClick={() => setNetwork(n)} className={chip(network === n)}>{n === "all" ? "All networks" : n}</button>)}</>}
      </div>

      <div className="onyx-panel rounded-2xl p-3">
        {orders.length === 0 ? <p className="py-8 text-center text-[13px] text-muted-foreground">No orders yet. Share your store link to get your first one.</p>
          : list.length === 0 ? <p className="py-8 text-center text-[13px] text-muted-foreground">Nothing matches these filters.</p>
          : groups.map((g) => (
            <div key={g.day} className="[&+&]:mt-3">
              <p className="px-1 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint-foreground">{g.label} <span className="font-normal normal-case tracking-normal">· {g.items.length} order{g.items.length === 1 ? "" : "s"}</span></p>
              <ul className="divide-y divide-white/[0.06]">
                {g.items.map((o) => {
                  const st = stageOf(o); const isOpen = open === o.order_reference;
                  return (
                    <li key={o.order_reference}>
                      <button type="button" onClick={() => setOpen(isOpen ? null : o.order_reference)} aria-expanded={isOpen} className="flex w-full items-center gap-3 py-2.5 text-left">
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${st.tone === "good" ? "bg-primary/15" : st.tone === "bad" ? "bg-danger/10" : "bg-amber/12"} ${toneClass(st.tone)}`}>{st.tone === "good" ? <CheckCircle2 size={17} /> : st.tone === "bad" ? <ShieldAlert size={17} /> : <Clock3 size={17} />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium text-foreground">{bundle(o)} <span className="text-muted-foreground">→</span> {o.recipient_phone}</span>
                          <span className="block text-[11.5px] text-faint-foreground">{timeOf(when(o))} · <span className={toneClass(st.tone)}>{st.label}</span></span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-[13px] font-semibold text-primary-glow">+{formatGHS(Number(o.agent_margin ?? 0))}</span>
                          <span className="block text-[11px] text-faint-foreground">{formatGHS(Number(o.amount))}</span>
                        </span>
                        <ChevronDown size={15} className={`shrink-0 text-faint-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                      {isOpen && (
                        <div className="mb-2 ml-12 rounded-xl bg-white/[0.03] p-3 text-[12.5px]">
                          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                            <div><p className="text-[11px] text-faint-foreground">Order ID</p><p className="flex items-center gap-1.5 font-mono text-[12px] text-foreground">{o.order_reference}<button type="button" aria-label="Copy order ID" onClick={() => void copy(o.order_reference, "Order ID")} className="text-muted-foreground hover:text-foreground"><Copy size={12} /></button></p></div>
                            <div><p className="text-[11px] text-faint-foreground">Paid</p><p className="text-foreground">{new Date(when(o)).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div>
                            <div><p className="text-[11px] text-faint-foreground">Customer paid</p><p className="text-foreground">{formatGHS(Number(o.amount))}</p></div>
                            <div><p className="text-[11px] text-faint-foreground">Your profit</p><p className="text-primary-glow">{formatGHS(Number(o.agent_margin ?? 0))}{o.status !== "delivered" && stageId(o) !== "issue" ? <span className="text-faint-foreground"> · pending</span> : ""}</p></div>
                          </div>
                          {st.note && <p className="mt-2.5 flex items-start gap-1.5 text-[12px] leading-5 text-muted-foreground"><Info size={13} className={`mt-0.5 shrink-0 ${toneClass(st.tone)}`} />{st.note}</p>}
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            <a href={waLink(o.recipient_phone)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full border border-white/[0.1] px-3 py-1.5 text-[12px] text-foreground"><MessageCircle size={13} />WhatsApp customer</a>
                            <button type="button" onClick={() => void copy(o.recipient_phone, "Number")} className="flex items-center gap-1.5 rounded-full border border-white/[0.1] px-3 py-1.5 text-[12px] text-foreground"><Copy size={13} />Copy number</button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        {list.length > 0 && (
          <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3 text-[12px] text-faint-foreground">
            <span>Showing {Math.min(shown, list.length)} of {list.length}</span>
            {list.length > shown && <button type="button" onClick={() => setShown((n) => n + PAGE)} className="font-semibold text-primary-glow">Show {Math.min(PAGE, list.length - shown)} more</button>}
          </div>
        )}
      </div>
      {orders.length >= 300 && <p className="px-1 text-[11.5px] text-faint-foreground">Showing your latest 300 orders. Export a CSV for older ones.</p>}
    </div>
  );
}
