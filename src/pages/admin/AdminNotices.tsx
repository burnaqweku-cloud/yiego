import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAdmin, type SiteNotice } from '@/contexts/AdminContext';
import { useAuth } from '@/hooks/useAuth';
import { NETWORKS } from '@/data/bundles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Bell, Info, AlertTriangle, AlertOctagon, CheckCircle2,
  Sparkles, Calendar, Eye, Power, Send, Save,
} from 'lucide-react';
import { toast } from 'sonner';
import SiteNoticeBanner from '@/components/layout/SiteNoticeBanner';
import { getNoticeStatus, isoToDatetimeLocal, datetimeLocalToIso } from '@/lib/site-notice';

const severityOptions: { value: SiteNotice['severity']; label: string; icon: typeof Info; tone: string }[] = [
  { value: 'info',    label: 'Info',    icon: Info,          tone: 'text-sky-600' },
  { value: 'success', label: 'Success', icon: CheckCircle2,  tone: 'text-emerald-600' },
  { value: 'warning', label: 'Warning', icon: AlertTriangle, tone: 'text-amber-600' },
  { value: 'outage',  label: 'Outage',  icon: AlertOctagon,  tone: 'text-rose-600' },
];

const statusBadgeStyle: Record<string, string> = {
  live:      'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  scheduled: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  expired:   'bg-muted text-muted-foreground border-border',
  draft:     'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  disabled:  'bg-muted text-muted-foreground border-border',
};

const statusLabel: Record<string, string> = {
  live: 'Live now',
  scheduled: 'Scheduled',
  expired: 'Expired',
  draft: 'Draft',
  disabled: 'Disabled',
};

const Section = ({ title, icon: Icon, children, hint }: {
  title: string;
  icon: typeof Bell;
  children: React.ReactNode;
  hint?: string;
}) => (
  <section className="bg-card rounded-2xl border border-border overflow-hidden">
    <header className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border bg-muted/30">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold text-sm leading-tight">{title}</h3>
        {hint && <p className="text-[11px] text-muted-foreground leading-tight">{hint}</p>}
      </div>
    </header>
    <div className="p-5 space-y-4">{children}</div>
  </section>
);

