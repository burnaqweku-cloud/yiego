import { useEffect, useState, useCallback } from 'react';
import TgAdminLayout from './TgAdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { fmtGhs, fmtDate, downloadCsv } from './_utils';

interface Row {
  chat_id: number;
  username: string | null;
  first_name: string | null;
  user_id: string | null;
  phone: string | null;
  created_at: string;
  last_active_at: string | null;
  order_count: number;
  spent_ghs: number;
  points: number;
  refs_sent: number;
  refs_qualified: number;
}

const TgUsers = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size] = useState(50);
  const [search, setSearch] = useState('');
  const [linked, setLinked] = useState<string>('');
  const [active, setActive] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('tg_admin_users_list', {
      p_search: search || null,
      p_linked: linked || null,
      p_active: active || null,
      p_page: page,
      p_size: size,
    });
    setLoading(false);
    if (error) {
      toast.error('Failed to load users', { description: error.message });
      return;
    }
    const d = data as unknown as { rows: Row[]; total: number };
    setRows(d.rows);
    setTotal(d.total);
  }, [search, linked, active, page, size]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / size));

  return (
    <TgAdminLayout title="Bot Users" description="Search, filter and manage every Telegram bot user.">
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search chat_id, username, name, phone…"
              className="pl-8 h-8 text-xs"
            />
          </div>
          <select
            value={linked}
            onChange={(e) => { setLinked(e.target.value); setPage(1); }}
            className="h-8 px-2 text-xs rounded-md border border-border bg-background"
          >
            <option value="">All</option>
            <option value="linked">Linked</option>
            <option value="unlinked">Guest</option>
          </select>
          <select
            value={active}
            onChange={(e) => { setActive(e.target.value); setPage(1); }}
            className="h-8 px-2 text-xs rounded-md border border-border bg-background"
          >
            <option value="">Any activity</option>
            <option value="active7">Active 7d</option>
            <option value="inactive30">Inactive 30d+</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1"
            onClick={() => downloadCsv(`tg-users-page-${page}.csv`, rows as unknown as Record<string, unknown>[])}
            disabled={!rows.length}
          >
            <Download className="w-3 h-3" /> Export CSV
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-3">
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground p-6 text-center">No users match the filters.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">Chat ID</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">Linked</th>
                  <th className="px-3 py-2 text-right">Orders</th>
                  <th className="px-3 py-2 text-right">Spent</th>
                  <th className="px-3 py-2 text-right">Points</th>
                  <th className="px-3 py-2 text-right">Refs</th>
                  <th className="px-3 py-2">Joined</th>
                  <th className="px-3 py-2">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.chat_id} className="hover:bg-muted/40">
                    <td className="px-3 py-2 font-mono">
                      <Link to={`/admin/tg/users/${r.chat_id}`} className="text-primary hover:underline">{r.chat_id}</Link>
                    </td>
                    <td className="px-3 py-2 truncate max-w-[140px]">
                      {r.first_name || r.username || '—'}
                      {r.username && <span className="text-muted-foreground ml-1">@{r.username}</span>}
                    </td>
                    <td className="px-3 py-2">{r.phone || '—'}</td>
                    <td className="px-3 py-2">{r.user_id ? <span className="text-emerald-600">Linked</span> : <span className="text-muted-foreground">Guest</span>}</td>
                    <td className="px-3 py-2 text-right">{r.order_count}</td>
                    <td className="px-3 py-2 text-right">{fmtGhs(r.spent_ghs)}</td>
                    <td className="px-3 py-2 text-right">{r.points.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{r.refs_qualified}/{r.refs_sent}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.created_at)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.last_active_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
        <span>{total.toLocaleString()} users · page {page} / {totalPages}</span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="outline" className="h-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </TgAdminLayout>
  );
};

export default TgUsers;
