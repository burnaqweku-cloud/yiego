import { useCallback, useEffect, useState } from "react";
import { MailCheck, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Field, Panel, Pill, Row, Rows, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { formatGHS } from "@/lib/format";
import { loadFollowUps, previewFollowUp, saveFollowUpMessage, saveFollowUpSettings, type FollowUpMessage, type FollowUps } from "@/lib/followUps";

/* Follow-ups: automatic reminders (email + app notification) for people who signed up or installed the
   app but never bought, and customers who went quiet. One switch, the wording of each message, and results. */

const WHEN: Record<string, string> = {
  first_1: "1 day after signing up", first_2: "3 days after the first", first_3: "6 days after the second · carries the offer",
  back_1: "30 days after their last order", back_2: "7 days later, if they still haven’t bought · carries the offer",
};
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

export default function AdminFollowUps() {
  const [data, setData] = useState<FollowUps | null>(null);
  const [busy, setBusy] = useState(true); const [failed, setFailed] = useState(false);
  const [edit, setEdit] = useState<FollowUpMessage | null>(null); const [saving, setSaving] = useState(false);
  const [cap, setCap] = useState("80");
  const load = useCallback(async () => {
    setBusy(true);
    const r = await loadFollowUps();
    setData(r.data); setFailed(Boolean(r.error) || !r.data); setBusy(false);
    if (r.data?.settings) setCap(String(r.data.settings.daily_cap));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const on = data?.settings?.enabled ?? false;
  const saveSettings = async (enabled: boolean) => {
    const r = await saveFollowUpSettings(enabled, Number(cap) || 80);
    if (r.error || !r.data) return toast.error("Couldn’t save. Only the owner can change this.");
    toast.success(enabled !== on ? (enabled ? "Follow-ups are on. The first ones go out within half an hour, in the daytime." : "Follow-ups are off. Nothing more will be sent.") : "Saved.");
    void load();
  };
  const saveMessage = async () => {
    if (!edit) return;
    setSaving(true);
    const r = await saveFollowUpMessage(edit);
    setSaving(false);
    if (r.error || !r.data) return toast.error("Couldn’t save. Fill in every box; only the owner can change the wording.");
    toast.success("Saved."); setEdit(null); void load();
  };
  const preview = async (key: string) => {
    const r = await previewFollowUp(key);
    if (r.error || !r.data) return toast.error("Couldn’t send the preview.");
    toast.success(`Preview sent to ${r.data}. It arrives in a minute.`);
  };
  const group = (track: "first" | "back") => (data?.messages ?? []).filter((m) => m.track === track);
  const o = data?.offer;

  const list = (messages: FollowUpMessage[]) => (
    <Rows empty="No messages.">
      {messages.map((m) => <Row key={m.key} onClick={() => setEdit({ ...m })}
        primary={<>{m.subject} {m.is_offer && <Pill tone="warn">offer</Pill>}{!m.enabled && <Pill tone="muted">off</Pill>}</>}
        secondary={`${WHEN[m.key] ?? ""} · sent ${m.sent} · opened ${pct(m.opened, m.sent)} · clicked ${pct(m.clicked, m.sent)}`}
        right={`${m.bought}`} rightNote="bought after" />)}
    </Rows>
  );

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Follow-ups" description="Automatic reminders by email and app notification for people who never bought, and customers who went quiet. At most one message every 3 days per person, daytime only, and it stops the moment they buy."
        action={<Button variant="ghost" size="sm" onClick={() => void load()} disabled={busy} aria-label="Refresh" title="Refresh"><RefreshCw size={14} className={busy ? "animate-spin" : ""} /></Button>} />
      {failed ? <p role="alert" className="text-[13px] text-danger">Couldn’t load follow-ups. Tap refresh.</p> : <>
        <Panel title="Sending" icon={MailCheck}>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground">Send follow-ups <Pill tone={on ? "good" : "muted"}>{on ? "on" : "off"}</Pill></p>
              <p className="mt-0.5 text-[11.5px] leading-5 text-faint-foreground">While this is off nothing is sent. Previews to your own email still work.</p>
            </div>
            <Switch checked={on} disabled={busy || !data?.can_edit} onCheckedChange={(v) => void saveSettings(v)} aria-label="Send follow-ups" />
          </div>
          <div className="mt-3">
            <StatGrid cols={4}>
              <Stat loading={busy} label="Never bought · due now" value={data?.waiting.first ?? 0} note="signed up, no order" />
              <Stat loading={busy} label="App only · due now" value={data?.waiting.app ?? 0} note="app with no account" />
              <Stat loading={busy} label="Went quiet · due now" value={data?.waiting.back ?? 0} note="30+ days, no order" />
              <Stat loading={busy} label="Sent today" value={data?.sent_today ?? 0} note={`limit ${data?.settings?.daily_cap ?? 80} a day · ${data?.unsubscribed ?? 0} unsubscribed`} tone="good" />
            </StatGrid>
          </div>
          {data?.can_edit && <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="w-40"><Field label="Most messages a day"><input className={inputCls} inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, "").slice(0, 3))} /></Field></div>
            <Button size="sm" variant="ghost" onClick={() => void saveSettings(on)}>Save limit</Button>
          </div>}
          {o && <p className="mt-3 text-[11.5px] leading-5 text-faint-foreground">The offer in the last message: MTN 1GB for {formatGHS(o.price)} instead of {formatGHS(o.normal)}. Used {o.used} of {o.max}. Only people who were sent the offer can claim it, once, within 7 days. When all {o.max} are used the offer message stops going out.</p>}
        </Panel>

        <Panel title="Never bought" note="Signed up or has the app, no order yet · 3 messages">{list(group("first"))}</Panel>
        <Panel title="Went quiet" note="Bought before, nothing for 30 days · 2 messages">{list(group("back"))}</Panel>
      </>}

      <Modal open={edit !== null} onClose={() => setEdit(null)} label="Follow-up message">
        {edit && <div className="w-[min(94vw,540px)] space-y-2.5 p-5">
          <h2 className="text-[16px] font-semibold text-foreground">Edit message</h2>
          <p className="text-[11.5px] leading-5 text-faint-foreground">{WHEN[edit.key]}. Write {"{name}"} where the person’s first name goes{edit.is_offer ? <>, {"{offer_price}"} for the offer price and {"{normal_price}"} for the usual price</> : null}.</p>
          <Field label="Email subject"><input className={inputCls} value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></Field>
          <Field label="Heading inside the email"><input className={inputCls} value={edit.heading} onChange={(e) => setEdit({ ...edit, heading: e.target.value })} /></Field>
          <Field label="Email text" hint="Leave an empty line between paragraphs."><textarea className={`${inputCls} h-44 py-2 leading-5`} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
          <Field label="Button"><input className={inputCls} value={edit.cta_label} onChange={(e) => setEdit({ ...edit, cta_label: e.target.value })} /></Field>
          <Field label="App notification title"><input className={inputCls} value={edit.push_title} onChange={(e) => setEdit({ ...edit, push_title: e.target.value })} /></Field>
          <Field label="App notification text"><input className={inputCls} value={edit.push_body} onChange={(e) => setEdit({ ...edit, push_body: e.target.value })} /></Field>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] px-3 py-2 text-[12.5px] text-foreground">Send this message<Switch checked={edit.enabled} onCheckedChange={(v) => setEdit({ ...edit, enabled: v })} aria-label="Send this message" /></label>
          <div className="flex flex-wrap justify-between gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => void preview(edit.key)}><Send size={14} />Email me the saved version</Button>
            <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => setEdit(null)}>Cancel</Button><Button size="sm" onClick={() => void saveMessage()} disabled={saving || !data?.can_edit}>{saving ? "Saving…" : "Save"}</Button></div>
          </div>
        </div>}
      </Modal>
    </div>
  );
}
