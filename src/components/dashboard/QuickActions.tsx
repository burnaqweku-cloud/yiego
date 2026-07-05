import { Smartphone, Tv, Wifi, Zap, type LucideIcon } from "lucide-react";
import { comingSoonToast } from "@/lib/toasts";
import { useFlows } from "@/store/flows";

const ACTIONS: { label: string; icon: LucideIcon; tint: string; hint: string }[] = [
  { label: "Buy Data", icon: Wifi, tint: "#22C387", hint: "MTN · Telecel · AT" },
  { label: "Airtime", icon: Smartphone, tint: "#4FD6E8", hint: "All networks" },
  { label: "Electricity", icon: Zap, tint: "#F5B544", hint: "ECG prepaid" },
  { label: "TV Subs", icon: Tv, tint: "#45C7C2", hint: "DStv · GOtv" },
];

export default function QuickActions() {
  const { openBuyData } = useFlows();
  return (
    <div className="grid grid-cols-4 gap-3 sm:gap-4">
      {ACTIONS.map(({ label, icon: Icon, tint, hint }) => (
        <button
          key={label}
          type="button"
          className="onyx-quick group"
          onClick={() => (label === "Buy Data" ? openBuyData() : comingSoonToast(label))}
        >
          <span className="onyx-quick-icon" style={{ ["--tint" as string]: tint }}>
            <Icon size={20} strokeWidth={2.1} />
          </span>
          <span className="mt-2.5 text-[12.5px] font-semibold tracking-tight text-[#d6e2db] sm:text-[13.5px]">
            {label}
          </span>
          <span className="mt-0.5 hidden text-[11px] text-faint-foreground sm:block">{hint}</span>
        </button>
      ))}
    </div>
  );
}
