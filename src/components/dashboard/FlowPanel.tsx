import { ArrowUpRight } from "lucide-react";
import { formatGHS } from "@/lib/format";
import { MOCK_TRANSACTIONS } from "@/data/mock";

const BARS = [42, 55, 38, 64, 49, 72, 58, 81, 66, 90, 74, 96];

/** "This week" money-flow panel — fills the space beside the wallet. */
export default function FlowPanel() {
  const inflow = MOCK_TRANSACTIONS.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const outflow = MOCK_TRANSACTIONS.filter((t) => t.amount < 0).reduce(
    (a, t) => a + Math.abs(t.amount),
    0,
  );

  return (
    <div className="onyx-panel flex flex-col rounded-[26px] p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            This week
          </p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">Money moving through your wallet</p>
        </div>
        <span className="onyx-trend">
          <ArrowUpRight size={13} /> 18.4%
        </span>
      </div>

      <div className="mt-6 flex min-h-[112px] flex-1 items-end gap-1.5" aria-hidden="true">
        {BARS.map((b, i) => (
          <span key={i} className="onyx-bar" style={{ height: `${b}%`, animationDelay: `${i * 45}ms` }} />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="onyx-flowstat">
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#6e8b7d]">In</span>
          <span className="mt-1 block font-display text-[17px] font-semibold tnum text-success">
            {formatGHS(inflow)}
          </span>
        </div>
        <div className="onyx-flowstat">
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#6e8b7d]">Out</span>
          <span className="mt-1 block font-display text-[17px] font-semibold tnum text-[#e7c4a0]">
            {formatGHS(outflow)}
          </span>
        </div>
      </div>
    </div>
  );
}
