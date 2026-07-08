import { Check } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { FlowHeader, SelectRow } from "@/components/flows/flow-parts";
import { useProfile } from "@/store/profile";

const LANGUAGES: { name: string; native: string; code: string }[] = [
  { name: "English", native: "Default", code: "EN" },
  { name: "Twi", native: "Akan kasa", code: "TW" },
  { name: "Français", native: "French", code: "FR" },
  { name: "Hausa", native: "Harshen Hausa", code: "HA" },
];

/** Language picker — writes to the profile store and closes. */
export default function LanguageSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, update } = useProfile();

  const pick = (name: string) => {
    update({ language: name });
    toast(`Language set to ${name}`);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} label="Language">
      <FlowHeader title="Language" subtitle="Choose your app language" onClose={onClose} />
      <div className="space-y-2.5 px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-5">
        {LANGUAGES.map((lang) => {
          const selected = profile.language === lang.name;
          return (
            <SelectRow
              key={lang.name}
              selected={selected}
              onClick={() => pick(lang.name)}
              leading={
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border font-mono text-[12px] font-semibold ${
                    selected
                      ? "border-primary-glow/20 bg-primary/[0.12] text-primary-glow"
                      : "border-white/[0.08] bg-white/[0.03] text-muted-foreground"
                  }`}
                >
                  {lang.code}
                </span>
              }
              title={lang.name}
              subtitle={lang.native}
              trailing={
                selected ? <Check size={18} className="shrink-0 text-primary-glow" /> : undefined
              }
            />
          );
        })}
        <p className="px-1 pt-2 text-[12.5px] leading-relaxed text-faint-foreground">
          Twi, Français and Hausa translations are rolling out screen by screen — some pages may
          still show English.
        </p>
      </div>
    </Modal>
  );
}
