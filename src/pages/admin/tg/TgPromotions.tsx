import { useEffect, useState, useCallback } from 'react';
import TgAdminLayout from './TgAdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { fmtDate } from './_utils';

interface Promo { id: string; code: string; type: string; usage_limit: number | null; used_count: number; expires_at: string | null; active: boolean; created_at: string; }

const TgPromotions = () => {
  const [rows, setRows] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState(''); const [type, setType] = useState('bonus_points'); const [value, setValue] = useState('');
  const [limit, setLimit] = useState(''); const [expires, setExpires] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('tg_admin_promo_codes').select('*').order('created_at', { ascending: false }).limit(100);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows(data as Promo[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!code.trim()) { toast.error('Code required'); return; }
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return;
    const { error } = await supabase.from('tg_admin_promo_codes').insert({
      code: code.toUpperCase(), type, value: { amount: Number(value) || 0 },
      usage_limit: limit ? parseInt(limit, 10) : null,
      expires_at: expires ? new Date(expires).toISOString() : null,
      created_by: u.user.id,
    });
    if (error) { toast.error(error.message); return; }
    await supabase.rpc('log_tg_admin_action', { p_action: 'promo.create', p_target_type: 'tg_admin_promo_codes', p_target_id: code, p_details: { type, value } });
    toast.success('Promo created');
    setCode(''); setValue(''); setLimit(''); setExpires('');
    load();
  };

  const toggle = async (id: string, next: boolean) => {
    const { error } = await supabase.from('tg_admin_promo_codes').update({ active: next }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    await supabase.rpc('log_tg_admin_action', { p_action: next ? 'promo.activate' : 'promo.deactivate', p_target_type: 'tg_admin_promo_codes', p_target_id: id, p_details: {} });
    load();
  };

  return (
    <TgAdminLayout title="Promotions" description="Promo codes for bonus points, discounts and free bundles.">
      <Card><CardContent className="p-4 space-y-2">
        <p className="text-sm font-semibold">Create promo code</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Input value={code} onChange={e=>setCode(e.target.value)} placeholder="CODE" className="h-8 text-xs" />
          <select value={type} onChange={e=>setType(e.target.value)} className="h-8 px-2 text-xs rounded-md border border-border bg-background">
            <option value="bonus_points">Bonus points</option><option value="discount">Discount</option><option value="free_bundle">Free bundle</option>
          </select>
          <Input type="number" value={value} onChange={e=>setValue(e.target.value)} placeholder="Value" className="h-8 text-xs" />
          <Input type="number" value={limit} onChange={e=>setLimit(e.target.value)} placeholder="Usage limit (blank = unlimited)" className="h-8 text-xs" />
          <Input type="datetime-local" value={expires} onChange={e=>setExpires(e.target.value)} className="h-8 text-xs" />
          <Button size="sm" onClick={create} className="text-xs">Create</Button>
        </div>
      </CardContent></Card>

      <Card className="mt-3"><CardContent className="p-0 overflow-x-auto">
        {loading ? <div className="p-3 space-y-2">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-8" />)}</div>
        : rows.length === 0 ? <p className="p-6 text-xs text-muted-foreground text-center">No promo codes.</p>
        : <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr>
              <th className="px-3 py-2 text-left">Code</th><th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-right">Used / Limit</th><th className="px-3 py-2 text-left">Expires</th>
              <th className="px-3 py-2 text-left">Active</th><th className="px-3 py-2 text-left">Created</th>
            </tr></thead>
            <tbody className="divide-y divide-border">{rows.map(p => (
              <tr key={p.id}><td className="px-3 py-2 font-mono">{p.code}</td><td className="px-3 py-2">{p.type}</td>
                <td className="px-3 py-2 text-right">{p.used_count} / {p.usage_limit ?? '∞'}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDate(p.expires_at)}</td>
                <td className="px-3 py-2"><Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={()=>toggle(p.id, !p.active)}>{p.active ? 'Active' : 'Inactive'}</Button></td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDate(p.created_at)}</td>
              </tr>))}</tbody>
          </table>}
      </CardContent></Card>
    </TgAdminLayout>
  );
};
export default TgPromotions;
