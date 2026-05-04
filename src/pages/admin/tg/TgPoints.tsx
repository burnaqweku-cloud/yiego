import { useEffect, useState, useCallback } from 'react';
import TgAdminLayout from './TgAdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { fmtDate, downloadCsv } from './_utils';

interface Overview { outstanding: number; granted_week: number; redeemed_week: number; expired_week: number; breakdown_30d: Record<string, number> | null;
  top_earners: Array<{ user_id: string | null; balance: number | null; chat_id: number | null; first_name: string | null; username: string | null }>;
  top_referrers: Array<{ referrer_chat_id: number; qualified: number }>; }
interface LedgerRow { id: string; user_id: string; delta: number; reason: string; reference_id: string | null; balance_after: number; created_at: string; chat_id: number | null; first_name: string | null; }

const SETTING_KEYS = [
  ['referrer_reward', 400, 'Referrer reward (pts)'],
  ['referee_reward', 100, 'Referee reward (pts)'],
  ['daily_checkin', 5, 'Daily check-in (pts)'],
  ['streak_bonus', 20, 'Streak bonus (pts)'],
  ['streak_interval_days', 7, 'Streak interval (days)'],
  ['points_per_ghs', 1, 'Pts per GHS'],
  ['expiry_months', 6, 'Expiry window (months)'],
  ['min_order_for_referral', 0, 'Min order GHS for referral'],
] as const;

