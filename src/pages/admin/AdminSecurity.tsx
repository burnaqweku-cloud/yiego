import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from './AdminLayout';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Shield, Globe, Fingerprint, Phone, Mail, Ban, UserCheck, UserX,
  Plus, Loader2, RefreshCw, Search, Clock, Eye, Trash2, ShieldOff,
  Lock, Unlock, Activity
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

interface SecurityBlock {
  id: string;
  block_type: string;
  block_value: string;
  reason: string;
  severity: string;
  status: string;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  notes: string | null;
}

interface SecurityEvent {
  id: string;
  user_id: string | null;
  event_type: string;
  ip: string | null;
  device_hash: string | null;
  user_agent: string | null;
  meta: any;
  created_at: string;
}

interface BannedUser {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  suspended: boolean;
  suspended_reason: string | null;
  suspended_at: string | null;
  referral_frozen: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-blue-500/20 text-blue-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  high: 'bg-red-500/20 text-red-400',
};

const BLOCK_TYPE_ICONS: Record<string, typeof Globe> = {
  ip: Globe,
  device: Fingerprint,
  phone: Phone,
  email: Mail,
};

const AdminSecurity = () => {
  const { user: adminUser } = useAuth();
  const [blocks, setBlocks] = useState<SecurityBlock[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ip');
  const [addDialog, setAddDialog] = useState<string | null>(null); // block_type or null
  const [newBlock, setNewBlock] = useState({ value: '', reason: '', severity: 'medium', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  // Ban/unban dialog
  const [banDialog, setBanDialog] = useState<{ userId: string; action: 'ban' | 'unban' } | null>(null);
  const [banReason, setBanReason] = useState('');
  // Freeze/unfreeze
  const [freezeDialog, setFreezeDialog] = useState<{ userId: string; action: 'freeze' | 'unfreeze' } | null>(null);
  const [freezeReason, setFreezeReason] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [blocksRes, eventsRes, bannedRes] = await Promise.all([
      supabase.from('security_blocks' as any).select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('security_events' as any).select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('profiles').select('id, full_name, email, phone, suspended, suspended_reason, suspended_at, referral_frozen').eq('suspended', true).limit(100),
    ]);
    if (blocksRes.data) setBlocks(blocksRes.data as any);
    if (eventsRes.data) setEvents(eventsRes.data as any);
    if (bannedRes.data) setBannedUsers(bannedRes.data as any);
    setLoading(false);
  };

  const handleAddBlock = async () => {
    if (!addDialog || !newBlock.value.trim() || !newBlock.reason.trim()) {
      toast.error('Value and reason are required');
      return;
    }
    setSubmitting(true);

    let normalizedValue = newBlock.value.trim();
    if (addDialog === 'email') normalizedValue = normalizedValue.toLowerCase();
    if (addDialog === 'device') normalizedValue = normalizedValue.toLowerCase();

    const { error } = await supabase.from('security_blocks' as any).insert({
      block_type: addDialog,
      block_value: normalizedValue,
      reason: newBlock.reason.trim(),
      severity: newBlock.severity,
      notes: newBlock.notes.trim() || null,
      created_by: adminUser?.id,
    });

    if (error) {
      if (error.code === '23505') {
        toast.error('An active block for this value already exists');
      } else {
        toast.error('Failed to add block: ' + error.message);
      }
      setSubmitting(false);
      return;
    }

    // Audit log (fire-and-forget)
    supabase.from('security_events' as any).insert({
      user_id: adminUser?.id,
      event_type: 'admin_block_add',
      meta: { block_type: addDialog, block_value: normalizedValue, reason: newBlock.reason.trim(), severity: newBlock.severity },
    }).then(() => {});

    toast.success(`${addDialog.toUpperCase()} block added`);
    setAddDialog(null);
    setNewBlock({ value: '', reason: '', severity: 'medium', notes: '' });
    setSubmitting(false);
    await loadData();
  };

  const handleDisableBlock = async (block: SecurityBlock) => {
    const { error } = await supabase.from('security_blocks' as any)
      .update({ status: 'inactive' })
      .eq('id', block.id);

    if (error) { toast.error('Failed to disable block'); return; }

    supabase.from('security_events' as any).insert({
      user_id: adminUser?.id,
      event_type: 'admin_block_disable',
      meta: { block_id: block.id, block_type: block.block_type, block_value: block.block_value },
    }).then(() => {});

    toast.success('Block disabled');
    await loadData();
  };

  const handleBanUser = async () => {
    if (!banDialog) return;
    const { userId, action } = banDialog;
    if (action === 'ban' && !banReason.trim()) { toast.error('Reason required'); return; }
    setSubmitting(true);

    const updates: Record<string, any> = action === 'ban'
      ? { suspended: true, suspended_at: new Date().toISOString(), suspended_reason: banReason.trim(), banned_by: adminUser?.id }
      : { suspended: false, suspended_at: null, suspended_reason: null, banned_by: null };

    await supabase.from('profiles').update(updates as any).eq('id', userId);

    supabase.from('security_events' as any).insert({
      user_id: adminUser?.id,
      event_type: action === 'ban' ? 'admin_ban_user' : 'admin_unban_user',
      meta: { target_user_id: userId, reason: banReason.trim() || null },
    }).then(() => {});

    supabase.from('audit_logs').insert({
      actor_id: adminUser?.id ?? '',
      actor_email: adminUser?.email,
      action: action === 'ban' ? 'user_banned' : 'user_unbanned',
      entity_type: 'profile',
      entity_id: userId,
      metadata: { reason: banReason.trim() || null },
    }).then(() => {});

    toast.success(action === 'ban' ? 'User banned' : 'User unbanned');
    setBanDialog(null);
    setBanReason('');
    setSubmitting(false);
    await loadData();
  };

  const handleFreezeReferral = async () => {
    if (!freezeDialog) return;
    const { userId, action } = freezeDialog;
    if (action === 'freeze' && !freezeReason.trim()) { toast.error('Reason required'); return; }
    setSubmitting(true);

    const updates: Record<string, any> = action === 'freeze'
      ? { referral_frozen: true, referral_frozen_at: new Date().toISOString(), referral_frozen_reason: freezeReason.trim() }
      : { referral_frozen: false, referral_frozen_at: null, referral_frozen_reason: null };

    await supabase.from('profiles').update(updates as any).eq('id', userId);

    supabase.from('security_events' as any).insert({
      user_id: adminUser?.id,
      event_type: action === 'freeze' ? 'admin_freeze_referral' : 'admin_unfreeze_referral',
      meta: { target_user_id: userId, reason: freezeReason.trim() || null },
    }).then(() => {});

    toast.success(action === 'freeze' ? 'Referral rewards frozen' : 'Referral rewards unfrozen');
    setFreezeDialog(null);
    setFreezeReason('');
    setSubmitting(false);
    await loadData();
  };

  const getFilteredBlocks = (type: string) =>
    blocks.filter(b => b.block_type === type && (
      !search || b.block_value.includes(search.toLowerCase()) || b.reason.toLowerCase().includes(search.toLowerCase())
    ));

  const filteredEvents = events.filter(e =>
    !eventFilter || e.event_type.includes(eventFilter.toLowerCase())
  );

  if (loading) return <AdminLayout><div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></AdminLayout>;

  const activeIpBlocks = blocks.filter(b => b.block_type === 'ip' && b.status === 'active').length;
  const activeDeviceBlocks = blocks.filter(b => b.block_type === 'device' && b.status === 'active').length;
  const activePhoneBlocks = blocks.filter(b => b.block_type === 'phone' && b.status === 'active').length;
  const activeEmailBlocks = blocks.filter(b => b.block_type === 'email' && b.status === 'active').length;

  const renderBlocksList = (type: string) => {
    const filtered = getFilteredBlocks(type);
    const Icon = BLOCK_TYPE_ICONS[type] || Shield;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${type} blocks...`} className="pl-9" />
          </div>
          <Button size="sm" onClick={() => { setAddDialog(type); setNewBlock({ value: '', reason: '', severity: 'medium', notes: '' }); }} className="gap-1.5 ml-3">
            <Plus className="w-3.5 h-3.5" /> Add {type.toUpperCase()} Block
          </Button>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No {type} blocks found</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(block => (
              <Card key={block.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <code className="text-sm font-mono font-medium break-all">{block.block_value}</code>
                          <Badge className={SEVERITY_COLORS[block.severity]}>{block.severity}</Badge>
                          <Badge variant={block.status === 'active' ? 'destructive' : 'secondary'}>{block.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{block.reason}</p>
                        {block.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{block.notes}</p>}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Added {format(new Date(block.created_at), 'dd MMM yyyy HH:mm')}
                          {block.expires_at && ` · Expires ${format(new Date(block.expires_at), 'dd MMM yyyy')}`}
                        </p>
                      </div>
                    </div>
                    {block.status === 'active' && (
                      <Button size="sm" variant="outline" onClick={() => handleDisableBlock(block)} className="text-xs shrink-0">
                        <ShieldOff className="w-3.5 h-3.5 mr-1" /> Disable
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <AdminLayout>
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card><CardContent className="p-4 text-center">
          <Globe className="w-5 h-5 mx-auto mb-1 text-blue-400" />
          <p className="text-2xl font-bold">{activeIpBlocks}</p>
          <p className="text-xs text-muted-foreground">IP Blocks</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Fingerprint className="w-5 h-5 mx-auto mb-1 text-orange-400" />
          <p className="text-2xl font-bold">{activeDeviceBlocks}</p>
          <p className="text-xs text-muted-foreground">Device Blocks</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Phone className="w-5 h-5 mx-auto mb-1 text-green-400" />
          <p className="text-2xl font-bold">{activePhoneBlocks}</p>
          <p className="text-xs text-muted-foreground">Phone Blocks</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Mail className="w-5 h-5 mx-auto mb-1 text-purple-400" />
          <p className="text-2xl font-bold">{activeEmailBlocks}</p>
          <p className="text-xs text-muted-foreground">Email Blocks</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Ban className="w-5 h-5 mx-auto mb-1 text-red-500" />
          <p className="text-2xl font-bold">{bannedUsers.length}</p>
          <p className="text-xs text-muted-foreground">Banned Users</p>
        </CardContent></Card>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-display font-bold flex items-center gap-2">
          <Shield className="w-5 h-5" /> Security Controls
        </h1>
        <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="ip">IP Blocks</TabsTrigger>
          <TabsTrigger value="device">Device</TabsTrigger>
          <TabsTrigger value="phone">Phone</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="banned">Banned Users</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>

        <TabsContent value="ip">{renderBlocksList('ip')}</TabsContent>
        <TabsContent value="device">{renderBlocksList('device')}</TabsContent>
        <TabsContent value="phone">{renderBlocksList('phone')}</TabsContent>
        <TabsContent value="email">{renderBlocksList('email')}</TabsContent>

        {/* Banned Users Tab */}
        <TabsContent value="banned">
          {bannedUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No banned users</p>
          ) : (
            <div className="space-y-2">
              {bannedUsers.map(u => (
                <Card key={u.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">{u.full_name}</p>
                        <p className="text-xs text-muted-foreground">{u.email} · {u.phone}</p>
                        {u.suspended_reason && <p className="text-xs text-destructive mt-1">{u.suspended_reason}</p>}
                        {u.suspended_at && <p className="text-[10px] text-muted-foreground">Banned: {format(new Date(u.suspended_at), 'dd MMM yyyy HH:mm')}</p>}
                        <div className="flex gap-1.5 mt-1">
                          {u.suspended && <Badge variant="destructive">Banned</Badge>}
                          {u.referral_frozen && <Badge className="bg-yellow-500/20 text-yellow-400">Referral Frozen</Badge>}
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => { setBanDialog({ userId: u.id, action: 'unban' }); setBanReason(''); }}>
                          <UserCheck className="w-3.5 h-3.5 mr-1" /> Unban
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events">
          <div className="mb-4">
            <div className="relative max-w-sm">
              <Activity className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={eventFilter} onChange={e => setEventFilter(e.target.value)} placeholder="Filter by event type..." className="pl-9" />
            </div>
          </div>
          {filteredEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No security events found</p>
          ) : (
            <div className="space-y-1.5">
              {filteredEvents.map(evt => (
                <Card key={evt.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-[10px] shrink-0">{evt.event_type}</Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          {evt.ip && <span className="font-mono">{evt.ip}</span>}
                          {evt.device_hash && <span className="font-mono truncate max-w-[100px]" title={evt.device_hash}>{evt.device_hash.slice(0, 12)}...</span>}
                          {evt.user_id && <span className="truncate max-w-[100px]" title={evt.user_id}>{evt.user_id.slice(0, 8)}</span>}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {format(new Date(evt.created_at), 'dd MMM HH:mm')}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Block Dialog */}
      <Dialog open={!!addDialog} onOpenChange={(open) => { if (!open) setAddDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {addDialog?.toUpperCase()} Block</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Value</Label>
              <Input
                value={newBlock.value}
                onChange={e => setNewBlock(prev => ({ ...prev, value: e.target.value }))}
                placeholder={
                  addDialog === 'ip' ? '192.168.1.1' :
                  addDialog === 'device' ? 'device hash...' :
                  addDialog === 'phone' ? '+233501234567' :
                  'user@example.com'
                }
              />
            </div>
            <div>
              <Label>Reason</Label>
              <Input
                value={newBlock.reason}
                onChange={e => setNewBlock(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Why is this being blocked?"
              />
            </div>
            <div>
              <Label>Severity</Label>
              <Select value={newBlock.severity} onValueChange={v => setNewBlock(prev => ({ ...prev, severity: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={newBlock.notes}
                onChange={e => setNewBlock(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(null)}>Cancel</Button>
            <Button onClick={handleAddBlock} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              Add Block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban/Unban Dialog */}
      <Dialog open={!!banDialog} onOpenChange={(open) => { if (!open) setBanDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{banDialog?.action === 'ban' ? 'Ban User' : 'Unban User'}</DialogTitle>
          </DialogHeader>
          {banDialog?.action === 'ban' && (
            <div>
              <Label>Reason</Label>
              <Textarea value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Ban reason..." rows={3} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanDialog(null)}>Cancel</Button>
            <Button variant={banDialog?.action === 'ban' ? 'destructive' : 'default'} onClick={handleBanUser} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              {banDialog?.action === 'ban' ? 'Ban User' : 'Unban User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Freeze/Unfreeze Dialog */}
      <Dialog open={!!freezeDialog} onOpenChange={(open) => { if (!open) setFreezeDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{freezeDialog?.action === 'freeze' ? 'Freeze Referral Rewards' : 'Unfreeze Referral Rewards'}</DialogTitle>
          </DialogHeader>
          {freezeDialog?.action === 'freeze' && (
            <div>
              <Label>Reason</Label>
              <Textarea value={freezeReason} onChange={e => setFreezeReason(e.target.value)} placeholder="Freeze reason..." rows={3} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFreezeDialog(null)}>Cancel</Button>
            <Button onClick={handleFreezeReferral} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              {freezeDialog?.action === 'freeze' ? 'Freeze' : 'Unfreeze'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminSecurity;
