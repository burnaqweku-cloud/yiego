import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { FlowHeader } from "./flow-parts";
import { useProfile, hashPin } from "@/store/profile";

/**
 * The PIN check that guards debits — shown between "Pay" and processing
 * whenever the user has set a wallet PIN.
 */
export default function PinGate({
  onConfirm,
  onBack,
  onClose,
}: {
  onConfirm: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const { profile } = useProfile();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-verify once 4 digits are in.
  useEffect(() => {
    if (pin.length !== 4) return;
    if (hashPin(pin) === profile.pinHash) {
      onConfirm();
    } else {
      setError(true);
      const id = window.setTimeout(() => {
        setPin("");
        setError(false);
        inputRef.current?.focus();
      }, 700);
      return () => window.clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  return (
    <>
      <FlowHeader title="Enter your PIN" subtitle="Confirm this payment" onBack={onBack} onClose={onClose} />
      <div className="flex flex-col items-center px-5 pb-10 pt-8 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-primary-glow/20 bg-primary/[0.12] text-primary-glow">
          <Lock size={22} />
        </span>
        <p className="mt-4 max-w-[30ch] text-[13px] leading-relaxed text-muted-foreground">
          Enter your 4-digit wallet PIN to authorise this payment.
        </p>

        <div className="relative mt-6" aria-live="polite">
          <div className="flex justify-center gap-3" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`grid h-14 w-12 place-items-center rounded-xl border text-[22px] font-bold text-white transition-colors ${
                  error
                    ? "border-danger/50 bg-danger/[0.08]"
                    : pin.length > i
                      ? "border-primary-glow/40 bg-primary/[0.1]"
                      : "border-white/10 bg-white/[0.03]"
                }`}
              >
                {pin.length > i ? "•" : ""}
              </span>
            ))}
          </div>
          <input
            ref={inputRef}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            aria-label="4-digit wallet PIN"
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
        {error && <p className="mt-3 text-[12.5px] font-semibold text-danger">Wrong PIN — try again.</p>}
      </div>
    </>
  );
}
