import { useCallback, useEffect, useState } from "react";
import { BellRing, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Panel, Pill, Row, Rows, Stat, StatGrid } from "@/components/admin/ui";
import { formatAdminDate } from "@/lib/admin-data";
import { loadPushOverview, savePushSettings, sendPushTest, type PushOverview, type PushSettings } from "@/lib/push";

/* Phone notifications in the Android app: the main switch, one switch per kind, a test to the
   admin's own phone, and what was sent lately. Only the owner can change the switches. */

const KINDS: { key: Exclude<keyof PushSettings, "enabled">; label: string; hint: string }[] = [
  { key: "order_paid", label: "Payment received", hint: "When an order is paid for." },
  { key: "order_delivered", label: "Data delivered", hint: "When the data lands." },
  { key: "order_refunded", label: "Order refunded", hint: "When money goes back." },
  { key: "announcements", label: "Announcements", hint: "When you post one here." },
];
const KIND_LABEL: Record<string, string> = { order_paid: "Payment", order_delivered: "Delivered", order_refunded: "Refund", announcement: "Announcement", test: "Test", campaign: "Follow-up", alert: "Alert to admins" };
const OFF: PushSettings = { enabled: false, order_paid: true, order_delivered: true, order_refunded: true, announcements: true };

export default function PushCard() {
  const [data, setData] = useState<PushOverview | null>(null);
  const [busy, setBusy] = useState(true); const [failed, setFailed] = useState(false); const [testing, setTesting] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    const r = await loadPushOverview();
    setData(r.data); setFailed(Boolean(r.error) || !r.data); setBusy(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const settings = data?.settings ?? OFF;
  const change = async (patch: Partial<PushSettings>) => {
    if (!data) return;
    const next = { ...settings, ...patch };
    setData({ ...data, settings: next });
    const r = await savePushSettings(next);
    if (r.error || !r.data) { toast.error("Couldn’t save. Only the owner can change this."); void load(); }
    else toast.success(patch.enabled === undefined ? "Saved." : next.enabled ? "Notifications are on." : "Notifications are off.");
  };
  const test = async () => {
    setTesting(true);
    const r = await sendPushTest();
    setTesting(false);
    if (r.error) return toast.error("Couldn’t send the test.");
    if (!r.data) return toast.error("No phone found for your account. Open the DataYego app, sign in with this account and turn on notifications first.");
    toast.success(`Test sent to ${r.data} phone${r.data === 1 ? "" : "s"}. It should arrive in a few seconds.`);
    setTimeout(() => void load(), 4000);
  };

  return (
    <Panel title="Phone notifications" icon={BellRing} action={<Button variant="ghost" size="sm" onClick={() => void load()} disabled={busy} aria-label="Refresh notifications" title="Refresh"><RefreshCw size={14} className={busy ? "animate-spin" : ""} /></Button>}>
      {failed ? <p role="alert" className="py-3 text-[12px] text-danger">Couldn’t load notifications. Tap refresh.</p> : <>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground">Send notifications to the app <Pill tone={settings.enabled ? "good" : "muted"}>{settings.enabled ? "on" : "off"}</Pill></p>
            <p className="mt-0.5 text-[11.5px] leading-5 text-faint-foreground">While this is off nothing is sent to customers. The test below still works.</p>
          </div>
          <Switch checked={settings.enabled} disabled={busy || !data?.can_edit} onCheckedChange={(v) => void change({ enabled: v })} aria-label="Send notifications to the app" />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {KINDS.map((k) => (
            <div key={k.key} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] px-3 py-2">
              <div className="min-w-0"><p className="text-[12.5px] font-medium text-foreground">{k.label}</p><p className="text-[11px] text-faint-foreground">{k.hint}</p></div>
              <Switch checked={settings[k.key]} disabled={busy || !data?.can_edit} onCheckedChange={(v) => void change({ [k.key]: v })} aria-label={k.label} />
            </div>
          ))}
        </div>
        <div className="mt-3">
          <StatGrid cols={3}>
            <Stat loading={busy} label="Phones that get notifications" value={data?.phones ?? 0} note={`${data?.phones_signed_in ?? 0} signed in`} tone="good" />
            <Stat loading={busy} label="Delivered today" value={data?.sent_today ?? 0} />
            <Stat loading={busy} label="Your phones" value={data?.my_phones ?? 0} note="signed in with this account" />
          </StatGrid>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void test()} disabled={testing || busy}><Send size={14} />{testing ? "Sending…" : "Send a test to my phone"}</Button>
          <p className="text-[11.5px] text-faint-foreground">Goes only to phones signed in with your account.</p>
        </div>
        {data && data.recent.length > 0 && <div className="mt-3">
          <p className="mb-1 text-[11px] text-faint-foreground">Last sent</p>
          <Rows empty="">
            {data.recent.slice(0, 8).map((n) => <Row key={n.id} primary={<>{n.title} <Pill tone={n.status === "sent" ? "good" : n.status === "failed" ? "bad" : "muted"}>{n.status === "sent" ? "sent" : n.status === "failed" ? "not sent" : "waiting"}</Pill></>}
              secondary={`${KIND_LABEL[n.kind] ?? n.kind} · ${formatAdminDate(n.sent_at ?? n.created_at)}${n.status === "failed" && n.error ? ` · ${n.error}` : ""}`} right={`${n.delivered ?? 0}/${n.recipients ?? 0}`} rightNote="phones" />)}
          </Rows>
        </div>}
      </>}
    </Panel>
  );
}
