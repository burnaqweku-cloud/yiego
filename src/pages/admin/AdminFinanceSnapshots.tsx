import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, RefreshCw, CalendarDays, Eye, AlertTriangle } from 'lucide-react';
import { format, parseISO, lastDayOfMonth } from 'date-fns';

interface Snapshot {
  id: string;
  snapshot_month: string;
  master_balance: number;
  available_balance: number;
  savings_balance: number;
  total_in: number;
  total_out: number;
  net_movement: number;
  entry_count: number;
  created_at: string;
  notes: string | null;
}

const fmtGHS = (n: number) => `GHS ${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const AdminFinanceSnapshots = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [drift, setDrift] = useState<{ stored: number; live: number; diff: number } | null>(null);
  const [confirm, setConfirm] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [genMonth, setGenMonth] = useState(format(new Date(), 'yyyy-MM'));

  useEffect(() => { if (isAdmin === false) { toast.error('Access denied'); navigate('/admin'); } }, [isAdmin, navigate]);

  const computeLiveMaster = useCallback(async (monthEnd: string): Promise<number> => {
    const [settingsRes, mainRes, savRes] = await Promise.all([
      supabase.from('finance_settings').select('starting_balance').eq('id', true).maybeSingle(),
      supabase.from('finance_ledger_entries').select('amount,direction').eq('status', 'posted').eq('bucket', 'main').lte('entry_date', monthEnd),
      supabase.from('finance_ledger_entries').select('amount,direction').eq('status', 'posted').eq('bucket', 'savings').lte('entry_date', monthEnd),
    ]);
    const start = Number((settingsRes.data as { starting_balance?: number } | null)?.starting_balance ?? 0);
    const sumDir = (rows: { amount: number; direction: string }[] | null) => (rows || []).reduce((s, r) => s + (r.direction === 'credit' ? Number(r.amount) : -Number(r.amount)), 0);
    return start + sumDir(mainRes.data as never) + sumDir(savRes.data as never);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('finance_monthly_snapshots')
      .select('*')
      .order('snapshot_month', { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const list = (data || []) as Snapshot[];
    setRows(list);
    setLoading(false);
    if (list.length) {
      const latest = list[0];
      const monthEnd = format(lastDayOfMonth(parseISO(latest.snapshot_month)), 'yyyy-MM-dd');
      const live = await computeLiveMaster(monthEnd);
      setDrift({ stored: Number(latest.master_balance), live, diff: live - Number(latest.master_balance) });
    } else {
      setDrift(null);
    }
  }, [computeLiveMaster]);

  useEffect(() => { load(); }, [load]);

  const recompute = async (s: Snapshot) => {
    setBusy(true);
    const { error } = await supabase.rpc('finance_recompute_monthly_snapshot' as never, { p_month: s.snapshot_month } as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Snapshot recomputed');
    setConfirm(null);
    load();
  };

  const generate = async () => {
    if (!genMonth) return;
    const date = `${genMonth}-01`;
    setBusy(true);
    const { error } = await supabase.rpc('finance_create_monthly_snapshot' as never, { p_month: date } as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Snapshot created');
    load();
  };

  const viewMonth = (s: Snapshot) => {
    const start = s.snapshot_month;
    const end = format(lastDayOfMonth(parseISO(s.snapshot_month)), 'yyyy-MM-dd');
    navigate(`/admin/finance-ledger?from=${start}&to=${end}&status=posted`);
  };

  const driftBadge = drift && Math.abs(drift.diff) > 0.01;

  if (isAdmin === false) return null;

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="sm" variant="ghost" onClick={() => navigate('/admin/finance-ledger')}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Ledger
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2"><CalendarDays className="w-5 h-5" /> Monthly Snapshots</h1>
            <p className="text-sm text-muted-foreground">End-of-month state of Master, Available, and Savings.</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 flex items-end gap-3 flex-wrap">
            <div>
              <Label className="text-xs">Generate snapshot for month</Label>
              <Input type="month" value={genMonth} onChange={e => setGenMonth(e.target.value)} className="w-[180px]" />
            </div>
            <Button onClick={generate} disabled={busy} size="sm">Generate</Button>
            <Button onClick={load} variant="outline" size="sm" className="ml-auto"><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh</Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10" />)}</div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No snapshots yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-muted-foreground text-xs">
                      <th className="px-3 py-2">Month</th>
                      <th className="px-3 py-2 text-right">Master</th>
                      <th className="px-3 py-2 text-right">Available</th>
                      <th className="px-3 py-2 text-right">Savings</th>
                      <th className="px-3 py-2 text-right">In</th>
                      <th className="px-3 py-2 text-right">Out</th>
                      <th className="px-3 py-2 text-right">Net</th>
                      <th className="px-3 py-2 text-right">Entries</th>
                      <th className="px-3 py-2">Created</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s, idx) => {
                      const isLatest = idx === 0;
                      return (
                        <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium whitespace-nowrap">
                            {format(parseISO(s.snapshot_month), 'MMMM yyyy')}
                            {isLatest && driftBadge && (
                              <Badge variant="destructive" className="ml-2 text-[10px] gap-1">
                                <AlertTriangle className="w-3 h-3" /> Drift
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtGHS(s.master_balance)}
                            {isLatest && driftBadge && drift && (
                              <div className="text-[10px] text-red-600">live {fmtGHS(drift.live)}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtGHS(s.available_balance)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtGHS(s.savings_balance)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{fmtGHS(s.total_in)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-red-600">{fmtGHS(s.total_out)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums font-semibold ${Number(s.net_movement) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtGHS(s.net_movement)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs">{s.entry_count}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{format(new Date(s.created_at), 'dd MMM HH:mm')}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => viewMonth(s)} title="View entries"><Eye className="w-3.5 h-3.5" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-600" onClick={() => setConfirm(s)} title="Recompute"><RefreshCw className="w-3.5 h-3.5" /></Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!confirm} onOpenChange={() => setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Recompute Snapshot</DialogTitle></DialogHeader>
          {confirm && (
            <p className="text-sm text-muted-foreground">
              This will overwrite the stored snapshot for <strong>{format(parseISO(confirm.snapshot_month), 'MMMM yyyy')}</strong> with values
              recomputed live from the ledger. The old row will be deleted.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button onClick={() => confirm && recompute(confirm)} disabled={busy}>Recompute</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminFinanceSnapshots;
