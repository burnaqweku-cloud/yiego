import { useEffect, useState, useCallback } from 'react';
import TgAdminLayout from './TgAdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { fmtDate } from './_utils';

interface Row { id: string; subject: string; category: string | null; status: string; customer_phone: string | null; related_order_id: string | null; created_at: string; }

const TgSupport = () => {
  const [rows, setRows] = useState<Row[]>([]); const [loading, setLoading] = useState(true); const [status, setStatus] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('tg_admin_support_tickets_list', { p_status: status || null, p_page: 1, p_size: 100 });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data as unknown as { rows: Row[] }).rows);
  }, [status]);
  useEffect(() => { load(); }, [load]);

  return (
    <TgAdminLayout title="Support Tickets" description="AI/bot-originated support tickets.">
      <Card><CardContent className="p-3">
        <select value={status} onChange={e=>setStatus(e.target.value)} className="h-8 px-2 text-xs rounded-md border border-border bg-background">
          <option value="">All</option><option value="open">Open</option><option value="escalated">Escalated</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
        </select>
      </CardContent></Card>
      <Card className="mt-3"><CardContent className="p-0 overflow-x-auto">
        {loading ? <div className="p-3 space-y-2">{Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-8" />)}</div>
        : rows.length === 0 ? <p className="p-6 text-xs text-muted-foreground text-center">No tickets.</p>
        : <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr>
              <th className="px-3 py-2 text-left">Subject</th><th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Phone</th>
              <th className="px-3 py-2 text-left">Order</th><th className="px-3 py-2 text-left">Created</th>
            </tr></thead>
            <tbody className="divide-y divide-border">{rows.map(t => (
              <tr key={t.id}>
                <td className="px-3 py-2">{t.subject}</td><td className="px-3 py-2">{t.category || '—'}</td>
                <td className="px-3 py-2">{t.status}</td><td className="px-3 py-2">{t.customer_phone || '—'}</td>
                <td className="px-3 py-2 font-mono text-[10px]">{t.related_order_id || '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDate(t.created_at)}</td>
              </tr>))}</tbody>
          </table>}
      </CardContent></Card>
      <p className="text-[10px] text-muted-foreground mt-2">Open tickets are managed in the existing AI Tickets section. This view filters bot-channel tickets only.</p>
    </TgAdminLayout>
  );
};
export default TgSupport;
