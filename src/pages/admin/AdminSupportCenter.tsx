import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { useTicketThread } from '@/hooks/useSupportTickets';
import TicketThread from '@/components/support/TicketThread';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LifeBuoy, Search, RefreshCw, Clock, Info, CheckCircle, MessageSquare, User, Store } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AdminTicket {
  id: string;
  ticket_type: string;
  created_by: string;
  agent_id: string | null;
  subject: string;
  category: string;
  status: string;
  related_order_id: string | null;
  customer_phone: string | null;
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_email?: string;
  user_phone?: string;
  agent_store_name?: string;
  agent_store_status?: string;
  unread_count?: number;
}

const statusConfig: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  open: { label: 'Open', icon: Info, className: 'bg-sky-500/10 text-sky-600' },
  in_progress: { label: 'In Progress', icon: Clock, className: 'bg-amber-500/10 text-amber-600' },
  resolved: { label: 'Resolved', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-600' },
  closed: { label: 'Closed', icon: CheckCircle, className: 'bg-muted text-muted-foreground' },
};

const roleBadgeStyle: Record<string, string> = {
  user: 'bg-sky-500/10 text-sky-700 border-sky-200',
  agent: 'bg-violet-500/10 text-violet-700 border-violet-200',
};

const STATUSES = ['all', 'open', 'in_progress', 'resolved', 'closed'];

