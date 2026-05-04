import { useEffect, useState, useCallback } from 'react';
import AdminLayout from './AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Sparkles, Users, Activity, Settings as SettingsIcon, Gift, ShieldAlert, History, Megaphone, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatPrice } from '@/data/bundles';

interface KPI { label: string; value: string | number; sub?: string; }

const KpiCard = ({ label, value, sub }: KPI) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-2xl font-display font-bold tracking-tight tabular mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </CardContent>
  </Card>
);

// ─────────── Overview ───────────
const OverviewTab = () => {
  const [kpis, setKpis] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const [a, t, r, red, ref] = await Promise.all([
        supabase.from('loyalty_accounts').select('points_balance, lifetime_points_earned, lifetime_points_redeemed, lifetime_spend_ghs, current_tier'),
        supabase.from('point_transactions').select('id', { count: 'exact', head: true }),
        supabase.from('loyalty_redemptions').select('points_used, ghs_value, type'),
        supabase.from('loyalty_referrals').select('status'),
        supabase.from('loyalty_referral_codes').select('id', { count: 'exact', head: true }),
      ]);

      const accounts = a.data || [];
      const totalMembers = accounts.length;
      const tierBreakdown = accounts.reduce((acc: any, x: any) => {
        acc[x.current_tier] = (acc[x.current_tier] || 0) + 1; return acc;
      }, {});
      const outstandingPoints = accounts.reduce((s: number, x: any) => s + (x.points_balance || 0), 0);
      const lifetimeEarned = accounts.reduce((s: number, x: any) => s + (x.lifetime_points_earned || 0), 0);
      const lifetimeRedeemed = accounts.reduce((s: number, x: any) => s + (x.lifetime_points_redeemed || 0), 0);
      const totalSpend = accounts.reduce((s: number, x: any) => s + Number(x.lifetime_spend_ghs || 0), 0);

      const redemptions = (r.data || []) as any[];
      const totalRedeemValue = redemptions.reduce((s, x) => s + Number(x.ghs_value || 0), 0);

      const refs = (red.data || []) as any[];

      setKpis({
        totalMembers, tierBreakdown, outstandingPoints,
        lifetimeEarned, lifetimeRedeemed, totalSpend, totalRedeemValue,
        totalRedemptions: redemptions.length,
        completedReferrals: refs.filter(r => r.status === 'completed').length,
        pendingReferrals: refs.filter(r => r.status === 'pending').length,
      });
    })();
  }, []);

  if (!kpis) return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({length:8}).map((_,i)=><Skeleton key={i} className="h-24" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total members" value={kpis.totalMembers.toLocaleString()} />
        <KpiCard label="Outstanding points" value={kpis.outstandingPoints.toLocaleString()} sub="Liability on books" />
        <KpiCard label="Lifetime earned" value={kpis.lifetimeEarned.toLocaleString()} />
        <KpiCard label="Lifetime redeemed" value={kpis.lifetimeRedeemed.toLocaleString()} />
        <KpiCard label="Redemptions" value={kpis.totalRedemptions} sub={formatPrice(kpis.totalRedeemValue)} />
        <KpiCard label="Completed referrals" value={kpis.completedReferrals} />
        <KpiCard label="Pending referrals" value={kpis.pendingReferrals} />
        <KpiCard label="Tracked spend" value={formatPrice(kpis.totalSpend)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Tier breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {['bronze','silver','gold','platinum'].map(t => (
              <div key={t} className="p-3 rounded-lg border border-border">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t}</p>
                <p className="text-xl font-bold tabular mt-1">{kpis.tierBreakdown[t] || 0}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ─────────── Members ───────────
const MembersTab = () => {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [target, setTarget] = useState<any>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('loyalty_accounts')
      .select('id, user_id, points_balance, lifetime_points_earned, lifetime_points_redeemed, lifetime_spend_ghs, current_tier, banned_from_program, banned_reason, updated_at')
      .order('lifetime_spend_ghs', { ascending: false })
      .limit(200);
    setMembers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = members.filter(m =>
    !q || m.user_id.toLowerCase().includes(q.toLowerCase())
  );

  const submitAdjust = async () => {
    const d = parseInt(delta, 10);
    if (!d || !reason || reason.length < 10) return toast.error('Provide delta + reason (10+ chars)');
    const { data, error } = await supabase.rpc('admin_adjust_loyalty_points', {
      p_target_user_id: target.user_id,
      p_delta: d,
      p_reason: reason,
    } as any);
    if (error) return toast.error(error.message);
    const res = data as any;
    if (!res?.success) return toast.error(res?.error || 'Failed');
    toast.success(`New balance: ${res.new_balance}`);
    setAdjustOpen(false); setDelta(''); setReason(''); setTarget(null);
    load();
  };

  const toggleBan = async (m: any) => {
    const newVal = !m.banned_from_program;
    const reason = newVal ? prompt('Reason for ban?') : null;
    if (newVal && (!reason || reason.length < 5)) return;
    await supabase.from('loyalty_accounts').update({
      banned_from_program: newVal,
      banned_reason: newVal ? reason : null,
    }).eq('id', m.id);
    toast.success(newVal ? 'Member banned from program' : 'Member unbanned');
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder="Search by user_id…" value={q} onChange={e => setQ(e.target.value)} />
        <Button variant="outline" onClick={load}>Refresh</Button>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? <Skeleton className="h-64 m-4" /> : (
            <table className="w-full text-xs">
              <thead className="bg-secondary/50 text-left">
                <tr>
                  <th className="px-3 py-2">User ID</th>
                  <th className="px-3 py-2">Tier</th>
                  <th className="px-3 py-2 tabular">Balance</th>
                  <th className="px-3 py-2 tabular">Earned</th>
                  <th className="px-3 py-2 tabular">Redeemed</th>
                  <th className="px-3 py-2 tabular">Spend</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id} className="border-t border-border/50">
                    <td className="px-3 py-2 font-mono text-[10px]">{m.user_id.slice(0,8)}…</td>
                    <td className="px-3 py-2"><Badge variant="secondary">{m.current_tier}</Badge></td>
                    <td className="px-3 py-2 tabular">{m.points_balance.toLocaleString()}</td>
                    <td className="px-3 py-2 tabular">{m.lifetime_points_earned.toLocaleString()}</td>
                    <td className="px-3 py-2 tabular">{m.lifetime_points_redeemed.toLocaleString()}</td>
                    <td className="px-3 py-2 tabular">{formatPrice(m.lifetime_spend_ghs)}</td>
                    <td className="px-3 py-2">{m.banned_from_program ? <Badge variant="destructive">Banned</Badge> : <Badge variant="default">Active</Badge>}</td>
                    <td className="px-3 py-2 space-x-1">
                      <Button size="sm" variant="outline" onClick={() => { setTarget(m); setAdjustOpen(true); }}>Adjust</Button>
                      <Button size="sm" variant={m.banned_from_program ? 'default' : 'destructive'} onClick={() => toggleBan(m)}>
                        {m.banned_from_program ? 'Unban' : 'Ban'}
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No members</td></tr>}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust points</DialogTitle>
            <DialogDescription>Use positive number to credit, negative to debit. Will be audit logged.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Delta (e.g. 100 or -50)</Label>
              <Input type="number" value={delta} onChange={e => setDelta(e.target.value)} />
            </div>
            <div>
              <Label>Reason (10+ chars)</Label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button onClick={submitAdjust}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─────────── Transactions ───────────
const TransactionsTab = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('point_transactions').select('*').order('created_at', { ascending: false }).limit(300);
      setRows(data || []); setLoading(false);
    })();
  }, []);
  if (loading) return <Skeleton className="h-64" />;
  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-secondary/50 text-left">
          <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Source</th><th className="px-3 py-2 tabular">Amount</th><th className="px-3 py-2 tabular">Balance</th><th className="px-3 py-2">Description</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t border-border/50">
              <td className="px-3 py-2">{format(new Date(r.created_at), 'MMM d HH:mm')}</td>
              <td className="px-3 py-2 font-mono text-[10px]">{r.user_id.slice(0,8)}…</td>
              <td className="px-3 py-2"><Badge variant="secondary">{r.type}</Badge></td>
              <td className="px-3 py-2 text-muted-foreground">{r.source}</td>
              <td className={`px-3 py-2 tabular font-bold ${r.amount >= 0 ? 'text-success' : 'text-destructive'}`}>{r.amount > 0 ? '+' : ''}{r.amount}</td>
              <td className="px-3 py-2 tabular">{r.balance_after}</td>
              <td className="px-3 py-2 text-muted-foreground max-w-xs truncate">{r.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent></Card>
  );
};

