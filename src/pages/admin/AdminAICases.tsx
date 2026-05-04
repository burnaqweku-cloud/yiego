import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import SEOHead from '@/components/seo/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, RefreshCw, Clock, CheckCircle, AlertCircle, XCircle, ChevronLeft, ChevronRight, Bot, Filter, User, Archive, HandMetal, ShieldAlert, Globe, Lock, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const ISSUE_LABELS: Record<string, string> = {
  order_not_created: 'Order Not Created',
  deposit_not_reflected: 'Deposit Not Reflected',
  order_not_delivered: 'Order Issue',
  account_issue: 'Account / Access',
  other: 'Other',
};

const ACTIVE_STATUS_TABS = [
  { value: 'new', label: 'New', icon: AlertCircle, color: 'text-sky-600' },
  { value: 'in_progress', label: 'In Progress', icon: Clock, color: 'text-amber-600' },
  { value: 'resolved', label: 'Resolved', icon: CheckCircle, color: 'text-emerald-600' },
];

const ISSUE_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'order_not_created', label: 'Order Not Created' },
  { value: 'deposit_not_reflected', label: 'Deposit Issue' },
  { value: 'order_not_delivered', label: 'Order Issue' },
  { value: 'account_issue', label: 'Account Issue' },
];

const PAGE_SIZE = 20;

// Lightweight list columns - no notes, no full metadata
const LIST_COLUMNS = 'id, ticket_number, ticket_code, created_at, updated_at, status, issue_type, customer_phone, customer_email, reference_value, assigned_to, manager_review, ticket_metadata->source';

interface AITicketListItem {
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

const aiFilter = { source: 'ai_assistant' };

// Stable color mapping per admin ID for quick visual recognition
const ADMIN_COLORS = [
  'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  'bg-teal-500/10 text-teal-700 dark:text-teal-400',
  'bg-pink-500/10 text-pink-700 dark:text-pink-400',
  'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
];
function getAdminColor(adminId: string): string {
  let hash = 0;
  for (let i = 0; i < adminId.length; i++) hash = ((hash << 5) - hash) + adminId.charCodeAt(i);
  return ADMIN_COLORS[Math.abs(hash) % ADMIN_COLORS.length];
}

const AdminAICases = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<AITicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState(searchParams.get('status') || searchParams.get('tab') || 'new');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Archive mode
  const isArchive = searchParams.get('view') === 'archive';

  // Filters
  const [issueFilter, setIssueFilter] = useState('all');
  const [assignedFilter, setAssignedFilter] = useState('all');
  const [managerReviewFilter, setManagerReviewFilter] = useState(false);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [showFilters, setShowFilters] = useState(false);

  // Admin name cache
  const [adminNames, setAdminNames] = useState<Record<string, string>>({});

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const statusToFetch = isArchive ? 'closed' : activeTab;

    let query = (supabase.from('admin_support_tickets') as any)
      .select('id, ticket_number, ticket_code, created_at, updated_at, status, issue_type, customer_phone, customer_email, reference_value, assigned_to, manager_review, ticket_metadata', { count: 'exact' })
      .contains('ticket_metadata', aiFilter)
      .eq('status', statusToFetch)
      .order('created_at', { ascending: sortOrder === 'asc' })
      .range(from, to);

    if (search.trim()) {
      const s = search.trim();
      // Search by ticket_code or phone or reference
      query = (supabase.from('admin_support_tickets') as any)
        .select('id, ticket_number, ticket_code, created_at, updated_at, status, issue_type, customer_phone, customer_email, reference_value, assigned_to, manager_review, ticket_metadata', { count: 'exact' })
        .contains('ticket_metadata', aiFilter)
        .eq('status', statusToFetch)
        .or(`customer_phone.ilike.%${s}%,reference_value.ilike.%${s}%,ticket_code.ilike.%${s}%,issue_type.ilike.%${s}%`)
        .order('created_at', { ascending: sortOrder === 'asc' })
        .range(from, to);
    }

    if (issueFilter !== 'all') {
      query = query.eq('issue_type', issueFilter);
    }

    if (assignedFilter === 'mine' && user) {
      query = query.eq('assigned_to', user.id);
    } else if (assignedFilter === 'unassigned') {
      query = query.is('assigned_to', null);
    }

    if (managerReviewFilter) {
      query = query.eq('manager_review', true);
    }

