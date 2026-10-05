import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { p1, useAgent } from "@/components/agent/AgentShell";
import { formatGHS } from "@/lib/format";

/* The agent's customers: accounts created on their store and signed-in buyers through it. Their store only. */
interface C { id: string; name: string | null; email: string | null; phone: string | null; joined: string; owned: boolean; orders: number; spent: number; last_order: string | null }
export default function AgentCustomers() {
  const { agent } = useAgent();
  const [rows, setRows] = useState<C[] | null>(null); const [q, setQ] = useState("");
  useEffect(() => { void p1().rpc("agent_customers", {}).then(({ data }) => setRows((data as C[]) ?? [])); }, []);
  const visible = useMemo(() => (rows ?? []).filter((c) => !q.trim() || [c.name, c.email, c.phone].some((v) => (v ?? "").toLowerCase().includes(q.trim().toLowerCase()))), [rows, q]);
  const d = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
  return (
    <div className="space-y-5">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Customers</p><h1 className="font-display text-[24px] font-semibold text-foreground">People who buy from {agent.store_name}</h1><p className="mt-1 text-[13px] text-muted-foreground">Accounts created on your store, and anyone who bought while signed in.</p></div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="onyx-panel rounded-2xl py-3"><p className="text-[18px] font-semibold tabular-nums text-foreground">{rows?.length ?? "…"}</p><p className="text-[11px] text-faint-foreground">Customers</p></div>
        <div className="onyx-panel rounded-2xl py-3"><p className="text-[18px] font-semibold tabular-nums text-foreground">{rows ? rows.filter((c) => c.owned).length : "…"}</p><p className="text-[11px] text-faint-foreground">Signed up here</p></div>
        <div className="onyx-panel rounded-2xl py-3"><p className="text-[18px] font-semibold tabular-nums text-primary-glow">{rows ? formatGHS(rows.reduce((s, c) => s + Number(c.spent), 0)) : "…"}</p><p className="text-[11px] text-faint-foreground">Spent, delivered</p></div>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by name, email or phone" className="onyx-field w-full" />
      <section className="onyx-panel rounded-[22px] p-4">
        {rows === null ? <p className="text-[13px] text-muted-foreground">Loading…</p> : visible.length === 0 ? <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><Users size={15} />No customers yet. Share your store link and they'll appear here.</p> : (
          <ul className="divide-y divide-white/[0.06]">{visible.map((c) => <li key={c.id} className="flex items-start justify-between gap-3 py-3"><span className="min-w-0"><span className="block truncate text-[13.5px] font-semibold text-foreground">{c.name || c.email || "Customer"}</span><span className="block truncate text-[11.5px] text-faint-foreground">{[c.phone, c.email].filter(Boolean).join(" · ")}</span><span className="block text-[11.5px] text-faint-foreground">Joined {d(c.joined)}{c.owned ? " on your store" : ""} · last order {d(c.last_order)}</span></span><span className="shrink-0 text-right"><span className="block text-[13px] font-semibold text-foreground">{formatGHS(Number(c.spent))}</span><span className="block text-[11px] text-muted-foreground">{c.orders} order{c.orders === 1 ? "" : "s"}</span></span></li>)}</ul>
        )}
      </section>
    </div>
  );
}
