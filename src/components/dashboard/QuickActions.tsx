import { Smartphone, Tv, Wifi, Zap, type LucideIcon } from "lucide-react";
import { comingSoonToast } from "@/lib/toasts";

interface QuickAction {
  label: string;
  icon: LucideIcon;
}

const ACTIONS: QuickAction[] = [
  { label: "Buy Data", icon: Wifi },
  { label: "Airtime", icon: Smartphone },
  { label: "Electricity", icon: Zap },
  { label: "TV Subs", icon: Tv },
];

export default function QuickActions() {
  return (
    <div className="grid grid-cols-4 gap-3">
      {ACTIONS.map(({ label, icon: Icon }) => (
        <button
          key={label}
          type="button"
          onClick={() => comingSoonToast(label)}
          className="group flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-card py-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-white">
            <Icon size={20} strokeWidth={1.75} />
          </span>
          <span className="text-[13px] font-medium text-muted-foreground transition-colors duration-150 group-hover:text-foreground">
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}
