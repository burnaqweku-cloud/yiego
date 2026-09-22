import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/* One-tap copy for an order reference. Tap the ID to copy; no long-press menu. */
export default function CopyRef({ value, className = "" }: { value: string; className?: string }) {
  const [done, setDone] = useState(false);
  const copy = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); void navigator.clipboard.writeText(value).then(() => { setDone(true); toast.success(`${value} copied`); setTimeout(() => setDone(false), 1200); }); };
  return <button type="button" onClick={copy} aria-label={`Copy ${value}`} className={`inline-flex items-center gap-1 font-mono ${className}`}>{value}{done ? <Check size={11} className="text-primary-glow" /> : <Copy size={11} className="text-faint-foreground" />}</button>;
}