    // Hide manager_review tickets from In Progress (they belong in Manager Review page)
    if (activeTab === 'in_progress' && !isArchive && !managerReviewFilter) {
      query = query.eq('manager_review', false);
    }

    const { data, error, count } = await query;
    if (!error) {
      const ticketData = (data as AITicketListItem[]) || [];
      setTickets(ticketData);
      setTotalCount(count || 0);

      // Batch fetch admin names
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
  }, [activeTab, page, search, sortOrder, issueFilter, assignedFilter, managerReviewFilter, user, isArchive]);

  const fetchCounts = useCallback(async () => {
    const statuses = ['new', 'in_progress', 'resolved', 'closed'];
    const results = await Promise.all(
      statuses.map(s => {
        let q = (supabase.from('admin_support_tickets') as any)
          .select('id', { count: 'exact', head: true })
          .contains('ticket_metadata', aiFilter)
          .eq('status', s);
        // Exclude manager_review tickets from in_progress count
        if (s === 'in_progress') {
          q = q.eq('manager_review', false);
        }
        return q;
      })
    );
    const c: Record<string, number> = {};
    statuses.forEach((s, i) => { c[s] = results[i].count || 0; });
    setCounts(c);
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);
  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  useEffect(() => { setPage(0); }, [activeTab, search, issueFilter, assignedFilter, managerReviewFilter, sortOrder, isArchive]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const openCount = (counts['new'] || 0);
  const closedCount = (counts['closed'] || 0);

  const hasActiveFilters = issueFilter !== 'all' || assignedFilter !== 'all' || managerReviewFilter || sortOrder !== 'desc';

  const getDisplayCode = (t: AITicketListItem) => t.ticket_code || `#${t.ticket_number}`;

  // Ticket Intake Mode
  const [intakeMode, setIntakeMode] = useState<'automatic' | 'always_open' | 'closed'>('automatic');
  const [intakeModeLoading, setIntakeModeLoading] = useState(true);
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);

  useEffect(() => {
    supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'ticket_intake_mode')
      .maybeSingle()
      .then(({ data }) => {
        const v = data?.value as string;
        if (v === 'always_open' || v === 'closed') setIntakeMode(v);
        else setIntakeMode('automatic');
        setIntakeModeLoading(false);
      });
  }, []);

  const handleIntakeModeChange = async (mode: string) => {
    const prev = intakeMode;
    const next = mode as typeof intakeMode;
    setIntakeMode(next);
    const { error } = await supabase
      .from('site_settings')
      .upsert({ key: 'ticket_intake_mode', value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) {
      toast.error('Failed to update intake mode');
      setIntakeMode(prev);
    } else {
      const labels = { automatic: 'Automatic (9 AM – 9 PM)', always_open: 'Always Open', closed: 'Closed' };
      toast.success(`Ticket intake set to: ${labels[next]}`);
    }
  };

  const handleTakeTicket = useCallback(async (e: React.MouseEvent, ticketId: string) => {
    e.stopPropagation();
    if (!user) return;
    const { error } = await supabase
      .from('admin_support_tickets')
      .update({ status: 'in_progress', assigned_to: user.id, updated_at: new Date().toISOString() })
      .eq('id', ticketId);
    if (error) {
      toast.error('Failed to take ticket');
      return;
    }
    toast.success('Ticket assigned to you');
    fetchTickets();
    fetchCounts();
  }, [user, fetchTickets, fetchCounts]);

  return (
    <AdminLayout>
      <SEOHead title="AI Support Tickets | Admin" description="Review AI-escalated support tickets" path="/admin/ai-cases" noIndex />

      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              {isArchive ? <Archive className="w-5 h-5 text-muted-foreground" /> : <Bot className="w-5 h-5 text-primary" />}
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold">
                {isArchive ? 'Closed Tickets Archive' : 'AI Support Tickets'}
              </h2>
              <p className="text-muted-foreground text-sm">
                {isArchive
                  ? `${closedCount} closed ticket${closedCount !== 1 ? 's' : ''}`
                  : openCount > 0 ? `${openCount} new ticket${openCount > 1 ? 's' : ''} waiting` : 'AI chatbot escalations'}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {!isArchive && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIntakeModalOpen(true)}
                className="text-muted-foreground"
              >
                <Settings2 className="w-3.5 h-3.5 mr-1" />
                Intake
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                  intakeMode === 'automatic' ? 'bg-sky-500/10 text-sky-700 dark:text-sky-400' :
                  intakeMode === 'always_open' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' :
                  'bg-destructive/10 text-destructive'
                }`}>
                  {intakeMode === 'automatic' ? 'Auto' : intakeMode === 'always_open' ? 'Open' : 'Off'}
                </span>
              </Button>
            )}
            {isArchive ? (
              <Button variant="outline" size="sm" onClick={() => setSearchParams({})}>
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Active
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchParams({ view: 'archive' })}
                className="text-muted-foreground"
              >
                <Archive className="w-3.5 h-3.5 mr-1" />
                Closed
                {closedCount > 0 && <span className="ml-1 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{closedCount}</span>}
              </Button>
            )}
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="relative"
            >
              <Filter className="w-3.5 h-3.5" />
              {hasActiveFilters && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full border-2 border-background" />
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { fetchTickets(); fetchCounts(); }}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Ticket Intake Mode Modal */}
        <Dialog open={intakeModalOpen} onOpenChange={setIntakeModalOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-primary" />
                Ticket Intake Mode
              </DialogTitle>
            </DialogHeader>
            <RadioGroup value={intakeMode} onValueChange={handleIntakeModeChange} disabled={intakeModeLoading} className="space-y-2">
              {([
                { value: 'automatic', label: 'Automatic', desc: 'Accept tickets during support hours only (9 AM – 9 PM Ghana time)', icon: Clock, activeColor: 'border-sky-500/50 bg-sky-500/5' },
                { value: 'always_open', label: 'Always Open', desc: 'Accept tickets at any time, 24/7', icon: Globe, activeColor: 'border-emerald-500/50 bg-emerald-500/5' },
                { value: 'closed', label: 'Closed', desc: 'Pause all ticket intake. AI will still chat but won\'t create tickets', icon: Lock, activeColor: 'border-destructive/50 bg-destructive/5' },
              ] as const).map(opt => {
                const Icon = opt.icon;
                const isActive = intakeMode === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 cursor-pointer transition-all ${isActive ? opt.activeColor : 'border-border hover:bg-muted/30'}`}
                  >
                    <RadioGroupItem value={opt.value} className="mt-0.5" />
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${isActive ? '' : 'text-muted-foreground'}`}>{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                );
              })}
            </RadioGroup>
          </DialogContent>
        </Dialog>

        {/* Status tabs - only for active view */}
        {!isArchive && (
          <div className="flex gap-1 overflow-x-auto">
            {ACTIVE_STATUS_TABS.map(tab => {
              const Icon = tab.icon;
              const count = counts[tab.value] || 0;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {count > 0 && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === tab.value ? 'bg-primary-foreground/20' : 'bg-muted'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by ticket code, phone, or reference..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="bg-card rounded-xl border border-border p-3 grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Issue Type</label>
              <Select value={issueFilter} onValueChange={setIssueFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ISSUE_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Assigned</label>
              <Select value={assignedFilter} onValueChange={setAssignedFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All</SelectItem>
                  <SelectItem value="mine" className="text-xs">Assigned to me</SelectItem>
                  <SelectItem value="unassigned" className="text-xs">Unassigned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Sort</label>
              <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as 'asc' | 'desc')}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc" className="text-xs">Newest first</SelectItem>
                  <SelectItem value="asc" className="text-xs">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Manager Review</label>
              <button
                onClick={() => setManagerReviewFilter(!managerReviewFilter)}
                className={`flex items-center gap-2 h-8 px-3 rounded-md border text-xs font-medium w-full transition-colors ${
                  managerReviewFilter
                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-400'
                    : 'bg-background border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                {managerReviewFilter ? 'Showing flagged' : 'Show flagged only'}
              </button>
            </div>
            {hasActiveFilters && (
              <div className="sm:col-span-4">
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setIssueFilter('all'); setAssignedFilter('all'); setManagerReviewFilter(false); setSortOrder('desc'); }}>
                  Clear all filters
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Ticket list */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12">
            <Bot className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {isArchive ? 'No closed tickets' : 'No AI tickets found'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop header */}
             <div className={`hidden md:grid gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border ${activeTab === 'new' && !isArchive ? 'grid-cols-[90px_1fr_110px_130px_120px_110px_80px]' : 'grid-cols-[90px_1fr_110px_130px_120px_110px]'}`}>
              <span>Ticket</span>
              <span>Issue</span>
              <span>Status</span>
              <span>Contact</span>
              <span>Assigned</span>
              <span>Created</span>
              {activeTab === 'new' && !isArchive && <span>Action</span>}
            </div>

            <div className="space-y-1">
              {tickets.map(ticket => {
                const meta = ticket.ticket_metadata || {};
                const assignedName = ticket.assigned_to ? (adminNames[ticket.assigned_to] || 'Admin') : null;
                const displayCode = getDisplayCode(ticket);

                return (
                  <div
                    key={ticket.id}
                    className={`bg-card rounded-xl border hover:bg-muted/30 transition-all duration-150 cursor-pointer ${ticket.manager_review ? 'border-orange-500/40 bg-orange-500/[0.03]' : 'border-border'}`}
                    onClick={() => navigate(`/admin/ai-cases/${ticket.id}?from=${isArchive ? 'archive' : activeTab}`)}
                  >
                    {/* Desktop row */}
                    <div className={`hidden md:grid gap-2 px-4 py-3 items-center ${activeTab === 'new' && !isArchive ? 'grid-cols-[90px_1fr_110px_130px_120px_110px_80px]' : 'grid-cols-[90px_1fr_110px_130px_120px_110px]'}`}>
                      <span className="text-xs font-extrabold text-foreground font-mono">{displayCode}</span>
                      <div className="min-w-0">
                        <span className="text-xs font-medium truncate block">{ISSUE_LABELS[ticket.issue_type] || ticket.issue_type}</span>
                        {meta.ai_summary && (
                          <span className="text-[10px] text-muted-foreground block truncate">{meta.ai_summary}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full w-fit ${
                          ticket.status === 'new' ? 'bg-sky-500/10 text-sky-600' :
                          ticket.status === 'in_progress' ? 'bg-amber-500/10 text-amber-600' :
                          ticket.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-600' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {ACTIVE_STATUS_TABS.find(s => s.value === ticket.status)?.label || ticket.status}
                        </span>
                        {ticket.manager_review && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400">
                            <ShieldAlert className="w-3 h-3" />
                            Manager Review
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground font-mono truncate">
                        {ticket.customer_phone || ticket.customer_email || '—'}
                      </span>
                      <span className="text-xs truncate">
                        {assignedName && ticket.assigned_to ? (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${getAdminColor(ticket.assigned_to)}`}>
                            <User className="w-3 h-3" />
                            {assignedName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(ticket.created_at), 'MMM d, h:mm a')}
                      </span>
                      {activeTab === 'new' && !isArchive && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] font-bold gap-1"
                          onClick={(e) => handleTakeTicket(e, ticket.id)}
                        >
                          <HandMetal className="w-3 h-3" />
                          Take
                        </Button>
                      )}
                    </div>

                    {/* Mobile card */}
                    <div className="md:hidden p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-extrabold font-mono">{displayCode}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              ticket.status === 'new' ? 'bg-sky-500/10 text-sky-600' :
                              ticket.status === 'in_progress' ? 'bg-amber-500/10 text-amber-600' :
                              ticket.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-600' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              {ACTIVE_STATUS_TABS.find(s => s.value === ticket.status)?.label || ticket.status}
                            </span>
                            {ticket.manager_review && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 inline-flex items-center gap-1">
                                <ShieldAlert className="w-3 h-3" />
                                Review
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium">{ISSUE_LABELS[ticket.issue_type] || ticket.issue_type}</p>
                          {meta.ai_summary && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{meta.ai_summary}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                            {ticket.customer_phone && <span>📞 {ticket.customer_phone}</span>}
                            {assignedName && ticket.assigned_to && (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${getAdminColor(ticket.assigned_to)}`}>
                                <User className="w-2.5 h-2.5" />
                                {assignedName}
                              </span>
                            )}
                            {meta.has_screenshot && <span>📸</span>}
                            {meta.is_agent && <span>🏪 Agent</span>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {format(new Date(ticket.created_at), 'MMM d, h:mm a')}
                          </span>
                          {activeTab === 'new' && !isArchive && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] font-bold gap-1 px-2"
                              onClick={(e) => handleTakeTicket(e, ticket.id)}
                            >
                              <HandMetal className="w-3 h-3" />
                              Take
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
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

export default AdminAICases;
