import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import type { ServicePin } from "@/lib/services";

/* One checker: its serial number and PIN, each with a copy button. */
function Line({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { toast.error("Couldn't copy. Press and hold the number instead."); }
  };
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-2.5">
      <div className="min-w-0"><p className="text-[11.5px] text-muted-foreground">{label}</p><p className="select-all break-all font-mono text-[16px] font-semibold tracking-wide text-foreground">{value}</p></div>
      <button type="button" onClick={() => void copy()} aria-label={`Copy ${label.toLowerCase()}`} className="onyx-iconbtn shrink-0 rounded-xl text-primary-glow">{copied ? <Check size={17} /> : <Copy size={17} />}</button>
    </div>
  );
}

export default function PinCard({ pin, index, total }: { pin: ServicePin; index: number; total: number }) {
  return (
    <div className="rounded-2xl border border-primary-glow/25 bg-primary/[0.06] px-4 py-1.5">
      {total > 1 && <p className="pt-2 text-[12px] font-semibold text-primary-glow">Checker {index + 1} of {total}</p>}
      <div className="divide-y divide-white/[0.08]"><Line label="Serial number" value={pin.serial} /><Line label="PIN" value={pin.pin} /></div>
    </div>
  );
}
