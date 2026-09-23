import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import type { PlanOption, PlanQuote } from "@/lib/agents";

/* Choose 1, 3 or 12 months and pay through Paystack. Used on the first-pay
   screen and in the Renew / Extend sheet. Whatever is bought is added to the
   end of the current plan; lapsed agents start again from the day they pay. */
export default function PlanPicker({ quote, verb = "Pay", extending = false }: { quote: PlanQuote | null; verb?: string; extending?: boolean }) {
  const [months, setMonths] = useState<1 | 3 | 12>(1);
  const [busy, setBusy] = useState(false);
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
  if (!quote) return <p className="text-[13px] text-muted-foreground">Loading plans…</p>;
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {plans.map((p: PlanOption) => {
          const on = p.months === months; const promo = p.promo_id && quote.promo;
          return (
            <button key={p.months} type="button" onClick={() => setMonths(p.months)} className={`relative rounded-2xl border p-3 text-left transition ${on ? "border-primary bg-primary/12" : "border-white/[0.1] bg-white/[0.02]"}`}>
              {p.saving_pct > 0 && <span className="absolute -top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-[#04120c]">Save {p.saving_pct}%</span>}
              {promo && <span className="absolute -top-2 right-2 rounded-full bg-amber px-2 py-0.5 text-[10px] font-bold text-[#1a1200]">{quote.promo!.percent_off}% off</span>}
              <p className="text-[12px] text-muted-foreground">{p.months === 1 ? "1 month" : `${p.months} months`}</p>
              <p className="mt-1 text-[18px] font-semibold leading-tight text-foreground">{formatGHS(p.pay_now)}</p>
              <p className="text-[10.5px] text-faint-foreground">{p.months === 1 ? (promo ? `normally ${formatGHS(p.list_price)}` : "per month") : `${formatGHS(p.per_month)} / month`}</p>
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
      <button type="button" className="onyx-btn-primary mt-4 w-full py-3 text-[14px]" onClick={() => void pay()} disabled={busy || !chosen}>{busy ? "Opening Paystack…" : `${verb} ${chosen ? formatGHS(chosen.total) : ""} with Paystack`}</button>
      <p className="mt-2.5 text-center text-[11px] text-faint-foreground">{extending ? "Added to the end of your current plan. " : "Your plan starts the moment payment is confirmed. "}Card or mobile money. No refunds on 3 and 12-month plans.</p>
    </div>
  );
}
