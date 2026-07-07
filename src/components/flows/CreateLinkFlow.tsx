import { useEffect, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader, ProcessingView } from "./flow-parts";
import { useLinks, linkUrl, type PayLink } from "@/store/links";
import { formatGHS } from "@/lib/format";

type Step = "form" | "processing" | "success";

/** Create a payment link — it lands in the live links list on /payments. */
export default function CreateLinkFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addLink } = useLinks();
  const [step, setStep] = useState<Step>("form");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [created, setCreated] = useState<PayLink | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setStep("form");
    setTitle("");
    setAmount("");
    setCreated(null);
    setCopied(false);
  }, [open]);

  const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
  const valid = title.trim().length >= 3 && amt >= 1;

  useEffect(() => {
    if (step !== "processing" || !valid) return;
    const id = window.setTimeout(() => {
      setCreated(addLink(title.trim(), amt));
      setStep("success");
    }, 1200);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const copy = () => {
    if (!created) return;
    navigator.clipboard?.writeText(`https://${linkUrl(created)}`).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Modal open={open} onClose={onClose} label="Create payment link">
      {step === "form" && (
        <>
          <FlowHeader
            title="Create payment link"
            subtitle="Share it anywhere, get paid"
            onClose={onClose}
          />
          <div className="space-y-5 px-5 pb-2 pt-5">
            <div>
              <label
                htmlFor="cl-title"
                className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint-foreground"
              >
                What's it for?
              </label>
              <input
                id="cl-title"
                className="onyx-field mt-2 text-[16px]"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 60))}
                placeholder="e.g. Logo design deposit"
              />
            </div>
            <div>
              <label
                htmlFor="cl-amount"
                className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint-foreground"
              >
                Amount (GH₵)
              </label>
              <input
                id="cl-amount"
                className="onyx-field mt-2 text-[16px] tnum"
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
                placeholder="0.00"
              />
            </div>
            <p className="text-[12.5px] leading-relaxed text-faint-foreground">
              Anyone with the link can pay you by MoMo or card. The money settles straight into
              your YieGo wallet.
            </p>
          </div>
          <FlowFooter>
            <button
              type="button"
              className="onyx-btn-primary w-full disabled:pointer-events-none disabled:opacity-40"
              disabled={!valid}
              onClick={() => setStep("processing")}
            >
              Create link
            </button>
          </FlowFooter>
        </>
      )}

      {step === "processing" && <ProcessingView label="Creating your link…" />}

      {step === "success" && created && (
        <div className="px-5 pb-2 pt-9">
          <div role="status" className="flex flex-col items-center text-center">
            <span className="onyx-success-badge" aria-hidden="true">
              <Check size={38} strokeWidth={3} />
            </span>
            <h3 className="mt-5 font-display text-[21px] font-semibold tracking-tight text-white">
              Link is live!
            </h3>
            <p className="mt-1.5 max-w-[30ch] text-[13.5px] leading-relaxed text-muted-foreground">
              “{created.title}” is ready to share — {formatGHS(created.amount)} per payment.
            </p>
          </div>

          <button
            type="button"
            onClick={copy}
            className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-primary-glow/25 bg-primary/[0.08] px-4 py-4 text-left transition hover:bg-primary/[0.14]"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary-glow/20 bg-primary/[0.12] text-primary-glow">
              <Link2 size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[13.5px] font-semibold text-primary-glow">
                {linkUrl(created)}
              </span>
              <span className="text-[11.5px] text-faint-foreground">Tap to copy</span>
            </span>
            <span className="onyx-copy shrink-0">
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy"}
            </span>
          </button>

          <div className="mt-6 flex flex-col gap-2.5 pb-[max(8px,env(safe-area-inset-bottom))]">
            <button type="button" className="onyx-btn-primary w-full" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