// ─────────── Redemptions ───────────
const RedemptionsTab = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('loyalty_redemptions').select('*').order('created_at', { ascending: false }).limit(300);
      setRows(data || []); setLoading(false);
    })();
  }, []);
  if (loading) return <Skeleton className="h-64" />;
  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-secondary/50 text-left">
          <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 tabular">Points</th><th className="px-3 py-2 tabular">Value</th><th className="px-3 py-2">Status</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t border-border/50">
              <td className="px-3 py-2">{format(new Date(r.created_at), 'MMM d HH:mm')}</td>
              <td className="px-3 py-2 font-mono text-[10px]">{r.user_id.slice(0,8)}…</td>
              <td className="px-3 py-2"><Badge variant="secondary">{r.type}</Badge></td>
              <td className="px-3 py-2 tabular">{r.points_used}</td>
              <td className="px-3 py-2 tabular">{formatPrice(r.ghs_value)}</td>
              <td className="px-3 py-2"><Badge variant={r.status === 'completed' ? 'default' : 'secondary'}>{r.status}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent></Card>
  );
};

// ─────────── Referrals ───────────
const ReferralsTab = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    const { data } = await supabase.from('loyalty_referrals').select('*').order('created_at', { ascending: false }).limit(300);
    setRows(data || []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: string, reason?: string) => {
    await supabase.from('loyalty_referrals').update({ status, rejection_reason: reason || null, updated_at: new Date().toISOString() }).eq('id', id);
    toast.success('Updated'); load();
  };

  if (loading) return <Skeleton className="h-64" />;
  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-secondary/50 text-left">
          <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Referrer</th><th className="px-3 py-2">Referee</th><th className="px-3 py-2">Code</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Flagged</th><th className="px-3 py-2">Actions</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t border-border/50">
              <td className="px-3 py-2">{format(new Date(r.created_at), 'MMM d')}</td>
              <td className="px-3 py-2 font-mono text-[10px]">{r.referrer_id.slice(0,8)}…</td>
              <td className="px-3 py-2 font-mono text-[10px]">{r.referee_id.slice(0,8)}…</td>
              <td className="px-3 py-2 font-mono">{r.code_used}</td>
              <td className="px-3 py-2"><Badge variant={r.status === 'completed' ? 'default' : r.status === 'pending' ? 'secondary' : 'destructive'}>{r.status}</Badge></td>
              <td className="px-3 py-2">{r.flagged ? <Badge variant="destructive">{r.flag_reason}</Badge> : '—'}</td>
              <td className="px-3 py-2 space-x-1">
                {r.status === 'pending' && (
                  <Button size="sm" variant="destructive" onClick={() => setStatus(r.id, 'rejected', 'admin_review')}>Reject</Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent></Card>
  );
};

