import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import type { PlanOption, PlanQuote } from "@/lib/agents";
import { useWallet } from "@/store/wallet";
import { invalidate } from "@/lib/requestCache";

/* Choose 1, 3 or 12 months and pay: through Paystack (4% checkout fee), or, when the balance covers it, straight
   from the wallet or from agent earnings (no fee, instant). Used on the first-pay screen and in the Renew / Extend
   sheet. Whatever is bought is added to the end of the current plan; lapsed agents start again from the day they pay. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p1 = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");
const money = (n: number) => (Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(2));

export default function PlanPicker({ quote, verb = "Pay", extending = false, earningsBalance = 0, onPaid }: { quote: PlanQuote | null; verb?: string; extending?: boolean; earningsBalance?: number; onPaid?: () => void }) {
  const [months, setMonths] = useState<1 | 3 | 12>(1);
  const [busy, setBusy] = useState(false);
  const [busyFrom, setBusyFrom] = useState<"wallet" | "earnings" | null>(null);
  const wallet = useWallet();
  const plans = quote?.plans ?? [];
  const chosen = plans.find((p) => p.months === months) ?? plans[0];
  const pay = async () => {
    if (!chosen) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke<{ error?: string; data?: { authorizationUrl: string } }>("agent-subscribe", { body: { months: chosen.months } });
    setBusy(false);
    const err = data?.error ?? error?.message; if (err) return toast.error(err);
    if (data?.data?.authorizationUrl) window.location.href = data.data.authorizationUrl;
  };
  const payFrom = async (source: "wallet" | "earnings") => {
    if (!chosen) return;
    const label = source === "wallet" ? "your wallet" : "your earnings";
    if (!window.confirm(`Take ${formatGHS(chosen.pay_now)} from ${label} for the ${chosen.months === 1 ? "1-month" : `${chosen.months}-month`} plan? No checkout fee.`)) return;
    setBusyFrom(source);
    const { data, error } = await p1().rpc("agent_pay_plan_from_balance", { p_months: chosen.months, p_source: source });
    setBusyFrom(null);
    if (error) { const m = String(error.message); toast.error(m.startsWith("insufficient") ? `Not enough in ${label}.` : m.startsWith("payout_pending") ? "Finish or cancel your pending payout first." : m.replace(/_/g, " ")); return; }
    const r = data as { paid_until?: string };
    toast.success(`Paid from ${label}. Your store is open until ${r?.paid_until ? new Date(r.paid_until).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "the new date"}.`);
    invalidate("agents:"); void wallet.refresh(); onPaid?.();
  };
  const walletCovers = !!chosen && wallet.balance >= Number(chosen.pay_now) && chosen.pay_now > 0;
  const earningsCover = !!chosen && Number(earningsBalance) >= Number(chosen.pay_now) && chosen.pay_now > 0;
  if (!quote) return <p className="text-[13px] text-muted-foreground">Loading plans…</p>;
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {plans.map((p: PlanOption) => {
          const on = p.months === months; const promo = p.promo_id && quote.promo;
          return (
            <button key={p.months} type="button" onClick={() => setMonths(p.months)} className={`relative min-w-0 rounded-2xl border px-2 pb-2.5 pt-3.5 text-left transition sm:px-3 sm:pb-3 ${on ? "border-primary bg-primary/12" : "border-white/[0.1] bg-white/[0.02]"}`}>
              {p.saving_pct > 0 && <span className="absolute -top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-[#04120c]">Save {p.saving_pct}%</span>}
              {promo && <span className="absolute -top-2 right-2 rounded-full bg-amber px-2 py-0.5 text-[10px] font-bold text-[#1a1200]">{quote.promo!.percent_off}% off</span>}
              <p className="truncate text-[11px] text-muted-foreground sm:text-[12px]">{p.months === 1 ? "1 month" : `${p.months} months`}</p>
              <p className="mt-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground sm:text-[10px]">GHS</p><p className="whitespace-nowrap text-[17px] font-semibold leading-none tabular-nums text-foreground sm:text-[20px]">{money(p.pay_now)}</p>
              <p className="mt-1 whitespace-nowrap text-[10px] tabular-nums text-faint-foreground sm:text-[10.5px]">{p.months === 1 ? (promo ? `was ${money(p.list_price)}` : "per month") : `${money(p.per_month)}/mo`}</p>
            </button>
          );
        })}
      </div>
      {chosen && (
        <div className="mt-3 rounded-2xl bg-white/[0.03] p-3 text-[12px] text-muted-foreground">
          <div className="flex justify-between"><span>{chosen.months === 1 ? "1 month" : `${chosen.months} months`} plan</span><span className="text-foreground">{formatGHS(chosen.pay_now)}</span></div>
          <div className="mt-1 flex justify-between"><span>Checkout fee (4%)</span><span className="text-foreground">{formatGHS(chosen.fee)}</span></div>
          <div className="mt-1.5 flex justify-between border-t border-white/[0.08] pt-1.5 text-[13px] font-semibold text-foreground"><span>You pay</span><span>{formatGHS(chosen.total)}</span></div>
        </div>
      )}
      {(walletCovers || earningsCover) && chosen && (
        <div className="mt-4 space-y-2">
          {walletCovers && <button type="button" className="onyx-btn-primary w-full py-3 text-[14px]" onClick={() => void payFrom("wallet")} disabled={busy || busyFrom !== null}>{busyFrom === "wallet" ? "Paying…" : `${verb} ${formatGHS(chosen.pay_now)} from my wallet`}<span className="ml-1.5 text-[11px] font-normal opacity-80">· no fee · {formatGHS(wallet.balance)} available</span></button>}
          {earningsCover && <button type="button" className="onyx-btn-primary w-full py-3 text-[14px]" onClick={() => void payFrom("earnings")} disabled={busy || busyFrom !== null}>{busyFrom === "earnings" ? "Paying…" : `${verb} ${formatGHS(chosen.pay_now)} from my earnings`}<span className="ml-1.5 text-[11px] font-normal opacity-80">· no fee · {formatGHS(Number(earningsBalance))} available</span></button>}
        </div>
      )}
      <button type="button" className={`${walletCovers || earningsCover ? "mt-2 w-full rounded-full border border-white/[0.12] py-3 text-[14px] font-medium text-foreground" : "onyx-btn-primary mt-4 w-full py-3 text-[14px]"}`} onClick={() => void pay()} disabled={busy || busyFrom !== null || !chosen}>{busy ? "Opening secure checkout…" : `${verb} ${chosen ? formatGHS(chosen.total) : ""} with Paystack`}</button>
      <p className="mt-2.5 text-center text-[11px] text-faint-foreground">{extending ? "Added to the end of your current plan. " : "Your plan starts the moment payment is confirmed. "}Card or mobile money{walletCovers || earningsCover ? ", or your balance with no fee" : ""}. No refunds on 3 and 12-month plans.</p>
    </div>
  );
}
