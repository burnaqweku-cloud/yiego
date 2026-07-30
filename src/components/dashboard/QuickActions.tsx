import { Smartphone, Tv, Wifi, Zap, type LucideIcon } from "lucide-react";
import { useFlows } from "@/store/flows";

const ACTIONS: { label: string; serviceId: string; icon: LucideIcon; tint: string; hint: string }[] = [
  { label: "Buy Data", serviceId: "data", icon: Wifi, tint: "#22C387", hint: "MTN · Telecel · AT" },
  { label: "Airtime", serviceId: "airtime", icon: Smartphone, tint: "#4FD6E8", hint: "All networks" },
  { label: "Electricity", serviceId: "electricity", icon: Zap, tint: "#F5B544", hint: "ECG prepaid" },
  { label: "TV Subs", serviceId: "tv", icon: Tv, tint: "#45C7C2", hint: "DStv · GOtv" },
];

export default function QuickActions() {
  const { openService } = useFlows();
  return (
    <div className="grid grid-cols-4 gap-3 sm:gap-4">
      {ACTIONS.map(({ label, serviceId, icon: Icon, tint, hint }) => (
        <button
          key={label}
          type="button"
          className="onyx-quick group"
          onClick={() => openService(serviceId)}
        >
          <span className="onyx-quick-icon" style={{ ["--tint" as string]: tint }}>
            <Icon size={20} strokeWidth={2.1} />
          </span>
          <span className="mt-2.5 text-[12.5px] font-semibold tracking-tight text-ink-body sm:text-[13.5px]">
            {label}
          </span>
          <span className="mt-0.5 hidden text-[11px] text-faint-foreground sm:block">{hint}</span>
        </button>
      ))}
    </div>
  );
}