// ─────────── Settings ───────────
const SettingsTab = () => {
  const [s, setS] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('loyalty_settings').select('*').eq('id', 1).maybeSingle();
    setS(data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('loyalty_settings').update({
      points_per_ghs: s.points_per_ghs,
      points_to_ghs_rate: s.points_to_ghs_rate,
      min_order_ghs_for_points: s.min_order_ghs_for_points,
      signup_bonus_points: s.signup_bonus_points,
      birthday_bonus_points: s.birthday_bonus_points,
      referral_bonus_referrer_points: s.referral_bonus_referrer_points,
      referral_bonus_referee_ghs: s.referral_bonus_referee_ghs,
      max_referrals_per_month: s.max_referrals_per_month,
      max_redeem_percent_per_order: s.max_redeem_percent_per_order,
      program_active: s.program_active,
      points_expiry_months: s.points_expiry_months,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Settings saved');
  };

  if (!s) return <Skeleton className="h-64" />;

  const F = (key: string, label: string, type: string = 'number', step: any = 1) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} step={step} value={s[key] ?? ''} onChange={e => setS({ ...s, [key]: type === 'number' ? parseFloat(e.target.value) : e.target.value })} />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between">
          Program settings
          <div className="flex items-center gap-2">
            <span className="text-xs">Program active</span>
            <Switch checked={s.program_active} onCheckedChange={v => setS({ ...s, program_active: v })} />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!s.program_active && (
          <div className="mb-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive flex gap-2">
            <ShieldAlert className="w-4 h-4" /> Kill switch ON — no new points awarded, redemptions disabled, balances preserved.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {F('points_per_ghs', 'Points per GHS', 'number', '0.01')}
          {F('points_to_ghs_rate', 'GHS per point', 'number', '0.001')}
          {F('min_order_ghs_for_points', 'Min order for points (GHS)')}
          {F('signup_bonus_points', 'Signup bonus points')}
          {F('birthday_bonus_points', 'Birthday bonus points')}
          {F('referral_bonus_referrer_points', 'Referrer reward (points)')}
          {F('referral_bonus_referee_ghs', 'Referee reward (GHS)', 'number', '0.01')}
          {F('max_referrals_per_month', 'Max referrals/month')}
          {F('max_redeem_percent_per_order', 'Max redeem % per order')}
          {F('points_expiry_months', 'Points expiry (months, blank=never)')}
        </div>
        <Button className="mt-4" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
      </CardContent>
    </Card>
  );
};

// ─────────── Promotions ───────────
const PromotionsTab = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: '', multiplier: 2, bonus_points: 0, applies_to: 'all', tier_filter: '', starts_at: '', ends_at: '', active: true });

  const load = async () => {
    const { data } = await supabase.from('loyalty_promotions').select('*').order('created_at', { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name || !form.starts_at || !form.ends_at) return toast.error('Fill name + dates');
    const { error } = await supabase.from('loyalty_promotions').insert({
      ...form,
      tier_filter: form.applies_to === 'tier' ? form.tier_filter : null,
    });
    if (error) return toast.error(error.message);
    toast.success('Promo created'); setOpen(false); load();
  };

  const toggle = async (p: any) => {
    await supabase.from('loyalty_promotions').update({ active: !p.active }).eq('id', p.id);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button onClick={() => setOpen(true)}><Megaphone className="w-4 h-4 mr-1" />New promotion</Button></div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-secondary/50 text-left">
            <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Multi</th><th className="px-3 py-2">Bonus</th><th className="px-3 py-2">Applies</th><th className="px-3 py-2">Window</th><th className="px-3 py-2">Active</th></tr>
          </thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.id} className="border-t border-border/50">
                <td className="px-3 py-2 font-medium">{p.name}</td>
                <td className="px-3 py-2 tabular">{p.multiplier}×</td>
                <td className="px-3 py-2 tabular">{p.bonus_points}</td>
                <td className="px-3 py-2">{p.applies_to}{p.tier_filter ? ` (${p.tier_filter})` : ''}</td>
                <td className="px-3 py-2 text-muted-foreground">{format(new Date(p.starts_at), 'MMM d')} → {format(new Date(p.ends_at), 'MMM d')}</td>
                <td className="px-3 py-2"><Switch checked={p.active} onCheckedChange={() => toggle(p)} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No promotions</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New promotion</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Multiplier</Label><Input type="number" step="0.1" value={form.multiplier} onChange={e => setForm({ ...form, multiplier: parseFloat(e.target.value) })} /></div>
            <div><Label>Bonus points</Label><Input type="number" value={form.bonus_points} onChange={e => setForm({ ...form, bonus_points: parseInt(e.target.value) })} /></div>
            <div><Label>Starts at</Label><Input type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} /></div>
            <div><Label>Ends at</Label><Input type="datetime-local" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={create}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─────────── Audit ───────────
