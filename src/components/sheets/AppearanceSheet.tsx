import { Check, Moon, Sun } from "lucide-react";
import Modal from "@/components/ui/modal";
import { FlowHeader, SelectRow } from "@/components/flows/flow-parts";

/** Appearance — Onyx Dark is the signature look; Light is on the roadmap. */
export default function AppearanceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} label="Appearance">
      <FlowHeader title="Appearance" subtitle="How YieGo looks" onClose={onClose} />
      <div className="space-y-2.5 px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-5">
        <SelectRow
          selected
          onClick={onClose}
          leading={
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary-glow/20 bg-primary/[0.12] text-primary-glow">
              <Moon size={17} />
            </span>
          }
          title="Onyx Dark"
          subtitle="Near-black canvas, emerald light"
          trailing={<Check size={18} className="shrink-0 text-primary-glow" />}
        />

        <button type="button" disabled className="onyx-select opacity-55">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-muted-foreground">
            <Sun size={17} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-[14px] font-semibold tracking-tight text-foreground">
              Light
            </span>
            <span className="block truncate text-[12px] text-faint-foreground">
              A daylight theme is on the roadmap
            </span>
          </span>
          <span className="onyx-badge is-pop shrink-0">Soon</span>
        </button>

        <p className="px-1 pt-2 text-[12.5px] leading-relaxed text-faint-foreground">
          Dark is YieGo's signature look — the Onyx theme is designed around it, from the luminous
          wallet to the glass panels. Light mode arrives once it can look just as premium.
        </p>
      </div>
    </Modal>
  );
}
