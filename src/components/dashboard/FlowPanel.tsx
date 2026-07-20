import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatGHS } from "@/lib/format";
import { useWallet } from "@/store/wallet";
import { cn } from "@/lib/utils";

/** Fallback shape for fresh demos — used until real activity spans 2+ days. */
const STATIC_BARS = [42, 55, 38, 64, 49, 72, 58, 81, 66, 90, 74, 96];
const FALLBACK_TREND = 18.4;
const BUCKETS = 12;
const DAY_MS = 86_400_000;

function dayStart(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Mon 29" */
function dayLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString("en-GH", { weekday: "short" })} ${d.getDate()}`;
}

/** "This week" money-flow panel — fills the space beside the wallet. */
export default function FlowPanel() {
  const { transactions } = useWallet();
  const recent = transactions.filter((t) => t.group !== "Earlier");
  const inflow = recent.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const outflow = recent.filter((t) => t.amount < 0).reduce((a, t) => a + Math.abs(t.amount), 0);

  // Honest bars: bucket real (timestamped) transactions by day over the last
  // 12 days, summing absolute volume. Falls back to the classic static shape
  // until at least 2 days carry data, so fresh demos still look alive.
  const { bars, trend, labels } = useMemo(() => {
    const today = dayStart(Date.now());
    const sums = new Array<number>(BUCKETS).fill(0);
    let thisWeek = 0;
    let lastWeek = 0;
    for (const t of transactions) {
      if (!t.ts) continue;
      const age = Math.round((today - dayStart(t.ts)) / DAY_MS);
      const volume = Math.abs(t.amount);
      const idx = BUCKETS - 1 - age;
      if (idx >= 0 && idx < BUCKETS) sums[idx] += volume;
      if (age >= 0 && age < 7) thisWeek += volume;
      else if (age >= 7 && age < 14) lastWeek += volume;
    }
    const activeDays = sums.filter((v) => v > 0).length;
    const max = Math.max(...sums);
    return {
      // Normalise live volumes into the 8%–96% band so quiet days stay visible.
      bars: activeDays >= 2 ? sums.map((v) => 8 + (v / max) * 88) : STATIC_BARS,
      trend:
        thisWeek > 0 && lastWeek > 0
          ? ((thisWeek - lastWeek) / lastWeek) * 100
          : FALLBACK_TREND,
      labels: [0, Math.round((BUCKETS - 1) / 2), BUCKETS - 1].map((i) =>
        dayLabel(today - (BUCKETS - 1 - i) * DAY_MS),
      ),
    };
  }, [transactions]);

  const up = trend >= 0;

  return (
    <div className="onyx-panel flex flex-col rounded-[26px] p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            This week
          </p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">Money moving through your wallet</p>
        </div>
        <span
          className={cn(
            "onyx-trend",
            !up && "border-[#f5b544]/[0.2] bg-[#f5b544]/[0.08] text-[#e7c4a0]",
          )}
          aria-label={`Volume ${up ? "up" : "down"} ${Math.min(Math.abs(trend), 999).toFixed(1)} percent vs last week`}
        >
          {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{" "}
          {Math.min(Math.abs(trend), 999).toFixed(1)}%
        </span>
      </div>

      <div className="mt-6 flex min-h-[112px] flex-1 items-end gap-1.5" aria-hidden="true">
        {bars.map((b, i) => (
          <span key={i} className="onyx-bar" style={{ height: `${b}%`, animationDelay: `${i * 45}ms` }} />
        ))}
      </div>

      <div className="mt-2 grid grid-cols-3 text-[10px] text-faint-foreground" aria-hidden="true">
        <span>{labels[0]}</span>
        <span className="text-center">{labels[1]}</span>
        <span className="text-right">{labels[2]}</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="onyx-flowstat">
          <span className="text-[11px] uppercase tracking-[0.18em] text-[#6e8b7d]">In</span>
          <span className="mt-1 block font-display text-[17px] font-semibold tnum text-success">
            {formatGHS(inflow)}
          </span>
        </div>
        <div className="onyx-flowstat">
          <span className="text-[11px] uppercase tracking-[0.18em] text-[#6e8b7d]">Out</span>
          <span className="mt-1 block font-display text-[17px] font-semibold tnum text-[#e7c4a0]">
            {formatGHS(outflow)}
          </span>
        </div>
      </div>
    </div>
  );
}
