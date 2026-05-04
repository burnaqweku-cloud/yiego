import { useEffect, useState, useCallback } from 'react';
import TgAdminLayout from './TgAdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { fmtGhs, fmtDate, downloadCsv } from './_utils';

interface Row {
  order_id: string; telegram_chat_id: number; customer_name: string | null;
  network: string; bundle_size_gb: number; recipient_number: string;
  amount_ghs: number; payment_method: string | null; status: string;
  payment_status: string; created_at: string;
}

const TgOrders = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [network, setNetwork] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('tg_admin_orders_list', {
      p_status: status || null, p_network: network || null,
      p_search: search || null, p_from: null, p_to: null, p_page: page, p_size: 50,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    const d = data as unknown as { rows: Row[]; total: number };
    setRows(d.rows); setTotal(d.total);
  }, [status, network, search, page]);

  useEffect(() => { load(); }, [load]);
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <TgAdminLayout title="Bot Orders" description="All data orders placed through the Telegram bot.">
      <Card><CardContent className="p-3 flex flex-wrap gap-2">
        <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="order_id, phone, name…" className="h-8 text-xs flex-1 min-w-[180px]" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-8 px-2 text-xs rounded-md border border-border bg-background">
          <option value="">All status</option><option value="pending">Pending</option><option value="processing">Processing</option><option value="delivered">Delivered</option><option value="failed">Failed</option>
        </select>
        <select value={network} onChange={(e) => { setNetwork(e.target.value); setPage(1); }} className="h-8 px-2 text-xs rounded-md border border-border bg-background">
          <option value="">All networks</option><option value="mtn">MTN</option><option value="telecel">Telecel</option><option value="airteltigo">AirtelTigo</option>
        </select>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => downloadCsv(`tg-orders-page-${page}.csv`, rows as unknown as Record<string, unknown>[])} disabled={!rows.length}>
          <Download className="w-3 h-3" /> CSV
        </Button>
      </CardContent></Card>

      <Card className="mt-3"><CardContent className="p-0 overflow-x-auto">
        {loading ? <div className="p-3 space-y-2">{Array.from({length:8}).map((_,i)=><Skeleton key={i} className="h-8" />)}</div>
        : rows.length === 0 ? <p className="p-6 text-xs text-muted-foreground text-center">No orders.</p>
        : <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr>
              <th className="px-3 py-2 text-left">Order</th><th className="px-3 py-2 text-left">Customer</th>
              <th className="px-3 py-2 text-left">Network</th><th className="px-3 py-2 text-right">GB</th>
              <th className="px-3 py-2 text-left">Recipient</th><th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-left">Method</th><th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Created</th>
            </tr></thead>
            <tbody className="divide-y divide-border">{rows.map(o => (
              <tr key={o.order_id} className="hover:bg-muted/40">
                <td className="px-3 py-2 font-mono"><Link to={`/admin/orders/${o.order_id}`} className="text-primary hover:underline">{o.order_id}</Link></td>
                <td className="px-3 py-2"><Link to={`/admin/tg/users/${o.telegram_chat_id}`} className="hover:underline">{o.customer_name || `chat ${o.telegram_chat_id}`}</Link></td>
                <td className="px-3 py-2 uppercase">{o.network}</td><td className="px-3 py-2 text-right">{o.bundle_size_gb}</td>
                <td className="px-3 py-2">{o.recipient_number}</td><td className="px-3 py-2 text-right">{fmtGhs(o.amount_ghs)}</td>
                <td className="px-3 py-2">{o.payment_method || '—'}</td>
                <td className="px-3 py-2"><span className={o.status === 'delivered' ? 'text-emerald-600' : o.status === 'failed' ? 'text-destructive' : ''}>{o.status}</span></td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDate(o.created_at)}</td>
              </tr>))}</tbody>
          </table>}
      </CardContent></Card>

      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
        <span>{total.toLocaleString()} orders · page {page} / {totalPages}</span>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-7" disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft className="w-3 h-3" /></Button>
          <Button size="sm" variant="outline" className="h-7" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}><ChevronRight className="w-3 h-3" /></Button>
        </div>
      </div>
    </TgAdminLayout>
  );
};
export default TgOrders;
