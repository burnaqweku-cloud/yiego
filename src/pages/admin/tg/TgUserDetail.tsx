import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import TgAdminLayout from './TgAdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, Send, Sparkles, Unlink2, Ban, RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { fmtGhs, fmtDate } from './_utils';

interface Stats {
  orders_count: number;
  orders_spent_ghs: number;
  deposits_count: number;
  deposits_total_ghs: number;
  points_lifetime_earned: number;
  points_lifetime_redeemed: number;
  points_from_referrals: number;
  first_seen: string | null;
}
interface Detail {
  link: { chat_id: number; username: string | null; first_name: string | null; user_id: string | null; phone: string | null; created_at: string; last_active_at: string | null; linked_at: string | null } | null;
  profile: { full_name: string | null; email: string | null; phone: string | null } | null;
  points: { balance: number; banned_from_points: boolean; last_activity_at: string | null } | null;
  session: { current_step: string | null; updated_at: string | null } | null;
  banned: { reason: string | null; banned_at: string } | null;
  recent_orders: Array<{ order_id: string; network: string; bundle_size_gb: number; amount_ghs: number; status: string; payment_status: string; payment_method?: string; created_at: string }>;
  recent_deposits: Array<{ paystack_reference: string; total_payable: number; status: string; created_at: string }>;
  recent_ledger: Array<{ delta: number; reason: string; reference_id: string | null; balance_after: number; created_at: string }>;
  referrals_sent: number;
  referrals_qualified: number;
  referred_by: { referrer_chat_id: number; status: string; created_at: string; qualified_at: string | null } | null;
  stats: Stats;
}

