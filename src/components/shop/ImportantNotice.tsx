import { AlertTriangle } from "lucide-react";
import type { NetworkId } from "@/data/bundles";
import { cn } from "@/lib/utils";

/**
 * The house rules, said once and plainly — the sentences that prevent
 * disputes: variable delivery, the airtime-debt condition, wrong-number
 * finality, and MTN's one-time verification hold.
 *
 * On the shop page everything shows. Inside the buy flow the MTN line only
 * appears when the order actually is MTN, so other networks read a shorter
 * notice rather than someone else's caveat.
 */

const POINTS = [
  "Delivery times may vary.",
  "The receiving phone must not owe airtime.",
  "No refunds for orders sent to a wrong number — double-check before paying.",
];

const MTN_NOTE =
  "MTN: a number ordering MTN data through us for the first time may show \u201CAwaiting Verification\u201D for a quick one-time check before it delivers. Future orders to that same number go through normally.";

export default function ImportantNotice({
  compact = false,
  network = null,
  className,
}: {
  /** Tighter spacing for the buy-flow modal. */
  compact?: boolean;
  /** Inside the flow, the network is known — the MTN note only shows for MTN.
   *  Null (the shop page) shows everything. */
  network?: NetworkId | null;
  className?: string;
}) {
  const showMtn = network === null || network === "mtn";
  return (
    <aside
      aria-label="Important notice"
      className={cn(
        "rounded-2xl border border-amber/20 bg-amber/[0.06]",
        compact ? "px-3.5 py-3" : "px-4 py-4 sm:px-5",
        className,
      )}
    >
      <p
        className={cn(
          "flex items-center gap-2 font-semibold text-amber",
          compact ? "text-[12px]" : "text-[12.5px] uppercase tracking-[0.12em]",
        )}
      >
        <AlertTriangle size={compact ? 13 : 14} aria-hidden="true" />
        Important notice
      </p>
      <ul
        className={cn(
          "list-disc space-y-1 pl-5 text-muted-foreground",
          compact ? "mt-1.5 text-[12px] leading-5" : "mt-2.5 text-[13px] leading-6",
        )}
      >
        {POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
        {showMtn && <li>{MTN_NOTE}</li>}
      </ul>
    </aside>
  );
}
