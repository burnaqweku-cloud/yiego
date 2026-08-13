import { useEffect, useState } from "react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader, ProcessingView } from "./flow-parts";
import { TOPUP_AMOUNTS } from "@/data/bundles";
import { formatGHS } from "@/lib/format";
import { paystackFee } from "@/lib/fees";
import { createWalletDeposit } from "@/lib/phase1-api";
import { useAuth } from "@/store/auth-context";
import { useWallet } from "@/store/wallet";

type Step = "amount" | "processing";

export default function AddMoneyFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isAuthenticated } = useAuth();
  const { hasWallet } = useWallet();
  const [step, setStep] = useState<Step>("amount");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    setStep("amount");
    setAmount("");
  }, [open]);

  const value = Math.round((parseFloat(amount) || 0) * 100) / 100;
  const valid = value >= 1;
  // Paystack carries a 4% fee. The customer pays the deposit + fee; the wallet
  // is credited the round deposit amount.
  const fee = paystackFee(value);
  const payTotal = Math.round((value + fee) * 100) / 100;

  const startDeposit = async () => {
    if (!isAuthenticated) {
      toast.error("Sign in to add money to your wallet");
      onClose();
      return;
    }
    if (!hasWallet) {
      toast.error("Your wallet is not ready yet. Please refresh and try again.");
      return;
    }
    if (!valid) return;
    setStep("processing");
    const result = await createWalletDeposit({ amount: value });

    if (result.error || !result.data?.data?.authorizationUrl) {
      toast.error(result.error ?? "Could not start Paystack payment");
      setStep("amount");
      return;
    }

    window.location.assign(result.data.data.authorizationUrl);
  };

  return (
    <Modal open={open} onClose={onClose} label="Add money">
      {step === "amount" ? (
        <>
          <FlowHeader title="Add money" subtitle="Fund your wallet with Paystack" onClose={onClose} />
          <div className="space-y-5 px-5 pb-2 pt-5">
            <div className="onyx-amount-card rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-7 text-center">
              <div className="flex items-baseline justify-center gap-2">
                <span className="font-display text-[22px] font-semibold text-primary-glow">GH₵</span>
                <input
                  className="onyx-amount-input text-[42px] leading-none"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").replace(/(\.\d{2}).+/, "$1"))}
                  placeholder="0"
                  aria-label="Amount to add"
                  style={{ width: `${Math.max(amount.length || 1, 1)}ch` }}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {TOPUP_AMOUNTS.map((preset) => (
                <button key={preset} type="button" className={`onyx-pill ${amount === String(preset) ? "onyx-pill-on" : ""}`} onClick={() => setAmount(String(preset))}>
                  GH₵{preset}
                </button>
              ))}
            </div>
            {valid && fee > 0 && (
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5">
                <div className="flex items-center justify-between gap-4 px-3.5 py-2.5"><span className="text-[12.5px] text-faint-foreground">Added to wallet</span><span className="text-[13.5px] font-semibold">{formatGHS(value)}</span></div>
                <div className="flex items-center justify-between gap-4 border-t border-white/[0.05] px-3.5 py-2.5"><span className="text-[12.5px] text-faint-foreground">Fee</span><span className="text-[13.5px] font-semibold">{formatGHS(fee)}</span></div>
                <div className="flex items-center justify-between gap-4 border-t border-white/[0.08] px-3.5 py-3"><span className="text-[13px] font-semibold">You pay</span><span className="font-display text-[16px] font-semibold">{formatGHS(payTotal)}</span></div>
              </div>
            )}
            <p className="text-xs leading-5 text-faint-foreground">Pay securely with Paystack. Your wallet will update automatically after the payment is confirmed.</p>
          </div>
          <FlowFooter>
            <button type="button" className="onyx-btn-primary w-full disabled:pointer-events-none disabled:opacity-40" disabled={!valid || !hasWallet} onClick={startDeposit}>
              Pay {formatGHS(payTotal)} with Paystack
            </button>
          </FlowFooter>
        </>
      ) : <ProcessingView label="Opening Paystack…" />}
    </Modal>
  );
}
