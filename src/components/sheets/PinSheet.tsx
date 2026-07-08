import { useEffect, useState } from "react";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader } from "@/components/flows/flow-parts";
import { useProfile } from "@/store/profile";

/** Set or change the 4-digit transaction PIN. */
export default function PinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, update } = useProfile();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (!open) return;
    setPin("");
    setConfirm("");
  }, [open]);

  const changing = profile.pinSet;
  const mismatch = confirm.length === 4 && pin.length === 4 && pin !== confirm;
  const valid = pin.length === 4 && pin === confirm;

  const save = () => {
    update({ pinSet: true });
    toast(changing ? "PIN updated" : "PIN set", {
      description: "You'll confirm payments with this 4-digit PIN.",
    });
    onClose();
  };

  const labelCls = "text-[12px] font-semibold uppercase tracking-[0.14em] text-faint-foreground";
  const pinCls =
    "onyx-field mt-2 text-center font-display text-[24px] tracking-[0.6em] tnum placeholder:tracking-[0.3em]";

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  return (
    <Modal open={open} onClose={onClose} label="Security and PIN">
      <FlowHeader
        title={changing ? "Change PIN" : "Set your PIN"}
        subtitle="Confirms every payment"
        onClose={onClose}
      />
      <div className="space-y-5 px-5 pb-2 pt-5">
        <div className="flex items-start gap-3 rounded-2xl border border-primary-glow/15 bg-primary/[0.06] px-4 py-3.5">
          <ShieldCheck size={17} className="mt-0.5 shrink-0 text-primary-glow" />
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Your PIN is asked for before money leaves your wallet. Only you should know it.
          </p>
        </div>

        <div>
          <label htmlFor="pin-new" className={labelCls}>
            New 4-digit PIN
          </label>
          <input
            id="pin-new"
            className={pinCls}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(digits(e.target.value))}
            placeholder="••••"
          />
        </div>

        <div>
          <label htmlFor="pin-confirm" className={labelCls}>
            Confirm PIN
          </label>
          <input
            id="pin-confirm"
            className={pinCls}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={confirm}
            onChange={(e) => setConfirm(digits(e.target.value))}
            placeholder="••••"
          />
          {mismatch && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-danger" role="alert">
              <TriangleAlert size={13} /> PINs don't match — try again.
            </p>
          )}
        </div>

        <p className="text-[12.5px] leading-relaxed text-faint-foreground">
          Avoid easy guesses like 0000, 1234 or your birth year.
        </p>
      </div>
      <FlowFooter>
        <button
          type="button"
          className="onyx-btn-primary w-full disabled:pointer-events-none disabled:opacity-40"
          disabled={!valid}
          onClick={save}
        >
          {changing ? "Update PIN" : "Set PIN"}
        </button>
      </FlowFooter>
    </Modal>
  );
}
