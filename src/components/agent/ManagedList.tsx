import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";

/* A long list that stays tidy: search box, filter chips, and "show more" paging (10 at a time).
   Used for announcements, promos, pop-ups, form submissions, customers… anything that grows. */
export default function ManagedList<T>({ items, filters, filterOf, searchText, render, empty, pageSize = 10, countLabel }: {
  items: T[];
  filters?: Array<{ id: string; label: string }>;
  filterOf?: (item: T) => string;
  searchText?: (item: T) => string;
  render: (item: T) => ReactNode;
  empty: ReactNode;
  pageSize?: number;
  countLabel?: (n: number) => string;
}) {
  const [q, setQ] = useState(""); const [filter, setFilter] = useState(filters?.[0]?.id ?? "all"); const [shown, setShown] = useState(pageSize);
  const list = useMemo(() => items.filter((it) => (filter === "all" || !filterOf || filterOf(it) === filter) && (!q.trim() || !searchText || searchText(it).toLowerCase().includes(q.trim().toLowerCase()))), [items, filter, q, filterOf, searchText]);
  const visible = list.slice(0, shown);
  if (items.length === 0) return <p className="rounded-2xl border border-dashed border-white/[0.1] p-5 text-center text-[13px] text-muted-foreground">{empty}</p>;
  return (
    <div>
      {(items.length > 5 || (filters && filters.length > 1)) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {filters && filters.length > 1 && <div className="flex flex-wrap gap-1.5">{filters.map((f) => <button key={f.id} type="button" onClick={() => { setFilter(f.id); setShown(pageSize); }} className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ${filter === f.id ? "bg-primary/20 text-primary-glow" : "border border-white/[0.08] text-muted-foreground"}`}>{f.label}</button>)}</div>}
          {searchText && items.length > 5 && <label className="relative ml-auto block min-w-[160px] flex-1 sm:max-w-xs"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint-foreground" /><input value={q} onChange={(e) => { setQ(e.target.value); setShown(pageSize); }} placeholder="Search" className="onyx-field w-full !py-2 !pl-9 text-[13px]" /></label>}
        </div>
      )}
      {list.length === 0 ? <p className="py-4 text-center text-[13px] text-muted-foreground">Nothing matches.</p> : <ul className="divide-y divide-white/[0.06]">{visible.map((it, i) => <li key={i}>{render(it)}</li>)}</ul>}
      <div className="mt-3 flex items-center justify-between text-[12px] text-faint-foreground">
        <span>{countLabel ? countLabel(list.length) : `${list.length} total`}</span>
        {list.length > shown && <button type="button" onClick={() => setShown((n) => n + pageSize)} className="font-semibold text-primary-glow">Show {Math.min(pageSize, list.length - shown)} more</button>}
      </div>
    </div>
  );
}
