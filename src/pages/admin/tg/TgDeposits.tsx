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

interface Row { id: string; paystack_reference: string; chat_id: number; total_payable: number; base_amount: number; status: string; created_at: string; }

const TgDeposits = () => {
  const [rows, setRows] = useState<Row[]>([]); const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('tg_admin_deposits_list', { p_status: status || null, p_search: search || null, p_from: null, p_to: null, p_page: page, p_size: 50 });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    const d = data as unknown as { rows: Row[]; total: number }; setRows(d.rows); setTotal(d.total);
  }, [status, search, page]);
  useEffect(() => { load(); }, [load]);
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <TgAdminLayout title="Bot Deposits" description="Wallet top-ups initiated from the bot.">
      <Card><CardContent className="p-3 flex flex-wrap gap-2">
        <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="reference or chat_id" className="h-8 text-xs flex-1 min-w-[180px]" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-8 px-2 text-xs rounded-md border border-border bg-background">
          <option value="">All</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="failed">Failed</option>
        </select>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => downloadCsv(`tg-deposits-${page}.csv`, rows as unknown as Record<string, unknown>[])} disabled={!rows.length}>
          <Download className="w-3 h-3" /> CSV
        </Button>
      </CardContent></Card>
      <Card className="mt-3"><CardContent className="p-0 overflow-x-auto">
        {loading ? <div className="p-3 space-y-2">{Array.from({length:8}).map((_,i)=><Skeleton key={i} className="h-8" />)}</div>
        : rows.length === 0 ? <p className="p-6 text-xs text-muted-foreground text-center">No deposits.</p>
        : <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr>
              <th className="px-3 py-2 text-left">Reference</th><th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-right">Base</th><th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Created</th>
            </tr></thead>
            <tbody className="divide-y divide-border">{rows.map(d => (
              <tr key={d.id}><td className="px-3 py-2 font-mono">{d.paystack_reference}</td>
                <td className="px-3 py-2"><Link to={`/admin/tg/users/${d.chat_id}`} className="text-primary hover:underline">{d.chat_id}</Link></td>
                <td className="px-3 py-2 text-right">{fmtGhs(d.base_amount)}</td>
                <td className="px-3 py-2 text-right">{fmtGhs(d.total_payable)}</td>
                <td className="px-3 py-2">{d.status}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDate(d.created_at)}</td>
              </tr>))}</tbody>
          </table>}
      </CardContent></Card>
      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
        <span>{total.toLocaleString()} deposits · page {page} / {totalPages}</span>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-7" disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft className="w-3 h-3" /></Button>
          <Button size="sm" variant="outline" className="h-7" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}><ChevronRight className="w-3 h-3" /></Button>
        </div>
      </div>
    </TgAdminLayout>
  );
};
export default TgDeposits;
