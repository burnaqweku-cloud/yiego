/**
 * Admin Campaign Banner Manager (Phase 2/3)
 * Premium admin UI: analytics RPC, advanced targeting, archive/duplicate,
 * display modes, frequency reset, filters & search.
 */
import { useEffect, useMemo, useState } from 'react';
import AdminLayout from './AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Pencil, Eye, BarChart3, Copy, Archive, RotateCcw, Pause, Play, Filter } from 'lucide-react';
import CampaignBannerRenderer from '@/components/banners/CampaignBannerRenderer';

const TEMPLATES = [
  { value: 'promo', label: 'Promo Banner' },
  { value: 'service_update', label: 'Service Update' },
  { value: 'feature', label: 'Feature Announcement' },
  { value: 'urgent', label: 'Urgent Notice' },
  { value: 'image', label: 'Image Banner' },
];
const AUDIENCES = [
  { value: 'all', label: 'All Visitors' },
  { value: 'guests', label: 'Guests Only' },
  { value: 'logged_in', label: 'Logged-in Users' },
  { value: 'agents', label: 'Active Agents' },
  { value: 'non_agents', label: 'Non-Agents (logged in)' },
  { value: 'new_users', label: 'New Users' },
  { value: 'returning_users', label: 'Returning Users' },
  { value: 'no_orders', label: 'Users With No Orders' },
  { value: 'with_orders', label: 'Users With Orders' },
  { value: 'wallet_low', label: 'Wallet Balance Low' },
  { value: 'wallet_high', label: 'Wallet Balance High' },
  { value: 'sub_active', label: 'Agent Subscription Active' },
  { value: 'sub_expired', label: 'Agent Subscription Expired' },
  { value: 'sub_expiring', label: 'Subscription Expiring Soon' },
];
const PAGES = [
  { value: 'all', label: 'All Pages' },
  { value: 'homepage', label: 'Homepage' },
  { value: 'buy_data', label: 'Buy Data' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'orders', label: 'Orders' },
  { value: 'agent', label: 'Agent' },
  { value: 'guest_checkout', label: 'Guest Checkout' },
];
const FREQUENCIES = [
  { value: 'every_visit', label: 'Every Visit' },
  { value: 'once_per_user', label: 'Once per User' },
  { value: 'once_per_day', label: 'Once per Day' },
  { value: 'once_per_week', label: 'Once per Week' },
  { value: 'max_views', label: 'Max Views per User' },
];
const DISMISS = [
  { value: 'follow_frequency', label: 'Follow frequency rule' },
  { value: 'next_visit', label: 'Show again next visit' },
  { value: 'never_again', label: 'Never show again' },
];
const DISPLAY_MODES = [
  { value: 'popup', label: 'Popup Modal' },
  { value: 'bottom_sheet', label: 'Bottom Sheet' },
  { value: 'top_bar', label: 'Top Announcement Bar' },
  { value: 'inline', label: 'Inline Card' },
];

type TargetingRules = {
  account_age_days_min?: number | null;
  account_age_days_max?: number | null;
  wallet_balance_min?: number | null;
  wallet_balance_max?: number | null;
  min_orders?: number | null;
  max_orders?: number | null;
};

type Banner = {
  id: string;
  title: string;
  message: string;
  template_type: string;
  image_url: string | null;
  primary_button_text: string | null;
  primary_button_url: string | null;
  secondary_button_text: string | null;
  secondary_button_url: string | null;
  audience_type: string;
  target_pages: string[];
  is_enabled: boolean;
  start_at: string | null;
  end_at: string | null;
  frequency_type: string;
  max_views_per_user: number | null;
  show_delay_seconds: number;
  dismiss_behavior: string;
  priority: number;
  created_at: string;
  display_mode?: string | null;
  badge_text?: string | null;
  icon_type?: string | null;
  version?: number | null;
  targeting_rules?: TargetingRules | null;
  archived_at?: string | null;
};

type Analytics = {
  banner_id: string;
  views: number; unique_views: number; clicks: number; dismissals: number;
  ctr: number; dismissal_rate: number;
  views_today: number; clicks_today: number;
  views_7d: number; clicks_7d: number;
  last_viewed_at: string | null; last_clicked_at: string | null;
};

