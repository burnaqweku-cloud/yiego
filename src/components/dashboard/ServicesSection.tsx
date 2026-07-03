import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { comingSoonToast } from "@/lib/toasts";
import {
  CATEGORIES,
  SERVICES,
  servicesByCategory,
  type CategoryId,
  type Service,
} from "@/data/services";
import { cn } from "@/lib/utils";

type FilterId = CategoryId | "all";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  ...CATEGORIES.map((c) => ({ id: c.id as FilterId, label: c.short })),
];

function ServiceTile({ service }: { service: Service }) {
  const Icon = service.icon;

  return (
    <button
      type="button"
      title={service.description}
      onClick={() => comingSoonToast(service.name)}
      className="group flex flex-col items-center gap-2 rounded-xl transition-transform duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
    >
      <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary-strong transition-colors duration-200 group-hover:bg-primary group-hover:text-white">
        <Icon size={22} />
        {service.badge && (
          <span
            aria-hidden
            className={cn(
              "absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-card",
              service.badge === "new" ? "bg-amber" : "bg-primary",
            )}
          />
        )}
      </span>
      <span className="line-clamp-2 w-full break-words text-center text-[11px] font-medium leading-tight text-muted-foreground transition-colors duration-150 group-hover:text-foreground">
        {service.name}
      </span>
    </button>
  );
}

export default function ServicesSection() {
  const [filter, setFilter] = useState<FilterId>("all");
  const services = filter === "all" ? SERVICES : servicesByCategory(filter);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Services</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {SERVICES.length} services, one wallet
          </p>
        </div>
        <Link
          to="/services"
          className="-mx-2 -my-3 inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 py-3 text-[13px] font-semibold text-primary-strong transition-all duration-150 hover:text-primary active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          See all
        </Link>
      </CardHeader>

      <CardContent className="pt-4">
        <div
          role="group"
          className="no-scrollbar -mx-5 -my-1 flex gap-2 overflow-x-auto px-5 py-1"
          aria-label="Filter services by category"
        >
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "relative h-9 shrink-0 whitespace-nowrap rounded-full border px-4 text-[13px] font-medium transition-all duration-150 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  active
                    ? "border-ink bg-ink text-white"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div
          key={filter}
          className="mt-5 grid animate-fade-in grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-5 lg:grid-cols-5 xl:grid-cols-6"
        >
          {services.map((service) => (
            <ServiceTile key={service.id} service={service} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
