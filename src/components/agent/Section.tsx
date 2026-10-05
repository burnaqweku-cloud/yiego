import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useLocation } from "react-router-dom";
import { sectionsForPath } from "@/lib/agent-nav";

/* A collapsible panel for the agent dashboard, in the same spirit as the admin
   panel's grouped sections: a title row you tap to open, the body underneath.
   Open/closed is remembered per page in localStorage so an agent who keeps
   coming back to "Prices" or "FAQ" finds it where they left it. */
type Props = {
  page: string;          // e.g. "store"  (groups the memory keys)
  id: string;            // e.g. "faq"
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;     // small status at the right, e.g. "3 active"
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

const key = (page: string, id: string) => `dy.agent.section.${page}.${id}`;

export default function Section({ page, id, title, subtitle, icon, badge, defaultOpen = false, children, className = "", bodyClassName = "" }: Props) {
  const { pathname } = useLocation();
  const solo = sectionsForPath(pathname);
  const [open, setOpen] = useState<boolean>(() => {
    try { const v = localStorage.getItem(key(page, id)); return v === null ? defaultOpen : v === "1"; } catch { return defaultOpen; }
  });
  useEffect(() => { try { localStorage.setItem(key(page, id), open ? "1" : "0"); } catch { /* private mode */ } }, [open, page, id]);
  // On a menu route that names its sections, show only those, fully open, as plain panels.
  if (solo) {
    if (!solo.includes(id)) return null;
    return (
      <section className={`onyx-panel rounded-[22px] p-5 ${className}`}>
        <div className="flex items-start gap-3">{icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary-glow">{icon}</span>}<div className="min-w-0 flex-1"><h2 className="text-[15px] font-semibold text-foreground">{title}</h2>{subtitle && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{subtitle}</p>}</div>{badge && <span className="shrink-0 rounded-full border border-white/[0.1] px-2 py-0.5 text-[11.5px] text-muted-foreground">{badge}</span>}</div>
        <div className={`mt-4 ${bodyClassName}`}>{children}</div>
      </section>
    );
  }
  return (
    <section className={`onyx-panel overflow-hidden rounded-[22px] ${className}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        {icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary-glow">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-foreground">{title}</span>
          {subtitle && !open && <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">{subtitle}</span>}
        </span>
        {badge && <span className="shrink-0 rounded-full border border-white/[0.1] px-2 py-0.5 text-[11.5px] text-muted-foreground">{badge}</span>}
        <ChevronDown size={18} className={`shrink-0 text-faint-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className={`border-t border-white/[0.06] px-5 pb-5 pt-4 ${bodyClassName}`}>
          {subtitle && <p className="mb-3 text-[12.5px] text-muted-foreground">{subtitle}</p>}
          {children}
        </div>
      )}
    </section>
  );
}

/* Page header used above the sections, matching the existing agent pages. */
export function PageHeader({ kicker, title, blurb }: { kicker: string; title: string; blurb?: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">{kicker}</p>
      <h1 className="font-display text-[24px] font-semibold text-foreground">{title}</h1>
      {blurb && <p className="mt-1 text-[13px] text-muted-foreground">{blurb}</p>}
    </div>
  );
}
