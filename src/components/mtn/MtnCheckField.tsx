import { useEffect, useRef, useState } from "react";
import { Check, Clock, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { checkNumbers, isMtn, isValidGh, normalizeGh, STATUS_COPY, SUBMIT_COPY, submitNumbers, type CheckResult } from "@/lib/mtnCheck";

/* One field. Checks itself as soon as a full number is typed; colours the field;
   offers "Submit for verification" on numbers MTN hasn't approved yet. */
export default function MtnCheckField({ source, placeholder = "Enter MTN number", compact = false, onResult }: { source: "shop" | "checker" | "checkout"; placeholder?: string; compact?: boolean; onResult?: (r: CheckResult | null) => void }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitNote, setSubmitNote] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const n = normalizeGh(value);
    setSubmitNote(null);
    if (n.length < 10) { setResult(null); onResult?.(null); return; }
    const mine = ++seq.current;
    if (!isValidGh(n)) { const r: CheckResult = { msisdn: n, status: "invalid", message: null, submitted: null }; setResult(r); onResult?.(r); return; }
    if (!isMtn(n)) { const r: CheckResult = { msisdn: n, status: "not_mtn", message: null, submitted: null }; setResult(r); onResult?.(r); return; }
    setChecking(true);
    const t = setTimeout(() => {
      checkNumbers([n]).then((rs) => { if (mine !== seq.current) return; const r = rs[0] ?? null; setResult(r); onResult?.(r); })
        .catch(() => { if (mine === seq.current) toast.error("Couldn't check that number right now."); })
        .finally(() => { if (mine === seq.current) setChecking(false); });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const submit = async () => {
    if (!result) return;
    setSubmitting(true);
    try { const [o] = await submitNumbers([result.msisdn], source === "shop" ? "shop" : "checker"); setSubmitNote(SUBMIT_COPY[o.outcome]); if (o.outcome === "already_approved") setResult({ ...result, status: "approved" }); else setResult({ ...result, status: "unapproved", submitted: new Date().toISOString() }); }
    catch { toast.error("Couldn't submit right now. Please try again."); }
    finally { setSubmitting(false); }
  };

  const copy = result ? STATUS_COPY[result.status] : null;
  const tone = copy?.tone;
  const border = tone === "ok" ? "border-primary-glow/60 ring-1 ring-primary-glow/30" : tone === "wait" ? "border-amber/60 ring-1 ring-amber/30" : tone === "bad" ? "border-danger/60 ring-1 ring-danger/30" : "";
  const Icon = tone === "ok" ? Check : tone === "wait" ? Clock : tone === "bad" ? X : null;
  const color = tone === "ok" ? "text-primary-glow" : tone === "wait" ? "text-amber" : "text-danger";
  const canSubmit = result?.status === "not_approved";

  return (
    <div className="min-w-0">
      <div className="relative">
        <input value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d+ ]/g, "").slice(0, 14))} inputMode="numeric" autoComplete="tel" placeholder={placeholder} aria-label="MTN number to check" className={`onyx-field w-full pr-10 text-[15px] tracking-wide transition ${border}`} />
        <span className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${color}`}>{checking ? <Loader2 size={17} className="animate-spin text-faint-foreground" /> : Icon ? <Icon size={18} /> : null}</span>
      </div>
      {copy && !checking && (
        <div className={`mt-2 ${compact ? "text-[12px] leading-5" : "text-[12.5px] leading-5"}`}>
          <p className={`font-semibold ${color}`}>{copy.title}</p>
          <p className="text-muted-foreground">{submitNote ?? copy.text}</p>
          {canSubmit && !submitNote && <button type="button" disabled={submitting} onClick={() => void submit()} className="mt-1.5 text-[12.5px] font-semibold text-primary-glow disabled:opacity-60">{submitting ? "Submitting…" : "Submit this number for MTN verification →"}</button>}
          {result?.status === "unapproved" && result.submitted && !submitNote && <p className="mt-1 text-[11.5px] text-faint-foreground">Submitted {new Date(result.submitted).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}. We re-check with MTN every hour.</p>}
        </div>
      )}
    </div>
  );
}
