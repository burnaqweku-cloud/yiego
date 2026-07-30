import SectionHeader from "@/components/ui/section-header";
import { useWallet } from "@/store/wallet";
import { formatGHS } from "@/lib/format";
import type { TxType } from "@/data/mock";

/**
 * "Where your money goes" — debits grouped into spending buckets, each drawn
 * as a pure-CSS gradient bar sized by its share of total spending.
 * Withdrawals are money moved out, not money spent, so they're excluded.
 */

interface Bucket {
  id: string;
  label: string;
  /** TxTypes that land in this bucket; the last bucket catches the rest. */
  types: TxType[];
}

/* Bar fills live in index.css as .onyx-seg.seg-<id> — theme-tuned there. */
const BUCKETS: Bucket[] = [
  { id: "topups", label: "Top-ups & bills", types: ["data", "airtime", "electricity", "tv", "bill"] },
  { id: "digital", label: "Digital", types: ["digital", "giftcard"] },
  { id: "education", label: "Education", types: ["education"] },
  { id: "crypto", label: "Crypto", types: ["crypto"] },
  { id: "other", label: "Other", types: [] },
];

export default function SpendingBreakdown() {
  const { transactions } = useWallet();

  // Spending = money out, excluding withdrawals (moved, not spent).
  const totals = new Map<string, number>(BUCKETS.map((b) => [b.id, 0]));
  const bucketOf = (type: TxType): string =>
    BUCKETS.find((b) => b.types.includes(type))?.id ?? "other";

  for (const t of transactions) {
    if (t.amount >= 0 || t.type === "withdrawal") continue;
    const id = bucketOf(t.type);
    totals.set(id, (totals.get(id) ?? 0) + Math.abs(t.amount));
  }

  const rows = BUCKETS.map((b) => ({ ...b, total: totals.get(b.id) ?? 0 })).filter(
    (b) => b.total > 0,
  );
  const total = rows.reduce((a, b) => a + b.total, 0);

  return (
    <div className="space-y-3.5">
      <SectionHeader title="Where your money goes" />

      <div className="onyx-panel rounded-[22px] p-5 sm:p-6">
        {total === 0 ? (
          <p className="py-3 text-center text-[13px] text-faint-foreground">
            No spending yet — buy data, airtime or pay a bill and you&rsquo;ll see where it goes.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-[15px]">
              {rows.map((b) => {
                const pct = (b.total / total) * 100;
                return (
                  <li
                    key={b.id}
                    className="grid grid-cols-[104px_1fr_auto] items-center gap-3"
                  >
                    <span className="truncate text-[12.5px] font-semibold text-muted-foreground">
                      {b.label}
                      <span className="sr-only">, {Math.round(pct)}% of spending</span>
                    </span>
                    <span
                      className="onyx-seg-track h-[7px] overflow-hidden rounded-full"
                      aria-hidden="true"
                    >
                      <span
                        className={`onyx-seg seg-${b.id} block h-full rounded-full`}
                        // Keep slivers visible so every bucket reads.
                        style={{ width: `${Math.max(pct, 3)}%` }}
                      />
                    </span>
                    <span className="text-right font-display text-[13px] font-semibold tnum text-foreground">
                      {formatGHS(b.total)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-5 flex items-center justify-between gap-4 border-t border-white/[0.06] pt-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint-foreground">
                Total spent
              </span>
              <span className="font-display text-[15px] font-semibold tnum text-white">
                {formatGHS(total)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
