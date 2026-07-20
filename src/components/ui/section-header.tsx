import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Sub-section heading used within pages, with an optional badge hugging the
 *  title (e.g. a count) and an optional right-aligned action. */
export default function SectionHeader({
  title,
  badge,
  action,
  className,
}: {
  title: string;
  badge?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        <h2 className="truncate font-display text-[17px] font-semibold tracking-tight text-white">
          {title}
        </h2>
        {badge}
      </div>
      {action}
    </div>
  );
}
