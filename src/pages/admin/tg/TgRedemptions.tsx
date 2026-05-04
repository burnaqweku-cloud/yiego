import { useEffect, useState, useCallback } from 'react';
import TgAdminLayout from './TgAdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { fmtDate } from './_utils';

interface Row { order_id: string; telegram_chat_id: number; network: string; bundle_size_gb: number; recipient_number: string; status: string; created_at: string; points_spent: number; }
interface Resp { rows: Row[]; total: number; lifetime_points: number; lifetime_gb: number; }

const TgRedemptions = () => {
  const [resp, setResp] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [network, setNetwork] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('tg_admin_redemptions_list', {
      p_status: status || null, p_network: network || null, p_from: null, p_to: null, p_page: 1, p_size: 200,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setResp(data as unknown as Resp);
  }, [status, network]);
  useEffect(() => { load(); }, [load]);

  return (
    <TgAdminLayout title="Points Redemptions" description="Bundles redeemed with points (RWD/TG- orders, payment_method=reward).">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">Total redemptions</p><p className="text-lg font-bold mt-1">{resp?.total ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">Lifetime points spent</p><p className="text-lg font-bold mt-1">{(resp?.lifetime_points ?? 0).toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">Lifetime GB delivered</p><p className="text-lg font-bold mt-1">{Number(resp?.lifetime_gb ?? 0).toFixed(0)} GB</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">Showing</p><p className="text-lg font-bold mt-1">{resp?.rows?.length ?? 0}</p></CardContent></Card>
      </div>

      <Card><CardContent className="p-3 flex flex-wrap gap-2">
        <select value={status} onChange={e=>setStatus(e.target.value)} className="h-8 px-2 text-xs rounded-md border border-border bg-background">
          <option value="">All statuses</option>
          <option value="Processing">Processing</option>
          <option value="Delivered">Delivered</option>
          <option value="Failed">Failed</option>
        </select>
        <select value={network} onChange={e=>setNetwork(e.target.value)} className="h-8 px-2 text-xs rounded-md border border-border bg-background">
          <option value="">All networks</option>
          <option value="MTN">MTN</option>
          <option value="Telecel">Telecel</option>
          <option value="AirtelTigo">AirtelTigo</option>
        </select>
      </CardContent></Card>

      <Card className="mt-3"><CardContent className="p-0 overflow-x-auto">
        {loading ? <div className="p-3 space-y-2">{Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-8" />)}</div>
        : !resp?.rows?.length ? <p className="p-6 text-xs text-muted-foreground text-center">No redemptions match the filters.</p>
        : <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr>
              <th className="px-3 py-2 text-left">Order</th><th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-left">Network</th><th className="px-3 py-2 text-right">GB</th>
              <th className="px-3 py-2 text-right">Pts spent</th>
              <th className="px-3 py-2 text-left">Recipient</th><th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Created</th>
            </tr></thead>
            <tbody className="divide-y divide-border">{resp.rows.map(r => (
              <tr key={r.order_id} className="hover:bg-muted/40">
                <td className="px-3 py-2 font-mono"><Link to={`/admin/orders/${r.order_id}`} className="text-primary hover:underline">{r.order_id}</Link></td>
                <td className="px-3 py-2"><Link to={`/admin/tg/users/${r.telegram_chat_id}`} className="hover:underline font-mono">{r.telegram_chat_id}</Link></td>
                <td className="px-3 py-2 uppercase">{r.network}</td><td className="px-3 py-2 text-right">{r.bundle_size_gb}</td>
                <td className="px-3 py-2 text-right font-semibold">{r.points_spent ? r.points_spent.toLocaleString() : '—'}</td>
                <td className="px-3 py-2">{r.recipient_number}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.created_at)}</td>
              </tr>))}</tbody>
          </table>}
      </CardContent></Card>
    </TgAdminLayout>
  );
};
export default TgRedemptions;
