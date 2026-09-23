import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { formatGHS } from "@/lib/format";
import { fmt, useAgent } from "@/components/agent/AgentShell";
import { stageOf, toneClass } from "@/components/agent/orderStage";
import { Info } from "lucide-react";

export default function AgentOrders() {
  const { orders } = useAgent();
  const [q, setQ] = useState(""); const [filter, setFilter] = useState<"all" | "delivered" | "waiting">("all");
  const list = useMemo(() => orders.filter((o) => (filter === "all" || (filter === "delivered" ? o.status === "delivered" : o.status !== "delivered")) && (!q || o.recipient_phone.includes(q) || o.order_reference.toLowerCase().includes(q.toLowerCase()))), [orders, q, filter]);
  return (
    <div className="space-y-3">
      <h1 className="font-display text-[22px] font-semibold text-foreground">Orders</h1>
      <div className="flex gap-2"><label className="relative flex-1"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Phone or order ID" className="onyx-field w-full pl-9" /></label></div>
      <div className="flex gap-2">{(["all", "delivered", "waiting"] as const).map((f) => <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 text-[12.5px] ${filter === f ? "bg-primary/15 text-primary-glow" : "border border-white/[0.08] text-muted-foreground"}`}>{f[0].toUpperCase() + f.slice(1)}</button>)}</div>
      {orders.some((o) => o.admin_resolution_status === "awaiting_verification" && o.status !== "delivered") && <div className="flex items-start gap-2 rounded-2xl bg-amber/10 px-3.5 py-3 text-[12.5px] leading-5 text-muted-foreground"><Info size={15} className="mt-0.5 shrink-0 text-amber" /><span><b className="text-foreground">Some orders are being verified by MTN.</b> This happens the first time a number receives a bundle this way. It hasn't failed and the customer's money is safe — MTN usually clears it within a few days, and the data is delivered automatically. It only happens once per number.</span></div>}
      <div className="onyx-panel rounded-2xl p-3"><ul className="divide-y divide-white/[0.06]">{list.length === 0 && <li className="py-8 text-center text-[13px] text-muted-foreground">Nothing here yet.</li>}{list.map((o) => { const st = stageOf(o); return <li key={o.order_reference} className="py-2.5"><div className="flex items-center justify-between"><div><p className="text-[13px] font-medium text-foreground">{o.networks?.name} {o.data_products?.name?.replace(/^.*?—\s*/, "")} → {o.recipient_phone}</p><p className="text-[11px] text-faint-foreground">{o.order_reference} · {fmt(o.paid_at ?? o.created_at)} · <span className={toneClass(st.tone)}>{st.label}</span></p></div><div className="text-right"><p className="text-[13px] font-semibold text-foreground">{formatGHS(Number(o.amount))}</p><p className="text-[11px] text-primary-glow">+{formatGHS(Number(o.agent_margin ?? 0))}</p></div></div>{st.note && st.tone !== "wait" && <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-amber/10 px-2.5 py-1.5 text-[11.5px] leading-4 text-muted-foreground"><Info size={12} className="mt-0.5 shrink-0 text-amber" />{st.note}</p>}</li>; })}</ul></div>
    </div>
  );
}
