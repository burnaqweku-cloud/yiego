import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, X } from "lucide-react";

/** Header row for a flow step: optional back, title/subtitle, close. */
export function FlowHeader({
  title,
  subtitle,
  onBack,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/[0.06] bg-[#101c16]/85 px-4 py-3.5 backdrop-blur">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="onyx-iconbtn rounded-xl"
        >
          <ArrowLeft size={18} />
        </button>
      ) : (
        <span className="h-11 w-11" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1 text-center">
        <p className="truncate font-display text-[15px] font-semibold tracking-tight text-white">
          {title}
        </p>
        {subtitle && <p className="truncate text-[11.5px] text-faint-foreground">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="onyx-iconbtn rounded-xl"
      >
        <X size={18} />
      </button>
    </div>
  );
}

/** Sticky footer holding the step's primary action. */
export function FlowFooter({ children }: { children: ReactNode }) {
  return <div className="onyx-flow-footer">{children}</div>;
}

/** Centered processing state. */
export function ProcessingView({ label }: { label: string }) {
  // The live region mounts empty, then receives the text — so screen
  // readers actually announce it (content added to an existing region).
  const [live, setLive] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setLive(label), 200);
    return () => window.clearTimeout(id);
  }, [label]);

  return (
    <div className="flex min-h-[340px] flex-col items-center justify-center gap-5 px-6 py-10 text-center">
      <span className="onyx-spinner" aria-hidden="true" />
      <div>
        <p className="font-display text-[17px] font-semibold text-white">{label}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Hang tight, this only takes a moment…</p>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {live}
      </span>
    </div>
  );
}

/** Centered success state with a summary + up to two actions. */
export function SuccessView({
  title,
  message,
  rows,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  message: string;
  rows: { label: string; value: string }[];
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  // Focus the heading on mount — announces the outcome and anchors keyboard
  // users at the top of the success state.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="px-5 pb-2 pt-9">
      <div className="flex flex-col items-center text-center">
        <span className="onyx-success-badge" aria-hidden="true">
          <Check size={38} strokeWidth={3} />
        </span>
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="mt-5 font-display text-[21px] font-semibold tracking-tight text-white focus:outline-none"
        >
          {title}
        </h3>
        <p className="mt-1.5 max-w-[30ch] text-[13.5px] leading-relaxed text-muted-foreground">
          {message}
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className={`flex items-center justify-between gap-4 px-3.5 py-3 ${
              i > 0 ? "border-t border-white/[0.05]" : ""
            }`}
          >
            <span className="text-[12.5px] text-faint-foreground">{r.label}</span>
            <span className="truncate text-right text-[13.5px] font-semibold text-foreground">
              {r.value}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-2.5 pb-[max(8px,env(safe-area-inset-bottom))]">
        <button type="button" className="onyx-btn-primary w-full" onClick={onPrimary}>
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary && (
          <button type="button" className="onyx-btn-ghost w-full" onClick={onSecondary}>
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/** A selectable option row (network / bundle / method). */
export function SelectRow({
  selected,
  onClick,
  leading,
  title,
  subtitle,
  trailing,
}: {
  selected?: boolean;
  onClick: () => void;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`onyx-select ${selected ? "is-on" : ""}`}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold tracking-tight text-foreground">{title}</p>
        {subtitle && <p className="truncate text-[12px] text-faint-foreground">{subtitle}</p>}
      </div>
      {trailing}
    </button>
  );
}