const AdminNotices = () => {
  const { siteNotice, updateSiteNotice } = useAdmin();
  const { user, isAdminOrStaff, loading } = useAuth();
  const navigate = useNavigate();

  // Local edit buffer (so admin can tweak before saving)
  const [draft, setDraft] = useState<SiteNotice>(siteNotice);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdminOrStaff)) navigate('/auth');
  }, [user, isAdminOrStaff, loading, navigate]);

  // Sync incoming realtime updates into the draft when the admin hasn't dirtied it
  useEffect(() => { setDraft(siteNotice); }, [siteNotice.id]);

  const status = useMemo(() => getNoticeStatus(draft), [draft]);

  const setField = <K extends keyof SiteNotice>(key: K, value: SiteNotice[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  if (loading || !user || !isAdminOrStaff) return null;

  const persist = async (overrides?: Partial<SiteNotice>) => {
    setSaving(true);
    try {
      await updateSiteNotice({ ...draft, ...overrides });
      toast.success('Notice saved');
    } catch (e) {
      toast.error('Could not save notice');
    } finally {
      setSaving(false);
    }
  };

  const handlePublishNow = async () => {
    if (!draft.title?.trim()) {
      toast.error('Add a title first');
      return;
    }
    setDraft((d) => ({ ...d, enabled: true }));
    await persist({ enabled: true });
  };

  const handleDisable = async () => {
    setDraft((d) => ({ ...d, enabled: false }));
    await persist({ enabled: false });
  };

  const SeverityIcon = severityOptions.find((s) => s.value === draft.severity)?.icon || Info;
  const charCount = draft.message?.length || 0;

  return (
    <AdminLayout>
      <div className="space-y-5 max-w-3xl pb-12">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-2xl font-display font-bold flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Service Notices
            </h2>
            <p className="text-muted-foreground text-sm">Publish premium platform-wide announcements.</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${statusBadgeStyle[status.state]}`}>
            <span className="relative flex h-1.5 w-1.5">
              {status.state === 'live' && (
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-500 animate-ping" />
              )}
              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                status.state === 'live' ? 'bg-emerald-500' :
                status.state === 'scheduled' ? 'bg-sky-500' :
                status.state === 'draft' ? 'bg-amber-500' : 'bg-muted-foreground'
              }`} />
            </span>
            {statusLabel[status.state]}
          </span>
        </div>

        {/* Status panel */}
        <div className="bg-gradient-to-br from-primary/5 to-card rounded-2xl border border-border p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Power className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{statusLabel[status.state]}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{status.reason}</p>
            </div>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(enabled) => setField('enabled', enabled)}
              aria-label="Enable banner"
            />
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button size="sm" onClick={handlePublishNow} disabled={saving} className="gap-1.5">
              <Send className="w-3.5 h-3.5" /> Publish now
            </Button>
            <Button size="sm" variant="outline" onClick={() => persist()} disabled={saving} className="gap-1.5">
              <Save className="w-3.5 h-3.5" /> Save changes
            </Button>
            {draft.enabled && (
              <Button size="sm" variant="ghost" onClick={handleDisable} disabled={saving} className="gap-1.5 text-muted-foreground">
                <Power className="w-3.5 h-3.5" /> Disable
              </Button>
            )}
          </div>
        </div>

        {/* Live preview */}
        <Section title="Live Preview" icon={Eye} hint="Exactly how users see it on supported pages.">
          {draft.title?.trim() ? (
            <div className="rounded-xl overflow-hidden border border-border">
              <SiteNoticeBanner preview notice={draft} dismissible={false} />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              Add a title to see the preview.
            </div>
          )}
        </Section>

        {/* Content */}
        <Section title="Notice Content" icon={Sparkles}>
          <div>
            <Label className="text-xs">Severity</Label>
            <Select value={draft.severity} onValueChange={(v) => setField('severity', v as SiteNotice['severity'])}>
              <SelectTrigger className="mt-1">
                <SelectValue>
                  <span className="flex items-center gap-2">
                    <SeverityIcon className={`w-4 h-4 ${severityOptions.find(s => s.value === draft.severity)?.tone}`} />
                    {severityOptions.find((s) => s.value === draft.severity)?.label}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {severityOptions.map((s) => {
                  const I = s.icon;
                  return (
                    <SelectItem key={s.value} value={s.value}>
                      <span className="flex items-center gap-2">
                        <I className={`w-4 h-4 ${s.tone}`} />
                        {s.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Title</Label>
            <Input
              value={draft.title}
              onChange={(e) => setField('title', e.target.value)}
              placeholder="e.g. MTN Service Delay"
              className="mt-1"
              maxLength={80}
            />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">{draft.title.length}/80</p>
          </div>

          <div>
            <Label className="text-xs">Message</Label>
            <Textarea
              value={draft.message}
              onChange={(e) => setField('message', e.target.value)}
              placeholder="Brief, clear explanation. Long messages auto-collapse with a Show more action on the user side."
              className="mt-1"
              rows={3}
              maxLength={500}
            />
            <p className={`text-[10px] mt-1 text-right ${charCount > 450 ? 'text-amber-600' : 'text-muted-foreground'}`}>
              {charCount}/500 {charCount > 140 && '· will collapse on mobile'}
            </p>
          </div>

          <div>
            <Label className="text-xs">Affected Network</Label>
            <Select value={draft.affected_network} onValueChange={(v) => setField('affected_network', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Networks</SelectItem>
                {NETWORKS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Section>

        {/* Schedule */}
        <Section
          title="Schedule"
          icon={Calendar}
          hint="Leave both empty to publish immediately when enabled."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Start Time (optional)</Label>
              <Input
                type="datetime-local"
                value={isoToDatetimeLocal(draft.start_time)}
                onChange={(e) => setField('start_time', datetimeLocalToIso(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">End Time (optional)</Label>
              <Input
                type="datetime-local"
                value={isoToDatetimeLocal(draft.end_time)}
                onChange={(e) => setField('end_time', datetimeLocalToIso(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>
          <div className="rounded-lg bg-muted/40 border border-border p-3 text-[11px] text-muted-foreground space-y-1">
            <p><strong className="text-foreground">No schedule:</strong> Live immediately when enabled.</p>
            <p><strong className="text-foreground">Start only:</strong> Goes live at the start time.</p>
            <p><strong className="text-foreground">End only:</strong> Live now until the end time.</p>
            <p><strong className="text-foreground">Both:</strong> Live only within the window.</p>
          </div>
        </Section>

        {/* Sticky save bar on mobile */}
        <div className="sticky bottom-3 z-10 sm:hidden">
          <Button onClick={() => persist()} disabled={saving} className="w-full shadow-lg gap-1.5">
            <Save className="w-4 h-4" /> Save Notice
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminNotices;
