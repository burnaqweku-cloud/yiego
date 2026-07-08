import { useEffect, useState } from "react";
import { ArrowDown, Check, Copy, Repeat2 } from "lucide-react";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader, ProcessingView } from "./flow-parts";
import { demoPin } from "@/data/serviceFlows";
import { cn } from "@/lib/utils";

const BOOKIES = ["SportyBet", "Betway", "MSport", "1xBet", "Melbet"];

type Step = "form" | "processing" | "result";

/** Bet-code converter — a free tool: paste a code, convert across bookies. */
export default function BetConverterFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>("form");
  const [code, setCode] = useState("");
  const [from, setFrom] = useState(BOOKIES[0]);
  const [to, setTo] = useState(BOOKIES[1]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setStep("form");
    setCode("");
    setFrom(BOOKIES[0]);
    setTo(BOOKIES[1]);
    setCopied(false);
  }, [open]);

  const valid = code.trim().length >= 4 && from !== to;
  const converted = `${to.slice(0, 2).toUpperCase()}${demoPin(`bet-${code}-${from}-${to}`, 8)}`;

  useEffect(() => {
    if (step !== "processing") return;
    const id = window.setTimeout(() => setStep("result"), 1400);
    return () => window.clearTimeout(id);
  }, [step]);

  const copy = () => {
    navigator.clipboard?.writeText(converted).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const BookiePills = ({
    value,
    exclude,
    onPick,
    idPrefix,
  }: {
    value: string;
    exclude?: string;
    onPick: (b: string) => void;
    idPrefix: string;
  }) => (
    <div className="flex flex-wrap gap-2" role="group" aria-label={`${idPrefix} bookmaker`}>
      {BOOKIES.map((b) => (
        <button
          key={b}
          type="button"
          aria-pressed={value === b}
          disabled={b === exclude}
          className={cn(
            "onyx-pill disabled:pointer-events-none disabled:opacity-30",
            value === b && "onyx-pill-on",
          )}
          onClick={() => onPick(b)}
        >
          {b}
        </button>
      ))}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} label="Bet code converter">
      {step === "form" && (
        <>
          <FlowHeader
            title="Bet code converter"
            subtitle="Free · convert codes across bookies"
            onClose={onClose}
          />
          <div className="space-y-5 px-5 pb-2 pt-5">
            <div>
              <label
                htmlFor="bc-code"
                className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint-foreground"
              >
                Booking code
              </label>
              <input
                id="bc-code"
                className="onyx-field mt-2 font-mono text-[16px] uppercase tracking-widest"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12))}
                placeholder="e.g. 7GK2MQ"
              />
            </div>

            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">
                From
              </p>
              <div className="mt-2">
                <BookiePills
                  idPrefix="From"
                  value={from}
                  onPick={(b) => {
                    setFrom(b);
                    // Never allow From === To — hop To to the next bookie.
                    if (b === to) setTo(BOOKIES.find((x) => x !== b) ?? to);
                  }}
                />
              </div>
            </div>

            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">
                To
              </p>
              <div className="mt-2">
                <BookiePills idPrefix="To" value={to} exclude={from} onPick={(b) => setTo(b)} />
              </div>
            </div>
          </div>
          <FlowFooter>
            <button
              type="button"
              className="onyx-btn-primary w-full disabled:pointer-events-none disabled:opacity-40"
              disabled={!valid}
              onClick={() => setStep("processing")}
            >
              <Repeat2 size={16} strokeWidth={2.4} />
              Convert code
            </button>
          </FlowFooter>
        </>
      )}

      {step === "processing" && <ProcessingView label="Converting your slip…" />}

      {step === "result" && (
        <div className="px-5 pb-2 pt-9">
          <div role="status" className="flex flex-col items-center text-center">
            <span className="onyx-success-badge" aria-hidden="true">
              <Check size={38} strokeWidth={3} />
            </span>
            <h3 className="mt-5 font-display text-[21px] font-semibold tracking-tight text-white">
              Converted!
            </h3>
            <p className="mt-1.5 max-w-[32ch] text-[13.5px] leading-relaxed text-muted-foreground">
              All matching games were rebuilt on {to}. Odds may differ slightly between bookies.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">
                  {from}
                </p>
                <p className="mt-1 truncate font-mono text-[15px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {code}
                </p>
              </div>
              <ArrowDown size={16} className="shrink-0 rotate-[-90deg] text-primary-glow" />
              <div className="min-w-0 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">
                  {to}
                </p>
                <p className="mt-1 truncate font-mono text-[15px] font-semibold uppercase tracking-widest text-primary-glow">
                  {converted}
                </p>
              </div>
            </div>
            <button type="button" onClick={copy} className="onyx-btn-ghost mt-4 w-full">
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Copied" : `Copy ${to} code`}
            </button>
          </div>

          <div className="mt-6 flex flex-col gap-2.5 pb-[max(8px,env(safe-area-inset-bottom))]">
            <button type="button" className="onyx-btn-primary w-full" onClick={onClose}>
              Done
            </button>
            <button
              type="button"
              className="onyx-btn-ghost w-full"
              onClick={() => {
                setCode("");
                setStep("form");
              }}
            >
              Convert another
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
