import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Sparkles, TriangleAlert } from "lucide-react";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader, ProcessingView, SelectRow, SuccessView } from "./flow-parts";
import type { FlowField, FlowOption, FlowPlan, ServiceFlowConfig } from "@/data/serviceFlows";
import { useWallet, nowLabel } from "@/store/wallet";
import { formatGHS } from "@/lib/format";

/**
 * The generic, config-driven service flow. Renders whatever steps a
 * ServiceFlowConfig declares — provider → plan/amount → details → review —
 * then processes the payment against the live wallet.
 */

type StepName = "provider" | "plan" | "amount" | "fields" | "review";
type Phase = "steps" | "processing" | "success";

function OptionLogo({ option }: { option: FlowOption }) {
  const abbr = option.abbr ?? option.name.slice(0, 3).toUpperCase();
  return (
    <span
      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-white/[0.03] text-[12px] font-bold tracking-tight"
      style={{ color: option.color ?? "#7cf0b4", borderColor: `${option.color ?? "#7cf0b4"}55` }}
    >
      {abbr}
    </span>
  );
}

function PlanTag({ tag }: { tag: NonNullable<FlowPlan["tag"]> }) {
  const best = tag === "Best value";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.05em] ${
        best
          ? "border-amber/25 bg-amber/[0.12] text-amber"
          : "border-primary-glow/20 bg-primary/[0.12] text-primary-glow"
      }`}
    >
      {tag}
    </span>
  );
}

function fieldValid(f: FlowField, value: string): boolean {
  const v = value.trim();
  if (v.length < (f.minLen ?? 1)) return false;
  if (f.maxLen && v.length > f.maxLen) return false;
  return true;
}

function fieldDisplay(f: FlowField, value: string): string {
  return f.mask ? f.mask(value) : value;
}

export default function PurchaseFlow({
  config,
  open,
  onClose,
  onAddMoney,
}: {
  config: ServiceFlowConfig | null;
  open: boolean;
  onClose: () => void;
  onAddMoney: () => void;
}) {
  const { balance, debit, credit } = useWallet();

  const [phase, setPhase] = useState<Phase>("steps");
  const [idx, setIdx] = useState(0);
  const [provider, setProvider] = useState<FlowOption | null>(null);
  const [plan, setPlan] = useState<FlowPlan | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  // Reset on open AND close — closing mid-processing cancels the pending
  // timer via the phase-effect cleanup, so it can never silently charge.
  useEffect(() => {
    setPhase("steps");
    setIdx(0);
    setProvider(null);
    setPlan(null);
    setAmountStr("");
    setValues(config ? Object.fromEntries((config.fields ?? []).map((f) => [f.id, ""])) : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, config?.serviceId]);

  const steps = useMemo<StepName[]>(() => {
    if (!config) return ["review"];
    const s: StepName[] = [];
    if (config.providers) s.push("provider");
    if (config.plans) s.push("plan");
    if (config.amount) s.push("amount");
    if (config.fields?.length) s.push("fields");
    s.push("review");
    return s;
  }, [config]);

  const step = steps[Math.min(idx, steps.length - 1)];

  const amount = Math.round((parseFloat(amountStr) || 0) * 100) / 100;
  const isCredit = config?.direction === "credit";
  const charged = plan ? plan.price : amount;
  const creditedGHS = isCredit && config?.creditAmount ? config.creditAmount(amount) : 0;
  const canPay = isCredit || balance >= charged;

  const state = { provider, plan, amount, values };

  const amountValid = !config?.amount || amount >= config.amount.min;
  const fieldsValid = (config?.fields ?? []).every((f) => fieldValid(f, values[f.id] ?? ""));

  // Simulated processing → commit to the wallet.
  useEffect(() => {
    if (phase !== "processing" || !config) return;
    const id = window.setTimeout(() => {
      const subtitle = `${config.txSubtitle(state)} · ${nowLabel()}`;
      if (isCredit) {
        credit(creditedGHS, { type: config.txType, title: config.txTitle(state), subtitle });
      } else {
        debit(charged, { type: config.txType, title: config.txTitle(state), subtitle });
      }
      setPhase("success");
    }, 1700);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (!config) return null;

  const next = () => setIdx((i) => Math.min(i + 1, steps.length - 1));
  const back = idx > 0 ? () => setIdx((i) => i - 1) : undefined;

  const headerTitle =
    step === "provider"
      ? config.sheetTitle
      : step === "plan"
        ? config.plans?.title ?? config.sheetTitle
        : step === "amount"
          ? config.sheetTitle
          : step === "fields"
            ? config.fieldsTitle ?? "Details"
            : isCredit
              ? "Review"
              : "Review & pay";

  const headerSubtitle =
    step === "provider"
      ? config.providers?.title
      : provider
        ? `${provider.name}${plan ? ` · ${plan.name}` : ""}`
        : plan
          ? plan.name
          : undefined;

  /* Review rows assembled from whatever the config used. */
  const reviewRows: { label: string; value: string }[] = [];
  if (provider) reviewRows.push({ label: "Provider", value: provider.name });
  if (plan)
    reviewRows.push({
      label: "Plan",
      value: `${plan.name}${plan.detail ? ` · ${plan.detail}` : ""}`,
    });
  for (const f of config.fields ?? []) {
    reviewRows.push({ label: f.label, value: fieldDisplay(f, values[f.id] ?? "") });
  }
  if (config.rate) reviewRows.push({ label: "Rate", value: config.rate.detail });

  const paidLabel = formatGHS(charged);
  const unitLabel = (n: number) =>
    config.amount?.unit === "USDT" ? `${n} USDT` : formatGHS(n);

  const successRows: { label: string; value: string }[] = [
    ...(provider ? [{ label: "Provider", value: provider.name }] : []),
    ...(plan ? [{ label: "Plan", value: plan.name }] : []),
    ...(config.fields ?? []).map((f) => ({
      label: f.label,
      value: fieldDisplay(f, values[f.id] ?? ""),
    })),
    isCredit
      ? { label: "Received", value: formatGHS(creditedGHS) }
      : { label: "Paid", value: paidLabel },
    ...(config.successExtras ? config.successExtras(state) : []),
  ];

  return (
    <Modal open={open} onClose={onClose} label={config.sheetTitle}>
      {phase === "steps" && step === "provider" && config.providers && (
        <>
          <FlowHeader title={headerTitle} subtitle={headerSubtitle} onClose={onClose} />
          <div className="space-y-2.5 px-5 pb-6 pt-4">
            {config.providers.options.map((o) => (
              <SelectRow
                key={o.id}
                onClick={() => {
                  setProvider(o);
                  setPlan(null);
                  next();
                }}
                leading={<OptionLogo option={o} />}
                title={o.name}
                subtitle={o.detail}
                trailing={<ChevronRight size={18} className="shrink-0 text-faint-foreground" />}
              />
            ))}
          </div>
        </>
      )}

      {phase === "steps" && step === "plan" && config.plans && (
        <>
          <FlowHeader title={headerTitle} subtitle={headerSubtitle} onBack={back} onClose={onClose} />
          <div className="space-y-2.5 px-5 pb-6 pt-4">
            {(config.plans.for(provider?.id ?? null) ?? []).map((p) => (
              <SelectRow
                key={p.id}
                onClick={() => {
                  setPlan(p);
                  next();
                }}
                leading={
                  provider ? (
                    <OptionLogo option={provider} />
                  ) : (
                    <span className="onyx-tile-icon shrink-0">
                      <Sparkles size={18} />
                    </span>
                  )
                }
                title={
                  <span className="flex items-center gap-2">
                    {p.name}
                    {p.tag && <PlanTag tag={p.tag} />}
                  </span>
                }
                subtitle={p.detail}
                trailing={
                  <span className="shrink-0 font-display text-[15px] font-semibold tnum text-white">
                    {formatGHS(p.price)}
                  </span>
                }
              />
            ))}
          </div>
        </>
      )}

      {phase === "steps" && step === "amount" && config.amount && (
        <>
          <FlowHeader title={headerTitle} subtitle={headerSubtitle} onBack={back} onClose={onClose} />
          <div className="space-y-5 px-5 pb-2 pt-5">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-7 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint-foreground">
                {config.amount.label ?? "Amount"}
              </p>
              <div className="mt-3 flex items-baseline justify-center gap-2">
                <span className="font-display text-[22px] font-semibold text-primary-glow">
                  {config.amount.unit === "USDT" ? "USDT" : "GH₵"}
                </span>
                <input
                  className="onyx-amount-input text-[42px] leading-none"
                  inputMode="decimal"
                  value={amountStr}
                  onChange={(e) =>
                    setAmountStr(
                      e.target.value
                        .replace(/[^0-9.]/g, "")
                        .replace(/(\..*)\./g, "$1")
                        .replace(/(\.\d{2}).+/, "$1"),
                    )
                  }
                  placeholder="0"
                  aria-label={config.amount.label ?? "Amount"}
                  style={{ width: `${Math.max(amountStr.length || 1, 1)}ch` }}
                />
              </div>
              {config.rate && amount > 0 && (
                <p className="mt-3 text-[13px] font-semibold text-primary-glow tnum">
                  {config.rate.convertedLabel}: {config.rate.convert(amount)}
                </p>
              )}
              {amountStr.length > 0 && !amountValid && (
                <p className="mt-2 text-[12px] text-danger">
                  Minimum is {unitLabel(config.amount.min)}.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {config.amount.presets.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`onyx-pill ${amountStr === String(v) ? "onyx-pill-on" : ""}`}
                  onClick={() => setAmountStr(String(v))}
                >
                  {config.amount!.unit === "USDT" ? `${v} USDT` : `GH₵${v}`}
                </button>
              ))}
            </div>
          </div>
          <FlowFooter>
            <button
              type="button"
              className="onyx-btn-primary w-full disabled:pointer-events-none disabled:opacity-40"
              disabled={!amountValid || amount <= 0}
              onClick={next}
            >
              Continue
            </button>
          </FlowFooter>
        </>
      )}

      {phase === "steps" && step === "fields" && (
        <>
          <FlowHeader title={headerTitle} subtitle={headerSubtitle} onBack={back} onClose={onClose} />
          <div className="space-y-5 px-5 pb-2 pt-5">
            {(config.fields ?? []).map((f) => {
              const v = values[f.id] ?? "";
              const invalid = v.length > 0 && !fieldValid(f, v);
              return (
                <div key={f.id}>
                  <label
                    htmlFor={`pf-${config.serviceId}-${f.id}`}
                    className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint-foreground"
                  >
                    {f.label}
                  </label>
                  <input
                    id={`pf-${config.serviceId}-${f.id}`}
                    className={`onyx-field mt-2 text-[16px] ${f.monospace ? "font-mono tracking-wide" : ""} ${f.digitsOnly ? "tnum" : ""}`}
                    inputMode={f.inputMode === "numeric" ? "numeric" : f.inputMode === "email" ? "email" : "text"}
                    value={v}
                    onChange={(e) => {
                      let nv = e.target.value;
                      if (f.digitsOnly) nv = nv.replace(/\D/g, "");
                      if (f.maxLen) nv = nv.slice(0, f.maxLen);
                      setValues((s) => ({ ...s, [f.id]: nv }));
                    }}
                    placeholder={f.placeholder}
                  />
                  {invalid && f.errorText && (
                    <p className="mt-1.5 text-[12px] text-danger">{f.errorText}</p>
                  )}
                  {f.prefill && (
                    <button
                      type="button"
                      className="onyx-pill mt-3"
                      onClick={() => setValues((s) => ({ ...s, [f.id]: f.prefill!.value }))}
                    >
                      {f.prefill.label}
                    </button>
                  )}
                </div>
              );
            })}

            {(plan || amount > 0) && (
              <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
                <div>
                  <p className="text-[13.5px] font-semibold text-foreground">
                    {plan ? plan.name : config.sheetTitle}
                  </p>
                  {plan?.detail && <p className="text-[12px] text-faint-foreground">{plan.detail}</p>}
                </div>
                <span className="font-display text-[16px] font-semibold tnum text-white">
                  {plan ? formatGHS(plan.price) : unitLabel(amount)}
                </span>
              </div>
            )}
          </div>
          <FlowFooter>
            <button
              type="button"
              className="onyx-btn-primary w-full disabled:pointer-events-none disabled:opacity-40"
              disabled={!fieldsValid}
              onClick={next}
            >
              Continue
            </button>
          </FlowFooter>
        </>
      )}

      {phase === "steps" && step === "review" && (
        <>
          <FlowHeader title={headerTitle} onBack={back} onClose={onClose} />
          <div className="space-y-4 px-5 pb-2 pt-5">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5">
              {reviewRows.map((r, i) => (
                <div
                  key={r.label + i}
                  className={`flex items-center justify-between gap-4 px-3.5 py-3 ${
                    i > 0 ? "border-t border-white/[0.05]" : ""
                  }`}
                >
                  <span className="text-[12.5px] text-faint-foreground">{r.label}</span>
                  <span className="max-w-[60%] truncate text-right text-[13.5px] font-semibold text-foreground">
                    {r.value}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 border-t border-white/[0.08] px-3.5 py-3.5">
                <span className="text-[13px] font-semibold text-foreground">
                  {isCredit ? "You send" : "Amount"}
                </span>
                <span className="font-display text-[18px] font-semibold tnum text-white">
                  {isCredit ? `${amount} USDT` : paidLabel}
                </span>
              </div>
              {isCredit && (
                <div className="flex items-center justify-between gap-4 border-t border-white/[0.05] px-3.5 py-3.5">
                  <span className="text-[13px] font-semibold text-foreground">You receive</span>
                  <span className="font-display text-[18px] font-semibold tnum text-success">
                    {formatGHS(creditedGHS)}
                  </span>
                </div>
              )}
            </div>

            {!isCredit && (
              <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
                <div>
                  <p className="text-[13px] font-semibold text-foreground">Pay from Wallet</p>
                  <p className="text-[12px] text-faint-foreground tnum">Balance {formatGHS(balance)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[12px] text-faint-foreground">Balance after</p>
                  <p
                    className={`text-[13.5px] font-semibold tnum ${
                      canPay ? "text-foreground" : "text-danger"
                    }`}
                  >
                    {formatGHS(balance - charged)}
                  </p>
                </div>
              </div>
            )}

            {!canPay && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-danger/25 bg-danger/[0.08] px-4 py-3">
                <TriangleAlert size={16} className="mt-0.5 shrink-0 text-danger" />
                <p className="text-[12.5px] leading-relaxed text-[#f0c9c4]">
                  Not enough in your wallet. Add money to complete this purchase.
                </p>
              </div>
            )}
          </div>
          <FlowFooter>
            {canPay ? (
              <button
                type="button"
                className="onyx-btn-primary w-full"
                onClick={() => setPhase("processing")}
              >
                {isCredit ? "Confirm & receive" : `Pay ${paidLabel}`}
              </button>
            ) : (
              <button type="button" className="onyx-btn-primary w-full" onClick={onAddMoney}>
                Add money
              </button>
            )}
          </FlowFooter>
        </>
      )}

      {phase === "processing" && (
        <ProcessingView label={isCredit ? "Confirming your transfer…" : "Processing payment…"} />
      )}

      {phase === "success" && (
        <SuccessView
          title={config.successTitle}
          message={config.successMessage(state, isCredit ? formatGHS(creditedGHS) : paidLabel)}
          rows={successRows}
          primaryLabel="Done"
          onPrimary={onClose}
        />
      )}
    </Modal>
  );
}
