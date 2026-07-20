import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Flexible list row — an optional leading icon slot, title + subtitle, an
 * optional right slot, and an optional chevron. Becomes a real button when
 * onClick is passed (with hover feedback). Used by transaction lists,
 * payment-link lists, and settings menus so they all read identically.
 */
export default function ListRow({
  icon,
  title,
  subtitle,
  right,
  onClick,
  chevron = false,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  className?: string;
}) {
  const interactive = Boolean(onClick);
  const content = (
    <>
      {icon}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold tracking-tight text-foreground">
          {title}
        </p>
        {subtitle && (
          <p className="mt-0.5 truncate text-[11.5px] text-faint-foreground">{subtitle}</p>
        )}
      </div>
      {right && <div className="shrink-0 text-right">{right}</div>}
      {chevron && <ChevronRight size={17} className="shrink-0 text-faint-foreground" />}
    </>
  );

  const base = "flex w-full items-center gap-3.5 rounded-xl px-2 py-3 text-left";

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          base,
          "transition-colors duration-150 hover:bg-white/[0.03] active:bg-white/[0.05]",
          className,
        )}
      >
        {content}
      </button>
    );
  }
  return <div className={cn(base, className)}>{content}</div>;
}