const AuditTab = () => {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('loyalty_audit_log').select('*').order('created_at', { ascending: false }).limit(200);
      setRows(data || []);
    })();
  }, []);
  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-secondary/50 text-left">
          <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Admin</th><th className="px-3 py-2">Target</th><th className="px-3 py-2">Reason</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t border-border/50">
              <td className="px-3 py-2">{format(new Date(r.created_at), 'MMM d HH:mm')}</td>
              <td className="px-3 py-2"><Badge variant="secondary">{r.action}</Badge></td>
              <td className="px-3 py-2 font-mono text-[10px]">{r.admin_user_id?.slice(0,8)}…</td>
              <td className="px-3 py-2 font-mono text-[10px]">{r.target_user_id?.slice(0,8) || '—'}</td>
              <td className="px-3 py-2 text-muted-foreground max-w-md">{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent></Card>
  );
};

const AdminLoyalty = () => {
  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h1 className="font-display font-bold text-2xl tracking-tight">Loyalty & Rewards</h1>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="overview" className="text-xs"><Activity className="w-3.5 h-3.5 mr-1" />Overview</TabsTrigger>
            <TabsTrigger value="members" className="text-xs"><Users className="w-3.5 h-3.5 mr-1" />Members</TabsTrigger>
            <TabsTrigger value="transactions" className="text-xs"><History className="w-3.5 h-3.5 mr-1" />Transactions</TabsTrigger>
            <TabsTrigger value="redemptions" className="text-xs"><Gift className="w-3.5 h-3.5 mr-1" />Redemptions</TabsTrigger>
            <TabsTrigger value="referrals" className="text-xs"><Crown className="w-3.5 h-3.5 mr-1" />Referrals</TabsTrigger>
            <TabsTrigger value="promotions" className="text-xs"><Megaphone className="w-3.5 h-3.5 mr-1" />Promotions</TabsTrigger>
            <TabsTrigger value="settings" className="text-xs"><SettingsIcon className="w-3.5 h-3.5 mr-1" />Settings</TabsTrigger>
            <TabsTrigger value="audit" className="text-xs"><ShieldAlert className="w-3.5 h-3.5 mr-1" />Audit</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-3"><OverviewTab /></TabsContent>
          <TabsContent value="members" className="mt-3"><MembersTab /></TabsContent>
          <TabsContent value="transactions" className="mt-3"><TransactionsTab /></TabsContent>
          <TabsContent value="redemptions" className="mt-3"><RedemptionsTab /></TabsContent>
          <TabsContent value="referrals" className="mt-3"><ReferralsTab /></TabsContent>
          <TabsContent value="promotions" className="mt-3"><PromotionsTab /></TabsContent>
          <TabsContent value="settings" className="mt-3"><SettingsTab /></TabsContent>
          <TabsContent value="audit" className="mt-3"><AuditTab /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminLoyalty;
