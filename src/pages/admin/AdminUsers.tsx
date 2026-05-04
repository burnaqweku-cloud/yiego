import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatPrice } from '@/data/bundles';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Users, RefreshCw, Mail, Phone, Download, ChevronLeft, ChevronRight, Ban, Eye, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface UserProfile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  username: string | null;
  created_at: string;
  suspended: boolean;
  agent_status: string | null;
}

const PAGE_SIZE = 50;

const AdminUsers = () => {
  const { user, isAdminOrStaff, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    if (!authLoading && (!user || !isAdminOrStaff)) navigate('/auth');
  }, [user, isAdminOrStaff, authLoading, navigate]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('profiles')
      .select('id, full_name, email, phone, username, created_at, suspended', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Server-side search
    const q = debouncedSearch.trim();
    if (q) {
      query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,username.ilike.%${q}%`);
    }

    query = query.range(from, to);

    const { data: profiles, count, error } = await query;

    if (error || !profiles) {
      setLoading(false);
      return;
    }

    // Batch fetch agent statuses for this page of users
    const userIds = profiles.map(p => p.id);
    const { data: agents } = userIds.length > 0
      ? await supabase.from('agents' as any).select('user_id, status').in('user_id', userIds)
      : { data: [] };

    const agentMap: Record<string, string> = {};
    (agents as any[] || []).forEach((a: any) => { agentMap[a.user_id] = a.status; });

    const enriched: UserProfile[] = profiles.map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      phone: p.phone,
      username: p.username,
      created_at: p.created_at,
      suspended: p.suspended || false,
      agent_status: agentMap[p.id] || null,
    }));

    setUsers(enriched);
    setTotalCount(count ?? enriched.length);
    setLoading(false);
  }, [page, debouncedSearch]);

  useEffect(() => {
    if (isAdminOrStaff) fetchUsers();
  }, [isAdminOrStaff, fetchUsers]);

  if (authLoading || !user || !isAdminOrStaff) return null;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleExportCSV = () => {
    const headers = ['Name', 'Username', 'Email', 'Phone', 'Joined', 'Status'];
    const rows = users.map(u => [
      u.full_name, u.username || '', u.email || '', u.phone,
      new Date(u.created_at).toLocaleDateString(),
      u.suspended ? 'Suspended' : 'Active'
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `users-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('Users exported (current page)');
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold">Users</h2>
            <p className="text-muted-foreground text-sm">{totalCount} registered users</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5 text-xs hidden sm:flex">
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={fetchUsers} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone, username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : users.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">{debouncedSearch ? `No users match "${debouncedSearch}"` : 'No registered users yet'}</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Joined</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium text-sm">{u.full_name || '—'}</p>
                          {u.agent_status === 'active' && (
                            <Badge variant="outline" className="text-[9px] gap-0.5 px-1.5 py-0 h-4 border-primary/30 text-primary">
                              <ShieldCheck className="w-2.5 h-2.5" /> Agent
                            </Badge>
                          )}
                          {(u.agent_status === 'pending_review' || u.agent_status === 'approved') && (
                            <Badge variant="outline" className="text-[9px] gap-0.5 px-1.5 py-0 h-4 border-amber-400/30 text-amber-600">
                              Pending Agent
                            </Badge>
                          )}
                        </div>
                        {u.username && <p className="text-xs text-muted-foreground">@{u.username}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="space-y-0.5">
                        {u.email && <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{u.email}</p>}
                        {u.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{u.phone}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {u.suspended ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive flex items-center gap-1 w-fit">
                          <Ban className="w-3 h-3" /> Suspended
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/admin/users/${u.id}`)}
                        className="gap-1 text-[10px] h-7 px-2"
                      >
                        <Eye className="w-3 h-3" /> View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminUsers;
