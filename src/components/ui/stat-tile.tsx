import { cn } from "@/lib/utils";

/** Compact metric tile: uppercase label, big tabular value, optional delta.
 *  `size="sm"` shrinks the value so 3-up rows fit on a 390px phone. */
export default function StatTile({
  label,
  value,
  delta,
  tone = "up",
  size = "md",
  className,
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "up" | "down" | "muted";
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("onyx-panel rounded-[20px] p-3.5 sm:p-5", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 whitespace-nowrap font-display font-semibold tracking-[-0.01em] tnum text-white",
          size === "sm" ? "text-[16px] sm:text-[20px]" : "text-[20px] sm:text-[22px]",
        )}
      >
        {value}
      </p>
      {delta && (
        <p
          className={cn(
            "mt-1 text-[12px] font-semibold",
            tone === "down"
              ? "text-[#e7c4a0]"
              : tone === "muted"
                ? "text-muted-foreground"
                : "text-success",
          )}
        >
          {delta}
        </p>
      )}
    </div>
  );
}
