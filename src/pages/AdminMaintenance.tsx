import { useEffect, useState } from "react";
import { Eye, Loader2, Mail, Save, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { MaintenanceNotice } from "@/components/layout/MaintenanceGate";
import { useAuth } from "@/store/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { loadMaintenance, loadMaintenanceAnnouncements, saveMaintenance, sendMaintenanceEmailBatch, type MaintenanceEmailProgress } from "@/lib/maintenance";
import { DEFAULT_MAINTENANCE, type MaintenanceSettings } from "@/lib/maintenancePolicy";

export default function AdminMaintenance() {
  const { user } = useAuth();
  const [draft, setDraft] = useState(DEFAULT_MAINTENANCE);
  const [saved, setSaved] = useState(DEFAULT_MAINTENANCE);
  const [ready, setReady] = useState(false);
  const [master, setMaster] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mail, setMail] = useState<MaintenanceEmailProgress | null>(null);
  const [mailing, setMailing] = useState(false);
  const [mailError, setMailError] = useState("");
  const [latestId, setLatestId] = useState("");
  const runEmails = async (id: string) => {
    if (!id || mailing) return;
    setMailing(true); setMailError("");
    try {
      for (let i = 0; i < 400; i++) {
        const p = await sendMaintenanceEmailBatch(id);
        setMail(p);
        if (p.pending === 0 && p.sending === 0) break;
        if (p.rateLimited) await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (e) { setMailError(e instanceof Error ? e.message : "Email sending stopped."); }
    finally { setMailing(false); }
  };
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const next = await loadMaintenance();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as unknown as { schema: (s: string) => any }).schema("phase1").rpc("admin_role", { p_user: user?.id });
        const latest = (await loadMaintenanceAnnouncements().catch(() => []))[0];
        if (live) { setDraft(next); setSaved(next); setMaster(data === "master"); setLatestId(latest?.id ?? ""); setReady(true); }
      } catch { if (live) { setFailed(true); setReady(true); } }
    })();
    return () => { live = false; };
  }, [user?.id]);
  const patch = (value: Partial<MaintenanceSettings>) => setDraft((d) => ({ ...d, ...value }));
  const save = async () => {
    if (!user || !master || busy) return;
    if (!draft.title.trim() || !draft.reason.trim() || !draft.blocked_message.trim()) return toast.error("Enter a title, reason and unavailable-service message.");
    const switching = draft.enabled !== saved.enabled;
    if (draft.enabled && !saved.enabled && !window.confirm("Enable maintenance for all customers and agents? Browsing and order tracking will remain available, and every user will be emailed.")) return;
    if (!draft.enabled && saved.enabled && !window.confirm("Turn maintenance off? Every user will be emailed that service is back.")) return;
    setBusy(true);
    try { const next = await saveMaintenance(user.id, draft); setSaved(next); setDraft(next);
      if (switching) { const id = `maintenance:${next.revision}`; setLatestId(id); setMail(null); void runEmails(id); }
      toast.success(next.enabled ? "Maintenance enabled. Customers can browse and track orders only." : "Maintenance is off. Normal services are available."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save maintenance."); }
    finally { setBusy(false); }
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  if (!ready) return <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin text-amber" /></div>;
  return <div className="space-y-7">
    <AdminPageHeader title="Maintenance" description="Service availability and customer notice" />
    {failed && <p role="alert" className="text-danger">Could not load maintenance. Reload before making changes.</p>}
    <div className="flex flex-wrap items-center justify-between gap-4 border-y border-border py-5"><div className="flex items-start gap-3"><Wrench className="mt-1 text-amber" /><div><h2 className="font-display text-lg font-semibold">Maintenance is {saved.enabled ? "on" : "off"}</h2><p className="mt-1 text-sm text-muted-foreground">{saved.enabled ? "Customers and agents have read-only access." : "Customers can use available services normally."}</p></div></div><div className="flex items-center gap-3"><label htmlFor="maintenance-toggle" className="text-sm font-semibold">{draft.enabled ? "On" : "Off"}</label><Switch id="maintenance-toggle" checked={draft.enabled} disabled={!master || busy || failed} onCheckedChange={(enabled) => patch({ enabled })} /></div></div>
    {!master && <p className="text-sm text-muted-foreground">All administrators can view this page. Only the master administrator can change maintenance.</p>}
    <fieldset disabled={!master || busy || failed} className="max-w-3xl space-y-5 disabled:opacity-70">
      <label className="block space-y-2"><span className="text-sm font-semibold">Notice title</span><input className="onyx-field" maxLength={120} value={draft.title} onChange={(e) => patch({ title: e.target.value })} /></label>
      <label className="block space-y-2"><span className="text-sm font-semibold">Reason for maintenance</span><textarea className="onyx-field min-h-36 resize-y" maxLength={2000} value={draft.reason} onChange={(e) => patch({ reason: e.target.value })} /><span className="block text-right text-xs text-muted-foreground">{draft.reason.length}/2000</span></label>
      <label className="block space-y-2"><span className="text-sm font-semibold">Expected return / update (optional)</span><input className="onyx-field" maxLength={200} placeholder="e.g. Next update at 4 PM Ghana time" value={draft.eta} onChange={(e) => patch({ eta: e.target.value })} /></label>
      <label className="block space-y-2"><span className="text-sm font-semibold">Message when a service is unavailable</span><textarea className="onyx-field min-h-24 resize-y" maxLength={300} value={draft.blocked_message} onChange={(e) => patch({ blocked_message: e.target.value })} /></label>
      <label className="block space-y-2"><span className="text-sm font-semibold">Service-restored title</span><input className="onyx-field" maxLength={120} value={draft.restored_title} onChange={(e) => patch({ restored_title: e.target.value })} /></label>
      <label className="block space-y-2"><span className="text-sm font-semibold">Service-restored message</span><textarea className="onyx-field min-h-24 resize-y" maxLength={2000} value={draft.restored_message} onChange={(e) => patch({ restored_message: e.target.value })} /></label>
    </fieldset>
    <div className="flex flex-wrap items-center gap-3"><Button onClick={() => void save()} disabled={!master || !dirty || busy || failed}>{busy ? <Loader2 className="animate-spin" /> : <Save />}Save maintenance</Button><Button variant="ghost" onClick={() => setPreview(true)}><Eye />Preview customer notice</Button>{dirty && <span className="text-xs text-amber">Unsaved changes</span>}</div>
    <div className="max-w-3xl space-y-2 border-t border-border pt-5 text-sm"><p>Switching on or off saves a notice for everyone’s notification bell, including agent and sub-agent storefronts.</p><p className="text-muted-foreground">Switching on or off also emails every user (not sub-agents) once. Keep this page open until sending finishes.</p>
      {(mail || mailing || mailError) && <div className="rounded-xl border border-border p-4" aria-live="polite">
        <p className="font-semibold">{mailing ? <><Loader2 className="mr-2 inline size-4 animate-spin" />Sending emails…</> : mail && mail.pending + mail.sending === 0 ? "Emails finished" : "Email sending paused"}</p>
        {mail && <p className="mt-1 text-muted-foreground">{mail.sent} of {mail.total} sent{mail.failed ? ` · ${mail.failed} could not be delivered` : ""}{mail.pending + mail.sending ? ` · ${mail.pending + mail.sending} waiting` : ""}</p>}
        {mailError && <p role="alert" className="mt-1 text-danger">{mailError}</p>}
      </div>}
      {master && latestId && !mailing && <Button variant="outline" size="sm" onClick={() => void runEmails(latestId)}><Mail />{mail && mail.pending + mail.sending === 0 ? "Check email status" : "Send / continue latest notice email"}</Button>}</div>
    <div className="max-w-3xl border-t border-border pt-5 text-sm leading-7 text-muted-foreground"><h3 className="font-semibold text-foreground">While maintenance is active</h3><ul className="mt-2 list-disc space-y-1 pl-5"><li>The full-page notice appears on arrival and every reload, including store links.</li><li>Closing it allows browsing, signing in, viewing details and tracking orders.</li><li>Purchases, top-ups, withdrawals and business changes are paused.</li><li>Verified administrators remain exempt; already-paid orders continue processing.</li><li>Saving does not turn maintenance on unless the switch is set to On.</li></ul></div>
    {saved.revision && <p className="text-xs text-muted-foreground">Last saved {new Intl.DateTimeFormat("en-GH", { timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short" }).format(new Date(saved.revision))} · Ghana time</p>}
    {preview && <MaintenanceNotice settings={draft} onClose={() => setPreview(false)} />}
  </div>;
}