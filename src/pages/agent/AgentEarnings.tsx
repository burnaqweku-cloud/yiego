import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { formatGHS } from "@/lib/format";
import { fmt, p1, useAgent } from "@/components/agent/AgentShell";

export default function AgentEarnings() {
  const { agent, payouts, plan, reload } = useAgent();
  const [amount, setAmount] = useState(""); const [busy, setBusy] = useState(false);
  const fee = (v: number) => plan ? Math.max(v * plan.payout_fee_rate, plan.payout_fee_minimum) : 0;
  const request = async () => {
    const v = Number(amount); if (!(v > 0)) return;
    setBusy(true); const { data, error } = await p1().rpc("agent_request_payout", { p_amount: v }); setBusy(false);
    if (error) { const m = String(error.message); toast.error(m.includes("momo_number_missing") ? "Add your MoMo number under Store first." : m.startsWith("below_minimum") ? `Minimum is ${formatGHS(Number(m.split(":")[1]))}` : m.includes("insufficient") ? "Not enough earnings." : m.includes("already_pending") ? "You already have a withdrawal waiting." : m); return; }
    toast.success(`Requested. You'll receive ${formatGHS(Number((data as { net: number }).net))}.`); setAmount(""); void reload();
  };
  return (
    <div className="space-y-3">
      <h1 className="font-display text-[22px] font-semibold text-foreground">Earnings</h1>
      <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Available to withdraw</p><p className="mt-1 text-[34px] font-semibold leading-none text-foreground">{formatGHS(Number(agent.earnings_balance))}</p></div>
      <div className="onyx-panel rounded-2xl p-4">
        <p className="text-[13.5px] font-semibold text-foreground">Withdraw to MoMo</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Minimum {formatGHS(plan?.payout_minimum ?? 20)} · fee {((plan?.payout_fee_rate ?? 0.01) * 100).toFixed(0)}% (at least {formatGHS(plan?.payout_fee_minimum ?? 0.5)}) · to {agent.momo_number ?? "— add your MoMo number in Store"}</p>
        <div className="mt-3 flex gap-2"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="onyx-field flex-1" /><button type="button" onClick={() => void request()} disabled={busy || !agent.momo_number} className="onyx-btn-primary px-4 py-2 text-[13px] disabled:opacity-50">Withdraw</button></div>
        {Number(amount) > 0 && plan && <p className="mt-2 text-[12px] text-faint-foreground">Fee {formatGHS(fee(Number(amount)))} · you receive <b className="text-foreground">{formatGHS(Number(amount) - fee(Number(amount)))}</b></p>}
        {!agent.momo_number && <Link to="/agent/store" className="mt-2 inline-block text-[12px] text-primary-glow">Add MoMo number →</Link>}
      </div>
      <div className="onyx-panel rounded-2xl p-3">
        <p className="px-1 text-[13px] font-semibold text-foreground">Withdrawals</p>
        <ul className="mt-1 divide-y divide-white/[0.06]">{payouts.length === 0 && <li className="py-6 text-center text-[13px] text-muted-foreground">No withdrawals yet.</li>}{payouts.map((p) => <li key={p.id} className="flex items-center justify-between py-2.5"><div><p className="text-[13px] text-foreground">{formatGHS(Number(p.amount))} <span className="text-faint-foreground">− fee {formatGHS(Number(p.fee))}</span></p><p className="text-[11px] text-faint-foreground">{fmt(p.created_at)}{p.note ? ` · ${p.note}` : ""}</p></div><span className={`text-[12px] font-semibold ${p.status === "paid" ? "text-primary-glow" : p.status === "rejected" ? "text-danger" : "text-amber"}`}>{p.status === "paid" ? `paid ${formatGHS(Number(p.net))}` : p.status === "requested" ? "waiting" : p.status}</span></li>)}</ul>
      </div>
    </div>
  );
}
