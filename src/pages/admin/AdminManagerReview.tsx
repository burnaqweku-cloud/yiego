import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import SEOHead from '@/components/seo/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, RefreshCw, ShieldAlert, ChevronLeft, ChevronRight, User, Bot, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const ISSUE_LABELS: Record<string, string> = {
  order_not_created: 'Order Not Created',
  deposit_not_reflected: 'Deposit Not Reflected',
  order_not_delivered: 'Order Issue',
  account_issue: 'Account / Access',
  other: 'Other',
};

const PAGE_SIZE = 20;

interface ManagerReviewTicket {
  id: string;
  ticket_number: number;
  ticket_code: string | null;
  created_at: string;
  updated_at: string;
  status: string;
  issue_type: string;
  customer_phone: string | null;
  customer_email: string | null;
  reference_value: string | null;
  assigned_to: string | null;
  manager_review: boolean;
  ticket_metadata: any;
}

const AdminManagerReview = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<ManagerReviewTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [adminNames, setAdminNames] = useState<Record<string, string>>({});

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = (supabase.from('admin_support_tickets') as any)
      .select('id, ticket_number, ticket_code, created_at, updated_at, status, issue_type, customer_phone, customer_email, reference_value, assigned_to, manager_review, ticket_metadata', { count: 'exact' })
      .contains('ticket_metadata', { source: 'ai_assistant' })
      .eq('manager_review', true)
      .not('status', 'eq', 'closed')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (search.trim()) {
      const s = search.trim();
      query = (supabase.from('admin_support_tickets') as any)
        .select('id, ticket_number, ticket_code, created_at, updated_at, status, issue_type, customer_phone, customer_email, reference_value, assigned_to, manager_review, ticket_metadata', { count: 'exact' })
        .contains('ticket_metadata', { source: 'ai_assistant' })
        .eq('manager_review', true)
        .not('status', 'eq', 'closed')
        .or(`customer_phone.ilike.%${s}%,reference_value.ilike.%${s}%,ticket_code.ilike.%${s}%`)
        .order('created_at', { ascending: false })
        .range(from, to);
    }

    const { data, error, count } = await query;
    if (!error) {
      const ticketData = (data as ManagerReviewTicket[]) || [];
      setTickets(ticketData);
      setTotalCount(count || 0);

      const assignedIds = [...new Set(ticketData.map(t => t.assigned_to).filter(Boolean))] as string[];
      const missing = assignedIds.filter(id => !adminNames[id]);
      if (missing.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', missing);
        if (profiles) {
          const newNames: Record<string, string> = {};
          profiles.forEach((p: any) => { newNames[p.id] = p.full_name || 'Admin'; });
          setAdminNames(prev => ({ ...prev, ...newNames }));
        }
      }
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);
  useEffect(() => { setPage(0); }, [search]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const STATUS_COLORS: Record<string, string> = {
    new: 'bg-sky-500/10 text-sky-600',
    in_progress: 'bg-amber-500/10 text-amber-600',
    resolved: 'bg-emerald-500/10 text-emerald-600',
  };

  return (
    <AdminLayout>
      <SEOHead title="Manager Review | Admin" description="Tickets flagged for manager review" path="/admin/manager-review" noIndex />

      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold">Manager Review</h2>
              <p className="text-muted-foreground text-sm">
                {totalCount > 0 ? `${totalCount} ticket${totalCount !== 1 ? 's' : ''} flagged for review` : 'Tickets requiring manager attention'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/ai-cases')}>
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> AI Tickets
            </Button>
            <Button variant="outline" size="sm" onClick={fetchTickets}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by ticket code, phone, or reference..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12">
            <ShieldAlert className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No tickets flagged for manager review</p>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              {tickets.map(ticket => {
                const meta = ticket.ticket_metadata || {};
                const assignedName = ticket.assigned_to ? (adminNames[ticket.assigned_to] || 'Admin') : null;
                const displayCode = ticket.ticket_code || `#${ticket.ticket_number}`;

                return (
                  <div
                    key={ticket.id}
                    className="bg-card rounded-xl border border-orange-500/40 bg-orange-500/[0.03] hover:bg-muted/30 transition-all duration-150 cursor-pointer"
                    onClick={() => navigate(`/admin/ai-cases/${ticket.id}?from=manager_review`)}
                  >
                    {/* Desktop row */}
                    <div className="hidden md:grid gap-2 px-4 py-3 items-center grid-cols-[90px_1fr_110px_130px_120px_110px]">
                      <span className="text-xs font-extrabold text-foreground font-mono">{displayCode}</span>
                      <div className="min-w-0">
                        <span className="text-xs font-medium truncate block">{ISSUE_LABELS[ticket.issue_type] || ticket.issue_type}</span>
                        {meta.ai_summary && <span className="text-[10px] text-muted-foreground block truncate">{meta.ai_summary}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full w-fit ${STATUS_COLORS[ticket.status] || 'bg-muted text-muted-foreground'}`}>
                          {ticket.status === 'new' ? 'New' : ticket.status === 'in_progress' ? 'In Progress' : ticket.status === 'resolved' ? 'Resolved' : ticket.status}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono truncate">
                        {ticket.customer_phone || ticket.customer_email || '—'}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {assignedName ? (
                          <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{assignedName}</span>
                        ) : <span className="text-muted-foreground/50">—</span>}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(ticket.created_at), 'MMM d, h:mm a')}
                      </span>
                    </div>

                    {/* Mobile card */}
                    <div className="md:hidden p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-extrabold font-mono">{displayCode}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[ticket.status] || 'bg-muted text-muted-foreground'}`}>
                              {ticket.status === 'new' ? 'New' : ticket.status === 'in_progress' ? 'In Progress' : ticket.status === 'resolved' ? 'Resolved' : ticket.status}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 inline-flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" />
                              Review
                            </span>
                          </div>
                          <p className="text-xs font-medium">{ISSUE_LABELS[ticket.issue_type] || ticket.issue_type}</p>
                          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                            {ticket.customer_phone && <span>📞 {ticket.customer_phone}</span>}
                            {assignedName && (
                              <span className="inline-flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded text-[10px]">
                                <User className="w-2.5 h-2.5" />{assignedName}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {format(new Date(ticket.created_at), 'MMM d, h:mm a')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
                </p>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 px-2" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-xs flex items-center px-2">{page + 1} / {totalPages}</span>
                  <Button size="sm" variant="outline" className="h-7 px-2" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminManagerReview;
