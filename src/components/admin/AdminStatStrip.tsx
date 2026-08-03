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
      <div className={cn("grid divide-white/[0.07]", items.length <= 2 ? "grid-cols-2 divide-x" : "grid-cols-2 sm:grid-cols-none sm:auto-cols-fr sm:grid-flow-col")}>
        {items.map((item, index) => {
          const content = (
            <>
              <p className="min-h-7 break-words text-[8px] font-semibold uppercase leading-[1.35] tracking-[0.08em] text-faint-foreground sm:min-h-0 sm:text-[10px] sm:leading-normal sm:tracking-[0.11em]">{item.label}</p>
              <p className={cn("mt-1 break-words font-display text-base font-semibold leading-tight sm:text-xl", toneClass[item.tone ?? "default"])}>{loading ? "—" : item.value}</p>
            </>
          );
          const mobileBorder = items.length > 2 ? cn(index % 2 === 1 && "border-l border-white/[0.07]", index >= 2 && "border-t border-white/[0.07]", "sm:border-t-0", index % 2 === 1 && "sm:border-l") : "";
          return item.onClick ? (
            <button key={item.label} type="button" onClick={item.onClick} className={cn("min-w-0 px-2 py-3 text-center transition-colors sm:px-4", mobileBorder, item.active ? "bg-primary/[0.09]" : "hover:bg-white/[0.035]")}>{content}</button>
          ) : (
            <div key={item.label} className={cn("min-w-0 px-2 py-3 text-center sm:px-4", mobileBorder)}>{content}</div>
          );
        })}
      </div>
    </section>
  );
}
