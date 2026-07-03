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
      className="group flex flex-col items-center gap-2.5 rounded-xl transition-transform duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
    >
      <span className="relative grid h-[52px] w-[52px] place-items-center rounded-2xl bg-muted text-primary transition-all duration-200 group-hover:bg-primary group-hover:text-white group-hover:shadow-sm">
        <Icon size={22} strokeWidth={1.75} />
        {service.badge && (
          <span
            aria-hidden
            className={cn(
              "absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-[3px] ring-card",
              service.badge === "new" ? "bg-amber" : "bg-primary",
            )}
          />
        )}
      </span>
      <span className="line-clamp-2 flex min-h-[2.1rem] w-full items-start justify-center break-words text-center text-[11px] font-medium leading-tight text-muted-foreground transition-colors duration-150 group-hover:text-foreground">
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
                  "relative h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[13px] font-medium transition-all duration-150 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  active
                    ? "bg-ink text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted-strong hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div
          key={filter}
          className="mt-6 grid animate-fade-in grid-cols-4 gap-x-2 gap-y-6 sm:grid-cols-5 lg:grid-cols-5 xl:grid-cols-6"
        >
          {services.map((service) => (
            <ServiceTile key={service.id} service={service} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
