import { useState } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { p1, useAgent } from "@/components/agent/AgentShell";

/* What the parent asks applicants, and whether approval is automatic.
   Saved through network_set_application_settings, which cleans and caps everything. */
export type Question = { id?: string; label: string; type: "text" | "textarea" | "select" | "phone" | "email"; required: boolean; options: string[] };
const TYPES: Array<[Question["type"], string]> = [["text", "Short answer"], ["textarea", "Long answer"], ["select", "Choose one"], ["phone", "Phone number"], ["email", "Email"]];

export default function NetworkQuestions() {
  const { agent, reload } = useAgent();
  const a = agent as unknown as { network_auto_approve?: boolean; network_questions?: Question[] };
  const [auto, setAuto] = useState(a.network_auto_approve ?? false);
  const [qs, setQs] = useState<Question[]>((a.network_questions ?? []).map((q) => ({ ...q, options: q.options ?? [] })));
  const [busy, setBusy] = useState(false);
  const upd = (i: number, patch: Partial<Question>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= qs.length) return; const n = [...qs]; [n[i], n[j]] = [n[j], n[i]]; setQs(n); };
  const save = async () => {
    for (const q of qs) { if (!q.label.trim()) return toast.error("Every question needs a label."); if (q.type === "select" && q.options.filter((o) => o.trim()).length < 2) return toast.error(`"${q.label}" needs at least two options.`); }
    setBusy(true);
    const { data, error } = await p1().rpc("network_set_application_settings", { p_auto_approve: auto, p_questions: qs.map((q) => ({ ...q, options: q.options.filter((o) => o.trim()) })) });
    setBusy(false);
    if (error) return toast.error(error.message.includes("max_10") ? "Up to 10 questions." : error.message.replace(/_/g, " "));
    setQs((data as { questions: Question[] }).questions); toast.success("Application settings saved."); void reload();
  };
  return (
    <div className="space-y-4">
      <label className="flex items-start justify-between gap-3 rounded-2xl bg-white/[0.03] p-4">
        <span><span className="block text-[14px] font-semibold text-foreground">Approve automatically</span><span className="block text-[12.5px] text-muted-foreground">{auto ? "Anyone who applies gets a store at once (after paying your fee, if you charge one). You still see their answers." : "You review each application and approve or decline it. Applicants are emailed either way."}</span></span>
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="mt-1 h-5 w-5" />
      </label>
      <div>
        <p className="text-[13px] font-semibold text-foreground">Questions applicants answer</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Name, phone, email and the store name are always asked. Add up to 10 of your own.</p>
        <ul className="mt-3 space-y-3">
          {qs.map((q, i) => (
            <li key={i} className="rounded-2xl border border-white/[0.08] p-3">
              <div className="flex items-start gap-2">
                <div className="flex flex-col pt-1 text-faint-foreground"><button type="button" onClick={() => move(i, -1)} aria-label="Move up" className="leading-none">▲</button><GripVertical size={14} className="my-0.5" /><button type="button" onClick={() => move(i, 1)} aria-label="Move down" className="leading-none">▼</button></div>
                <div className="min-w-0 flex-1 space-y-2">
                  <input value={q.label} onChange={(e) => upd(i, { label: e.target.value })} maxLength={160} placeholder="Question" className="onyx-field w-full" />
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={q.type} onChange={(e) => upd(i, { type: e.target.value as Question["type"] })} className="onyx-field !py-1.5 text-[12.5px]">{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><input type="checkbox" checked={q.required} onChange={(e) => upd(i, { required: e.target.checked })} />Required</label>
                    <button type="button" onClick={() => setQs(qs.filter((_, j) => j !== i))} aria-label="Remove question" className="ml-auto text-faint-foreground hover:text-danger"><Trash2 size={15} /></button>
                  </div>
                  {q.type === "select" && <div className="space-y-1.5">{q.options.map((o, k) => <div key={k} className="flex gap-2"><input value={o} onChange={(e) => upd(i, { options: q.options.map((x, m) => (m === k ? e.target.value : x)) })} maxLength={60} placeholder={`Option ${k + 1}`} className="onyx-field w-full !py-1.5 text-[13px]" /><button type="button" onClick={() => upd(i, { options: q.options.filter((_, m) => m !== k) })} aria-label="Remove option" className="text-faint-foreground"><Trash2 size={13} /></button></div>)}{q.options.length < 8 && <button type="button" onClick={() => upd(i, { options: [...q.options, ""] })} className="text-[12.5px] font-semibold text-primary-glow">+ Add option</button>}</div>}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {qs.length < 10 && <button type="button" onClick={() => setQs([...qs, { label: "", type: "text", required: false, options: [] }])} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-primary-glow"><Plus size={14} />Add a question</button>}
      </div>
      <div className="flex justify-end"><button type="button" disabled={busy} onClick={() => void save()} className="onyx-btn-primary px-5 py-2.5 text-[13.5px] disabled:opacity-60">{busy ? "Saving…" : "Save"}</button></div>
    </div>
  );
}
