import { useEffect, useState, useCallback } from 'react';
import TgAdminLayout from './TgAdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDate, downloadCsv } from './_utils';

interface Row { id: string; admin_user_id: string; action: string; target_type: string | null; target_id: string | null; details: Record<string, unknown>; ip_address: string | null; created_at: string; admin_name: string | null; }

const TgAuditLog = () => {
  const [rows, setRows] = useState<Row[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1);
  const [action, setAction] = useState(''); const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('tg_admin_audit_list', { p_action: action || null, p_target_type: null, p_from: null, p_to: null, p_page: page, p_size: 50 });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    const d = data as unknown as { rows: Row[]; total: number };
    setRows(d.rows); setTotal(d.total);
  }, [action, page]);
  useEffect(() => { load(); }, [load]);
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <TgAdminLayout title="Audit Log" description="Immutable log of every admin action in this section.">
      <Card><CardContent className="p-3 flex flex-wrap gap-2">
        <Input value={action} onChange={e=>{setAction(e.target.value); setPage(1);}} placeholder="action filter (e.g. user.ban)" className="h-8 text-xs flex-1 min-w-[200px]" />
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => downloadCsv(`tg-audit-${page}.csv`, rows as unknown as Record<string, unknown>[])} disabled={!rows.length}>
          <Download className="w-3 h-3" /> CSV
        </Button>
      </CardContent></Card>

      <Card className="mt-3"><CardContent className="p-0 overflow-x-auto">
        {loading ? <div className="p-3 space-y-2">{Array.from({length:8}).map((_,i)=><Skeleton key={i} className="h-8" />)}</div>
        : rows.length === 0 ? <p className="p-6 text-xs text-muted-foreground text-center">No audit entries.</p>
        : <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr>
              <th className="px-3 py-2 text-left">When</th><th className="px-3 py-2 text-left">Admin</th>
              <th className="px-3 py-2 text-left">Action</th><th className="px-3 py-2 text-left">Target</th>
              <th className="px-3 py-2 text-left">Details</th><th className="px-3 py-2 text-left">IP</th>
            </tr></thead>
            <tbody className="divide-y divide-border">{rows.map(r => (
              <tr key={r.id}><td className="px-3 py-2 text-muted-foreground">{fmtDate(r.created_at)}</td>
                <td className="px-3 py-2">{r.admin_name || r.admin_user_id.slice(0,8)}</td>
                <td className="px-3 py-2 font-mono text-[10px]">{r.action}</td>
                <td className="px-3 py-2 font-mono text-[10px]">{r.target_type ? `${r.target_type}/${r.target_id ?? ''}` : '—'}</td>
                <td className="px-3 py-2 truncate max-w-[300px] font-mono text-[10px]">{JSON.stringify(r.details).slice(0, 120)}</td>
                <td className="px-3 py-2 font-mono text-[10px]">{r.ip_address || '—'}</td>
              </tr>))}</tbody>
          </table>}
      </CardContent></Card>

      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
        <span>{total.toLocaleString()} entries · page {page} / {totalPages}</span>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-7" disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft className="w-3 h-3" /></Button>
          <Button size="sm" variant="outline" className="h-7" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}><ChevronRight className="w-3 h-3" /></Button>
        </div>
      </div>
    </TgAdminLayout>
  );
};
export default TgAuditLog;
