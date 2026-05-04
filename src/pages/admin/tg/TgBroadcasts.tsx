import { useEffect, useState, useCallback } from 'react';
import TgAdminLayout from './TgAdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { fmtDate } from './_utils';

interface BC { id: string; status: string; message: string; total_count: number; sent_count: number; failed_count: number; scheduled_for: string | null; created_at: string; }

const TgBroadcasts = () => {
  const [rows, setRows] = useState<BC[]>([]);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState<'all' | 'linked' | 'active7' | 'single'>('all');
  const [chatId, setChatId] = useState('');
  const [message, setMessage] = useState('');
  const [btnLabel, setBtnLabel] = useState(''); const [btnUrl, setBtnUrl] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('tg_admin_broadcasts').select('id, status, message, total_count, sent_count, failed_count, scheduled_for, created_at').order('created_at', { ascending: false }).limit(50);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows(data as BC[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (sendNow = false) => {
    if (!message.trim()) { toast.error('Message required'); return; }
    if (segment === 'single' && !chatId) { toast.error('chat_id required'); return; }
    setBusy(true);
    const seg: Record<string, string | number> = { kind: segment };
    if (segment === 'single') seg.chat_id = Number(chatId);
    const { data, error } = await supabase.rpc('tg_admin_create_broadcast', {
      p_segment: seg as unknown as never,
      p_message: message,
      p_button_label: btnLabel || null, p_button_url: btnUrl || null,
      p_scheduled_for: sendNow ? null : (scheduledFor ? new Date(scheduledFor).toISOString() : null),
    });
    if (error) { setBusy(false); toast.error(error.message); return; }
    const r = data as { ok: boolean; id: string; recipients: number };
    if (sendNow && r?.id) {
      await supabase.rpc('tg_admin_send_now_broadcast', { p_id: r.id });
      await supabase.functions.invoke('tg-admin-broadcast-runner', { body: {} }).catch(() => {});
      toast.success(`Sending to ${r.recipients} recipients now…`);
    } else {
      toast.success(`Broadcast queued · ${r.recipients} recipients`);
    }
    setBusy(false);
    setMessage(''); setBtnLabel(''); setBtnUrl(''); setChatId(''); setScheduledFor('');
    load();
  };

  const cancel = async (id: string) => {
    const reason = prompt('Cancel reason?') || ''; if (!reason) return;
    const { error } = await supabase.rpc('tg_admin_cancel_broadcast', { p_id: id, p_reason: reason });
    if (error) { toast.error(error.message); return; }
    toast.success('Cancelled'); load();
  };

  return (
    <TgAdminLayout title="Broadcasts" description="Send segmented messages with rate-limited delivery (~25/sec).">
      <Card><CardContent className="p-4 space-y-3">
        <p className="text-sm font-semibold">Compose</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select value={segment} onChange={e=>setSegment(e.target.value as 'all' | 'linked' | 'active7' | 'single')} className="h-8 px-2 text-xs rounded-md border border-border bg-background">
            <option value="all">All bot users</option><option value="linked">Linked accounts only</option>
            <option value="active7">Active in last 7 days</option><option value="single">Single user</option>
          </select>
          {segment === 'single' && <Input value={chatId} onChange={e=>setChatId(e.target.value)} placeholder="chat_id" className="h-8 text-xs" />}
        </div>
        <Textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Message body (HTML supported, max 4096 chars)" className="text-xs min-h-[100px]" />
        <p className="text-[10px] text-muted-foreground text-right">{message.length} / 4096</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input value={btnLabel} onChange={e=>setBtnLabel(e.target.value)} placeholder="Button label (optional)" className="h-8 text-xs" />
          <Input value={btnUrl} onChange={e=>setBtnUrl(e.target.value)} placeholder="Button URL (optional)" className="h-8 text-xs" />
        </div>
        <Input type="datetime-local" value={scheduledFor} onChange={e=>setScheduledFor(e.target.value)} className="h-8 text-xs" />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => create(false)} disabled={busy} variant="outline" className="text-xs">{busy ? 'Working…' : 'Queue broadcast'}</Button>
          <Button size="sm" onClick={() => create(true)} disabled={busy} className="text-xs">{busy ? 'Working…' : 'Send now'}</Button>
        </div>
      </CardContent></Card>

      <Card className="mt-3"><CardContent className="p-0 overflow-x-auto">
        <p className="text-xs font-semibold p-3 border-b border-border">Recent broadcasts</p>
        {loading ? <div className="p-3 space-y-2">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-8" />)}</div>
        : rows.length === 0 ? <p className="p-6 text-xs text-muted-foreground text-center">No broadcasts yet.</p>
        : <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr>
              <th className="px-3 py-2 text-left">Created</th><th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Preview</th><th className="px-3 py-2 text-right">Sent</th>
              <th className="px-3 py-2 text-right">Failed</th><th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">{rows.map(b => (
              <tr key={b.id}><td className="px-3 py-2 text-muted-foreground">{fmtDate(b.created_at)}</td>
                <td className="px-3 py-2">{b.status}</td>
                <td className="px-3 py-2 truncate max-w-[280px]">{b.message.slice(0, 60)}…</td>
                <td className="px-3 py-2 text-right text-emerald-600">{b.sent_count}</td>
                <td className="px-3 py-2 text-right text-destructive">{b.failed_count}</td>
                <td className="px-3 py-2 text-right">{b.total_count}</td>
                <td className="px-3 py-2">{['queued','running'].includes(b.status) && <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2" onClick={()=>cancel(b.id)}>Cancel</Button>}</td>
              </tr>))}</tbody>
          </table>}
      </CardContent></Card>
    </TgAdminLayout>
  );
};
export default TgBroadcasts;