const emptyBanner = (): Partial<Banner> => ({
  title: '',
  message: '',
  template_type: 'promo',
  image_url: '',
  primary_button_text: '',
  primary_button_url: '',
  secondary_button_text: '',
  secondary_button_url: '',
  audience_type: 'all',
  target_pages: ['all'],
  is_enabled: false,
  start_at: null,
  end_at: null,
  frequency_type: 'once_per_day',
  max_views_per_user: null,
  show_delay_seconds: 0,
  dismiss_behavior: 'follow_frequency',
  priority: 0,
  display_mode: 'popup',
  badge_text: '',
  targeting_rules: {},
});

const computeStatus = (b: Banner): { label: string; tone: string } => {
  if (b.archived_at) return { label: 'Archived', tone: 'bg-muted text-muted-foreground' };
  if (!b.is_enabled) return { label: 'Disabled', tone: 'bg-muted text-muted-foreground' };
  const now = Date.now();
  if (b.end_at && new Date(b.end_at).getTime() < now) return { label: 'Expired', tone: 'bg-destructive/10 text-destructive' };
  if (b.start_at && new Date(b.start_at).getTime() > now) return { label: 'Scheduled', tone: 'bg-blue-500/10 text-blue-600' };
  return { label: 'Active', tone: 'bg-emerald-500/10 text-emerald-600' };
};

