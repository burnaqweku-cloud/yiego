import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Sub-section heading used within pages, with an optional right-aligned action. */
export default function SectionHeader({
  title,
  action,
  className,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="font-display text-[17px] font-semibold tracking-tight text-white">{title}</h2>
      {action}
    </div>
  );
}
