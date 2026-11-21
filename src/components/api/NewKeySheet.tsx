import { useState } from "react";
import { AlertTriangle, Check, Copy, KeyRound } from "lucide-react";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader } from "@/components/flows/flow-parts";

/** A new key, shown once: we keep only a scrambled copy, so it can never be shown again. */
export default function NewKeySheet({ open, keyValue, mode, onClose }: { open: boolean; keyValue: string; mode: "live" | "test"; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { void navigator.clipboard?.writeText(keyValue); setCopied(true); };
  return (
    <Modal open={open} onClose={onClose} label="Your new key">
      <FlowHeader title={mode === "live" ? "Your new live key" : "Your new test key"} onClose={onClose} />
      <div className="px-5 pb-2 pt-6">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary-glow"><KeyRound size={24} /></span>
        <p className="mt-3 text-center text-[13.5px] text-muted-foreground">Copy it now and keep it somewhere safe.</p>
        <div className="mt-4 break-all rounded-2xl border border-white/[0.1] bg-background/70 px-4 py-3.5 font-mono text-[13px] leading-relaxed text-foreground">{keyValue}</div>
        <div className="mt-3 flex items-start gap-2 rounded-2xl bg-amber/12 px-3.5 py-3 text-[12.5px] text-amber">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>We only show it once. If you lose it, make a new one: the old key stops working. {mode === "live" ? "Never put it in a web page or share it: anyone with it can spend your balance." : ""}</span>
        </div>
      </div>
      <FlowFooter>
        <div className="flex flex-col gap-2.5">
          <button type="button" onClick={copy} className="onyx-btn-primary w-full !py-3 !text-[14px]">{copied ? <><Check size={15} className="mr-1.5 inline" />Copied</> : <><Copy size={15} className="mr-1.5 inline" />Copy key</>}</button>
          <button type="button" onClick={onClose} className="w-full rounded-full py-2.5 text-[13.5px] font-semibold text-muted-foreground">I've saved it</button>
        </div>
      </FlowFooter>
    </Modal>
  );
}