const AdminCampaignBanners = () => {
  const { isAdmin } = useAuth();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [form, setForm] = useState<Partial<Banner>>(emptyBanner());
  const [stats, setStats] = useState<Record<string, Analytics>>({});

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [audienceFilter, setAudienceFilter] = useState<string>('all');
  const [templateFilter, setTemplateFilter] = useState<string>('all');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('campaign_banners')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Failed to load banners', description: error.message, variant: 'destructive' });
    } else {
      setBanners((data || []) as unknown as Banner[]);
    }
    setLoading(false);

    // Server-side aggregated analytics (no raw event scan in browser)
    const { data: analytics } = await supabase.rpc('get_campaign_banner_analytics' as any);
    const map: Record<string, Analytics> = {};
    (analytics || []).forEach((a: any) => { map[a.banner_id] = a; });
    setStats(map);
  };

  useEffect(() => { load(); }, []);

  const startCreate = () => { setForm(emptyBanner()); setOpen(true); };
  const startEdit = (b: Banner) => {
    setForm({
      ...b,
      target_pages: Array.isArray(b.target_pages) ? b.target_pages : ['all'],
      targeting_rules: b.targeting_rules || {},
    });
    setOpen(true);
  };

  const togglePage = (page: string) => {
    const current = (form.target_pages as string[]) || [];
    if (page === 'all') return setForm({ ...form, target_pages: ['all'] });
    const without = current.filter((p) => p !== 'all');
    if (without.includes(page)) {
      const next = without.filter((p) => p !== page);
      setForm({ ...form, target_pages: next.length ? next : ['all'] });
    } else {
      setForm({ ...form, target_pages: [...without, page] });
    }
  };

  const setRule = (k: keyof TargetingRules, v: string) => {
    const num = v === '' ? null : Number(v);
    setForm({ ...form, targeting_rules: { ...(form.targeting_rules || {}), [k]: num } });
  };

  const save = async () => {
    if (!form.title?.trim()) {
      toast({ title: 'Title required', variant: 'destructive' });
      return;
    }
    const payload: any = {
      title: form.title.trim(),
      message: (form.message || '').trim(),
      template_type: form.template_type || 'promo',
      image_url: form.image_url?.trim() || null,
      primary_button_text: form.primary_button_text?.trim() || null,
      primary_button_url: form.primary_button_url?.trim() || null,
      secondary_button_text: form.secondary_button_text?.trim() || null,
      secondary_button_url: form.secondary_button_url?.trim() || null,
      audience_type: form.audience_type || 'all',
      target_pages: form.target_pages?.length ? form.target_pages : ['all'],
      is_enabled: !!form.is_enabled,
      start_at: form.start_at || null,
      end_at: form.end_at || null,
      frequency_type: form.frequency_type || 'once_per_day',
      max_views_per_user: form.frequency_type === 'max_views' ? (form.max_views_per_user || 1) : null,
      show_delay_seconds: Number(form.show_delay_seconds || 0),
      dismiss_behavior: form.dismiss_behavior || 'follow_frequency',
      priority: Number(form.priority || 0),
      display_mode: form.display_mode || 'popup',
      badge_text: form.badge_text?.trim() || null,
      targeting_rules: form.targeting_rules || {},
    };

    const isUpdate = !!form.id;
    const { error } = isUpdate
      ? await supabase.from('campaign_banners').update(payload).eq('id', form.id!)
      : await supabase.from('campaign_banners').insert(payload);

    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: isUpdate ? 'Banner updated' : 'Banner created' });
    setOpen(false);
    load();
  };

  const toggleEnabled = async (b: Banner) => {
    const { error } = await supabase
      .from('campaign_banners')
      .update({ is_enabled: !b.is_enabled })
      .eq('id', b.id);
    if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    else load();
  };

  const archive = async (b: Banner) => {
    if (!confirm(`Archive banner "${b.title}"? It will stop showing to users but history is kept.`)) return;
    const { error } = await supabase
      .from('campaign_banners')
      .update({ archived_at: new Date().toISOString(), is_enabled: false } as any)
      .eq('id', b.id);
    if (error) toast({ title: 'Archive failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Banner archived' }); load(); }
  };

  const unarchive = async (b: Banner) => {
    const { error } = await supabase
      .from('campaign_banners')
      .update({ archived_at: null } as any)
      .eq('id', b.id);
    if (error) toast({ title: 'Restore failed', description: error.message, variant: 'destructive' });
    else load();
  };

  const remove = async (b: Banner) => {
    if (!confirm(`Permanently delete "${b.title}"? Analytics will also be removed.`)) return;
    const { error } = await supabase.from('campaign_banners').delete().eq('id', b.id);
    if (error) toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    else load();
  };

  const duplicate = async (b: Banner) => {
    const { id, created_at, ...rest } = b as any;
    const payload = {
      ...rest,
      title: `${b.title} (Copy)`,
      is_enabled: false,
      archived_at: null,
      version: 1,
    };
    const { error } = await supabase.from('campaign_banners').insert(payload);
    if (error) toast({ title: 'Duplicate failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Banner duplicated as draft' }); load(); }
  };

  const resetFrequency = async (b: Banner) => {
    if (!confirm(`Reset view/dismissal frequency for "${b.title}" so it can show again to users who already saw it?`)) return;
    const { error } = await supabase.rpc('reset_campaign_banner_frequency' as any, { p_banner_id: b.id });
    if (error) toast({ title: 'Reset failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Frequency reset (version bumped)' }); load(); }
  };

  const previewBanner = useMemo(() => ({
    id: form.id || 'preview',
    title: form.title || 'Preview Title',
    message: form.message || 'Your banner message will appear here.',
    template_type: (form.template_type as any) || 'promo',
    image_url: form.image_url || null,
    primary_button_text: form.primary_button_text || null,
    primary_button_url: form.primary_button_url || null,
    secondary_button_text: form.secondary_button_text || null,
    secondary_button_url: form.secondary_button_url || null,
    audience_type: 'all' as const,
    target_pages: ['all'],
    is_enabled: true,
    start_at: null,
    end_at: null,
    frequency_type: 'every_visit' as const,
    max_views_per_user: null,
    show_delay_seconds: 0,
    dismiss_behavior: 'follow_frequency' as const,
    priority: 0,
    display_mode: (form.display_mode as any) || 'popup',
    badge_text: form.badge_text || null,
    version: 1,
  }), [form]);

  // Derived list with filters
  const filtered = useMemo(() => {
    return banners.filter((b) => {
      if (search && !b.title.toLowerCase().includes(search.toLowerCase()) && !(b.message || '').toLowerCase().includes(search.toLowerCase())) return false;
      if (audienceFilter !== 'all' && b.audience_type !== audienceFilter) return false;
      if (templateFilter !== 'all' && b.template_type !== templateFilter) return false;
      const s = computeStatus(b).label.toLowerCase();
      if (statusFilter !== 'all' && s !== statusFilter) return false;
      return true;
    });
  }, [banners, search, audienceFilter, templateFilter, statusFilter]);

  // Aggregate header analytics
  const totals = useMemo(() => {
    const t = { views: 0, clicks: 0, dismissals: 0, active: 0 };
    banners.forEach((b) => {
      const s = stats[b.id];
      if (s) { t.views += s.views; t.clicks += s.clicks; t.dismissals += s.dismissals; }
      if (computeStatus(b).label === 'Active') t.active += 1;
    });
    return t;
  }, [banners, stats]);

  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="text-sm text-muted-foreground">Admin access only.</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-display font-bold">Banner Campaigns</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Create premium popup, bottom sheet, or top-bar banners with audience &amp; targeting rules.
            </p>
          </div>
          <Button onClick={startCreate} className="gap-2">
            <Plus className="w-4 h-4" /> New Banner
          </Button>
        </div>

        {/* Aggregate cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4"><div className="text-[11px] uppercase text-muted-foreground">Active</div><div className="text-2xl font-bold">{totals.active}</div></Card>
          <Card className="p-4"><div className="text-[11px] uppercase text-muted-foreground">Total Views</div><div className="text-2xl font-bold">{totals.views}</div></Card>
          <Card className="p-4"><div className="text-[11px] uppercase text-muted-foreground">Total Clicks</div><div className="text-2xl font-bold">{totals.clicks}</div></Card>
          <Card className="p-4"><div className="text-[11px] uppercase text-muted-foreground">Dismissals</div><div className="text-2xl font-bold">{totals.dismissals}</div></Card>
        </div>

        {/* Filters */}
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Input
              className="h-9 max-w-xs"
              placeholder="Search title or message…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={audienceFilter} onValueChange={setAudienceFilter}>
              <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Audience" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All audiences</SelectItem>
                {AUDIENCES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={templateFilter} onValueChange={setTemplateFilter}>
              <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Template" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All templates</SelectItem>
                {TEMPLATES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {banners.length === 0 ? 'No banners yet. Create your first campaign.' : 'No banners match your filters.'}
            </p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map((b) => {
              const s = computeStatus(b);
              const st = stats[b.id];
              return (
                <Card key={b.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">{b.title}</h3>
                        <Badge className={s.tone} variant="outline">{s.label}</Badge>
                        <Badge variant="outline" className="text-[10px]">{b.template_type}</Badge>
                        <Badge variant="outline" className="text-[10px]">{b.audience_type}</Badge>
                        <Badge variant="outline" className="text-[10px]">{b.display_mode || 'popup'}</Badge>
                        {b.version && b.version > 1 && <Badge variant="outline" className="text-[10px]">v{b.version}</Badge>}
                      </div>
                      {b.message && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{b.message}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground flex-wrap">
                        <span className="inline-flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {st?.views ?? 0} views</span>
                        <span>{st?.unique_views ?? 0} unique</span>
                        <span>{st?.clicks ?? 0} clicks</span>
                        <span>{st?.dismissals ?? 0} dismissed</span>
                        <span>CTR {st?.ctr ?? 0}%</span>
                        <span>· Today {st?.views_today ?? 0}v / {st?.clicks_today ?? 0}c</span>
                        <span>· 7d {st?.views_7d ?? 0}v / {st?.clicks_7d ?? 0}c</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                      <Switch checked={b.is_enabled} onCheckedChange={() => toggleEnabled(b)} disabled={!!b.archived_at} />
                      <Button size="sm" variant="ghost" title="Preview" onClick={() => { setForm({ ...b, target_pages: Array.isArray(b.target_pages) ? b.target_pages : ['all'] }); setPreviewOpen(true); }}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Edit" onClick={() => startEdit(b)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Duplicate" onClick={() => duplicate(b)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Reset frequency" onClick={() => resetFrequency(b)}>
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      {b.archived_at ? (
                        <Button size="sm" variant="ghost" title="Restore" onClick={() => unarchive(b)}>
                          <Play className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" title="Archive" onClick={() => archive(b)}>
                          <Archive className="w-4 h-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" title="Delete" onClick={() => remove(b)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Editor dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit Banner' : 'New Banner'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <section className="space-y-3">
              <h4 className="text-xs font-bold uppercase text-muted-foreground">Content</h4>
              <div>
                <Label>Title</Label>
                <Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <Label>Message</Label>
                <Textarea rows={3} value={form.message || ''} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Template</Label>
                  <Select value={form.template_type} onValueChange={(v) => setForm({ ...form, template_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TEMPLATES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Display mode</Label>
                  <Select value={form.display_mode || 'popup'} onValueChange={(v) => setForm({ ...form, display_mode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DISPLAY_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Image URL (optional)</Label>
                  <Input value={form.image_url || ''} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://…" />
                </div>
                <div>
                  <Label>Badge text (optional)</Label>
                  <Input value={form.badge_text || ''} onChange={(e) => setForm({ ...form, badge_text: e.target.value })} placeholder="NEW, HOT, LIMITED…" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Primary button text</Label>
                  <Input value={form.primary_button_text || ''} onChange={(e) => setForm({ ...form, primary_button_text: e.target.value })} />
                </div>
                <div>
                  <Label>Primary URL</Label>
                  <Input value={form.primary_button_url || ''} onChange={(e) => setForm({ ...form, primary_button_url: e.target.value })} placeholder="/dashboard or https://…" />
                </div>
                <div>
                  <Label>Secondary button text</Label>
                  <Input value={form.secondary_button_text || ''} onChange={(e) => setForm({ ...form, secondary_button_text: e.target.value })} />
                </div>
                <div>
                  <Label>Secondary URL</Label>
                  <Input value={form.secondary_button_url || ''} onChange={(e) => setForm({ ...form, secondary_button_url: e.target.value })} />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-xs font-bold uppercase text-muted-foreground">Audience &amp; Pages</h4>
              <div>
                <Label>Audience</Label>
                <Select value={form.audience_type} onValueChange={(v) => setForm({ ...form, audience_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUDIENCES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target pages</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {PAGES.map((p) => {
                    const active = ((form.target_pages as string[]) || []).includes(p.value);
                    return (
                      <button
                        type="button"
                        key={p.value}
                        onClick={() => togglePage(p.value)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          active ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted/60'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-xs font-bold uppercase text-muted-foreground">Advanced Targeting (optional)</h4>
              <p className="text-[11px] text-muted-foreground -mt-2">Leave blank to skip. Rules apply only to logged-in users.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Min account age (days)</Label>
                  <Input type="number" min={0} value={form.targeting_rules?.account_age_days_min ?? ''} onChange={(e) => setRule('account_age_days_min', e.target.value)} />
                </div>
                <div>
                  <Label>Max account age (days)</Label>
                  <Input type="number" min={0} value={form.targeting_rules?.account_age_days_max ?? ''} onChange={(e) => setRule('account_age_days_max', e.target.value)} />
                </div>
                <div>
                  <Label>Min orders</Label>
                  <Input type="number" min={0} value={form.targeting_rules?.min_orders ?? ''} onChange={(e) => setRule('min_orders', e.target.value)} />
                </div>
                <div>
                  <Label>Max orders</Label>
                  <Input type="number" min={0} value={form.targeting_rules?.max_orders ?? ''} onChange={(e) => setRule('max_orders', e.target.value)} />
                </div>
                <div>
                  <Label>Min wallet balance (GHS)</Label>
                  <Input type="number" min={0} step="0.01" value={form.targeting_rules?.wallet_balance_min ?? ''} onChange={(e) => setRule('wallet_balance_min', e.target.value)} />
                </div>
                <div>
                  <Label>Max wallet balance (GHS)</Label>
                  <Input type="number" min={0} step="0.01" value={form.targeting_rules?.wallet_balance_max ?? ''} onChange={(e) => setRule('wallet_balance_max', e.target.value)} />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-xs font-bold uppercase text-muted-foreground">Schedule &amp; Frequency</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start at (optional)</Label>
                  <Input type="datetime-local" value={form.start_at?.slice(0, 16) || ''} onChange={(e) => setForm({ ...form, start_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </div>
                <div>
                  <Label>End at (optional)</Label>
                  <Input type="datetime-local" value={form.end_at?.slice(0, 16) || ''} onChange={(e) => setForm({ ...form, end_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </div>
                <div>
                  <Label>Frequency</Label>
                  <Select value={form.frequency_type} onValueChange={(v) => setForm({ ...form, frequency_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.frequency_type === 'max_views' && (
                  <div>
                    <Label>Max views per user</Label>
                    <Input type="number" min={1} value={form.max_views_per_user ?? 1} onChange={(e) => setForm({ ...form, max_views_per_user: Number(e.target.value) })} />
                  </div>
                )}
                <div>
                  <Label>Show delay (seconds)</Label>
                  <Input type="number" min={0} value={form.show_delay_seconds ?? 0} onChange={(e) => setForm({ ...form, show_delay_seconds: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Dismiss behavior</Label>
                  <Select value={form.dismiss_behavior} onValueChange={(v) => setForm({ ...form, dismiss_behavior: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DISMISS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority (higher wins)</Label>
                  <Input type="number" value={form.priority ?? 0} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Switch checked={!!form.is_enabled} onCheckedChange={(v) => setForm({ ...form, is_enabled: v })} />
                <Label>Enabled (live)</Label>
              </div>
            </section>

            <section className="space-y-2">
              <h4 className="text-xs font-bold uppercase text-muted-foreground">Live Preview</h4>
              <div className="rounded-xl border border-border bg-muted/30 p-2">
                <CampaignBannerRenderer previewMode previewBanner={previewBanner as any} />
              </div>
            </section>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{form.id ? 'Save changes' : 'Create banner'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Standalone preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Preview</DialogTitle></DialogHeader>
          <CampaignBannerRenderer previewMode previewBanner={previewBanner as any} />
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminCampaignBanners;
