import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollText, Search, RefreshCw, User, Clock } from 'lucide-react';

interface AuditLog {
  id: string;
  actor_id: string;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  changes: any;
  metadata: any;
  created_at: string;
}

const AdminAuditLogs = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate('/auth');
  }, [user, isAdmin, authLoading, navigate]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('audit_logs' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    setLogs((data as unknown as AuditLog[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchLogs();
  }, [isAdmin, fetchLogs]);

  if (authLoading || !user || !isAdmin) return null;

  const filtered = logs.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      l.entity_type.toLowerCase().includes(q) ||
      l.entity_id?.toLowerCase().includes(q) ||
      l.actor_email?.toLowerCase().includes(q)
    );
  });

  const actionColor = (action: string) => {
    if (action.includes('delete') || action.includes('reject')) return 'text-destructive';
    if (action.includes('create') || action.includes('confirm') || action.includes('approve')) return 'text-success';
    if (action.includes('update') || action.includes('change')) return 'text-info';
    return 'text-foreground';
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold">Audit Logs</h2>
            <p className="text-muted-foreground text-sm">Track all admin actions and changes</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchLogs} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by action, entity, actor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <ScrollText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              {search ? `No logs match "${search}"` : 'No audit logs yet. Admin actions will appear here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((log) => (
              <div key={log.id} className="bg-card rounded-xl border border-border p-4 card-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-semibold ${actionColor(log.action)}`}>
                        {log.action}
                      </span>
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                        {log.entity_type}
                      </span>
                      {log.entity_id && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {log.entity_id}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {log.actor_email || 'Unknown'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                {log.changes && (
                  <details className="mt-2">
                    <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                      View Changes
                    </summary>
                    <pre className="text-[10px] mt-1 p-2 bg-muted rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(log.changes, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminAuditLogs;
