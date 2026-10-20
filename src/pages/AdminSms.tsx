import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Coins, MessageSquareText, RefreshCw, Send, Settings2, FileText } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import Switch from "@/components/admin/Switch";
import { Panel, Pill, Rows, Row, Stat, StatGrid } from "@/components/admin/ui";
import { formatAdminDate } from "@/lib/admin-data";
import { loadSmsOverview, toggleSms, SMS_KIND_LABEL, SMS_REASON_LABEL, type SmsOverview } from "@/lib/sms-admin";

/* Admin → SMS → Overview. The switch, the credits, today's numbers and anything that needs a person. */
export default function AdminSms() {
  const [o, setO] = useState<SmsOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => { try { setO(await loadSmsOverview()); setErr(null); } catch (e) { setErr((e as Error).message); } };
  useEffect(() => { void load(); const t = setInterval(() => void load(), 60_000); return () => clearInterval(t); }, []);

  const flip = async (next: boolean) => {
    if (!o || busy) return;
    const ok = window.confirm(next
      ? "Switch customer texts on? Every new paid order, delivery and MTN approval will text the customer from now on."
      : "Switch customer texts off? Nothing will be sent until it is switched on again; texts already queued stay queued.");
    if (!ok) return;
    setBusy(true);
    try { const s = await toggleSms(next); setO({ ...o, settings: s }); toast.success(next ? "Customer texts are on." : "Customer texts are off."); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const s = o?.settings; const on = Boolean(s?.enabled);
  const today = o?.today; const week = o?.week;
  const credits = s?.credits_remaining;
  const creditTone = credits == null ? "muted" : credits < 100 ? "bad" : credits < 300 ? "warn" : "good";

  return (
    <div className="space-y-6">
      <AdminPageHeader title="SMS" description="Texts customers get about their orders: paid, delivered and MTN number verified. Sent through Vynfy, delivery confirmed by the network." action={
        <button type="button" onClick={() => void load()} className="rounded-lg border border-white/[0.1] p-1.5 text-muted-foreground hover:text-foreground" aria-label="Refresh"><RefreshCw size={14} /></button>
      } />
      {err && <p className="rounded-xl border border-danger/25 bg-danger/[0.08] p-3 text-[13px] text-danger">{err}</p>}

      <Panel title="Customer texts" icon={MessageSquareText} action={s ? <Pill tone={on ? "good" : "muted"}>{on ? "On" : "Off"}</Pill> : null}>
        <div className="flex items-start justify-between gap-4">
          <p className="max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">
            The master switch. Off means nothing goes out; the separate switches for each type of text are under Settings.
            {s?.activated_at && <span className="block text-[12px] text-faint-foreground">On since {formatAdminDate(s.activated_at)}.</span>}
            {!s?.test_passed_at && <span className="block text-[12px] text-amber">A successful test text is needed before this can be switched on.</span>}
          </p>
          <Switch on={on} onChange={(n) => void flip(n)} label="Customer texts" disabled={!s || busy} />
        </div>
      </Panel>

      <StatGrid cols={4}>
        <Stat label="Vynfy credits left" value={credits == null ? "—" : credits.toLocaleString()} tone={creditTone} icon={Coins} note={s?.credits_updated_at ? `as of ${formatAdminDate(s.credits_updated_at)}` : "known after the next text"} loading={!o} />
        <Stat label="Sent today" value={today?.sent ?? "—"} note={today?.queued ? `${today.queued} queued` : "nothing queued"} icon={Send} loading={!o} />
        <Stat label="Delivered today" value={today?.delivered ?? "—"} tone="good" note="confirmed by the network" icon={CheckCircle2} loading={!o} />
        <Stat label="Needs a look" value={today ? today.failed + today.not_delivered : "—"} tone={today && today.failed + today.not_delivered > 0 ? "warn" : "muted"} note="failed or not delivered" icon={AlertTriangle} loading={!o} />
      </StatGrid>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel title="Last 7 days" icon={Send} className="min-w-0">
          <Rows empty="Nothing sent yet.">
            {[
              <Row key="sent" primary="Sent" right={week?.sent ?? 0} />,
              <Row key="del" primary="Delivered (confirmed)" right={week?.delivered ?? 0} tone="good" rightNote={week && week.sent ? `${Math.round((week.delivered / week.sent) * 100)}% of sent` : undefined} />,
              <Row key="nd" primary="Not delivered" right={week?.not_delivered ?? 0} tone={week?.not_delivered ? "bad" : "default"} />,
              <Row key="f" primary="Failed or uncertain before sending" right={week?.failed ?? 0} tone={week?.failed ? "warn" : "default"} />,
              ...(["purchase", "delivered", "verified"] as const).map((k) => <Row key={k} primary={`${SMS_KIND_LABEL[k]} texts`} right={o?.by_kind?.[k] ?? 0} />),
            ]}
          </Rows>
          <p className="mt-2 text-[11px] text-faint-foreground">Delivery is confirmed by the network and can lag the send by minutes; some texts never get a report even when they arrived.</p>
        </Panel>

        <Panel title="Needs a look" icon={AlertTriangle} className="min-w-0" action={<Link to="/admin/sms/messages?status=failed" className="text-[11.5px] font-semibold text-primary-glow hover:underline">All messages</Link>}>
          <Rows empty="Nothing needs attention.">
            {(o?.attention ?? []).map((a) => (
              <Row key={a.id} primary={`${a.phone} · ${SMS_KIND_LABEL[a.kind]} · ${a.order_reference}`}
                secondary={`${a.delivery_status ? `Network: ${a.delivery_status.replace("_", " ")}` : a.status}${a.reason ? ` – ${SMS_REASON_LABEL[a.reason] ?? a.reason}` : ""}`}
                right={formatAdminDate(a.at)} tone={a.status === "failed" || a.delivery_status ? "bad" : "warn"} />
            ))}
          </Rows>
        </Panel>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {[
          { to: "/admin/sms/messages", icon: MessageSquareText, title: "Messages", text: "Every text, its delivery result and why." },
          { to: "/admin/sms/templates", icon: FileText, title: "Templates", text: "The wording of the four texts, with a live preview and test send." },
          { to: "/admin/sms/settings", icon: Settings2, title: "Settings", text: "Sender name, which texts are on, store orders, test numbers." },
        ].map((c) => (
          <Link key={c.to} to={c.to} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 hover:bg-white/[0.04]">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground"><c.icon size={14} className="text-primary-glow" />{c.title}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{c.text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
