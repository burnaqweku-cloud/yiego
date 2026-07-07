import { useMemo, useState } from "react";
import { ArrowUpRight, Search, SearchX, X } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import SectionHeader from "@/components/ui/section-header";
import { SERVICES, CATEGORIES, type CategoryId } from "@/data/services";
import { useFlows } from "@/store/flows";
import { cn } from "@/lib/utils";

type FilterId = CategoryId | "all";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  ...CATEGORIES.map((c) => ({ id: c.id as FilterId, label: c.short })),
];

export default function Services() {
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  // Actual filter: active category pill AND the search query (name + description).
  const matches = useMemo(
    () =>
      SERVICES.filter((s) => {
        if (filter !== "all" && s.category !== filter) return false;
        if (!q) return true;
        return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
      }),
    [filter, q],
  );

  // Group the survivors back into their categories, keeping CATEGORIES order,
  // dropping any category with no matches.
  const groups = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        category,
        items: matches.filter((s) => s.category === category.id),
      })).filter((g) => g.items.length > 0),
    [matches],
  );

  const total = matches.length;
  const activeCategory = filter === "all" ? null : CATEGORIES.find((c) => c.id === filter);
  const { openService } = useFlows();

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="Catalog"
        title="All services"
        subtitle="Twenty-plus ways to pay, top up and get paid — all from one YieGo wallet."
      />

      {/* Controls — real search + category pills */}
      <section className="onyx-rise space-y-4" style={{ animationDelay: "60ms" }}>
        <div className="onyx-search flex items-center gap-2.5 sm:max-w-[460px]">
          <Search size={17} className="shrink-0 text-faint-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services, pay a bill…"
            aria-label="Search services"
            className="w-full min-w-0 bg-transparent text-[14px] text-foreground placeholder:text-[#5c6b63] focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-faint-foreground transition-colors hover:text-foreground"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div
          role="group"
          aria-label="Filter services by category"
          className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        >
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f.id)}
                className={cn("onyx-pill shrink-0", on && "onyx-pill-on")}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {total > 0 && (
          <p className="text-[12.5px] text-faint-foreground">
            {q ? (
              <>
                <span className="tnum font-semibold text-foreground">{total}</span>{" "}
                {total === 1 ? "result" : "results"} for &ldquo;
                <span className="text-primary-glow">{query.trim()}</span>&rdquo;
              </>
            ) : activeCategory ? (
              <>
                <span className="tnum font-semibold text-foreground">{total}</span>{" "}
                {total === 1 ? "service" : "services"} in {activeCategory.label}
              </>
            ) : (
              <>
                Every service —{" "}
                <span className="tnum font-semibold text-foreground">{total}</span> across{" "}
                {CATEGORIES.length} categories
              </>
            )}
          </p>
        )}
      </section>

      {/* Results — one section per category with matches */}
      {groups.length > 0 ? (
        <div className="onyx-rise space-y-8 lg:space-y-10" style={{ animationDelay: "120ms" }}>
          {groups.map((g) => (
            <section key={g.category.id}>
              <SectionHeader
                title={g.category.label}
                action={
                  <span className="tnum inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.02] px-2 text-[11px] font-semibold text-muted-foreground">
                    {g.items.length}
                  </span>
                }
              />
              <div
                key={filter}
                className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              >
                {g.items.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    className="onyx-tile group"
                    style={{ animationDelay: `${Math.min(i * 22, 260)}ms` }}
                    onClick={() => openService(s.id)}
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
                      <p className="text-[14px] font-semibold tracking-tight text-foreground">
                        {s.name}
                      </p>
                      <p className="mt-1 line-clamp-1 text-[12px] text-faint-foreground">
                        {s.description}
                      </p>
                    </div>
                    <span className="onyx-tile-go" aria-hidden="true">
                      <ArrowUpRight size={15} />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="onyx-rise" style={{ animationDelay: "120ms" }}>
          <div className="onyx-panel flex flex-col items-center rounded-[22px] px-6 py-14 text-center">
            <span
              className="grid h-14 w-14 place-items-center rounded-[16px] border border-white/[0.06] bg-white/[0.02] text-faint-foreground"
              aria-hidden="true"
            >
              <SearchX size={24} />
            </span>
            <p className="mt-4 font-display text-[17px] font-semibold tracking-tight text-white">
              No services match
            </p>
            <p className="mt-1.5 max-w-[36ch] text-[13px] leading-relaxed text-muted-foreground">
              {q ? (
                <>
                  We couldn&rsquo;t find anything for &ldquo;{query.trim()}&rdquo;. Try a different
                  search or category.
                </>
              ) : (
                <>Nothing here yet — try another category.</>
              )}
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
              className="onyx-btn-ghost mt-5"
            >
              Clear filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
