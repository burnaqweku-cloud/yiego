import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from './AdminLayout';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Shield, Users, Search, CheckCircle2, XCircle,
  Eye, Lock, Unlock, Ban, Loader2, Flag, Fingerprint, Globe,
  UserX, UserCheck, StickyNote, RefreshCw, Clock, ShieldOff,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface ReferralFlag {
  id: string;
  user_id: string;
  flag_type: string;
  severity_level: string;
  details: any;
  auto_flagged: boolean;
  reviewed_by_admin: boolean;
  admin_decision: string | null;
  admin_notes: string | null;
  created_at: string;
}

interface ReferrerSummary {
  id: string;
  full_name: string;
  email: string | null;
  username: string | null;
  phone: string;
  referral_success_count: number;
  referral_signup_count: number;
  referral_frozen: boolean;
  referral_frozen_reason: string | null;
  device_hash: string | null;
  registration_ip: string | null;
  suspended: boolean;
  suspended_reason: string | null;
  admin_notes: string | null;
  created_at: string;
}

interface ReferralActivityRow {
  id: string;
  referee_id: string;
  referrer_id: string;
  status: string;
  flagged: boolean;
  flag_type: string | null;
  rejected_reason: string | null;
  referee_device_hash: string | null;
  referee_registration_ip: string | null;
  referee_phone: string | null;
  admin_reviewed: boolean;
  admin_decision: string | null;
  created_at: string;
  first_success_order_id: string | null;
}

const FLAG_COLORS: Record<string, string> = {
  same_device: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  ip_cluster: 'bg-red-500/20 text-red-400 border-red-500/30',
  high_velocity: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  duplicate_phone: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  duplicate_device: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  ip_reuse: 'bg-red-500/20 text-red-400 border-red-500/30',
  fast_signups: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  self_referral: 'bg-red-600/20 text-red-300 border-red-600/30',
  suspicious_orders: 'bg-yellow-600/20 text-yellow-300 border-yellow-600/30',
};

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-blue-500/20 text-blue-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  high: 'bg-red-500/20 text-red-400',
  critical: 'bg-red-600/20 text-red-300',
};

