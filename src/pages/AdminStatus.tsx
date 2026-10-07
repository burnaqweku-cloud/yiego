import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Clipboard, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Panel, Pill } from "@/components/admin/ui";
import { formatAdminDate } from "@/lib/admin-data";
import { loadClientErrors, loadOpsStatus, PROCESSING_DELAY_NOTE, setProcessingDelay, type ClientError, type OpsStatus } from "@/lib/ops-status";

/* Team-wide switches that change what we tell customers. Today: the processing-delay apology. */
const BASE = "Hello, payment for your DataYego order YG-XXXXXXXXXX has been confirmed and your data order is still being processed.";

export default function AdminStatus() {
  const [s, setS] = useState<OpsStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<ClientError[] | null>(null);
  const [hours, setHours] = useState(48);
  useEffect(() => { void loadOpsStatus().then(setS); }, []);
  useEffect(() => { setErrs(null); void loadClientErrors(hours).then(setErrs); }, [hours]);

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

      <Panel title="Front-end failures" icon={AlertTriangle} action={<div className="flex items-center gap-2">
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="rounded-lg border border-white/[0.1] bg-transparent px-2 py-1 text-[12px] text-foreground">{[6, 24, 48, 168].map((h) => <option key={h} value={h} className="bg-[#0f1613]">{h < 48 ? `Last ${h}h` : `Last ${h / 24} days`}</option>)}</select>
        <button type="button" onClick={() => { setErrs(null); void loadClientErrors(hours).then(setErrs); }} className="rounded-lg border border-white/[0.1] p-1.5 text-muted-foreground hover:text-foreground" aria-label="Refresh"><RefreshCw size={13} /></button>
      </div>}>
        <p className="max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">Every time a page gives up loading (bundles not loading, plans unreachable) the phone reports it here, whoever was signed in. The connection column is what the phone itself reported.</p>
        {errs === null ? <p className="mt-3 text-[12.5px] text-faint-foreground">Loading…</p> : errs.length === 0 ? <p className="mt-3 text-[12.5px] text-faint-foreground">Nothing reported in this window.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead><tr className="text-[11px] uppercase tracking-wide text-faint-foreground"><th className="py-1.5 pr-3">When</th><th className="py-1.5 pr-3">Page</th><th className="py-1.5 pr-3">What</th><th className="py-1.5 pr-3">Who</th><th className="py-1.5 pr-3">Connection</th><th className="py-1.5">Message</th></tr></thead>
              <tbody>{errs.map((e) => { const net = e.context?.net as { type?: string; downlink?: number; rtt?: number } | undefined; return (
                <tr key={e.id} className="border-t border-white/[0.06] align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">{formatAdminDate(e.at)}</td>
                  <td className="py-2 pr-3 text-foreground">{e.page}</td>
                  <td className="py-2 pr-3 text-foreground">{e.source}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{e.email ?? "signed out"}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">{net?.type ? `${net.type}${net.downlink != null ? ` · ${net.downlink} Mb/s` : ""}${net.rtt != null ? ` · ${net.rtt} ms` : ""}` : e.context?.online === false ? "offline" : "—"}</td>
                  <td className="max-w-[40ch] break-words py-2 text-muted-foreground">{e.message}{e.context?.build ? <span className="block text-[11px] text-faint-foreground">build {String(e.context.build)}</span> : null}</td>
                </tr>); })}</tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
