import { useCallback, useEffect, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Field, Panel, Pill, inputCls } from "@/components/admin/ui";
import { formatAdminDate } from "@/lib/admin-data";
import { loadSmsSenders, saveSmsSenders, type SmsSenders, type SmsText } from "@/lib/services";
import { textStatus } from "@/lib/smsDelivery";

/** What a text was for, in a few words. */
const what = (t: SmsText) => (t.order_reference ? `Order ${t.order_reference}${t.parts > 1 ? `, text ${t.part} of ${t.parts}` : ""}` : t.queue_kind === "agent_approved" ? "Agent approved" : t.queue_kind === "test" ? "Test" : t.queue_kind ?? "Text");

/* The sender IDs for texts that are not about data orders: result-checker PINs and "you are approved" to agents.
   Each kind has its own ID and its own switch. An ID must be approved at Vynfy before its switch is turned on. */
export default function SmsSendersPanel() {
  const [data, setData] = useState<SmsSenders | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { const r = await loadSmsSenders(); setData(r.data); }, []);
  useEffect(() => { void load(); }, [load]);
  if (!data) return null;
  const set = (patch: Partial<SmsSenders>) => setData({ ...data, ...patch });
  const save = async () => {
    setSaving(true);
    const r = await saveSmsSenders(data);
    setSaving(false);
    if (r.error || !r.data) return toast.error("Couldn’t save. A sender ID is 3 to 11 characters, and only the owner can change this.");
    toast.success("Saved."); void load();
  };
  const row = (label: string, hint: string, on: boolean, toggle: (v: boolean) => void, sender: string, setSender: (v: string) => void) => (
    <div className="rounded-xl border border-white/[0.08] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0"><p className="text-[13px] font-semibold text-foreground">{label} <Pill tone={on ? "good" : "muted"}>{on ? "on" : "off"}</Pill></p><p className="mt-0.5 text-[11.5px] leading-5 text-faint-foreground">{hint}</p></div>
        <Switch checked={on} disabled={!data.can_edit} onCheckedChange={toggle} aria-label={label} />
      </div>
      <div className="mt-2 w-44"><Field label="Sender ID"><input className={inputCls} maxLength={11} value={sender} disabled={!data.can_edit} onChange={(e) => setSender(e.target.value)} /></Field></div>
    </div>
  );
  return (
    <Panel title="SMS" icon={MessageSquareText} note={data.credits != null ? `${data.credits} credits left` : undefined}>
      <p className="mb-2 text-[11.5px] leading-5 text-faint-foreground">Turn a switch on only after Vynfy shows that sender ID as approved; until then its texts are refused. Number-verification texts use <b className="text-foreground">{data.verify_sender}</b> and are {data.verify_enabled ? "on" : "off"} (change that under Verification SMS).</p>
      <div className="grid gap-2 lg:grid-cols-2">
        {row("Send result-checker PINs by SMS", "When off, the PIN is on screen and in the buyer’s email only.", data.services_enabled, (v) => set({ services_enabled: v }), data.services_sender, (v) => set({ services_sender: v }))}
        {row("Text an agent when they are approved", "Sent once, the moment you approve their application.", data.agents_enabled, (v) => set({ agents_enabled: v }), data.agents_sender, (v) => set({ agents_sender: v }))}
      </div>
      <div className="mt-2"><Field label="Agent-approved text" hint="{name} becomes their first name. Keep it under 160 characters to use one credit.">
        <textarea className={`${inputCls} h-20 py-2 leading-5`} value={data.agent_approved_text} disabled={!data.can_edit} onChange={(e) => set({ agent_approved_text: e.target.value })} /></Field>
        <p className="mt-1 text-[11px] text-faint-foreground">{data.agent_approved_text.length} characters</p></div>
      {data.can_edit && <div className="mt-2 flex justify-end"><Button size="sm" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save SMS settings"}</Button></div>}
      {data.texts && data.texts.length > 0 ? <div className="mt-3">
        <p className="text-[13px] font-semibold text-foreground">What happened to each text</p>
        <p className="mt-0.5 text-[11.5px] leading-5 text-faint-foreground">“Sent” means Vynfy took the text. “Delivered” means the network says it reached the phone; that report comes a little later.{data.texts_today ? ` Today: ${data.texts_today.delivered} delivered, ${data.texts_today.not_delivered} not delivered, ${data.texts_today.waiting} waiting for a report${data.texts_today.refused ? `, ${data.texts_today.refused} not sent` : ""}.` : ""}</p>
        <ul className="mt-2 divide-y divide-white/[0.06] rounded-xl border border-white/[0.08]">
          {data.texts.map((t) => { const st = textStatus(t); return (
            <li key={t.id} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0"><p className="truncate text-[12.5px] font-medium text-foreground">{what(t)}</p><p className="text-[11px] text-faint-foreground">To …{t.phone_end} from {t.sender}, {formatAdminDate(t.sent_at)}{st.note ? `. ${st.note}` : ""}</p></div>
              <Pill tone={st.tone}>{st.label}</Pill>
            </li>); })}
        </ul>
      </div> : data.recent.length > 0 && <p className="mt-2 text-[11.5px] leading-5 text-faint-foreground">Last texts: {data.recent.slice(0, 5).map((t) => `${t.kind === "agent_approved" ? "agent approved" : t.kind} to …${t.phone_end} (${t.result ?? t.status})`).join(" · ")}</p>}
    </Panel>
  );
}
