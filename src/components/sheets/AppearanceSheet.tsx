import { Check, MonitorSmartphone, Moon, Sun, type LucideIcon } from "lucide-react";
import Modal from "@/components/ui/modal";
import { FlowHeader, SelectRow } from "@/components/flows/flow-parts";
import { useTheme, type ThemeMode } from "@/store/theme";

/** Appearance — pick Onyx Dark, Daylight, or follow the device. */

const OPTIONS: { mode: ThemeMode; icon: LucideIcon; title: string; subtitle: string }[] = [
  { mode: "light", icon: Sun, title: "Daylight", subtitle: "Porcelain canvas, deep emerald" },
  { mode: "dark", icon: Moon, title: "Onyx Dark", subtitle: "Near-black canvas, emerald light" },
  { mode: "system", icon: MonitorSmartphone, title: "Match device", subtitle: "Follows your system setting" },
];

export default function AppearanceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mode, setMode } = useTheme();

  return (
    <Modal open={open} onClose={onClose} label="Appearance">
      <FlowHeader title="Appearance" subtitle="How DataYego looks" onClose={onClose} />
      <div className="space-y-2.5 px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-5">
        {OPTIONS.map((o) => {
          const selected = mode === o.mode;
          return (
            <SelectRow
              key={o.mode}
              selected={selected}
              onClick={() => setMode(o.mode)}
              leading={
                <span
                  className={
                    selected
                      ? "grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary-glow/20 bg-primary/[0.12] text-primary-glow"
                      : "grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-muted-foreground"
                  }
                >
                  <o.icon size={17} />
                </span>
              }
              title={o.title}
              subtitle={o.subtitle}
              trailing={selected ? <Check size={18} className="shrink-0 text-primary-glow" /> : undefined}
            />
          );
        })}

        <p className="px-1 pt-2 text-[12.5px] leading-relaxed text-faint-foreground">
          Daylight is DataYego's everyday look; Onyx Dark is the signature night mode. Your wallet
          stays the dark jewel in both.
        </p>
      </div>
    </Modal>
  );
}