const TgUserDetail = () => {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  const [msg, setMsg] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [unlinkReason, setUnlinkReason] = useState('');
  const [banReason, setBanReason] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [resetPtsReason, setResetPtsReason] = useState('');
  const [resetPtsConfirm, setResetPtsConfirm] = useState('');
  const [delReason, setDelReason] = useState('');
  const [delConfirm, setDelConfirm] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!chatId) return;
    setLoading(true);
    const { data: d, error } = await supabase.rpc('tg_admin_user_detail', { p_chat_id: Number(chatId) });
    setLoading(false);
    if (error) {
      toast.error('Failed to load user', { description: error.message });
      return;
    }
    setData(d as unknown as Detail);
  }, [chatId]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!msg.trim()) return;
    setBusy('send');
    const { data: r, error } = await supabase.functions.invoke('tg-admin-send-message', {
      body: { chat_id: Number(chatId), text: msg, reason: 'admin manual message' },
    });
    setBusy(null);
    if (error) { toast.error('Send failed', { description: error.message }); return; }
    if (!r?.ok) { toast.error('Telegram rejected message'); return; }
    toast.success('Message sent');
    setMsg('');
  };

  const adjust = async () => {
    const userId = data?.link?.user_id;
    if (!userId) { toast.error('User not linked — cannot adjust points'); return; }
    if (adjReason.trim().length < 5) { toast.error('Reason must be at least 5 chars'); return; }
    const delta = parseInt(adjAmount, 10);
    if (!Number.isFinite(delta) || delta === 0) { toast.error('Enter a non-zero integer'); return; }
    setBusy('adjust');
    const { data: r, error } = await supabase.rpc('admin_adjust_telegram_points', {
      p_target_user_id: userId, p_delta: delta, p_reason: adjReason,
    });
    setBusy(null);
    if (error) { toast.error('Adjust failed', { description: error.message }); return; }
    const result = r as { success: boolean; error?: string; new_balance?: number };
    if (!result.success) { toast.error(result.error || 'Adjust failed'); return; }
    toast.success(`New balance: ${result.new_balance}`);
    setAdjAmount(''); setAdjReason('');
    load();
  };

  const forceUnlink = async () => {
    if (unlinkReason.trim().length < 5) { toast.error('Reason required (5+ chars)'); return; }
    setBusy('unlink');
    const { error } = await supabase.rpc('tg_admin_force_unlink', { p_chat_id: Number(chatId), p_reason: unlinkReason });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Account unlinked');
    setUnlinkReason('');
    load();
  };

  const setBan = async (banned: boolean) => {
    if (banned && banReason.trim().length < 5) { toast.error('Reason required'); return; }
    setBusy('ban');
    const { error } = await supabase.rpc('tg_admin_set_full_ban', { p_chat_id: Number(chatId), p_banned: banned, p_reason: banReason });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(banned ? 'User banned' : 'User unbanned');
    setBanReason('');
    load();
  };

  const resetSession = async () => {
    if (resetReason.trim().length < 3) { toast.error('Reason required'); return; }
    setBusy('reset');
    const { error } = await supabase.rpc('tg_admin_reset_session', { p_chat_id: Number(chatId), p_reason: resetReason });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Session reset');
    setResetReason('');
    load();
  };

  const resetPoints = async () => {
    if (resetPtsConfirm !== String(chatId)) { toast.error('Type the chat_id to confirm'); return; }
    if (resetPtsReason.trim().length < 5) { toast.error('Reason required (5+ chars)'); return; }
    setBusy('resetpts');
    const { data: r, error } = await supabase.rpc('tg_admin_reset_points', { p_chat_id: Number(chatId), p_reason: resetPtsReason });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    const res = r as { ok: boolean; old_balance?: number };
    toast.success(`Balance reset (was ${res.old_balance ?? 0})`);
    setResetPtsReason(''); setResetPtsConfirm('');
    load();
  };

  const deleteUser = async () => {
    if (delConfirm !== String(chatId)) { toast.error('Type the chat_id to confirm'); return; }
    if (delReason.trim().length < 5) { toast.error('Reason required (5+ chars)'); return; }
    setBusy('delete');
    const { error } = await supabase.rpc('tg_admin_delete_user', { p_chat_id: Number(chatId), p_reason: delReason });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success('User deleted');
    navigate('/admin/tg/users');
  };

  return (
    <TgAdminLayout title={`User ${chatId}`} description="Telegram profile, activity and admin actions.">
      <div className="mb-3">
        <Link to="/admin/tg/users" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to users
        </Link>
      </div>

      {loading || !data ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : (
        <>
          {/* Header card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card><CardContent className="p-4 space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Telegram</p>
              <p className="text-sm font-semibold">{data.link?.first_name || data.link?.username || '—'}</p>
              <p className="text-xs text-muted-foreground">@{data.link?.username || '—'} · chat_id <span className="font-mono">{data.link?.chat_id}</span></p>
              <p className="text-xs text-muted-foreground">Joined {fmtDate(data.link?.created_at)} · Last active {fmtDate(data.link?.last_active_at)}</p>
              {data.banned && <p className="text-xs text-destructive mt-1">Banned: {data.banned.reason || 'no reason'} ({fmtDate(data.banned.banned_at)})</p>}
            </CardContent></Card>
            <Card><CardContent className="p-4 space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Linked Account</p>
              {data.profile ? (
                <>
                  <p className="text-sm font-semibold">{data.profile.full_name || '—'}</p>
                  <p className="text-xs text-muted-foreground">{data.profile.email || '—'} · {data.profile.phone || '—'}</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Guest user — no linked account.</p>
              )}
            </CardContent></Card>
          </div>

          {/* Lifetime stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <Card><CardContent className="p-3"><p className="text-[10px] uppercase text-muted-foreground">Orders</p><p className="text-sm font-bold">{data.stats?.orders_count ?? 0}</p><p className="text-[10px] text-muted-foreground">{fmtGhs(data.stats?.orders_spent_ghs ?? 0)} spent</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-[10px] uppercase text-muted-foreground">Deposits</p><p className="text-sm font-bold">{data.stats?.deposits_count ?? 0}</p><p className="text-[10px] text-muted-foreground">{fmtGhs(data.stats?.deposits_total_ghs ?? 0)}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><Sparkles className="w-3 h-3" />Points balance</p><p className="text-sm font-bold">{(data.points?.balance ?? 0).toLocaleString()}</p>{data.points?.banned_from_points && <p className="text-[10px] text-destructive">banned</p>}</CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-[10px] uppercase text-muted-foreground">Referrals</p><p className="text-sm font-bold">{data.referrals_qualified}/{data.referrals_sent}</p><p className="text-[10px] text-muted-foreground">qualified / sent</p></CardContent></Card>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <Card><CardContent className="p-3"><p className="text-[10px] uppercase text-muted-foreground">Pts earned (lifetime)</p><p className="text-sm font-bold text-emerald-600">+{(data.stats?.points_lifetime_earned ?? 0).toLocaleString()}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-[10px] uppercase text-muted-foreground">Pts redeemed (lifetime)</p><p className="text-sm font-bold">{(data.stats?.points_lifetime_redeemed ?? 0).toLocaleString()}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-[10px] uppercase text-muted-foreground">Pts from referrals</p><p className="text-sm font-bold">{(data.stats?.points_from_referrals ?? 0).toLocaleString()}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-[10px] uppercase text-muted-foreground">Referred by</p><p className="text-sm font-bold">{data.referred_by ? <Link to={`/admin/tg/users/${data.referred_by.referrer_chat_id}`} className="text-primary hover:underline font-mono">{data.referred_by.referrer_chat_id}</Link> : '—'}</p>{data.referred_by && <p className="text-[10px] text-muted-foreground">{data.referred_by.status}</p>}</CardContent></Card>
          </div>

          {/* Activity tabs */}
          <Tabs defaultValue="orders" className="mt-4">
            <TabsList className="flex-wrap">
              <TabsTrigger value="orders" className="text-xs">Orders ({data.recent_orders.length})</TabsTrigger>
              <TabsTrigger value="deposits" className="text-xs">Deposits ({data.recent_deposits.length})</TabsTrigger>
              <TabsTrigger value="ledger" className="text-xs">Points Ledger ({data.recent_ledger.length})</TabsTrigger>
              <TabsTrigger value="session" className="text-xs">Session</TabsTrigger>
            </TabsList>
            <TabsContent value="orders">
              <Card><CardContent className="p-0 overflow-x-auto">
                {data.recent_orders.length === 0 ? <p className="p-4 text-xs text-muted-foreground">No orders.</p> : (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr>
                      <th className="px-3 py-2 text-left">Order</th><th className="px-3 py-2 text-left">Network</th>
                      <th className="px-3 py-2 text-right">GB</th><th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-left">Method</th>
                      <th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Created</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {data.recent_orders.map(o => (
                        <tr key={o.order_id}>
                          <td className="px-3 py-2 font-mono"><Link to={`/admin/orders/${o.order_id}`} className="text-primary hover:underline">{o.order_id}</Link></td>
                          <td className="px-3 py-2">{o.network}</td><td className="px-3 py-2 text-right">{o.bundle_size_gb}</td>
                          <td className="px-3 py-2 text-right">{fmtGhs(o.amount_ghs)}</td>
                          <td className="px-3 py-2 text-[10px]">{o.payment_method || '—'}</td>
                          <td className="px-3 py-2">{o.status}</td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtDate(o.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent></Card>
            </TabsContent>
            <TabsContent value="deposits">
              <Card><CardContent className="p-0 overflow-x-auto">
                {data.recent_deposits.length === 0 ? <p className="p-4 text-xs text-muted-foreground">No deposits.</p> : (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr>
                      <th className="px-3 py-2 text-left">Reference</th><th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Created</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {data.recent_deposits.map(d => (
                        <tr key={d.paystack_reference}>
                          <td className="px-3 py-2 font-mono">{d.paystack_reference}</td>
                          <td className="px-3 py-2 text-right">{fmtGhs(d.total_payable)}</td>
                          <td className="px-3 py-2">{d.status}</td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtDate(d.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent></Card>
            </TabsContent>
            <TabsContent value="ledger">
              <Card><CardContent className="p-0 overflow-x-auto">
                {data.recent_ledger.length === 0 ? <p className="p-4 text-xs text-muted-foreground">No points entries.</p> : (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr>
                      <th className="px-3 py-2 text-right">Delta</th><th className="px-3 py-2 text-left">Reason</th>
                      <th className="px-3 py-2 text-left">Reference</th><th className="px-3 py-2 text-right">Balance</th>
                      <th className="px-3 py-2 text-left">When</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {data.recent_ledger.map((l, i) => (
                        <tr key={i}>
                          <td className={`px-3 py-2 text-right font-semibold ${l.delta > 0 ? 'text-emerald-600' : 'text-destructive'}`}>{l.delta > 0 ? '+' : ''}{l.delta}</td>
                          <td className="px-3 py-2">{l.reason}</td>
                          <td className="px-3 py-2 font-mono text-[10px]">{l.reference_id || '—'}</td>
                          <td className="px-3 py-2 text-right">{l.balance_after}</td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtDate(l.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent></Card>
            </TabsContent>
            <TabsContent value="session">
              <Card><CardContent className="p-4 text-xs">
                {data.session ? (
                  <>
                    <p>Step: <b>{data.session.current_step || '—'}</b></p>
                    <p className="text-muted-foreground mt-1">Updated {fmtDate(data.session.updated_at)}</p>
                  </>
                ) : <p className="text-muted-foreground">No active session.</p>}
              </CardContent></Card>
            </TabsContent>
          </Tabs>

          {/* Admin actions */}
          <div className="mt-4">
            <h2 className="text-sm font-semibold mb-2">Admin actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card><CardContent className="p-4 space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1"><Send className="w-3 h-3" /> Send Telegram message</p>
                <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Type message (HTML supported)" className="text-xs min-h-[80px]" />
                <Button size="sm" onClick={send} disabled={busy === 'send' || !msg.trim()} className="text-xs">Send</Button>
              </CardContent></Card>

              <Card><CardContent className="p-4 space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1"><Sparkles className="w-3 h-3" /> Adjust points</p>
                <div className="flex gap-2">
                  <Input type="number" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} placeholder="±delta" className="h-8 text-xs w-24" />
                  <Input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="Reason (5+ chars)" className="h-8 text-xs flex-1" />
                </div>
                <Button size="sm" onClick={adjust} disabled={busy === 'adjust' || !data.link?.user_id} className="text-xs">Apply</Button>
                {!data.link?.user_id && <p className="text-[10px] text-muted-foreground">Adjustments require a linked account.</p>}
              </CardContent></Card>

              <Card><CardContent className="p-4 space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1"><Unlink2 className="w-3 h-3" /> Force-unlink</p>
                <Input value={unlinkReason} onChange={(e) => setUnlinkReason(e.target.value)} placeholder="Reason" className="h-8 text-xs" disabled={!data.link?.user_id} />
                <Button size="sm" variant="destructive" onClick={forceUnlink} disabled={busy === 'unlink' || !data.link?.user_id} className="text-xs">Unlink</Button>
                {!data.link?.user_id && <p className="text-[10px] text-muted-foreground">Guest user — nothing to unlink.</p>}
              </CardContent></Card>

              <Card><CardContent className="p-4 space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1"><Ban className="w-3 h-3" /> {data.banned ? 'Unban user' : 'Ban from bot'}</p>
                {!data.banned && <Input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Reason" className="h-8 text-xs" />}
                <Button size="sm" variant={data.banned ? 'outline' : 'destructive'} onClick={() => setBan(!data.banned)} disabled={busy === 'ban'} className="text-xs">
                  {data.banned ? 'Unban' : 'Ban'}
                </Button>
              </CardContent></Card>

              <Card><CardContent className="p-4 space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Reset stuck session</p>
                <Input value={resetReason} onChange={(e) => setResetReason(e.target.value)} placeholder="Reason" className="h-8 text-xs" />
                <Button size="sm" variant="outline" onClick={resetSession} disabled={busy === 'reset'} className="text-xs">Reset</Button>
              </CardContent></Card>
            </div>
          </div>

          {/* Danger zone */}
          <div className="mt-6">
            <h2 className="text-sm font-semibold mb-2 text-destructive flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Danger Zone</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card className="border-destructive/40"><CardContent className="p-4 space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1"><RotateCcw className="w-3 h-3 text-destructive" /> Reset points balance</p>
                <p className="text-[10px] text-muted-foreground">Zeros out the user's points balance. Ledger history is preserved with a RESET entry.</p>
                <Input value={resetPtsReason} onChange={e=>setResetPtsReason(e.target.value)} placeholder="Reason (5+ chars)" className="h-8 text-xs" />
                <Input value={resetPtsConfirm} onChange={e=>setResetPtsConfirm(e.target.value)} placeholder={`Type chat_id ${chatId} to confirm`} className="h-8 text-xs" />
                <Button size="sm" variant="destructive" onClick={resetPoints} disabled={busy==='resetpts' || !data.link?.user_id} className="text-xs">Reset Balance</Button>
              </CardContent></Card>

              <Card className="border-destructive/40"><CardContent className="p-4 space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1"><Trash2 className="w-3 h-3 text-destructive" /> Delete user</p>
                <p className="text-[10px] text-muted-foreground">Removes link, session, balance. Known-user record kept (anti-Sybil). Open tickets closed. Audit-logged.</p>
                <Input value={delReason} onChange={e=>setDelReason(e.target.value)} placeholder="Reason (5+ chars)" className="h-8 text-xs" />
                <Input value={delConfirm} onChange={e=>setDelConfirm(e.target.value)} placeholder={`Type chat_id ${chatId} to confirm`} className="h-8 text-xs" />
                <Button size="sm" variant="destructive" onClick={deleteUser} disabled={busy==='delete'} className="text-xs">Delete User</Button>
              </CardContent></Card>
            </div>
          </div>
        </>
      )}
    </TgAdminLayout>
  );
};

export default TgUserDetail;
