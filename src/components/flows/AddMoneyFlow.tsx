import { useEffect, useState } from "react";
import { Check, CreditCard, Smartphone } from "lucide-react";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader, ProcessingView, SelectRow, SuccessView } from "./flow-parts";
import { TOPUP_AMOUNTS } from "@/data/bundles";
import { useWallet, nowLabel } from "@/store/wallet";
import { useMethods, type FundingMethod } from "@/store/methods";
import { formatGHS } from "@/lib/format";

type Step = "amount" | "method" | "processing" | "success";

const KIND_ICON = { momo: Smartphone, card: CreditCard } as const;

export default function AddMoneyFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { balance, credit } = useWallet();
  const { methods, defaultId } = useMethods();
  const defaultMethod = methods.find((m) => m.id === defaultId) ?? methods[0];
  const [step, setStep] = useState<Step>("amount");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FundingMethod>(defaultMethod);

  // Reset on open AND close — resetting on close cancels any pending
  // "processing" timer so closing mid-processing can't silently credit.
  useEffect(() => {
    setStep("amount");
    setAmount("");
    setMethod(defaultMethod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
  const valid = amt >= 1;

  useEffect(() => {
    if (step !== "processing" || !method || amt <= 0) return;
    const id = window.setTimeout(() => {
      credit(amt, {
        type: "deposit",
        title: "Wallet Top-up",
        subtitle: `${method.name} · ${nowLabel()}`,
      });
      setStep("success");
    }, 1600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return (
    <Modal open={open} onClose={onClose} label="Add money">
      {step === "amount" && (
        <>
          <FlowHeader title="Add money" subtitle="Top up your wallet" onClose={onClose} />
          <div className="space-y-5 px-5 pb-2 pt-5">
            <div className="onyx-amount-card rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-7 text-center">
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
                  aria-label="Amount to add"
                  size={Math.max(amount.length || 1, 1)}
                  style={{ width: `${Math.max(amount.length || 1, 1)}ch` }}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {TOPUP_AMOUNTS.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`onyx-pill ${amount === String(v) ? "onyx-pill-on" : ""}`}
                  onClick={() => setAmount(String(v))}
                >
                  GH₵{v}
                </button>
              ))}
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
            title="Payment method"
            subtitle={`Add ${formatGHS(amt)}`}
            onBack={() => setStep("amount")}
            onClose={onClose}
          />
          <div className="space-y-2.5 px-5 pb-4 pt-4">
            {methods.map((m) => {
              const Icon = KIND_ICON[m.kind];
              return (
              <SelectRow
                key={m.id}
                selected={method?.id === m.id}
                onClick={() => setMethod(m)}
                leading={
                  <span className="onyx-tx-icon is-out shrink-0">
                    <Icon size={17} />
                  </span>
                }
                title={m.name}
                subtitle={m.detail}
                trailing={
                  method?.id === m.id ? (
                    <Check size={18} className="shrink-0 text-primary-glow" />
                  ) : undefined
                }
              />
              );
            })}
          </div>
          <FlowFooter>
            <button
              type="button"
              className="onyx-btn-primary w-full"
              onClick={() => setStep("processing")}
            >
              Add {formatGHS(amt)}
            </button>
          </FlowFooter>
        </>
      )}

      {step === "processing" && <ProcessingView label="Adding money…" />}

      {step === "success" && (
        <SuccessView
          title="Wallet topped up!"
          message={`${formatGHS(amt)} was added to your YieGo wallet.`}
          rows={[
            { label: "Added", value: formatGHS(amt) },
            { label: "Method", value: method.name },
            { label: "New balance", value: formatGHS(balance) },
          ]}
          primaryLabel="Done"
          onPrimary={onClose}
        />
      )}
    </Modal>
  );
}