const AdminReferralReview = () => {
  const { user: adminUser } = useAuth();
  const [flags, setFlags] = useState<ReferralFlag[]>([]);
  const [referrers, setReferrers] = useState<ReferrerSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailUser, setDetailUser] = useState<string | null>(null);
  const [activities, setActivities] = useState<ReferralActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [noteDialog, setNoteDialog] = useState<{ flagId: string; type: 'approve' | 'reject' } | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [refereeProfiles, setRefereeProfiles] = useState<Record<string, any>>({});
  // Ban/suspend dialog
  const [banDialog, setBanDialog] = useState<{ userId: string; action: 'ban' | 'unban' | 'suspend' | 'unsuspend' } | null>(null);
  const [banReason, setBanReason] = useState('');
  // Admin notes dialog
  const [notesDialog, setNotesDialog] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  // IP/device stats
  const [ipStats, setIpStats] = useState<Record<string, number>>({});
  const [deviceStats, setDeviceStats] = useState<Record<string, number>>({});
  // Bulk actions
  const [selectedFlags, setSelectedFlags] = useState<Set<string>>(new Set());
  const [bulkResolveConfirm, setBulkResolveConfirm] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setSelectedFlags(new Set()); }, [flags]);

  const handleBulkResolve = async (flagIds: string[]) => {
    if (flagIds.length === 0) return;
    setBulkLoading(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from('referral_flags').update({
      reviewed_by_admin: true,
      admin_decision: 'resolved',
      admin_notes: 'Bulk resolved by admin',
      reviewed_at: now,
      reviewed_by: adminUser?.id,
    } as any).in('id', flagIds);
    if (error) {
      toast.error('Failed to resolve flags');
      console.error(error);
    } else {
      toast.success(`Resolved ${flagIds.length} flag${flagIds.length > 1 ? 's' : ''}`);
    }
    setBulkResolveConfirm(false);
    setSelectedFlags(new Set());
    setBulkLoading(false);
    await loadData();
  };

  const toggleFlagSelection = (id: string) => {
    setSelectedFlags(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllPendingFlags = () => {
    if (selectedFlags.size === pendingFlags.length) {
      setSelectedFlags(new Set());
    } else {
      setSelectedFlags(new Set(pendingFlags.map(f => f.id)));
    }
  };


  const loadData = async () => {
    setLoading(true);
    const [flagsRes, referrersRes] = await Promise.all([
      supabase.from('referral_flags').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('profiles').select('id, full_name, email, username, phone, referral_success_count, referral_signup_count, referral_frozen, referral_frozen_reason, device_hash, registration_ip, suspended, suspended_reason, admin_notes, created_at').gt('referral_signup_count', 0).order('referral_signup_count', { ascending: false }).limit(200),
    ]);
    if (flagsRes.data) setFlags(flagsRes.data as any);
    if (referrersRes.data) setReferrers(referrersRes.data as any);
    setLoading(false);
  };

  const loadReferrerDetail = async (userId: string) => {
    setDetailUser(userId);
    setActivityLoading(true);
    const { data } = await supabase.from('referral_activity').select('*').eq('referrer_id', userId).order('created_at', { ascending: false }).limit(50);
    if (data) {
      setActivities(data as any);
      const ids = [...new Set(data.map((a: any) => a.referee_id))];
      if (ids.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, phone, username, device_hash, registration_ip, created_at').in('id', ids);
        if (profiles) {
          const map: Record<string, any> = {};
          profiles.forEach((p: any) => { map[p.id] = p; });
          setRefereeProfiles(map);
        }
      }
    }

    // Load IP and device hash stats for this referrer
    const referrer = referrers.find(r => r.id === userId);
    if (referrer?.registration_ip) {
      const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('registration_ip', referrer.registration_ip);
      setIpStats(prev => ({ ...prev, [referrer.registration_ip!]: count ?? 0 }));
    }
    if (referrer?.device_hash) {
      const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('device_hash', referrer.device_hash);
      setDeviceStats(prev => ({ ...prev, [referrer.device_hash!]: count ?? 0 }));
    }

    setActivityLoading(false);
  };

  const handleFreezeReferrer = async (userId: string, freeze: boolean, reason?: string) => {
    setActionLoading(userId);
    await supabase.from('profiles').update({
      referral_frozen: freeze,
      referral_frozen_at: freeze ? new Date().toISOString() : null,
      referral_frozen_reason: freeze ? (reason || 'Frozen by admin for review') : null,
    } as any).eq('id', userId);

    // Audit log
    await supabase.from('audit_logs').insert({
      actor_id: adminUser?.id ?? '',
      actor_email: adminUser?.email,
      action: freeze ? 'referral_freeze' : 'referral_unfreeze',
      entity_type: 'profile',
      entity_id: userId,
      metadata: { reason: reason || null },
    });

    toast.success(freeze ? 'Referral rewards frozen' : 'Referral rewards unfrozen');
    await loadData();
    if (detailUser === userId) await loadReferrerDetail(userId);
    setActionLoading(null);
  };

  const handleBanSuspend = async () => {
    if (!banDialog) return;
    const { userId, action } = banDialog;
    setActionLoading(userId);

    const updates: Record<string, any> = {};
    let auditAction = '';

    if (action === 'ban' || action === 'suspend') {
      if (!banReason.trim()) { toast.error('Please provide a reason.'); setActionLoading(null); return; }
      updates.suspended = true;
      updates.suspended_at = new Date().toISOString();
      updates.suspended_reason = banReason.trim();
      auditAction = action === 'ban' ? 'user_banned' : 'user_suspended';
    } else {
      updates.suspended = false;
      updates.suspended_at = null;
      updates.suspended_reason = null;
      auditAction = action === 'unban' ? 'user_unbanned' : 'user_unsuspended';
    }

    await supabase.from('profiles').update(updates as any).eq('id', userId);

    await supabase.from('audit_logs').insert({
      actor_id: adminUser?.id ?? '',
      actor_email: adminUser?.email,
      action: auditAction,
      entity_type: 'profile',
      entity_id: userId,
      metadata: { reason: banReason.trim() || null },
    });

    toast.success(
      action === 'ban' ? 'User banned' :
      action === 'unban' ? 'User unbanned' :
      action === 'suspend' ? 'User suspended' : 'User unsuspended'
    );

    setBanDialog(null);
    setBanReason('');
    await loadData();
    if (detailUser === userId) await loadReferrerDetail(userId);
    setActionLoading(null);
  };

  const handleSaveNotes = async () => {
    if (!notesDialog) return;
    setActionLoading(notesDialog);
    await supabase.from('profiles').update({ admin_notes: editNotes.trim() || null } as any).eq('id', notesDialog);
    toast.success('Notes saved');
    setNotesDialog(null);
    await loadData();
    setActionLoading(null);
  };

  const handleFlagDecision = async () => {
    if (!noteDialog) return;
    setActionLoading(noteDialog.flagId);
    await supabase.from('referral_flags').update({
      reviewed_by_admin: true,
      admin_decision: noteDialog.type === 'approve' ? 'approved' : 'rejected',
      admin_notes: adminNote || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminUser?.id,
    } as any).eq('id', noteDialog.flagId);
    toast.success(`Flag ${noteDialog.type === 'approve' ? 'approved' : 'rejected'}`);
    setNoteDialog(null);
    setAdminNote('');
    await loadData();
    setActionLoading(null);
  };

  const handleActivityDecision = async (activityId: string, decision: 'approved' | 'rejected') => {
    setActionLoading(activityId);
    await supabase.from('referral_activity').update({
      admin_reviewed: true,
      admin_decision: decision,
      admin_reviewed_at: new Date().toISOString(),
      flagged: decision === 'rejected',
    } as any).eq('id', activityId);

    if (decision === 'rejected') {
      const activity = activities.find(a => a.id === activityId);
      if (activity && activity.status === 'successful') {
        await supabase.from('profiles').update({
          referral_success_count: Math.max(0, (referrers.find(r => r.id === activity.referrer_id)?.referral_success_count ?? 1) - 1),
        } as any).eq('id', activity.referrer_id);
      }
    }

    toast.success(`Referral ${decision}`);
    if (detailUser) await loadReferrerDetail(detailUser);
    await loadData();
    setActionLoading(null);
  };

  const filtered = referrers.filter(r =>
    !search || r.full_name?.toLowerCase().includes(search.toLowerCase()) || r.email?.toLowerCase().includes(search.toLowerCase()) || r.username?.toLowerCase().includes(search.toLowerCase()) || r.phone?.includes(search)
  );

  const pendingFlags = flags.filter(f => !f.reviewed_by_admin);
  const frozenReferrers = referrers.filter(r => r.referral_frozen);
  const suspendedReferrers = referrers.filter(r => r.suspended);

  if (loading) return <AdminLayout><div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></AdminLayout>;

  return (
    <AdminLayout>
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card><CardContent className="p-4 text-center">
          <Flag className="w-5 h-5 mx-auto mb-1 text-orange-400" />
          <p className="text-2xl font-bold">{pendingFlags.length}</p>
          <p className="text-xs text-muted-foreground">Pending Flags</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Lock className="w-5 h-5 mx-auto mb-1 text-red-400" />
          <p className="text-2xl font-bold">{frozenReferrers.length}</p>
          <p className="text-xs text-muted-foreground">Frozen</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Ban className="w-5 h-5 mx-auto mb-1 text-red-600" />
          <p className="text-2xl font-bold">{suspendedReferrers.length}</p>
          <p className="text-xs text-muted-foreground">Suspended</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Users className="w-5 h-5 mx-auto mb-1 text-blue-400" />
          <p className="text-2xl font-bold">{referrers.length}</p>
          <p className="text-xs text-muted-foreground">Active Referrers</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Shield className="w-5 h-5 mx-auto mb-1 text-green-400" />
          <p className="text-2xl font-bold">{flags.filter(f => f.reviewed_by_admin).length}</p>
          <p className="text-xs text-muted-foreground">Reviewed</p>
        </CardContent></Card>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-display font-bold">Referral Review</h1>
        <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      <Tabs defaultValue="flags">
        <TabsList className="mb-4">
          <TabsTrigger value="flags">
            Flags {pendingFlags.length > 0 && <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5">{pendingFlags.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="referrers">All Referrers</TabsTrigger>
          <TabsTrigger value="frozen">Frozen</TabsTrigger>
          <TabsTrigger value="suspended">Suspended</TabsTrigger>
        </TabsList>

        {/* FLAGS TAB */}
        <TabsContent value="flags">
          {flags.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No flags yet — the system is clean! 🎉</p>
          ) : (
            <div className="space-y-2">
              {/* Bulk action bar */}
              {pendingFlags.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setBulkResolveConfirm(true)}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Resolve All Visible ({pendingFlags.length})
                  </Button>
                  {selectedFlags.size > 0 && (
                    <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => handleBulkResolve([...selectedFlags])}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Resolve Selected ({selectedFlags.size})
                    </Button>
                  )}
                  <div className="flex items-center gap-1.5 ml-auto">
                    <Checkbox
                      checked={pendingFlags.length > 0 && selectedFlags.size === pendingFlags.length}
                      onCheckedChange={toggleAllPendingFlags}
                    />
                    <span className="text-xs text-muted-foreground">Select all</span>
                  </div>
                </div>
              )}
              {flags.map(f => {
                const referrer = referrers.find(r => r.id === f.user_id);
                const isPending = !f.reviewed_by_admin;
                return (
                  <Card key={f.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        {isPending && (
                          <div className="pt-0.5 shrink-0">
                            <Checkbox
                              checked={selectedFlags.has(f.id)}
                              onCheckedChange={() => toggleFlagSelection(f.id)}
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge className={FLAG_COLORS[f.flag_type] || 'bg-muted text-muted-foreground'}>
                              {f.flag_type.replace(/_/g, ' ')}
                            </Badge>
                            <Badge className={SEVERITY_COLORS[f.severity_level] || ''}>
                              {f.severity_level}
                            </Badge>
                            {f.reviewed_by_admin && (
                              <Badge variant={f.admin_decision === 'approved' ? 'default' : 'destructive'}>
                                {f.admin_decision}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium">{referrer?.full_name || referrer?.username || f.user_id.slice(0, 8)}</p>
                          <p className="text-xs text-muted-foreground">{referrer?.email} · {new Date(f.created_at).toLocaleDateString()}</p>
                          {f.details && (
                            <details className="mt-1">
                              <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">View evidence</summary>
                              <pre className="text-[10px] text-muted-foreground mt-1 bg-secondary/50 p-2 rounded overflow-x-auto max-h-32">{JSON.stringify(f.details, null, 2)}</pre>
                            </details>
                          )}
                          {f.admin_notes && <p className="text-xs mt-1 italic text-muted-foreground">Note: {f.admin_notes}</p>}
                        </div>
                        <div className="flex gap-1.5 shrink-0 flex-wrap">
                          {isPending && (
                            <>
                              <Button size="sm" variant="outline" className="text-xs" onClick={() => { setNoteDialog({ flagId: f.id, type: 'approve' }); setAdminNote(''); }}>
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="destructive" className="text-xs" onClick={() => { setNoteDialog({ flagId: f.id, type: 'reject' }); setAdminNote(''); }}>
                                <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                          {referrer && (
                            <Button size="sm" variant="ghost" className="text-xs" onClick={() => loadReferrerDetail(f.user_id)}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* REFERRERS TAB */}
        <TabsContent value="referrers">
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, phone..." className="pl-9" />
            </div>
          </div>
          <div className="space-y-2">
            {filtered.map(r => (
              <Card key={r.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => loadReferrerDetail(r.id)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{r.full_name} {r.username && <span className="text-muted-foreground">@{r.username}</span>}</p>
                      <p className="text-xs text-muted-foreground">{r.email} · {r.phone}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs"><strong>{r.referral_signup_count}</strong> signups</span>
                        <span className="text-xs text-green-400"><strong>{r.referral_success_count}</strong> qualified</span>
                        {r.referral_frozen && <Badge variant="destructive" className="text-[10px]">FROZEN</Badge>}
                        {r.suspended && <Badge variant="destructive" className="text-[10px]">SUSPENDED</Badge>}
                        {r.admin_notes && <StickyNote className="w-3.5 h-3.5 text-yellow-400" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.device_hash && <Fingerprint className="w-4 h-4 text-muted-foreground" />}
                      {r.registration_ip && <Globe className="w-4 h-4 text-muted-foreground" />}
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* FROZEN TAB */}
        <TabsContent value="frozen">
          {frozenReferrers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No frozen referrers.</p>
          ) : (
            <div className="space-y-2">
              {frozenReferrers.map(r => (
                <Card key={r.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{r.full_name} {r.username && <span className="text-muted-foreground">@{r.username}</span>}</p>
                      <p className="text-xs text-muted-foreground">{r.referral_frozen_reason}</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={actionLoading === r.id} onClick={() => handleFreezeReferrer(r.id, false)}>
                      {actionLoading === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Unlock className="w-3.5 h-3.5 mr-1" /> Unfreeze</>}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* SUSPENDED TAB */}
        <TabsContent value="suspended">
          {suspendedReferrers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No suspended users.</p>
          ) : (
            <div className="space-y-2">
              {suspendedReferrers.map(r => (
                <Card key={r.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{r.full_name} {r.username && <span className="text-muted-foreground">@{r.username}</span>}</p>
                      <p className="text-xs text-muted-foreground">{r.suspended_reason}</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={actionLoading === r.id} onClick={() => { setBanDialog({ userId: r.id, action: 'unban' }); setBanReason(''); }}>
                      {actionLoading === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><UserCheck className="w-3.5 h-3.5 mr-1" /> Unban</>}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* REFERRER DETAIL DIALOG */}
      <Dialog open={!!detailUser} onOpenChange={open => { if (!open) setDetailUser(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" /> Referrer Detail
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const r = referrers.find(r => r.id === detailUser);
            if (!r) return null;
            const ipCount = r.registration_ip ? (ipStats[r.registration_ip] ?? '?') : '—';
            const deviceCount = r.device_hash ? (deviceStats[r.device_hash] ?? '?') : '—';
            return (
              <div className="space-y-4">
                {/* Profile info grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="text-sm font-medium">{r.full_name}</p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium">{r.email}</p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="text-sm font-medium">{r.phone}</p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Registered</p>
                    <p className="text-sm font-medium">{new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Device Hash</p>
                    <p className="text-xs font-mono">{r.device_hash?.slice(0, 20) || '—'}{r.device_hash && '...'}</p>
                    {r.device_hash && <p className="text-[10px] text-muted-foreground mt-0.5">{deviceCount} account(s) with same hash</p>}
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Registration IP</p>
                    <p className="text-sm font-medium">{r.registration_ip || '—'}</p>
                    {r.registration_ip && <p className="text-[10px] text-muted-foreground mt-0.5">{ipCount} account(s) from this IP</p>}
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Stats</p>
                    <p className="text-sm"><strong>{r.referral_signup_count}</strong> signups · <strong>{r.referral_success_count}</strong> qualified</p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <div className="flex gap-1.5 flex-wrap mt-0.5">
                      {r.suspended && <Badge variant="destructive" className="text-[10px]">SUSPENDED</Badge>}
                      {r.referral_frozen && <Badge variant="destructive" className="text-[10px]">FROZEN</Badge>}
                      {!r.suspended && !r.referral_frozen && <Badge variant="default" className="text-[10px]">ACTIVE</Badge>}
                    </div>
                  </div>
                </div>

                {/* Admin notes */}
                {r.admin_notes && (
                  <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
                    <p className="text-xs text-yellow-400 font-bold mb-1 flex items-center gap-1"><StickyNote className="w-3 h-3" /> Admin Notes</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.admin_notes}</p>
                  </div>
                )}

                {/* Quick security action buttons */}
                <div className="flex gap-2 flex-wrap">
                  {r.referral_frozen ? (
                    <Button size="sm" variant="outline" onClick={() => handleFreezeReferrer(r.id, false)} disabled={actionLoading === r.id}>
                      <Unlock className="w-3.5 h-3.5 mr-1" /> Unfreeze Rewards
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={() => handleFreezeReferrer(r.id, true, 'Manual admin freeze')} disabled={actionLoading === r.id}>
                      <Lock className="w-3.5 h-3.5 mr-1" /> Freeze Rewards
                    </Button>
                  )}

                  {r.suspended ? (
                    <Button size="sm" variant="outline" onClick={() => { setBanDialog({ userId: r.id, action: 'unban' }); setBanReason(''); }}>
                      <UserCheck className="w-3.5 h-3.5 mr-1" /> Unban
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="destructive" className="gap-1" onClick={() => { setBanDialog({ userId: r.id, action: 'ban' }); setBanReason(''); }}>
                        <Ban className="w-3.5 h-3.5" /> Ban User
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 border-orange-500/30 text-orange-400 hover:bg-orange-500/5" onClick={() => { setBanDialog({ userId: r.id, action: 'suspend' }); setBanReason(''); }}>
                        <ShieldOff className="w-3.5 h-3.5" /> Suspend
                      </Button>
                    </>
                  )}

                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => { setNotesDialog(r.id); setEditNotes(r.admin_notes || ''); }}>
                    <StickyNote className="w-3.5 h-3.5" /> Notes
                  </Button>
                </div>

                {/* Security quick-block buttons */}
                <div className="border-t border-border pt-3 mt-2">
                  <p className="text-xs text-muted-foreground mb-2 font-semibold">Quick Security Blocks</p>
                  <div className="flex gap-2 flex-wrap">
                    {r.registration_ip && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Block IP ${r.registration_ip}? This will prevent ALL access from this IP.`)) return;
                          setActionLoading(r.id + '-ip');
                          await supabase.from('security_blocks').insert({
                            block_type: 'ip',
                            block_value: r.registration_ip,
                            reason: 'Blocked from referral review',
                            severity: 'high',
                            created_by: adminUser?.id ?? '',
                          });
                          await supabase.from('audit_logs').insert({
                            actor_id: adminUser?.id ?? '',
                            actor_email: adminUser?.email,
                            action: 'security_block_ip',
                            entity_type: 'security_block',
                            entity_id: r.registration_ip,
                            metadata: { user_id: r.id, source: 'referral_review' },
                          });
                          toast.success(`IP ${r.registration_ip} blocked`);
                          setActionLoading(null);
                        }}
                        disabled={!!actionLoading}
                      >
                        <Globe className="w-3 h-3" /> Block IP
                      </Button>
                    )}
                    {r.device_hash && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm('Block this device? This will prevent ALL access from this device.')) return;
                          setActionLoading(r.id + '-dev');
                          await supabase.from('security_blocks').insert({
                            block_type: 'device',
                            block_value: r.device_hash!.toLowerCase(),
                            reason: 'Blocked from referral review',
                            severity: 'high',
                            created_by: adminUser?.id ?? '',
                          });
                          await supabase.from('audit_logs').insert({
                            actor_id: adminUser?.id ?? '',
                            actor_email: adminUser?.email,
                            action: 'security_block_device',
                            entity_type: 'security_block',
                            entity_id: r.device_hash!.slice(0, 20),
                            metadata: { user_id: r.id, source: 'referral_review' },
                          });
                          toast.success('Device blocked');
                          setActionLoading(null);
                        }}
                        disabled={!!actionLoading}
                      >
                        <Fingerprint className="w-3 h-3" /> Block Device
                      </Button>
                    )}
                    {r.phone && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Block phone ${r.phone}? This will prevent signup/login/orders from this number.`)) return;
                          setActionLoading(r.id + '-phone');
                          await supabase.from('security_blocks').insert({
                            block_type: 'phone',
                            block_value: r.phone,
                            reason: 'Blocked from referral review',
                            severity: 'medium',
                            created_by: adminUser?.id ?? '',
                          });
                          toast.success(`Phone ${r.phone} blocked`);
                          setActionLoading(null);
                        }}
                        disabled={!!actionLoading}
                      >
                        Block Phone
                      </Button>
                    )}
                    {r.email && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Block email ${r.email}? This will prevent signup/login from this email.`)) return;
                          setActionLoading(r.id + '-email');
                          await supabase.from('security_blocks').insert({
                            block_type: 'email',
                            block_value: r.email!.toLowerCase().trim(),
                            reason: 'Blocked from referral review',
                            severity: 'medium',
                            created_by: adminUser?.id ?? '',
                          });
                          toast.success(`Email ${r.email} blocked`);
                          setActionLoading(null);
                        }}
                        disabled={!!actionLoading}
                      >
                        Block Email
                      </Button>
                    )}
                  </div>
                </div>

                {/* Referred users list */}
                <h3 className="text-sm font-bold mt-4">Referred Users ({activities.length})</h3>
                {activityLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                    {activities.map(a => {
                      const referee = refereeProfiles[a.referee_id];
                      return (
                        <div key={a.id} className="bg-secondary/30 rounded-lg p-3 border border-border">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{referee?.full_name || 'Unknown'} {referee?.username && <span className="text-muted-foreground text-xs">@{referee.username}</span>}</p>
                              <p className="text-xs text-muted-foreground">{referee?.email} · {referee?.phone}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <Badge variant={a.status === 'successful' ? 'default' : 'secondary'} className="text-[10px]">
                                  {a.status === 'successful' ? '✓ Qualified' : a.status === 'registered' ? 'Signed up' : a.status}
                                </Badge>
                                {a.flagged && <Badge variant="destructive" className="text-[10px]">{a.flag_type || 'flagged'}</Badge>}
                                {a.admin_reviewed && <Badge variant="outline" className="text-[10px]">{a.admin_decision}</Badge>}
                                {a.first_success_order_id && (
                                  <span className="text-[10px] text-muted-foreground">Order: {a.first_success_order_id}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                                {a.referee_device_hash && (
                                  <span title={a.referee_device_hash} className="flex items-center gap-0.5">
                                    <Fingerprint className="w-2.5 h-2.5" /> {a.referee_device_hash.slice(0, 10)}...
                                  </span>
                                )}
                                {a.referee_registration_ip && (
                                  <span className="flex items-center gap-0.5">
                                    <Globe className="w-2.5 h-2.5" /> {a.referee_registration_ip}
                                  </span>
                                )}
                                <span className="flex items-center gap-0.5">
                                  <Clock className="w-2.5 h-2.5" />
                                  Signed up: {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {referee?.created_at && (
                                  <span>Registered: {new Date(referee.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                                )}
                              </div>
                            </div>
                            {a.flagged && !a.admin_reviewed && (
                              <div className="flex gap-1 shrink-0">
                                <Button size="sm" variant="outline" className="text-[10px] h-7 px-2" onClick={(e) => { e.stopPropagation(); handleActivityDecision(a.id, 'approved'); }} disabled={actionLoading === a.id}>
                                  ✓
                                </Button>
                                <Button size="sm" variant="destructive" className="text-[10px] h-7 px-2" onClick={(e) => { e.stopPropagation(); handleActivityDecision(a.id, 'rejected'); }} disabled={actionLoading === a.id}>
                                  ✗
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {activities.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No referred users found.</p>}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* FLAG DECISION DIALOG */}
      <Dialog open={!!noteDialog} onOpenChange={open => { if (!open) setNoteDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{noteDialog?.type === 'approve' ? 'Approve' : 'Reject'} Flag</DialogTitle>
          </DialogHeader>
          <Textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} placeholder="Admin notes (optional)" rows={3} />
          <Button onClick={handleFlagDecision} disabled={!!actionLoading} className="w-full">
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `Confirm ${noteDialog?.type === 'approve' ? 'Approval' : 'Rejection'}`}
          </Button>
        </DialogContent>
      </Dialog>

      {/* BAN/SUSPEND DIALOG */}
      <Dialog open={!!banDialog} onOpenChange={open => { if (!open) setBanDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {banDialog?.action === 'ban' && <><Ban className="w-5 h-5 text-destructive" /> Ban User</>}
              {banDialog?.action === 'suspend' && <><ShieldOff className="w-5 h-5 text-orange-400" /> Suspend User</>}
              {banDialog?.action === 'unban' && <><UserCheck className="w-5 h-5 text-green-400" /> Unban User</>}
              {banDialog?.action === 'unsuspend' && <><UserCheck className="w-5 h-5 text-green-400" /> Unsuspend User</>}
            </DialogTitle>
          </DialogHeader>
          {(banDialog?.action === 'ban' || banDialog?.action === 'suspend') ? (
            <>
              <p className="text-sm text-muted-foreground">
                {banDialog.action === 'ban'
                  ? 'This will prevent the user from logging in. They will see a blocked screen.'
                  : 'This will temporarily suspend the user account.'}
              </p>
              <Textarea
                value={banReason}
                onChange={e => setBanReason(e.target.value)}
                placeholder="Reason (required)..."
                rows={3}
              />
              <Button
                onClick={handleBanSuspend}
                disabled={!banReason.trim() || !!actionLoading}
                variant="destructive"
                className="w-full"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `Confirm ${banDialog.action === 'ban' ? 'Ban' : 'Suspension'}`}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">This will restore the user's access.</p>
              <Button onClick={handleBanSuspend} disabled={!!actionLoading} className="w-full">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ADMIN NOTES DIALOG */}
      <Dialog open={!!notesDialog} onOpenChange={open => { if (!open) setNotesDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="w-5 h-5" /> Admin Notes
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={editNotes}
            onChange={e => setEditNotes(e.target.value)}
            placeholder="Internal admin notes about this referrer..."
            rows={5}
          />
          <Button onClick={handleSaveNotes} disabled={!!actionLoading} className="w-full">
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Notes'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* BULK RESOLVE CONFIRMATION DIALOG */}
      <Dialog open={bulkResolveConfirm} onOpenChange={setBulkResolveConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Resolve all visible flags?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will mark all {pendingFlags.length} open flag{pendingFlags.length !== 1 ? 's' : ''} as resolved.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setBulkResolveConfirm(false)} disabled={bulkLoading}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => handleBulkResolve(pendingFlags.map(f => f.id))} disabled={bulkLoading}>
              {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Resolve All'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminReferralReview;
