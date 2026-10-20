import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, History, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Panel, Pill } from "@/components/admin/ui";
import { formatAdminDate } from "@/lib/admin-data";
import { EVENT_LABEL, loadChecks, loadHistory, type CheckRun, type HistoryRow } from "@/lib/mtn-verification-admin";

/* Admin → MTN verification → History. Every check run with its full report, and every event on held orders. */
export default function AdminMtnVerificationHistory() {
  const [checks, setChecks] = useState<CheckRun[] | null>(null);
  const [events, setEvents] = useState<HistoryRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = async () => { try { const [c, e] = await Promise.all([loadChecks(30), loadHistory(300)]); setChecks(c); setEvents(e); } catch (err) { toast.error((err as Error).message); setChecks([]); setEvents([]); } };
  useEffect(() => { void load(); }, []);
  const tone = (ev: string): "good" | "warn" | "bad" | "muted" => ev === "supplier.number_approved" || ev === "admin.mtn_send" || ev === "supplier.verification_cleared" ? "good" : ev === "admin.mtn_send_refused" || ev === "supplier.fulfillment_failed" ? "bad" : ev === "supplier.awaiting_mtn_approval" ? "warn" : "muted";

  return (
    <div className="space-y-5">
      <AdminPageHeader title="History" description="Who checked what and when, and everything that happened to held orders." action={
        <button type="button" onClick={() => void load()} className="rounded-lg border border-white/[0.1] p-1.5 text-muted-foreground hover:text-foreground" aria-label="Refresh"><RefreshCw size={14} /></button>
      } />
      <Panel title="Check runs" icon={ShieldCheck}>
        {checks === null ? <p className="py-5 text-center text-[12px] text-faint-foreground">Loading…</p> : checks.length === 0 ? <p className="py-5 text-center text-[12px] text-faint-foreground">No checks yet.</p> : (
          <ul className="divide-y divide-white/[0.06]">
            {checks.map((c) => { const isOpen = open === c.id; return (
              <li key={c.id}>
                <button type="button" onClick={() => setOpen(isOpen ? null : c.id)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-white/[0.02]">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-foreground">{formatAdminDate(c.run_at)}{c.run_by ? ` · ${c.run_by}` : ""}</p>
                    <p className="text-[11px] text-faint-foreground">{c.numbers} numbers in {c.batches} batch{c.batches === 1 ? "" : "es"} · <span className="text-success">{c.approved} approved</span> · {c.not_yet} not yet · {c.blocked} blocked{c.unknown ? ` · ${c.unknown} no answer` : ""}</p>
                  </div>
                  {isOpen ? <ChevronUp size={14} className="text-faint-foreground" /> : <ChevronDown size={14} className="text-faint-foreground" />}
                </button>
                {isOpen && (
                  <ul className="mb-2 max-h-80 divide-y divide-white/[0.05] overflow-y-auto rounded-xl border border-white/[0.08] bg-white/[0.02] px-3">
                    {c.report.map((r) => <li key={r.phone} className="flex items-center gap-2 py-1.5 text-[12px]"><span className="font-mono text-foreground">{r.phone}</span><Pill tone={r.status === "approved" ? "good" : r.status === "blocked" ? "bad" : r.status === "unknown" ? "muted" : "warn"}>{r.status.replace("_", " ")}</Pill><span className="truncate text-faint-foreground">{r.orders.join(", ")}{r.message && r.status !== "approved" ? ` · ${r.message}` : ""}</span></li>)}
                  </ul>
                )}
              </li>); })}
          </ul>
        )}
      </Panel>
      <Panel title="Timeline" icon={History} note="newest first">
        {events === null ? <p className="py-5 text-center text-[12px] text-faint-foreground">Loading…</p> : events.length === 0 ? <p className="py-5 text-center text-[12px] text-faint-foreground">Nothing yet.</p> : (
          <ul className="divide-y divide-white/[0.06]">
            {events.map((e, i) => (
              <li key={`${e.at}-${i}`} className="py-2">
                <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-foreground"><Pill tone={tone(e.event)}>{EVENT_LABEL[e.event] ?? e.event}</Pill><span className="font-mono">{e.phone}</span><span className="text-faint-foreground">{e.order_reference}</span></p>
                <p className="text-[11px] text-faint-foreground">{formatAdminDate(e.at)}{e.message ? ` · ${e.message}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
