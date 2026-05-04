import { useEffect, useState, useCallback } from 'react';
import AdminLayout from './AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Sparkles, Activity, Users, Trophy, ShieldAlert, History,
  ArrowUp, ArrowDown, AlertTriangle, Send, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface OverviewKpis {
  total_users: number;
  users_with_points: number;
  banned_users: number;
  outstanding_points: number;
  points_issued_total: number;
  points_redeemed_total: number;
  redemptions_count: number;
  redemptions_gb: number;
  issued_7d: number;
  redeemed_7d: number;
  active_24h: number;
  breakdown_30d: Record<string, number> | null;
}

interface EarnerRow {
  user_id: string;
  balance: number;
  lifetime_earned: number;
  lifetime_redeemed: number;
  banned: boolean;
  last_activity_at: string;
  chat_id: number | null;
  phone: string | null;
  username: string | null;
  first_name: string | null;
}

interface LedgerRow {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  reference_id: string | null;
  balance_after: number;
  created_at: string;
}

interface LeaderRow {
  rank: number;
  leader_user_id: string;
  chat_id: number | null;
  first_name: string | null;
  username: string | null;
  points_earned: number;
}

const KpiCard = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-2xl font-display font-bold tracking-tight tabular mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </CardContent>
  </Card>
);

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString();

