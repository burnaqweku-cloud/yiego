import { useEffect, useState } from 'react';
import TgAdminLayout from './TgAdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { fmtDate } from './_utils';

interface Info { url: string; has_custom_certificate: boolean; pending_update_count: number; last_error_date: number | null; last_error_message: string | null; max_connections: number; ip_address: string | null; }

const TgBotHealth = () => {
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('tg-admin-webhook-info');
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setInfo(data?.info ?? null);
  };
  useEffect(() => { load(); }, []);

  const reRegister = async () => {
    setBusy(true);
    const { error } = await supabase.functions.invoke('telegram-set-webhook', { body: { action: 'set' } });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Webhook re-registered');
    await supabase.rpc('log_tg_admin_action', { p_action: 'bot.webhook_reregister', p_target_type: 'webhook', p_target_id: 'datasika_bot', p_details: {} });
    load();
  };

  const deleteWebhook = async () => {
    if (!confirm('Switch to polling? This deletes the webhook.')) return;
    setBusy(true);
    const { error } = await supabase.functions.invoke('telegram-set-webhook', { body: { action: 'delete' } });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Webhook deleted — switch to polling via cron');
    await supabase.rpc('log_tg_admin_action', { p_action: 'bot.switch_to_polling', p_target_type: 'webhook', p_target_id: 'datasika_bot', p_details: {} });
    load();
  };

  return (
    <TgAdminLayout title="Bot Health" description="Webhook status and manual controls.">
      <Card><CardContent className="p-4">
        {loading ? <Skeleton className="h-24" />
        : !info ? <p className="text-xs text-muted-foreground">No webhook info available.</p>
        : (
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">URL:</span><span className="font-mono truncate ml-2 max-w-[60%]">{info.url || '— (polling mode)'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Pending updates:</span><span className={info.pending_update_count > 0 ? 'text-amber-600 font-bold' : ''}>{info.pending_update_count}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Max connections:</span><span>{info.max_connections}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">IP address:</span><span className="font-mono">{info.ip_address || '—'}</span></div>
            {info.last_error_message && (
              <div className="mt-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                <p className="font-semibold text-destructive">Last error</p>
                <p className="text-[10px] text-muted-foreground">{fmtDate(info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null)}</p>
                <p className="mt-1">{info.last_error_message}</p>
              </div>
            )}
          </div>
        )}
      </CardContent></Card>

      <Card className="mt-3"><CardContent className="p-4 space-y-2">
        <p className="text-sm font-semibold">Manual controls</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="text-xs" onClick={load} disabled={loading || busy}>Refresh</Button>
          <Button size="sm" variant="outline" className="text-xs" onClick={reRegister} disabled={busy}>Re-register webhook</Button>
          <Button size="sm" variant="destructive" className="text-xs" onClick={deleteWebhook} disabled={busy}>Switch to polling (delete webhook)</Button>
        </div>
      </CardContent></Card>
    </TgAdminLayout>
  );
};
export default TgBotHealth;
