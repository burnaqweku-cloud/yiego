import { useEffect, useState } from "react";
import { Check, CreditCard, Smartphone, TriangleAlert } from "lucide-react";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader, ProcessingView, SelectRow, SuccessView } from "./flow-parts";
import { useWallet, nowLabel } from "@/store/wallet";
import { useMethods, type FundingMethod } from "@/store/methods";
import { formatGHS } from "@/lib/format";

type Step = "amount" | "method" | "processing" | "success";

const KIND_ICON = { momo: Smartphone, card: CreditCard } as const;

/** Withdraw / payout — moves money OUT of the wallet to MoMo or bank card. */
export default function WithdrawFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { balance, debit } = useWallet();
  const { methods, defaultId } = useMethods();
  const defaultMethod = methods.find((m) => m.id === defaultId) ?? methods[0];
  const [step, setStep] = useState<Step>("amount");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FundingMethod>(defaultMethod);

  // Reset on open AND close — cancels a pending processing timer.
  useEffect(() => {
    setStep("amount");
    setAmount("");
    setMethod(defaultMethod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
  const valid = amt >= 1 && amt <= balance;

  useEffect(() => {
    if (step !== "processing" || amt <= 0) return;
    const id = window.setTimeout(() => {
      debit(amt, {
        type: "withdrawal",
        title: "Withdrawal",
        subtitle: `To ${method.detail} · ${nowLabel()}`,
      });
      setStep("success");
    }, 1600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return (
    <Modal open={open} onClose={onClose} label="Withdraw">
      {step === "amount" && (
        <>
          <FlowHeader title="Withdraw" subtitle="Move money out of your wallet" onClose={onClose} />
          <div className="space-y-5 px-5 pb-2 pt-5">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-7 text-center">
              <div className="flex items-baseline justify-center gap-2">
                <span className="font-display text-[22px] font-semibold text-primary-glow">GH₵</span>
                <input
                  className="onyx-amount-input text-[42px] leading-none"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) =>
                    setAmount(
                      e.target.value
                        .replace(/[^0-9.]/g, "")
                        .replace(/(\..*)\./g, "$1")
                        .replace(/(\.\d{2}).+/, "$1"),
                    )
                  }
                  placeholder="0"
                  aria-label="Amount to withdraw"
                  style={{ width: `${Math.max(amount.length || 1, 1)}ch` }}
                />
              </div>
              <p className="mt-3 text-[12.5px] text-faint-foreground tnum">
                Available: {formatGHS(balance)}
              </p>
              {amount.length > 0 && amt > balance && (
                <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[12px] text-danger">
                  <TriangleAlert size={13} /> More than your balance.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {[50, 100, 200, 500].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`onyx-pill ${amount === String(v) ? "onyx-pill-on" : ""}`}
                  onClick={() => setAmount(String(v))}
                >
                  GH₵{v}
                </button>
              ))}
              <button
                type="button"
                className={`onyx-pill ${amount === String(Math.floor(balance)) ? "onyx-pill-on" : ""}`}
                onClick={() => setAmount(String(Math.floor(balance)))}
              >
                Max
              </button>
            </div>
          </div>
          <FlowFooter>
            <button
              type="button"
              className="onyx-btn-primary w-full disabled:pointer-events-none disabled:opacity-40"
              disabled={!valid}
              onClick={() => setStep("method")}
            >
              Continue
            </button>
          </FlowFooter>
        </>
      )}

      {step === "method" && (
        <>
          <FlowHeader
            title="Withdraw to"
            subtitle={`Sending ${formatGHS(amt)}`}
            onBack={() => setStep("amount")}
            onClose={onClose}
          />
          <div className="space-y-2.5 px-5 pb-4 pt-4">
            {methods.map((m) => {
              const Icon = KIND_ICON[m.kind];
              return (
              <SelectRow
                key={m.id}
                selected={method.id === m.id}
                onClick={() => setMethod(m)}
                leading={
                  <span className="onyx-tx-icon is-out shrink-0">
                    <Icon size={17} />
                  </span>
                }
                title={m.name}
                subtitle={m.detail}
                trailing={
                  method.id === m.id ? (
                    <Check size={18} className="shrink-0 text-primary-glow" />
                  ) : undefined
                }
              />
              );
            })}
            <p className="px-1 pt-1 text-[12px] text-faint-foreground">
              Arrives instantly · no YieGo fee
            </p>
          </div>
          <FlowFooter>
            <button
              type="button"
              className="onyx-btn-primary w-full"
              onClick={() => setStep("processing")}
            >
              Withdraw {formatGHS(amt)}
            </button>
          </FlowFooter>
        </>
      )}

      {step === "processing" && <ProcessingView label="Sending your money…" />}

      {step === "success" && (
        <SuccessView
          title="Withdrawal sent!"
          message={`${formatGHS(amt)} is on its way to your ${method.name}.`}
          rows={[
            { label: "Sent", value: formatGHS(amt) },
            { label: "To", value: `${method.name} · ${method.detail}` },
            { label: "New balance", value: formatGHS(balance) },
          ]}
          primaryLabel="Done"
          onPrimary={onClose}
        />
      )}
    </Modal>
  );
}