const TgPoints = () => {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [killSwitch, setKillSwitch] = useState<boolean>(true);
  const [settings, setSettings] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [adjUser, setAdjUser] = useState(''); const [adjDelta, setAdjDelta] = useState(''); const [adjReason, setAdjReason] = useState('');

  const loadAll = useCallback(async () => {
    const [ov, lg, cfg, ts] = await Promise.all([
      supabase.rpc('tg_admin_points_overview'),
      supabase.rpc('tg_admin_points_ledger', { p_chat_id: null, p_reason: null, p_from: null, p_to: null, p_page: 1, p_size: 100 }),
      supabase.from('telegram_points_config').select('points_system_enabled').eq('id', true).maybeSingle(),
      supabase.from('tg_admin_settings').select('key, value').in('key', SETTING_KEYS.map(s => s[0])),
    ]);
    if (ov.data) setOverview(ov.data as unknown as Overview);
    if (lg.data) setLedger((lg.data as unknown as { rows: LedgerRow[] }).rows);
    if (cfg.data) setKillSwitch(cfg.data.points_system_enabled !== false);
    if (ts.data) {
      const m: Record<string, number> = {};
      (ts.data as Array<{ key: string; value: unknown }>).forEach(r => { m[r.key] = Number(r.value); });
      setSettings(m);
    }
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const saveSetting = async (key: string, value: number) => {
    setBusy(key);
    const { error } = await supabase.rpc('set_tg_admin_setting', { p_key: key, p_value: value, p_reason: 'admin update' });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Saved ${key}`);
    setSettings(s => ({ ...s, [key]: value }));
  };

  const toggleKill = async (enabled: boolean) => {
    setBusy('kill');
    const { error } = await supabase.rpc('tg_admin_set_kill_switch', { p_enabled: enabled, p_reason: enabled ? 're-enable' : 'pause issuance' });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    setKillSwitch(enabled);
    toast.success(`Points system ${enabled ? 'ENABLED' : 'DISABLED'}`);
  };

  const adjustPoints = async () => {
    if (!adjUser || !adjDelta || adjReason.trim().length < 5) { toast.error('Fill all fields (reason 5+ chars)'); return; }
    setBusy('adj');
    const { data, error } = await supabase.rpc('admin_adjust_telegram_points', { p_target_user_id: adjUser, p_delta: parseInt(adjDelta, 10), p_reason: adjReason });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    const r = data as { success: boolean; error?: string; new_balance?: number };
    if (!r.success) { toast.error(r.error || 'Failed'); return; }
    toast.success(`New balance: ${r.new_balance}`);
    setAdjUser(''); setAdjDelta(''); setAdjReason(''); loadAll();
  };

  return (
    <TgAdminLayout title="Points System" description="Overview, ledger, configuration and manual adjustments.">
      <Tabs defaultValue="overview">
        <TabsList><TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="ledger" className="text-xs">Ledger</TabsTrigger>
          <TabsTrigger value="config" className="text-xs">Configuration</TabsTrigger>
          <TabsTrigger value="adjust" className="text-xs">Manual Adjust</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {!overview ? <Skeleton className="h-32" /> : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">Outstanding</p><p className="text-lg font-bold mt-1">{overview.outstanding.toLocaleString()}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">Granted 7d</p><p className="text-lg font-bold mt-1 text-emerald-600">+{overview.granted_week.toLocaleString()}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">Redeemed 7d</p><p className="text-lg font-bold mt-1">{overview.redeemed_week.toLocaleString()}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">Expired 7d</p><p className="text-lg font-bold mt-1 text-destructive">{overview.expired_week.toLocaleString()}</p></CardContent></Card>
              </div>
              <Card><CardContent className="p-4">
                <p className="text-xs font-semibold mb-2">Top earners</p>
                <div className="space-y-1 text-xs">
                  {(overview.top_earners || []).map((e, idx) => {
                    const label = e.first_name || e.username || (e.user_id ? e.user_id.slice(0,8) : (e.chat_id ? `#${e.chat_id}` : 'unknown'));
                    const key = e.user_id || `chat-${e.chat_id ?? idx}`;
                    return (
                      <div key={key} className="flex justify-between">
                        <span>{label}</span>
                        <span className="font-bold">{Number(e.balance ?? 0).toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent></Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="ledger">
          <div className="flex justify-end mb-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => downloadCsv('tg-ledger.csv', ledger as unknown as Record<string, unknown>[])} disabled={!ledger.length}>Export CSV</Button>
          </div>
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr>
                <th className="px-3 py-2 text-left">When</th><th className="px-3 py-2 text-left">User</th>
                <th className="px-3 py-2 text-right">Δ</th><th className="px-3 py-2 text-left">Reason</th>
                <th className="px-3 py-2 text-left">Reference</th><th className="px-3 py-2 text-right">Balance</th>
              </tr></thead>
              <tbody className="divide-y divide-border">{(ledger || []).map(l => (
                <tr key={l.id}><td className="px-3 py-2 text-muted-foreground">{fmtDate(l.created_at)}</td>
                  <td className="px-3 py-2">{l.first_name || (l.user_id ? l.user_id.slice(0,8) : (l as unknown as { chat_id?: number }).chat_id ? `#${(l as unknown as { chat_id?: number }).chat_id}` : '—')}</td>
                  <td className={`px-3 py-2 text-right font-bold ${l.delta>0?'text-emerald-600':'text-destructive'}`}>{l.delta>0?'+':''}{l.delta}</td>
                  <td className="px-3 py-2">{l.reason}</td>
                  <td className="px-3 py-2 font-mono text-[10px]">{l.reference_id || '—'}</td>
                  <td className="px-3 py-2 text-right">{l.balance_after}</td>
                </tr>))}</tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="config">
          <Card><CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div><p className="text-sm font-semibold">Points system</p><p className="text-xs text-muted-foreground">Master kill-switch — disables all earning and redemption.</p></div>
              <Switch checked={killSwitch} disabled={busy==='kill'} onCheckedChange={toggleKill} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SETTING_KEYS.map(([key, def, label]) => (
                <SettingRow key={key} k={key} label={label} value={settings[key] ?? def} busy={busy===key} onSave={(v) => saveSetting(key, v)} />
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground pt-2 border-t border-border">
              Note: bot reads settings via <code>get_tg_setting()</code>. To make new keys live, the bot must be patched to call this RPC for each value.
            </p>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="adjust">
          <Card><CardContent className="p-4 space-y-2 max-w-md">
            <p className="text-xs font-semibold">Manual point adjustment</p>
            <Input value={adjUser} onChange={e=>setAdjUser(e.target.value)} placeholder="Target user_id (uuid)" className="h-8 text-xs" />
            <Input type="number" value={adjDelta} onChange={e=>setAdjDelta(e.target.value)} placeholder="Delta (±)" className="h-8 text-xs" />
            <Input value={adjReason} onChange={e=>setAdjReason(e.target.value)} placeholder="Reason (5+ chars)" className="h-8 text-xs" />
            <Button size="sm" onClick={adjustPoints} disabled={busy==='adj'} className="text-xs">Apply</Button>
            <p className="text-[10px] text-muted-foreground pt-2">Tip: open the user detail page from <a className="underline" href="/admin/tg/users">Users</a> for in-context adjustments.</p>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </TgAdminLayout>
  );
};

const SettingRow = ({ k, label, value, busy, onSave }: { k: string; label: string; value: number; busy: boolean; onSave: (v: number) => void }) => {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{label}</p><p className="text-[10px] text-muted-foreground font-mono">{k}</p></div>
      <Input type="number" value={v} onChange={e=>setV(e.target.value)} className="h-7 w-20 text-xs" />
      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy || Number(v) === value} onClick={() => onSave(Number(v))}>Save</Button>
    </div>
  );
};

export default TgPoints;
