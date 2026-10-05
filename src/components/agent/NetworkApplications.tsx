import { useEffect, useState } from "react";
import { Check, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { p1 } from "@/components/agent/AgentShell";

/* The parent's queue of people asking to sell under them. Approve creates the store
   (awaiting payment if there's a fee); decline just records the decision. Both email the applicant. */
export interface Application { id: string; status: "pending" | "approved" | "declined" | "withdrawn"; applicant_name: string | null; applicant_email: string | null; applicant_phone: string | null; store_name: string; requested_slug: string; whatsapp: string | null; answers: Array<{ id: string; label: string; answer: string }>; decision_note: string | null; created_at: string; decided_at: string | null; agent_slug: string | null; agent_status: string | null }

export default function NetworkApplications({ onChange }: { onChange?: () => void }) {
  const [apps, setApps] = useState<Application[] | null>(null);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const load = async () => { const { data, error } = await p1().rpc("network_applications", { p_status: null }); if (error) { toast.error("Couldn't load applications."); return; } setApps((data as Application[]) ?? []); };
  useEffect(() => { void load(); }, []);
  const decide = async (a: Application, approve: boolean) => {
    if (!approve && !window.confirm(`Decline ${a.applicant_name ?? a.store_name}? They'll get an email.`)) return;
    setBusy(a.id);
    const { error } = await p1().rpc("network_application_decide", { p_id: a.id, p_approve: approve, p_note: note.trim() || null });
    setBusy(null);
    if (error) return toast.error(error.message.includes("already_an_agent") ? "This person already has a store on DataYego." : error.message.includes("already_decided") ? "Already decided." : "Couldn't save the decision.");
    toast.success(approve ? `Approved. ${a.store_name} is being set up.` : "Declined."); setNote(""); setOpen(null); void load(); onChange?.();
  };
  const d = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const list = (apps ?? []).filter((a) => tab === "all" || a.status === "pending");
  const pending = (apps ?? []).filter((a) => a.status === "pending").length;
  return (
    <div>
      <div className="mb-3 flex gap-2">{(["pending", "all"] as const).map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ${tab === t ? "bg-primary/20 text-primary-glow" : "border border-white/[0.08] text-muted-foreground"}`}>{t === "pending" ? `Waiting${pending ? ` (${pending})` : ""}` : "All"}</button>)}</div>
      {apps === null && <p className="text-[13px] text-muted-foreground">Loading…</p>}
      {apps !== null && list.length === 0 && <p className="rounded-2xl border border-dashed border-white/[0.1] p-5 text-center text-[13px] text-muted-foreground">{tab === "pending" ? "No one is waiting. Share your invite link to get applications." : "No applications yet."}</p>}
      <ul className="divide-y divide-white/[0.06]">
        {list.map((a) => (
          <li key={a.id} className="py-3">
            <button type="button" onClick={() => { setOpen(open === a.id ? null : a.id); setNote(""); }} className="flex w-full items-start justify-between gap-3 text-left">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-foreground">{a.applicant_name ?? "Applicant"} <span className="font-normal text-muted-foreground">· {a.store_name}</span></span>
                <span className="block text-[12px] text-faint-foreground">{a.requested_slug}.datayego.com · {d(a.created_at)}{a.applicant_phone ? ` · ${a.applicant_phone}` : ""}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.status === "pending" ? "bg-amber/15 text-amber" : a.status === "approved" ? "bg-primary/15 text-primary-glow" : "bg-white/[0.06] text-muted-foreground"}`}>{a.status === "pending" ? "Waiting" : a.status === "approved" ? (a.agent_status === "active" ? "Approved · active" : "Approved · unpaid") : "Declined"}</span><ChevronDown size={16} className={`text-faint-foreground transition ${open === a.id ? "rotate-180" : ""}`} /></span>
            </button>
            {open === a.id && (
              <div className="mt-3 space-y-3 rounded-2xl bg-white/[0.03] p-4">
                {a.applicant_email && <p className="text-[12.5px] text-muted-foreground">{a.applicant_email}{a.whatsapp ? ` · WhatsApp ${a.whatsapp}` : ""}</p>}
                {a.answers.filter((x) => x.answer).map((x) => <div key={x.id}><p className="text-[12px] font-semibold text-foreground">{x.label}</p><p className="mt-0.5 whitespace-pre-line text-[13px] leading-5 text-muted-foreground">{x.answer}</p></div>)}
                {a.answers.every((x) => !x.answer) && <p className="text-[12.5px] text-faint-foreground">No answers given.</p>}
                {a.status === "pending" ? (<>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="Optional note to the applicant (goes in the email)" className="onyx-field w-full resize-y" />
                  <div className="flex gap-2"><button type="button" disabled={busy === a.id} onClick={() => void decide(a, true)} className="onyx-btn-primary flex-1 py-2.5 text-[13px] disabled:opacity-60"><Check size={14} className="mr-1 inline" />Approve</button><button type="button" disabled={busy === a.id} onClick={() => void decide(a, false)} className="flex-1 rounded-full border border-white/[0.12] py-2.5 text-[13px] text-foreground disabled:opacity-60"><X size={14} className="mr-1 inline" />Decline</button></div>
                </>) : (
                  <p className="text-[12px] text-faint-foreground">{a.status === "approved" ? "Approved" : "Declined"}{a.decided_at ? ` on ${d(a.decided_at)}` : ""}{a.decision_note ? ` · "${a.decision_note}"` : ""}{a.agent_slug ? ` · store: ${a.agent_slug}` : ""}</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
