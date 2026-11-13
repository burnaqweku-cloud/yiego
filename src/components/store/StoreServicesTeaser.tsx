import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, GraduationCap, UserPlus } from "lucide-react";
import { useStore } from "@/components/store/StoreShell";
import { formatGHS } from "@/lib/format";
import { storeBase } from "@/lib/storeHost";
import { loadServices, type ServiceProduct } from "@/lib/services";

/* On a store's home page: the other things this store sells (result checkers, AFA registration), each with
   the store's price. Every active store sells them unless the agent switched them off; it shows nothing then. */
export default function StoreServicesTeaser() {
  const store = useStore();
  const [items, setItems] = useState<ServiceProduct[]>([]);
  useEffect(() => { let alive = true; void loadServices(store.slug).then((r) => { if (alive) setItems(r); }, () => undefined); return () => { alive = false; }; }, [store.slug]);
  if (items.length === 0) return null;
  const base = `${storeBase(store.slug)}/services`;
  const studio = store.template === "studio";
  return (
    <section className={studio ? "px-5 py-12 sm:px-8" : "onyx-panel rounded-[22px] p-5"}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={studio ? "st-h2" : "font-display text-[18px] font-semibold text-foreground"}>More services</h2>
        <Link to={base} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-primary-glow">See all<ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
      <ul className={studio ? "mt-5 grid gap-3 sm:grid-cols-2" : "mt-3 divide-y divide-white/[0.06]"}>
        {items.map((p) => { const Icon = p.kind === "afa" ? UserPlus : GraduationCap; return (
          <li key={p.code}>
            <Link to={`${base}/${p.kind === "afa" ? "afa" : "checkers"}`} className={studio ? "flex items-center justify-between gap-3 rounded-2xl border border-[var(--st-line)] p-4" : "flex items-center justify-between gap-3 py-3"}>
              <span className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/[0.12] text-primary-glow"><Icon size={18} aria-hidden="true" /></span>
                <span className="min-w-0"><span className="block truncate text-[14.5px] font-semibold text-foreground">{p.name}</span><span className="block truncate text-[12px] text-muted-foreground">{p.blurb}</span></span></span>
              <span className="shrink-0 text-[14.5px] font-semibold tabular-nums text-foreground">{formatGHS(p.price)}</span>
            </Link>
          </li>); })}
      </ul>
    </section>
  );
}
