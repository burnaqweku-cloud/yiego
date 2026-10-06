import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Panel, Row, Rows } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";

/* Master-admin-only: move money in or out of the master balance with a written reason.
   Every admin sees the history; only the master admin sees the form. */
interface Adj { id: string; occurred_at: string; amount: number; reason: string; kind: "add" | "withdraw" | "spend"; by: string | null; undone: boolean }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }> };
const KIND: Record<Adj["kind"], string> = { add: "Added", withdraw: "Withdrawn", spend: "Spent" };

export default function MasterAdjustments({ isMaster, onChanged }: { isMaster: boolean; onChanged?: () => void }) {
  const [list, setList] = useState<Adj[] | null>(null);
  const [kind, setKind] = useState<Adj["kind"]>("spend"); const [amount, setAmount] = useState(""); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const load = async () => { const { data } = await db().rpc("finance_master_adjustments", {}); setList((data as Adj[]) ?? []); };
  useEffect(() => { void load(); }, []);
  const save = async () => {
    const v = Number(amount); if (!Number.isFinite(v) || v <= 0) return toast.error("Enter an amount.");
    if (reason.trim().length < 3) return toast.error("Write the reason; every admin will see it.");
    if (!window.confirm(`${KIND[kind]} ${formatGHS(v)} ${kind === "add" ? "to" : "from"} the master balance?\n\nReason: ${reason.trim()}`)) return;
    setBusy(true);
    const { error } = await db().rpc("finance_master_adjust", { p_kind: kind, p_amount: v, p_reason: reason.trim() });
    setBusy(false);
    if (error) return toast.error(error.message.includes("master_admin") ? "Only the master admin can do this." : error.message.replace(/_/g, " "));
    toast.success("Recorded."); setAmount(""); setReason(""); void load(); onChanged?.();
  };
  return (
    <Panel title="Adjustments" note={isMaster ? "master admin only · every admin sees the history" : "only the master admin can add or remove money"}>
      {isMaster && (
        <div className="mb-4 grid gap-2 sm:grid-cols-[auto_1fr]">
          <div className="flex flex-wrap gap-1.5">{(["spend", "withdraw", "add"] as const).map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ${kind === k ? "bg-primary/20 text-primary-glow" : "border border-white/[0.08] text-muted-foreground"}`}>{k === "spend" ? "Spend (a cost)" : k === "withdraw" ? "Withdraw (not a cost)" : "Add money"}</button>)}</div>
          <div className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="GH₵" className="onyx-field w-full" />
            <input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} placeholder={kind === "spend" ? "Reason, e.g. 1GB giveaway, 100 bundles" : kind === "withdraw" ? "Reason, e.g. partner drawing" : "Reason, e.g. top-up from Larry"} className="onyx-field w-full" />
            <Button size="sm" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Record"}</Button>
          </div>
          <p className="text-[11.5px] text-faint-foreground sm:col-span-2">Spend lowers the pot and counts as a business cost in profit. Withdraw lowers the pot without touching profit (money leaving to a partner). Add raises the pot.</p>
        </div>
      )}
      <Rows empty="No adjustments yet.">
        {(list ?? []).map((a) => <Row key={a.id} primary={<span className={a.undone ? "line-through opacity-60" : ""}>{KIND[a.kind]} · {a.reason}</span>} secondary={`${formatAdminDate(a.occurred_at)}${a.by ? ` · by ${a.by}` : ""}${a.undone ? " · reversed" : ""}`} right={`${a.amount >= 0 ? "+" : "−"}${formatGHS(Math.abs(Number(a.amount)))}`} tone={a.amount >= 0 ? "good" : "bad"} />)}
      </Rows>
    </Panel>
  );
}
