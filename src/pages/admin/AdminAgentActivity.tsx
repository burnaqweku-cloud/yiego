import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AdminLayout from './AdminLayout';
import { format } from 'date-fns';
import { Search, Activity } from 'lucide-react';

const EVENT_TYPES = [
  'application_approved', 'application_declined', 'agent_activated',
  'agent_suspended', 'agent_reactivated', 'wallet_adjustment',
  'withdrawal_approved', 'withdrawal_paid', 'withdrawal_rejected',
  'price_change', 'store_live_toggled', 'suspicious_activity',
];

const eventBadge = (type: string) => {
  const styles: Record<string, string> = {
    application_approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    application_declined: 'bg-destructive/10 text-destructive',
    agent_activated: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    agent_suspended: 'bg-destructive/10 text-destructive',
    agent_reactivated: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    wallet_adjustment: 'bg-primary/15 text-primary',
    withdrawal_approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    withdrawal_paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    withdrawal_rejected: 'bg-destructive/10 text-destructive',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[type] || 'bg-muted text-muted-foreground'}`}>
      {type.replace(/_/g, ' ')}
    </span>
  );
};

const AdminAgentActivity = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [agents, setAgents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('all');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [logsRes, agentsRes] = await Promise.all([
      (supabase.from('agent_activity_logs' as any) as any).select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('agents').select('id, store_name'),
    ]);

    if (logsRes.data) setLogs(logsRes.data);
    if (agentsRes.data) {
      const map: Record<string, string> = {};
      (agentsRes.data as any[]).forEach(a => { map[a.id] = a.store_name; });
      setAgents(map);
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = logs;
    if (eventFilter !== 'all') result = result.filter(l => l.event_type === eventFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l.event_type?.toLowerCase().includes(q) ||
        agents[l.agent_id]?.toLowerCase().includes(q) ||
        JSON.stringify(l.meta || {}).toLowerCase().includes(q)
      );
    }
    return result;
  }, [logs, search, eventFilter, agents]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold">Agent Activity & Fraud Monitoring</h1>
          <p className="text-sm text-muted-foreground">Track all agent-related events and detect anomalies</p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              {EVENT_TYPES.map(t => (
                <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card className="card-shadow">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-8"><div className="spinner" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No activity logs found</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((log: any) => (
                  <div key={log.id} className="px-4 py-3 flex items-start gap-3 hover:bg-muted/20 transition-colors">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {eventBadge(log.event_type)}
                        <span className="text-xs font-semibold text-foreground">
                          {agents[log.agent_id] || 'Unknown Agent'}
                        </span>
                      </div>
                      {log.meta && Object.keys(log.meta).length > 0 && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {log.meta.reason && <p>Reason: {log.meta.reason}</p>}
                          {log.meta.amount && <p>Amount: GHS {Number(log.meta.amount).toFixed(2)}</p>}
                          {log.meta.type && <p>Type: {log.meta.type}</p>}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(log.created_at), 'dd MMM yyyy, HH:mm:ss')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminAgentActivity;
