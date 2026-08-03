import { cn } from "@/lib/utils";

export interface AdminStatItem {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning" | "danger";
  active?: boolean;
  onClick?: () => void;
}

const toneClass = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-amber",
  danger: "text-danger",
};

export default function AdminStatStrip({ items, loading = false }: { items: AdminStatItem[]; loading?: boolean }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.028] shadow-sm">
      <div className="grid auto-cols-fr grid-flow-col divide-x divide-white/[0.07]">
        {items.map((item) => {
          const content = (
            <>
              <p className="truncate text-[9px] font-semibold uppercase tracking-[0.11em] text-faint-foreground sm:text-[10px]">{item.label}</p>
              <p className={cn("mt-1 truncate font-display text-lg font-semibold sm:text-xl", toneClass[item.tone ?? "default"])}>{loading ? "—" : item.value}</p>
            </>
          );
          return item.onClick ? (
            <button key={item.label} type="button" onClick={item.onClick} className={cn("min-w-0 px-2 py-3 text-center transition-colors sm:px-4", item.active ? "bg-primary/[0.09]" : "hover:bg-white/[0.035]")}>{content}</button>
          ) : (
            <div key={item.label} className="min-w-0 px-2 py-3 text-center sm:px-4">{content}</div>
          );
        })}
      </div>
    </section>
  );
}
