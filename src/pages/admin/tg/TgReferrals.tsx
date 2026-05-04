import { useEffect, useState, useCallback } from 'react';
import TgAdminLayout from './TgAdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { fmtDate } from './_utils';

interface Row { id: string; referrer_chat_id: number; referee_chat_id: number; status: string; qualifying_order_id: string | null; created_at: string; qualified_at: string | null; rewarded_at: string | null; referrer_name: string | null; referee_name: string | null; }
interface Overview {
  total: number; qualified: number; pending: number; invalid: number; conversion_rate: number; points_granted: number;
  leaderboard: Array<{ referrer_chat_id: number; first_name: string | null; username: string | null; total: number; qualified: number; points_earned: number }>;
  suspicious_phones: Array<{ recipient_number: string; distinct_chats: number; orders: number }>;
  high_velocity: Array<{ referrer_chat_id: number; refs_24h: number }>;
}

const TgReferrals = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [list, ov] = await Promise.all([
      supabase.rpc('tg_admin_referrals_list', { p_status: status || null, p_page: 1, p_size: 100 }),
      supabase.rpc('tg_admin_referrals_overview'),
    ]);
    setLoading(false);
    if (list.error) { toast.error(list.error.message); return; }
    setRows((list.data as unknown as { rows: Row[] }).rows);
    if (ov.data) setOverview(ov.data as unknown as Overview);
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const act = async (id: string, fn: 'invalidate' | 'qualify') => {
    const r = reason[id] || '';
    if (r.trim().length < 5) { toast.error('Reason 5+ chars required'); return; }
    const { error } = await supabase.rpc(fn === 'invalidate' ? 'tg_admin_invalidate_referral' : 'tg_admin_force_qualify_referral', { p_id: id, p_reason: r });
    if (error) { toast.error(error.message); return; }
    toast.success('Done'); load();
  };

  return (
    <TgAdminLayout title="Referrals" description="Bot referral chain, qualifications, leaderboard and abuse signals.">
      {overview && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">Total</p><p className="text-lg font-bold mt-1">{overview.total}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">Qualified</p><p className="text-lg font-bold mt-1 text-emerald-600">{overview.qualified}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">Pending</p><p className="text-lg font-bold mt-1">{overview.pending}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">Conversion</p><p className="text-lg font-bold mt-1">{overview.conversion_rate}%</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">Pts granted</p><p className="text-lg font-bold mt-1">{overview.points_granted.toLocaleString()}</p></CardContent></Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <Card><CardContent className="p-4">
              <p className="text-xs font-semibold mb-2">Top referrers</p>
              <div className="space-y-1 text-xs max-h-64 overflow-y-auto">{overview.leaderboard.map(l => (
                <div key={l.referrer_chat_id} className="flex justify-between gap-2">
                  <Link to={`/admin/tg/users/${l.referrer_chat_id}`} className="hover:underline truncate">{l.first_name || l.username || l.referrer_chat_id}</Link>
                  <span className="text-muted-foreground shrink-0">{l.qualified}/{l.total} · {l.points_earned}pts</span>
                </div>
              ))}</div>
            </CardContent></Card>

            <Card><CardContent className="p-4">
              <p className="text-xs font-semibold mb-2 text-amber-600">⚠ Suspicious patterns</p>
              {overview.suspicious_phones.length === 0 && overview.high_velocity.length === 0 ? (
                <p className="text-xs text-muted-foreground">No anomalies detected.</p>
              ) : (
                <div className="space-y-2 text-xs max-h-64 overflow-y-auto">
                  {overview.suspicious_phones.length > 0 && <div>
                    <p className="text-[10px] uppercase text-muted-foreground mb-1">Recipient phone reuse (Sybil)</p>
                    {overview.suspicious_phones.map(s => (
                      <div key={s.recipient_number} className="flex justify-between"><span className="font-mono">{s.recipient_number}</span><span>{s.distinct_chats} chats / {s.orders} orders</span></div>
                    ))}
                  </div>}
                  {overview.high_velocity.length > 0 && <div className="pt-2 border-t border-border">
                    <p className="text-[10px] uppercase text-muted-foreground mb-1">High-velocity referrers (24h)</p>
                    {overview.high_velocity.map(h => (
                      <div key={h.referrer_chat_id} className="flex justify-between">
                        <Link to={`/admin/tg/users/${h.referrer_chat_id}`} className="hover:underline font-mono">{h.referrer_chat_id}</Link>
                        <span className="text-destructive">{h.refs_24h} refs</span>
                      </div>
                    ))}
                  </div>}
                </div>
              )}
            </CardContent></Card>
          </div>
        </>
      )}

      <Card className="mt-3"><CardContent className="p-3">
        <select value={status} onChange={e=>setStatus(e.target.value)} className="h-8 px-2 text-xs rounded-md border border-border bg-background">
          <option value="">All</option><option value="pending">Pending</option><option value="qualified">Qualified</option><option value="rewarded">Rewarded</option><option value="invalid">Invalid</option>
        </select>
      </CardContent></Card>
      <Card className="mt-3"><CardContent className="p-0 overflow-x-auto">
        {loading ? <div className="p-3 space-y-2">{Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-8" />)}</div>
        : rows.length === 0 ? <p className="p-6 text-xs text-muted-foreground text-center">No referrals.</p>
        : <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr>
              <th className="px-3 py-2 text-left">Referrer</th><th className="px-3 py-2 text-left">Referee</th>
              <th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Created</th>
              <th className="px-3 py-2 text-left">Qualified</th><th className="px-3 py-2 text-left">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">{rows.map(r => (
              <tr key={r.id}>
                <td className="px-3 py-2"><Link to={`/admin/tg/users/${r.referrer_chat_id}`} className="hover:underline">{r.referrer_name || r.referrer_chat_id}</Link></td>
                <td className="px-3 py-2"><Link to={`/admin/tg/users/${r.referee_chat_id}`} className="hover:underline">{r.referee_name || r.referee_chat_id}</Link></td>
                <td className="px-3 py-2"><span className={r.status==='qualified'||r.status==='rewarded'?'text-emerald-600':r.status==='invalid'?'text-destructive':''}>{r.status}</span></td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.created_at)}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.qualified_at)}</td>
                <td className="px-3 py-2"><div className="flex gap-1 items-center">
                  <Input value={reason[r.id] || ''} onChange={e=>setReason(s=>({...s,[r.id]:e.target.value}))} placeholder="Reason" className="h-6 text-[10px] w-24" />
                  {r.status === 'pending' && <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={()=>act(r.id,'qualify')}>Qualify</Button>}
                  {r.status !== 'invalid' && <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2" onClick={()=>act(r.id,'invalidate')}>Invalid</Button>}
                </div></td>
              </tr>))}</tbody>
          </table>}
      </CardContent></Card>
    </TgAdminLayout>
  );
};
export default TgReferrals;