// ── Overview / Analytics (Phase 9) ────────────────────────────────
const OverviewTab = () => {
  const [kpi, setKpi] = useState<OverviewKpis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('telegram_points_overview');
      if (error) { toast.error(error.message); setLoading(false); return; }
      if ((data as any)?.error) { toast.error('Not authorised'); setLoading(false); return; }
      setKpi(data as unknown as OverviewKpis);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  if (!kpi) return <p className="text-sm text-muted-foreground">No data.</p>;

  const breakdown = kpi.breakdown_30d || {};
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Outstanding pts" value={fmt(kpi.outstanding_points)} sub="Liability on books" />
        <KpiCard label="Total users" value={fmt(kpi.total_users)} sub={`${fmt(kpi.users_with_points)} with balance`} />
        <KpiCard label="Active 24h" value={fmt(kpi.active_24h)} />
        <KpiCard label="Banned" value={fmt(kpi.banned_users)} />
        <KpiCard label="Issued (lifetime)" value={fmt(kpi.points_issued_total)} sub={`+${fmt(kpi.issued_7d)} last 7d`} />
        <KpiCard label="Redeemed (lifetime)" value={fmt(kpi.points_redeemed_total)} sub={`-${fmt(kpi.redeemed_7d)} last 7d`} />
        <KpiCard label="Redemptions" value={fmt(kpi.redemptions_count)} sub={`${fmt(kpi.redemptions_gb)} GB issued`} />
        <KpiCard
          label="Net 7d"
          value={fmt(kpi.issued_7d - kpi.redeemed_7d)}
          sub={kpi.issued_7d - kpi.redeemed_7d >= 0 ? '↑ growing' : '↓ shrinking'}
        />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Last 30 days — by reason</CardTitle></CardHeader>
        <CardContent>
          {Object.keys(breakdown).length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity in last 30 days.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(breakdown).map(([reason, total]) => (
                <div key={reason} className="rounded-lg border p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{reason.replace(/_/g, ' ')}</p>
                  <p className={`text-lg font-bold tabular mt-0.5 ${total >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {total >= 0 ? '+' : ''}{fmt(total)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ── Top earners + adjust + ban (Phase 6) ──────────────────────────
const UsersTab = () => {
  const [rows, setRows] = useState<EarnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<EarnerRow | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('telegram_points_top_earners', { p_limit: 100 });
    if (error) { toast.error(error.message); setLoading(false); return; }
    setRows((data as EarnerRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      r.user_id.includes(s) ||
      (r.phone || '').toLowerCase().includes(s) ||
      (r.username || '').toLowerCase().includes(s) ||
      (r.first_name || '').toLowerCase().includes(s) ||
      String(r.chat_id || '').includes(s)
    );
  });

  const submitAdjust = async () => {
    if (!selected) return;
    const d = parseInt(delta, 10);
    if (!Number.isFinite(d) || d === 0) { toast.error('Enter a non-zero number'); return; }
    if (reason.trim().length < 5) { toast.error('Reason needs 5+ chars'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_adjust_telegram_points', {
      p_target_user_id: selected.user_id, p_delta: d, p_reason: reason.trim(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as any;
    if (!r?.success) { toast.error(r?.error || 'Failed'); return; }
    toast.success(`Balance now ${fmt(r.new_balance)} pts`);
    setAdjustOpen(false); setDelta(''); setReason(''); load();
  };

  const submitBan = async () => {
    if (!selected) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_set_telegram_points_ban', {
      p_target_user_id: selected.user_id,
      p_banned: !selected.banned,
      p_reason: reason.trim() || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as any;
    if (!r?.success) { toast.error(r?.error || 'Failed'); return; }
    toast.success(r.banned ? 'User banned from program' : 'Ban lifted');
    setBanOpen(false); setReason(''); load();
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by phone, chat ID, name, or user ID"
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button variant="outline" onClick={load}>Refresh</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No matches.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <Card key={r.user_id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">
                      {r.first_name || r.username || r.phone || 'Unlinked'}
                    </span>
                    {r.banned && <Badge variant="destructive" className="text-[10px]">Banned</Badge>}
                    {r.chat_id && <Badge variant="outline" className="text-[10px]">TG {r.chat_id}</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground tabular truncate">
                    {r.phone || '—'} · earned {fmt(r.lifetime_earned)} · redeemed {fmt(r.lifetime_redeemed)} · last {format(new Date(r.last_activity_at), 'MMM d')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold tabular">{fmt(r.balance)}</p>
                  <p className="text-[10px] text-muted-foreground">pts</p>
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="outline"
                    onClick={() => { setSelected(r); setDelta(''); setReason(''); setAdjustOpen(true); }}>
                    Adjust
                  </Button>
                  <Button size="sm" variant={r.banned ? 'outline' : 'destructive'}
                    onClick={() => { setSelected(r); setReason(''); setBanOpen(true); }}>
                    {r.banned ? 'Unban' : 'Ban'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust points</DialogTitle>
            <DialogDescription>
              {selected && <>Current balance: <strong>{fmt(selected.balance)}</strong> pts</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Delta (positive grants, negative revokes)</Label>
              <Input type="number" placeholder="e.g. 500 or -200" value={delta} onChange={e => setDelta(e.target.value)} />
            </div>
            <div>
              <Label>Reason (audit log, min 5 chars)</Label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button onClick={submitAdjust} disabled={busy}>{busy ? 'Saving…' : 'Apply'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={banOpen} onOpenChange={setBanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.banned ? 'Lift program ban' : 'Ban from points program'}</DialogTitle>
            <DialogDescription>
              {selected?.banned
                ? 'User will be able to earn and redeem points again. Their balance is preserved.'
                : 'User will not be able to earn or redeem points. Their balance is preserved but frozen.'}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Reason (optional)</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBanOpen(false)}>Cancel</Button>
            <Button variant={selected?.banned ? 'default' : 'destructive'} onClick={submitBan} disabled={busy}>
              {busy ? 'Saving…' : selected?.banned ? 'Unban' : 'Ban user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Ledger (audit) ────────────────────────────────────────────────
const LedgerTab = () => {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('telegram_points_ledger').select('*').order('created_at', { ascending: false }).limit(200);
    if (filterUser.trim()) q = q.eq('user_id', filterUser.trim());
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data as LedgerRow[]) || []);
    setLoading(false);
  }, [filterUser]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder="Filter by user ID (UUID)" value={filterUser} onChange={e => setFilterUser(e.target.value)} />
        <Button variant="outline" onClick={load}>Apply</Button>
      </div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No entries.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={r.id} className="rounded-lg border p-2.5 flex items-center gap-3 text-sm">
              {r.delta >= 0
                ? <ArrowUp className="w-4 h-4 text-emerald-600 shrink-0" />
                : <ArrowDown className="w-4 h-4 text-rose-600 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{r.reason}</p>
                <p className="text-[11px] text-muted-foreground tabular truncate">
                  {format(new Date(r.created_at), 'MMM d, HH:mm')} · {r.user_id.slice(0, 8)}… · ref {r.reference_id || '—'}
                </p>
              </div>
              <div className="text-right">
                <p className={`font-bold tabular ${r.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {r.delta >= 0 ? '+' : ''}{fmt(r.delta)}
                </p>
                <p className="text-[10px] text-muted-foreground tabular">→ {fmt(r.balance_after)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Weekly leaderboard (Phase 7) ──────────────────────────────────
const LeaderboardTab = () => {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('telegram_points_weekly_leaderboard', { p_limit: 25 });
      if (error) toast.error(error.message);
      setRows((data as LeaderRow[]) || []);
      setLoading(false);
    })();
  }, []);

  return loading ? (
    <div className="space-y-2">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
  ) : rows.length === 0 ? (
    <p className="text-sm text-muted-foreground py-8 text-center">No earners yet this week.</p>
  ) : (
    <div className="space-y-1.5">
      {rows.map(r => (
        <div key={r.leader_user_id} className="rounded-lg border p-2.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold tabular">
            {r.rank}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{r.first_name || r.username || `TG ${r.chat_id}`}</p>
            <p className="text-[11px] text-muted-foreground">@{r.username || '—'}</p>
          </div>
          <div className="text-right">
            <p className="font-bold tabular">{fmt(r.points_earned)}</p>
            <p className="text-[10px] text-muted-foreground">pts this week</p>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Maintenance (Phase 10) ────────────────────────────────────────
const MaintenanceTab = () => {
  const [busy, setBusy] = useState<string | null>(null);
  const [warningCount, setWarningCount] = useState<number | null>(null);

  const checkWarnings = async () => {
    setBusy('warn-check');
    const { data, error } = await supabase.rpc('telegram_points_expiry_warnings', { p_max: 1000 });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    setWarningCount((data as any[])?.length || 0);
  };

  const runExpiry = async () => {
    if (!confirm('Run inactivity expiry sweep now? This will zero out balances inactive 180+ days.')) return;
    setBusy('expire');
    const { data, error } = await supabase.rpc('expire_telegram_inactive_points', { p_days: 180, p_max: 500 });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    const r = data as any;
    toast.success(`Expired ${fmt(r.expired_users)} users · ${fmt(r.expired_points)} pts`);
  };

  const sendWarnings = async () => {
    setBusy('warn-send');
    const { data, error } = await supabase.functions.invoke('telegram-points-expiry-sweep', {
      body: { mode: 'warnings_only' },
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    const r = data as any;
    toast.success(`Sent ${fmt(r.warnings_sent || 0)} warning DMs`);
    checkWarnings();
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Inactivity expiry — 180 days
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Points expire after 180 days of zero earn/redeem activity. A warning DM is sent 30 days before.
            Both jobs run automatically every day at 03:00 (Africa/Accra) — these buttons are for manual checks.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={checkWarnings} disabled={busy === 'warn-check'}>
              {busy === 'warn-check' ? 'Checking…' : 'Count warning candidates'}
            </Button>
            <Button variant="outline" onClick={sendWarnings} disabled={busy === 'warn-send'}>
              <Send className="w-4 h-4 mr-1" /> {busy === 'warn-send' ? 'Sending…' : 'Send warnings now'}
            </Button>
            <Button variant="destructive" onClick={runExpiry} disabled={busy === 'expire'}>
              {busy === 'expire' ? 'Running…' : 'Run expiry sweep'}
            </Button>
          </div>
          {warningCount !== null && (
            <p className="text-xs">
              <strong>{fmt(warningCount)}</strong> users currently within 30 days of expiry.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const AdminTelegramPoints = () => {
  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" /> Telegram Points
          </h1>
          <p className="text-sm text-muted-foreground">
            Govern the bot loyalty program — earnings, redemptions, leaderboard, and liability.
          </p>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview"><Activity className="w-4 h-4 mr-1.5" />Overview</TabsTrigger>
            <TabsTrigger value="users"><Users className="w-4 h-4 mr-1.5" />Users</TabsTrigger>
            <TabsTrigger value="leaderboard"><Trophy className="w-4 h-4 mr-1.5" />Leaderboard</TabsTrigger>
            <TabsTrigger value="ledger"><History className="w-4 h-4 mr-1.5" />Ledger</TabsTrigger>
            <TabsTrigger value="maintenance"><ShieldAlert className="w-4 h-4 mr-1.5" />Maintenance</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-4"><OverviewTab /></TabsContent>
          <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>
          <TabsContent value="leaderboard" className="mt-4"><LeaderboardTab /></TabsContent>
          <TabsContent value="ledger" className="mt-4"><LedgerTab /></TabsContent>
          <TabsContent value="maintenance" className="mt-4"><MaintenanceTab /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminTelegramPoints;
