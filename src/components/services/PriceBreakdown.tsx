import { formatGHS } from "@/lib/format";

/* What the buyer is charged, set out the way the data checkout does it: our price on its own line, the payment
   fee on its own line, then the total. The price we charge must never be shown only as price-plus-fee, or the
   buyer reads the total as our price. With no fee (wallet) there is one line: the amount. */
export default function PriceBreakdown({ label, base, fee }: { label: string; base: number; fee: number }) {
  const row = "flex items-center justify-between gap-4 py-3";
  return (
    <div className="rounded-2xl border border-white/[0.08] px-4">
      <div className={row}><span className="text-[13px] text-muted-foreground">{label}</span><span className="text-[14.5px] font-semibold tabular-nums text-foreground">{formatGHS(base)}</span></div>
      {fee > 0 && <div className={`${row} border-t border-white/[0.06]`}><span className="text-[13px] text-muted-foreground">Payment fee (mobile money or card)</span><span className="text-[14.5px] font-semibold tabular-nums text-foreground">{formatGHS(fee)}</span></div>}
      {fee > 0 && <div className={`${row} border-t border-white/[0.08]`}><span className="text-[13.5px] font-semibold text-foreground">Total to pay</span><span className="font-display text-[18px] font-semibold tabular-nums text-foreground">{formatGHS(base + fee)}</span></div>}
    </div>
  );
}
