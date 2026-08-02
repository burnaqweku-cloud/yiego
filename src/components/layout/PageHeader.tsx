import type { ReactNode } from "react";

/**
 * Consistent header at the top of every page: small eyebrow, display title,
 * optional subtitle, and an optional right-aligned action.
 */
export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1.5 font-display text-[24px] font-semibold tracking-tight text-white sm:text-[28px]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-[54ch] text-[13.5px] leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
