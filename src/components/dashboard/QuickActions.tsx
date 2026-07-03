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
          className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-card py-3.5 shadow-card transition-all duration-150 hover:shadow-lift active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary-strong transition-colors duration-150 group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon size={20} />
          </span>
          <span className="text-xs font-medium text-muted-foreground transition-colors duration-150 group-hover:text-foreground">
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}
