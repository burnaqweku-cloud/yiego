import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader } from "@/components/flows/flow-parts";

const LIMITS = [
  { label: "Daily limit", value: "GH₵ 50,000" },
  { label: "Monthly limit", value: "GH₵ 300,000" },
  { label: "Single transaction", value: "GH₵ 20,000" },
];

/** Limits & verification — current Tier 2 standing plus the Tier 3 path. */
export default function LimitsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} label="Limits and verification">
      <FlowHeader title="Limits & verification" subtitle="Your account standing" onClose={onClose} />
      <div className="px-5 pb-2 pt-6">
        <div className="flex flex-col items-center text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full border border-primary-glow/25 bg-primary/[0.1] text-primary-glow">
            <ShieldCheck size={28} />
          </span>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-primary-glow/20 bg-primary/[0.12] px-3 py-1 text-[12px] font-semibold text-primary-glow">
            <ShieldCheck size={13} />
            Verified · Tier 2
          </span>
          <p className="mt-3 max-w-[32ch] text-[13.5px] leading-relaxed text-muted-foreground">
            Your ID is verified, so you can send, receive and withdraw within these limits.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5">
          {LIMITS.map((row, i) => (
            <div
              key={row.label}
              className={`flex items-center justify-between gap-4 px-3.5 py-3 ${
                i > 0 ? "border-t border-white/[0.05]" : ""
              }`}
            >
              <span className="text-[12.5px] text-faint-foreground">{row.label}</span>
              <span className="tnum text-right text-[13.5px] font-semibold text-foreground">
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-4 px-1 text-[12.5px] leading-relaxed text-faint-foreground">
          Tier 3 removes the daily cap and raises single transactions to GH₵ 100,000 — it takes a
          Ghana Card check and proof of address.
        </p>
      </div>
      <FlowFooter>
        <button
          type="button"
          className="onyx-btn-primary w-full"
          onClick={() => toast("Tier 3 upgrade is coming soon")}
        >
          Upgrade to Tier 3
        </button>
      </FlowFooter>
    </Modal>
  );
}
