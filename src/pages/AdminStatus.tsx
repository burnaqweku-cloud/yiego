import { useEffect, useState } from "react";
import { Activity, Clipboard } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Panel, Pill } from "@/components/admin/ui";
import { formatAdminDate } from "@/lib/admin-data";
import { loadOpsStatus, PROCESSING_DELAY_NOTE, setProcessingDelay, type OpsStatus } from "@/lib/ops-status";

/* Team-wide switches that change what we tell customers. Today: the processing-delay apology. */
const BASE = "Hello, payment for your DataYego order YG-XXXXXXXXXX has been confirmed and your data order is still being processed.";

export default function AdminStatus() {
  const [s, setS] = useState<OpsStatus | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void loadOpsStatus().then(setS); }, []);

  const toggle = async () => {
    if (!s || busy) return;
    const next = !s.processing_delay;
    setBusy(true);
    const err = await setProcessingDelay(next);
    setBusy(false);
    if (err) return toast.error("Couldn't change it. Try again.");
    setS(await loadOpsStatus());
    toast.success(next ? "Processing delay is on. Copied messages now include the apology." : "Processing delay is off.");
  };

  const on = Boolean(s?.processing_delay);
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Status" description="Team-wide switches that change what we tell customers. A change applies to every admin straight away." />
      <Panel title="Processing delay" icon={Activity} action={s ? <Pill tone={on ? "warn" : "muted"}>{on ? "On" : "Off"}</Pill> : null}>
        <div className="flex items-start justify-between gap-4">
          <p className="max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">
            Turn this on when deliveries are slow. In Orders, the message you copy for a paid order that is still processing gets an apology added at the end. Other messages don't change.
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Processing delay"
            disabled={!s || busy}
            onClick={() => void toggle()}
            className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${on ? "bg-primary" : "bg-foreground/20"}`}
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        {s?.updated_at && <p className="mt-3 text-[12px] text-faint-foreground">Last changed {formatAdminDate(s.updated_at)}{s.updated_by ? ` by ${s.updated_by}` : ""}</p>}
        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground"><Clipboard size={13} />What the copied message looks like now</p>
          <p className="text-[13px] leading-relaxed text-foreground">{BASE}{on ? <> <span className="text-amber">{PROCESSING_DELAY_NOTE}</span></> : null}</p>
        </div>
      </Panel>
    </div>
  );
}
