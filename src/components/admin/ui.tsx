import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatGHS } from "@/lib/format";

/* ═══════════════════════════════════════════════════════════════════════
   The admin recipe.
   One radius (16px), hairline borders, no shadows, 11px labels, 19px
   values, 12px notes. Colour appears only when it carries meaning:
   green = money in / good, amber = waiting, red = attention.
   `white/…` is the theme ink channel, so all of this flips to light mode.
   ═══════════════════════════════════════════════════════════════════════ */

export type Tone = "default" | "good" | "warn" | "bad" | "muted";
const toneText: Record<Tone, string> = { default: "text-foreground", good: "text-success", warn: "text-amber", bad: "text-danger", muted: "text-muted-foreground" };

export function Money({ value, tone = "default", className }: { value: number | string | null | undefined; tone?: Tone; className?: string }) {
  const n = Number(value ?? 0);
  return <span className={cn("tabular-nums", toneText[tone], className)}>{formatGHS(n)}</span>;
}

/** A two-column-on-mobile stat card: label, value, one line of context. */
export function Stat({ label, value, note, tone = "default", icon: Icon, to, onClick, loading }: {
  label: string; value: ReactNode; note?: ReactNode; tone?: Tone; icon?: LucideIcon; to?: string; onClick?: () => void; loading?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        {Icon ? <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", tone === "default" || tone === "muted" ? "bg-white/[0.05] text-muted-foreground" : tone === "good" ? "bg-success/[0.12] text-success" : tone === "warn" ? "bg-amber/[0.12] text-amber" : "bg-danger/[0.12] text-danger")}><Icon size={15} /></span> : <span />}
        {(to || onClick) && <ArrowRight size={15} className="text-faint-foreground" />}
      </div>
      <p className={cn("text-[11px] leading-4 text-faint-foreground", Icon && "mt-3")}>{label}</p>
      <p className={cn("mt-0.5 text-[19px] font-semibold leading-tight tabular-nums", toneText[tone])}>{loading ? "—" : value}</p>
      {note && <p className="mt-1 text-[12px] leading-4 text-muted-foreground">{note}</p>}
    </>
  );
  const cls = "block min-w-0 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5 text-left";
  if (to) return <Link to={to} className={cn(cls, "hover:bg-white/[0.04]")}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cn(cls, "w-full hover:bg-white/[0.04]")}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

export function StatGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return <div className={cn("grid gap-2.5", cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 lg:grid-cols-4")}>{children}</div>;
}

/** A titled section. Title 15px semibold with an optional icon; action on the right. */
export function Panel({ title, icon: Icon, action, children, className, note }: { title: string; icon?: LucideIcon; action?: ReactNode; children: ReactNode; className?: string; note?: string }) {
  return (
    <section className={cn("rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4", className)}>
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon size={17} className="shrink-0 text-primary-glow" />}
          <h2 className="truncate text-[15px] font-semibold text-foreground">{title}</h2>
          {note && <span className="hidden text-[11px] text-faint-foreground sm:inline">{note}</span>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Row list inside a panel: hairline dividers, no card-in-card. */
export function Rows({ children, empty }: { children: ReactNode[]; empty: string }) {
  if (!children.length) return <p className="py-6 text-center text-[13px] text-faint-foreground">{empty}</p>;
  return <ul className="divide-y divide-white/[0.06]">{children}</ul>;
}

export function Row({ primary, secondary, right, rightNote, onClick, tone = "default" }: { primary: ReactNode; secondary?: ReactNode; right?: ReactNode; rightNote?: ReactNode; onClick?: () => void; tone?: Tone }) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] text-foreground">{primary}</p>
        {secondary && <p className="truncate text-[12px] text-faint-foreground">{secondary}</p>}
      </div>
      {(right || rightNote) && (
        <div className="shrink-0 text-right">
          {right && <p className={cn("text-[13.5px] font-semibold tabular-nums", toneText[tone])}>{right}</p>}
          {rightNote && <p className="text-[11px] text-faint-foreground">{rightNote}</p>}
        </div>
      )}
    </>
  );
  return <li>{onClick ? <button type="button" onClick={onClick} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-white/[0.02]">{inner}</button> : <div className="flex items-center gap-3 py-2.5">{inner}</div>}</li>;
}

/** Segmented control (date presets, filters). */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex w-full gap-0.5 overflow-x-auto rounded-full border border-white/[0.07] bg-white/[0.02] p-0.5" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} type="button" onClick={() => onChange(o.value)} className={cn("flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium", value === o.value ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground")}>{o.label}</button>
      ))}
    </div>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: Tone }) {
  const cls = tone === "good" ? "bg-success/[0.12] text-success" : tone === "warn" ? "bg-amber/[0.12] text-amber" : tone === "bad" ? "bg-danger/[0.12] text-danger" : "bg-white/[0.05] text-muted-foreground";
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", cls)}>{children}</span>;
}

/** Small inline action link */
export function InlineAction({ children, onClick, to }: { children: ReactNode; onClick?: () => void; to?: string }) {
  const cls = "inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary-glow hover:underline";
  if (to) return <Link to={to} className={cls}>{children}<ArrowRight size={13} /></Link>;
  return <button type="button" onClick={onClick} className={cls}>{children}</button>;
}

/* Form bits used by the finance modals */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block"><span className="mb-1 block text-[12px] text-muted-foreground">{label}</span>{children}{hint && <span className="mt-1 block text-[11px] text-faint-foreground">{hint}</span>}</label>;
}
export const inputCls = "h-10 w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-3 text-[14px] text-foreground placeholder:text-faint-foreground focus:border-primary/50 focus:outline-none";
