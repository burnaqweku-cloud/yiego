import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { SERVICES, CATEGORIES, type CategoryId } from "@/data/services";
import { comingSoonToast } from "@/lib/toasts";
import { cn } from "@/lib/utils";

type FilterId = CategoryId | "all";

const TABS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  ...CATEGORIES.map((c) => ({ id: c.id as FilterId, label: c.short })),
];

export default function ServicesSection() {
  const [filter, setFilter] = useState<FilterId>("all");
  const services = useMemo(
    () => (filter === "all" ? SERVICES : SERVICES.filter((s) => s.category === filter)),
    [filter],
  );

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-[21px] font-semibold leading-none tracking-[-0.02em] text-white sm:text-[24px]">
            Everything, one wallet
          </h2>
          <p className="mt-2 text-[13.5px] text-muted-foreground">
            <span className="text-primary-glow">{SERVICES.length}+</span> services — pay bills, cash
            out crypto, get paid.
          </p>
        </div>
        <Link to="/services" className="onyx-ghostlink hidden sm:inline-flex">
          View catalog <ChevronRight size={15} />
        </Link>
      </div>

      <div role="group" aria-label="Filter services by category" className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const on = filter === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(t.id)}
              className={cn("onyx-pill shrink-0", on && "onyx-pill-on")}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        key={filter}
        className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        {services.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className="onyx-tile group"
            style={{ animationDelay: `${Math.min(i * 22, 260)}ms` }}
            onClick={() => comingSoonToast(s.name)}
          >
            <div className="flex items-start justify-between">
              <span className="onyx-tile-icon">
                <s.icon size={19} strokeWidth={2} />
              </span>
              {s.badge && (
                <span className={cn("onyx-badge", s.badge === "new" ? "is-new" : "is-pop")}>
                  {s.badge === "new" ? "New" : "Popular"}
                </span>
              )}
            </div>
            <div className="mt-4">
              <p className="text-[14px] font-semibold tracking-tight text-foreground">{s.name}</p>
              <p className="mt-1 line-clamp-1 text-[12px] text-faint-foreground">{s.description}</p>
            </div>
            <span className="onyx-tile-go" aria-hidden="true">
              <ArrowUpRight size={15} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
