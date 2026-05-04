import { useEffect, useState } from 'react';
import TgAdminLayout from './TgAdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { fmtDate } from './_utils';

const KEYS = [
  ['welcome_text', 'string', 'Welcome message'],
  ['help_text', 'string', 'Help text'],
  ['agent_pitch_text', 'string', 'Agent pitch message'],
  ['order_delivered_template', 'string', 'Order delivered template'],
  ['maintenance_mode', 'bool', 'Maintenance mode'],
  ['maintenance_message', 'string', 'Maintenance message'],
  ['admin_chat_id', 'number', 'Admin chat ID (alerts)'],
  ['min_deposit_ghs', 'number', 'Min deposit (GHS)'],
  ['max_deposit_ghs', 'number', 'Max deposit (GHS)'],
] as const;

interface Setting { key: string; value: unknown; updated_at: string; updated_by: string | null; }

const TgConfiguration = () => {
  const [settings, setSettings] = useState<Record<string, Setting>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from('tg_admin_settings').select('*').in('key', KEYS.map(k=>k[0]));
    if (data) {
      const m: Record<string, Setting> = {};
      (data as Setting[]).forEach(s => m[s.key] = s);
      setSettings(m);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (key: string, raw: string, kind: string) => {
    setBusy(key);
    let value: string | number | boolean = raw;
    if (kind === 'number') value = Number(raw);
    else if (kind === 'bool') value = raw === 'true';
    const { error } = await supabase.rpc('set_tg_admin_setting', { p_key: key, p_value: value as unknown as never, p_reason: 'config update' });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Saved ${key}`);
    setEdits(e => { const n = { ...e }; delete n[key]; return n; });
    load();
  };

  return (
    <TgAdminLayout title="Configuration" description="Editable bot copy, limits and runtime settings.">
      <Card><CardContent className="p-4 space-y-4">
        {KEYS.map(([key, kind, label]) => {
          const cur = settings[key];
          const curStr = cur ? (typeof cur.value === 'string' ? cur.value : JSON.stringify(cur.value)) : '';
          const editing = edits[key] !== undefined ? edits[key] : curStr;
          return (
            <div key={key} className="border-b border-border pb-3 last:border-b-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold">{label}</p>
                <p className="text-[10px] text-muted-foreground">{cur ? `Updated ${fmtDate(cur.updated_at)}` : 'Not set'}</p>
              </div>
              {kind === 'string' && (key.includes('text') || key.includes('template') || key.includes('message')) ? (
                <Textarea value={editing} onChange={e=>setEdits(s=>({...s,[key]:e.target.value}))} className="text-xs min-h-[60px]" />
              ) : kind === 'bool' ? (
                <select value={editing || 'false'} onChange={e=>setEdits(s=>({...s,[key]:e.target.value}))} className="h-8 px-2 text-xs rounded-md border border-border bg-background w-32">
                  <option value="true">Enabled</option><option value="false">Disabled</option>
                </select>
              ) : (
                <Input type={kind === 'number' ? 'number' : 'text'} value={editing} onChange={e=>setEdits(s=>({...s,[key]:e.target.value}))} className="h-8 text-xs" />
              )}
              <div className="flex justify-end mt-1">
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === key} onClick={() => save(key, editing, kind)}>Save</Button>
              </div>
            </div>
          );
        })}
        <p className="text-[10px] text-muted-foreground">
          Bot reads these via <code>get_tg_setting('key', fallback)</code>. Any changes apply on the next bot read; no redeploy needed.
        </p>
      </CardContent></Card>
    </TgAdminLayout>
  );
};
export default TgConfiguration;