const AdminSupportCenter = () => {
  const { user, isAdminOrStaff, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'user' | 'agent'>('user');
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [activeTicketMeta, setActiveTicketMeta] = useState<AdminTicket | null>(null);
  const [senderProfiles, setSenderProfiles] = useState<Record<string, any>>({});

  const { ticket, messages, loading: threadLoading, sending, sendMessage, updateStatus, refresh: refreshThread } = useTicketThread(
    activeTicketId,
    'admin'
  );

  useEffect(() => {
    if (!authLoading && (!user || !isAdminOrStaff)) navigate('/auth');
  }, [user, isAdminOrStaff, authLoading, navigate]);

  const fetchTickets = useCallback(async () => {
    if (!isAdminOrStaff) return;
    setLoading(true);
    let query = supabase
      .from('support_tickets_v2' as any)
      .select('*')
      .eq('ticket_type', tab)
      .order('updated_at', { ascending: false });

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    const { data } = await query;

    if (data) {
      const allTickets = data as any[];
      const userIds = [...new Set(allTickets.map(t => t.created_by))];
      const { data: profiles } = userIds.length > 0
        ? await supabase.from('profiles').select('id, full_name, email, phone, username').in('id', userIds)
        : { data: [] };
      const profileMap: Record<string, any> = {};
      profiles?.forEach((p: any) => { profileMap[p.id] = p; });

      let agentMap: Record<string, any> = {};
      if (tab === 'agent') {
        const agentIds = [...new Set(allTickets.filter(t => t.agent_id).map(t => t.agent_id))];
        if (agentIds.length > 0) {
          const { data: agents } = await supabase.from('agents' as any).select('id, store_name, status').in('id', agentIds);
          (agents as any[])?.forEach((a: any) => { agentMap[a.id] = a; });
        }
      }

      const ticketIds = allTickets.map(t => t.id);
      let unreadMap: Record<string, number> = {};
      if (ticketIds.length > 0) {
        const { data: unreadMsgs } = await supabase
          .from('ticket_messages' as any)
          .select('ticket_id')
          .in('ticket_id', ticketIds)
          .eq('read_by_admin', false)
          .neq('sender_type', 'admin');
        if (unreadMsgs) {
          (unreadMsgs as any[]).forEach((m: any) => {
            unreadMap[m.ticket_id] = (unreadMap[m.ticket_id] || 0) + 1;
          });
        }
      }

      setTickets(allTickets.map(t => ({
        ...t,
        user_name: profileMap[t.created_by]?.full_name || profileMap[t.created_by]?.username || 'Unknown',
        user_email: profileMap[t.created_by]?.email || '',
        user_phone: profileMap[t.created_by]?.phone || '',
        agent_store_name: t.agent_id ? agentMap[t.agent_id]?.store_name || '' : '',
        agent_store_status: t.agent_id ? agentMap[t.agent_id]?.status || '' : '',
        unread_count: unreadMap[t.id] || 0,
      })));

      // Build sender profiles for thread use
      setSenderProfiles(profileMap);
    }
    setLoading(false);
  }, [tab, statusFilter, isAdminOrStaff]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  // Fetch profiles for message senders when opening a thread
  const fetchThreadProfiles = useCallback(async (ticketMeta: AdminTicket) => {
    // Already have from ticket fetch
  }, []);

  if (authLoading || !user || !isAdminOrStaff) return null;

  const filtered = tickets.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.subject.toLowerCase().includes(q) ||
      t.user_name?.toLowerCase().includes(q) ||
      t.user_email?.toLowerCase().includes(q) ||
      t.agent_store_name?.toLowerCase().includes(q) ||
      t.related_order_id?.toLowerCase().includes(q) ||
      t.customer_phone?.includes(q) ||
      t.id.includes(q)
    );
  });

  const stats = {
    open: tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    total: tickets.length,
  };

  if (activeTicketId && activeTicketMeta) {
    const ownerInfo = {
      name: activeTicketMeta.user_name || 'Unknown',
      email: activeTicketMeta.user_email,
      phone: activeTicketMeta.user_phone || activeTicketMeta.customer_phone || undefined,
      role: activeTicketMeta.ticket_type as string,
      storeName: activeTicketMeta.agent_store_name || undefined,
      storeStatus: activeTicketMeta.agent_store_status || undefined,
    };

    return (
      <AdminLayout>
        <div className="max-w-3xl mx-auto">
          <TicketThread
            ticket={ticket}
            messages={messages}
            loading={threadLoading}
            sending={sending}
            senderRole="admin"
            onSend={sendMessage}
            onBack={() => { setActiveTicketId(null); setActiveTicketMeta(null); fetchTickets(); }}
            onStatusChange={updateStatus}
            ticketOwnerInfo={ownerInfo}
            senderProfiles={senderProfiles}
          />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold">Support Center</h2>
            <p className="text-muted-foreground text-sm">Manage user & agent support tickets</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchTickets}><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Open', value: stats.open, icon: Info, color: 'text-sky-600' },
            { label: 'In Progress', value: stats.in_progress, icon: Clock, color: 'text-amber-600' },
            { label: 'Resolved', value: stats.resolved, icon: CheckCircle, color: 'text-emerald-600' },
            { label: 'Total', value: stats.total, icon: LifeBuoy, color: 'text-muted-foreground' },
          ].map(s => (
            <div key={s.label} className="bg-card rounded-xl p-4 border border-border">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-[10px] text-muted-foreground font-medium">{s.label}</span>
              </div>
              <p className="text-xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setSearch(''); setStatusFilter('all'); }}>
          <TabsList className="w-full max-w-xs">
            <TabsTrigger value="user" className="flex-1">User Tickets</TabsTrigger>
            <TabsTrigger value="agent" className="flex-1">Agent Tickets</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search subject, user, phone, order..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {STATUSES.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}>
                {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </button>
            ))}
          </div>
        </div>

        {/* Ticket List */}
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No tickets found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(t => {
              const st = statusConfig[t.status] || statusConfig.open;
              const StatusIcon = st.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => { setActiveTicketId(t.id); setActiveTicketMeta(t); }}
                  className="w-full text-left bg-card rounded-xl border border-border p-4 hover:bg-muted/30 transition-all duration-150 active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="text-sm font-semibold truncate">{t.subject}</h4>
                        {(t.unread_count || 0) > 0 && (
                          <span className="text-[10px] font-bold bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full">
                            {t.unread_count}
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${st.className}`}>
                          <StatusIcon className="w-3 h-3" />
                          {st.label}
                        </span>
                        {/* Role badge */}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${roleBadgeStyle[t.ticket_type] || roleBadgeStyle.user}`}>
                          {t.ticket_type === 'agent' ? 'Agent' : 'User'}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                          {t.category.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="flex gap-3 text-[11px] text-muted-foreground flex-wrap">
                        <span>{t.user_name}</span>
                        {t.agent_store_name && <span className="text-primary font-medium">{t.agent_store_name}</span>}
                        {t.related_order_id && <span className="font-mono">{t.related_order_id}</span>}
                        {t.customer_phone && <span>{t.customer_phone}</span>}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminSupportCenter;
