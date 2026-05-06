import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatPrice } from '@/data/bundles';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search, Users, RefreshCw, Mail, Phone, Download, ChevronLeft, ChevronRight,
  Ban, Eye, ShieldCheck, AlertTriangle, Wallet, Calendar, BadgeCheck,
  UserPlus, UserCheck, AtSign, Hash, Copy, Activity,
} from 'lucide-react';
import { toast } from 'sonner';

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  username: string | null;
  avatar_url?: string | null;
  created_at: string;
  suspended: boolean;
  agent_status: string | null;
  wallet_balance: number;
}

const PAGE_SIZE = 25;

type StatusFilter = 'all' | 'active' | 'suspended' | 'agents' | 'new';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'agents', label: 'Agents' },
  { id: 'new', label: 'New (7d)' },
];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function getInitials(name: string | null, email: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || 'U';
  }
  if (email) return email[0]?.toUpperCase() || 'U';
  return 'U';
}

const AdminUsers = () => {
  const { user, isAdminOrStaff, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Aggregate stats (whole-table counts)
  const [stats, setStats] = useState<{
    total: number;
    active: number;
    suspended: number;
    agents: number;
    newWeek: number;
  } | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !isAdminOrStaff)) navigate('/auth');
  }, [user, isAdminOrStaff, authLoading, navigate]);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [statusFilter]);

  // Stats — uses SECURITY DEFINER RPC that bypasses RLS for admins/staff
  const fetchStats = useCallback(async () => {
    try {
      const { data, error: rpcErr } = await supabase.rpc('admin_user_stats' as any);
      if (rpcErr || !data || (Array.isArray(data) && data.length === 0)) return;
      const row: any = Array.isArray(data) ? data[0] : data;
      setStats({
        total: Number(row.total) || 0,
        active: Number(row.active) || 0,
        suspended: Number(row.suspended) || 0,
        agents: Number(row.agents) || 0,
        newWeek: Number(row.new_week) || 0,
      });
    } catch {
      // Best-effort; main fetch surfaces errors
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const offset = page * PAGE_SIZE;

      // Primary path: admin_list_users RPC (SECURITY DEFINER, bypasses RLS)
      const { data, error: rpcErr } = await supabase.rpc('admin_list_users' as any, {
        p_search: debouncedSearch.trim() || null,
        p_status: statusFilter,
        p_offset: offset,
        p_limit: PAGE_SIZE,
      });

      if (rpcErr) {
        // RPC may not exist yet (migration unapplied). Surface a helpful error.
        const msg = rpcErr.message || '';
        if (/function .* does not exist|Could not find the function/i.test(msg)) {
          setError(
            'The admin_list_users RPC isn\'t available in this Supabase project yet. Apply the latest database migration in Lovable, then refresh this page.'
          );
        } else {
          setError(msg || 'Failed to load users.');
        }
        setUsers([]);
        setTotalCount(0);
        return;
      }

      const rows: any[] = Array.isArray(data) ? data : [];
      const total = rows.length > 0 ? Number(rows[0].total_count) || 0 : 0;

      const enriched: UserProfile[] = rows.map((r: any) => ({
        id: r.id,
        full_name: r.full_name,
        email: r.email,
        phone: r.phone,
        username: r.username,
        avatar_url: r.avatar_url,
        created_at: r.created_at,
        suspended: !!r.suspended,
        agent_status: r.agent_status || null,
        wallet_balance: Number(r.wallet_balance) || 0,
      }));

      setUsers(enriched);
      setTotalCount(total);
    } catch (e: any) {
      setError(e?.message || 'Unexpected error loading users');
      setUsers([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => {
    if (isAdminOrStaff) {
      fetchUsers();
      fetchStats();
    }
  }, [isAdminOrStaff, fetchUsers, fetchStats]);

  if (authLoading || !user || !isAdminOrStaff) return null;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleExportCSV = () => {
    const headers = ['Name', 'Username', 'Email', 'Phone', 'Wallet (GHS)', 'Joined', 'Status', 'Agent'];
    const rows = users.map(u => [
      u.full_name || '', u.username || '', u.email || '', u.phone || '',
      u.wallet_balance.toFixed(2),
      new Date(u.created_at).toLocaleDateString(),
      u.suspended ? 'Suspended' : 'Active',
      u.agent_status === 'active' ? 'Yes' : '',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `users-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('Users exported (current page)');
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success('User ID copied');
  };

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* ── Header ── */}
        <header className="flex items-end justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-primary">People</span>
            </div>
            <h1 className="text-2xl md:text-[1.85rem] font-display font-extrabold tracking-[-0.025em] leading-[1.05]">
              Users
            </h1>
            <p className="text-[12.5px] text-muted-foreground mt-1">
              <span className="font-bold text-foreground tabular">{totalCount.toLocaleString('en-US')}</span> registered
              {statusFilter !== 'all' && ` · ${FILTERS.find(f => f.id === statusFilter)?.label}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={users.length === 0}
              className="gap-1.5 text-[12px] h-9 rounded-full bg-card/60 backdrop-blur-sm hover:border-primary/35 hidden sm:flex"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
            <button
              onClick={() => { fetchUsers(); fetchStats(); }}
              className="w-10 h-10 rounded-full border border-border/70 bg-card/70 backdrop-blur-md text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card transition-all flex items-center justify-center group"
              aria-label="Refresh users"
            >
              <RefreshCw className={`w-4 h-4 transition-transform duration-500 ${loading ? 'animate-spin' : 'group-hover:rotate-180'}`} />
            </button>
          </div>
        </header>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3">
          <UserStat icon={Users} tone="primary" label="Total" value={stats ? stats.total.toLocaleString('en-US') : '—'} />
          <UserStat icon={UserCheck} tone="emerald" label="Active" value={stats ? stats.active.toLocaleString('en-US') : '—'} />
          <UserStat icon={Ban} tone="rose" label="Suspended" value={stats ? stats.suspended.toLocaleString('en-US') : '—'} />
          <UserStat icon={ShieldCheck} tone="amber" label="Active agents" value={stats ? stats.agents.toLocaleString('en-US') : '—'} />
          <UserStat icon={UserPlus} tone="sky" label="New 7d" value={stats ? `+${stats.newWeek.toLocaleString('en-US')}` : '—'} />
        </div>

        {/* ── Search + Filter pills ── */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
            <Input
              placeholder="Search by name, email, phone, or @username…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-11 h-11 rounded-2xl bg-muted/30 border-border/60 focus:bg-background"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 snap-row">
            {FILTERS.map(f => {
              const active = statusFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={`shrink-0 inline-flex items-center px-3.5 h-9 rounded-full text-[11.5px] font-semibold transition-all duration-200 ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.55)]'
                      : 'bg-card/70 backdrop-blur-sm border border-border/70 text-foreground/75 hover:text-foreground hover:border-primary/40'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Error state ── */}
        {error && (
          <div className="relative overflow-hidden rounded-2xl border border-rose-500/30 bg-rose-500/[0.05] p-4">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-500/40 to-transparent" />
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 ring-1 ring-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 shadow-[0_4px_12px_-4px_hsl(var(--destructive)/0.3)]">
                <AlertTriangle className="w-4 h-4" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-rose-600 dark:text-rose-400 leading-tight">Couldn't load users</p>
                <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-1 break-words">{error}</p>
                <p className="text-[10.5px] text-muted-foreground/80 mt-2 leading-relaxed">
                  If this looks like a permissions error, the <code className="text-foreground bg-muted/60 px-1 rounded">profiles</code> table likely needs an RLS policy that lets admins/staff read all rows.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 gap-1.5 text-[11.5px] h-8 rounded-full"
                  onClick={() => { fetchUsers(); fetchStats(); }}
                >
                  <RefreshCw className="w-3 h-3" /> Try again
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── List ── */}
        {loading ? (
          <div className="rounded-2xl glass-card overflow-hidden">
            <div className="divide-y divide-border/50">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-5 py-4 flex items-center gap-3">
                  <Skeleton className="w-11 h-11 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-7 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ) : users.length === 0 && !error ? (
          <div className="rounded-2xl glass-card p-16 text-center">
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 mx-auto mb-5 flex items-center justify-center shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.4)]">
              <Users className="w-7 h-7 text-primary" strokeWidth={1.8} />
            </div>
            <h3 className="font-display font-bold text-xl tracking-tight">
              {debouncedSearch ? 'No matching users' : 'No registered users yet'}
            </h3>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-sm mx-auto">
              {debouncedSearch
                ? `Nothing matches "${debouncedSearch}". Try a different search or clear it.`
                : 'When users sign up, they will appear here.'}
            </p>
          </div>
        ) : users.length > 0 ? (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2.5">
              {users.map(u => <UserCard key={u.id} user={u} onView={() => navigate(`/admin/users/${u.id}`)} onCopyId={copyId} />)}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block rounded-2xl glass-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30">
                    <th className="text-left px-5 py-3 font-bold text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">User</th>
                    <th className="text-left px-4 py-3 font-bold text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">Contact</th>
                    <th className="text-right px-4 py-3 font-bold text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">Wallet</th>
                    <th className="text-left px-4 py-3 font-bold text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">Joined</th>
                    <th className="text-left px-4 py-3 font-bold text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">Status</th>
                    <th className="text-right px-5 py-3 font-bold text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => <UserRow key={u.id} user={u} onView={() => navigate(`/admin/users/${u.id}`)} onCopyId={copyId} />)}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11.5px] text-muted-foreground tabular">
                  Showing <span className="font-bold text-foreground">{page * PAGE_SIZE + 1}</span>–<span className="font-bold text-foreground">{Math.min((page + 1) * PAGE_SIZE, totalCount)}</span> of <span className="font-bold text-foreground">{totalCount.toLocaleString('en-US')}</span>
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 px-3 text-[12px] rounded-full bg-card/60 backdrop-blur-sm hover:border-primary/35"
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline ml-1">Prev</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 px-3 text-[12px] rounded-full bg-card/60 backdrop-blur-sm hover:border-primary/35"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <span className="hidden sm:inline mr-1">Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
};

// ─── Sub-components ──────────────────────────────────────────────

const TONES: Record<string, { tile: string; rail: string }> = {
  primary: { tile: 'from-primary/20 to-primary/5 text-primary ring-primary/25', rail: 'bg-primary' },
  emerald: { tile: 'from-emerald-500/20 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 ring-emerald-500/25', rail: 'bg-emerald-500' },
  sky: { tile: 'from-sky-500/20 to-sky-500/5 text-sky-600 dark:text-sky-400 ring-sky-500/25', rail: 'bg-sky-500' },
  rose: { tile: 'from-rose-500/20 to-rose-500/5 text-rose-600 dark:text-rose-400 ring-rose-500/25', rail: 'bg-rose-500' },
  amber: { tile: 'from-amber-500/20 to-amber-500/5 text-amber-600 dark:text-amber-400 ring-amber-500/25', rail: 'bg-amber-500' },
};

const UserStat = ({
  icon: Icon, tone, label, value,
}: {
  icon: typeof Users;
  tone: keyof typeof TONES;
  label: string;
  value: string;
}) => {
  const t = TONES[tone];
  return (
    <div className="relative rounded-xl glass-card p-3.5 overflow-hidden">
      <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full ${t.rail} opacity-80`} />
      <div className="relative">
        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ring-1 ${t.tile} flex items-center justify-center shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.2)] mb-2`}>
          <Icon className="w-3.5 h-3.5" strokeWidth={2} />
        </div>
        <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">{label}</p>
        <p className="text-[18px] font-display font-extrabold tabular leading-tight mt-1 truncate">{value}</p>
      </div>
    </div>
  );
};

const Avatar = ({
  url, name, email, size = 40,
}: { url?: string | null; name: string | null; email: string | null; size?: number }) => {
  const initials = getInitials(name, email);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-[hsl(var(--brand-glow))] p-[1.5px] shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.4)]">
        <span className="block w-full h-full rounded-full overflow-hidden bg-card">
          {url ? (
            <img src={url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-[hsl(var(--brand-glow))] text-primary-foreground font-display font-extrabold text-[12px]">
              {initials}
            </span>
          )}
        </span>
      </span>
    </div>
  );
};

const RoleBadges = ({ user }: { user: UserProfile }) => {
  const isAgent = user.agent_status === 'active';
  const isPendingAgent = user.agent_status === 'pending_review' || user.agent_status === 'approved';
  if (!isAgent && !isPendingAgent && !user.suspended) return null;
  return (
    <div className="inline-flex items-center gap-1 flex-wrap">
      {isAgent && (
        <span className="inline-flex items-center gap-0.5 text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/25">
          <ShieldCheck className="w-2.5 h-2.5" /> Agent
        </span>
      )}
      {isPendingAgent && (
        <span className="inline-flex items-center gap-0.5 text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/12 text-amber-600 dark:text-amber-400 border border-amber-500/30">
          Pending agent
        </span>
      )}
      {user.suspended && (
        <span className="inline-flex items-center gap-0.5 text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25">
          <Ban className="w-2.5 h-2.5" /> Suspended
        </span>
      )}
    </div>
  );
};

const StatusPill = ({ user }: { user: UserProfile }) => (
  user.suspended ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full border bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25">
      <Ban className="w-2.5 h-2.5" /> Suspended
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25">
      <BadgeCheck className="w-2.5 h-2.5" /> Active
    </span>
  )
);

const UserRow = ({
  user, onView, onCopyId,
}: { user: UserProfile; onView: () => void; onCopyId: (id: string) => void }) => {
  const memberId = user.id.slice(0, 8).toUpperCase();
  return (
    <tr className={`border-b border-border/40 last:border-0 hover:bg-primary/[0.03] transition-colors group ${user.suspended ? 'opacity-75' : ''}`}>
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar url={user.avatar_url} name={user.full_name} email={user.email} size={40} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-[13px] truncate">{user.full_name || <span className="text-muted-foreground italic">No name</span>}</p>
              <RoleBadges user={user} />
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-[10.5px] text-muted-foreground">
              {user.username ? (
                <span className="inline-flex items-center gap-0.5"><AtSign className="w-2.5 h-2.5" />{user.username}</span>
              ) : null}
              <button
                onClick={() => onCopyId(user.id)}
                className="inline-flex items-center gap-0.5 font-mono hover:text-primary transition-colors"
                title="Copy full user ID"
              >
                <Hash className="w-2.5 h-2.5" />{memberId}
                <Copy className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5" />
              </button>
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <div className="space-y-0.5">
          {user.email && <p className="text-[11.5px] text-foreground/85 truncate inline-flex items-center gap-1.5"><Mail className="w-3 h-3 text-muted-foreground/60" />{user.email}</p>}
          {user.phone && <p className="text-[11px] text-muted-foreground tabular inline-flex items-center gap-1.5"><Phone className="w-3 h-3 text-muted-foreground/60" />{user.phone}</p>}
          {!user.email && !user.phone && <span className="text-[11px] text-muted-foreground/60 italic">No contact</span>}
        </div>
      </td>
      <td className="px-4 py-3.5 text-right">
        <p className="text-[13px] font-bold tabular leading-tight">{formatPrice(user.wallet_balance)}</p>
        <p className="text-[10px] text-muted-foreground/70 inline-flex items-center justify-end gap-0.5"><Wallet className="w-2.5 h-2.5" />balance</p>
      </td>
      <td className="px-4 py-3.5">
        <p className="text-[11.5px] font-semibold leading-tight">{relativeTime(user.created_at)}</p>
        <p className="text-[10px] text-muted-foreground/70 tabular">{new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
      </td>
      <td className="px-4 py-3.5">
        <StatusPill user={user} />
      </td>
      <td className="px-5 py-3.5 text-right">
        <Button size="sm" variant="outline" onClick={onView} className="gap-1 text-[10.5px] h-7 px-3 rounded-full bg-card/60 backdrop-blur-sm hover:border-primary/35">
          <Eye className="w-3 h-3" /> View
        </Button>
      </td>
    </tr>
  );
};

const UserCard = ({
  user, onView, onCopyId,
}: { user: UserProfile; onView: () => void; onCopyId: (id: string) => void }) => {
  const memberId = user.id.slice(0, 8).toUpperCase();
  return (
    <button
      onClick={onView}
      className={`group relative w-full text-left rounded-2xl glass-card p-3.5 overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_18px_40px_-20px_hsl(var(--primary)/0.3)] ${user.suspended ? 'opacity-80' : ''}`}
    >
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative flex items-start gap-3">
        <Avatar url={user.avatar_url} name={user.full_name} email={user.email} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-[13.5px] truncate">{user.full_name || <span className="text-muted-foreground italic">No name</span>}</p>
            <RoleBadges user={user} />
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10.5px] text-muted-foreground">
            {user.username && <span className="inline-flex items-center gap-0.5"><AtSign className="w-2.5 h-2.5" />{user.username}</span>}
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onCopyId(user.id); }}
              className="inline-flex items-center gap-0.5 font-mono hover:text-primary transition-colors"
            >
              <Hash className="w-2.5 h-2.5" />{memberId}
            </span>
          </div>
          <div className="space-y-0.5 mt-2">
            {user.email && <p className="text-[11px] text-foreground/85 truncate inline-flex items-center gap-1.5"><Mail className="w-3 h-3 text-muted-foreground/60" />{user.email}</p>}
            {user.phone && <p className="text-[11px] text-muted-foreground tabular inline-flex items-center gap-1.5"><Phone className="w-3 h-3 text-muted-foreground/60" />{user.phone}</p>}
          </div>
          <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-border/40">
            <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground"><Wallet className="w-3 h-3 text-primary" /><span className="font-bold tabular text-foreground">{formatPrice(user.wallet_balance)}</span></span>
            <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground"><Calendar className="w-3 h-3" />{relativeTime(user.created_at)}</span>
            <StatusPill user={user} />
          </div>
        </div>
      </div>
    </button>
  );
};

export default AdminUsers;
