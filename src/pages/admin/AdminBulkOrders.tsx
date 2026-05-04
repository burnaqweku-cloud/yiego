import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { PackagePlus, RefreshCw, ChevronLeft, ChevronRight, Layers } from 'lucide-react';

const PAGE_SIZE = 25;
const STATUSES = ['Pending', 'Processing', 'Paid', 'Delivered', 'Failed'];
const NETWORKS = ['MTN', 'Telecel', 'AirtelTigo'];

interface BulkOrderRow {
  id: string;
  order_id: string;
  recipient_number: string;
  network: string;
  bundle_size_gb: number;
  amount_ghs: number;
  cost_price_ghs: number | null;
  status: string;
  supplier_id: string | null;
  supplier_reference: string | null;
  supplier_order_id: string | null;
  supplier_status: string | null;
  supplier_message: string | null;
  failure_reason: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface BulkSummary {
  total_count: number;
  today_count: number;
  delivered_count: number;
  processing_count: number;
  failed_count: number;
  total_gb: number;
  by_network: Record<string, number>;
  by_supplier: Record<string, number>;
  by_status: Record<string, number>;
}

const fmtDate = (s: string) => new Date(s).toLocaleString('en-GB', { timeZone: 'Africa/Accra', hour12: false });
const fmtGhs = (n: number) => `GHS ${Number(n || 0).toFixed(2)}`;

const statusBadge = (s: string) => {
  if (s === 'Delivered') return 'text-emerald-600 border-emerald-600/30 bg-emerald-500/10';
  if (s === 'Failed') return 'text-destructive border-destructive/30 bg-destructive/10';
  if (s === 'Processing' || s === 'Paid') return 'text-amber-600 border-amber-500/30 bg-amber-500/10';
  return 'text-muted-foreground';
};

const AdminBulkOrders = () => {
  const { isAdmin, isAdminOrStaff } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState<BulkOrderRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [networkFilter, setNetworkFilter] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<BulkSummary | null>(null);
  const [supplierMap, setSupplierMap] = useState<Record<string, string>>({});

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadOrders = useCallback(async () => {
    if (!isAdminOrStaff) return;
    setLoading(true);
    let query = supabase
      .from('orders')
      .select('id, order_id, recipient_number, network, bundle_size_gb, amount_ghs, cost_price_ghs, status, supplier_id, supplier_reference, supplier_order_id, supplier_status, supplier_message, failure_reason, admin_notes, created_at, updated_at', { count: 'exact' })
      .eq('order_source', 'admin_bulk')
      .eq('is_checkpoint', false);

    if (statusFilter !== 'All') query = query.eq('status', statusFilter);
    if (networkFilter !== 'All') query = query.eq('network', networkFilter);
    if (debouncedSearch) {
      const s = debouncedSearch;
      query = query.or(`order_id.ilike.%${s}%,recipient_number.ilike.%${s}%,supplier_order_id.ilike.%${s}%,supplier_reference.ilike.%${s}%`);
    }

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count: c } = await query;
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data || []) as BulkOrderRow[]);
    setCount(c || 0);
  }, [isAdminOrStaff, statusFilter, networkFilter, debouncedSearch, page]);

  const loadSummary = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_bulk_orders_summary' as any);
    if (error) { console.warn('[bulk summary]', error.message); return; }
    setSummary(data as unknown as BulkSummary);
  }, []);

  const loadSuppliers = useCallback(async () => {
    const { data } = await supabase.from('suppliers').select('id, code');
    const map: Record<string, string> = {};
    (data || []).forEach((s: any) => { map[s.id] = s.code; });
    setSupplierMap(map);
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useEffect(() => { loadSummary(); loadSuppliers(); }, [loadSummary, loadSuppliers]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const refreshAll = () => { loadOrders(); loadSummary(); };

  if (!isAdminOrStaff) return null;

  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-display font-bold flex items-center gap-2">
              <Layers className="w-5 h-5" /> Bulk Orders
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Admin-dispatched bulk orders. Separate from normal customer orders — these don't count in normal stats and don't deduct any wallet.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refreshAll} className="gap-1.5"><RefreshCw className="w-4 h-4" /> Refresh</Button>
            {isAdmin && (
              <Button size="sm" onClick={() => navigate('/admin/orders/bulk')} className="gap-1.5">
                <PackagePlus className="w-4 h-4" /> New Bulk Dispatch
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <StatCard label="Today" value={summary?.today_count} />
          <StatCard label="Total" value={summary?.total_count} />
          <StatCard label="Delivered" value={summary?.delivered_count} tone="emerald" />
          <StatCard label="Processing" value={summary?.processing_count} tone="amber" />
          <StatCard label="Failed" value={summary?.failed_count} tone="destructive" />
          <StatCard label="Total GB" value={summary?.total_gb} />
        </div>

        {/* Breakdowns */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <BreakdownCard title="By Network" data={summary.by_network} />
            <BreakdownCard title="By Supplier" data={summary.by_supplier} />
            <BreakdownCard title="By Status" data={summary.by_status} />
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-3 flex flex-wrap gap-2">
            <Input
              placeholder="Search order ID, phone, supplier ref…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 text-sm flex-1 min-w-[220px]"
            />
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={networkFilter} onValueChange={(v) => { setNetworkFilter(v); setPage(0); }}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Networks</SelectItem>
                {NETWORKS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="p-3 space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
            ) : rows.length === 0 ? (
              <p className="p-8 text-sm text-muted-foreground text-center">No bulk orders found.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Order</th>
                    <th className="px-3 py-2 text-left">Recipient</th>
                    <th className="px-3 py-2 text-left">Network</th>
                    <th className="px-3 py-2 text-right">GB</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-left">Supplier</th>
                    <th className="px-3 py-2 text-left">Supplier Ref</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((o) => (
                    <tr key={o.id} className="hover:bg-muted/40">
                      <td className="px-3 py-2 font-mono">
                        <Link to={`/admin/orders/${o.order_id}`} className="text-primary hover:underline">{o.order_id}</Link>
                      </td>
                      <td className="px-3 py-2 font-mono">{o.recipient_number}</td>
                      <td className="px-3 py-2 uppercase">{o.network}</td>
                      <td className="px-3 py-2 text-right">{o.bundle_size_gb}</td>
                      <td className="px-3 py-2 text-right">{fmtGhs(o.amount_ghs)}</td>
                      <td className="px-3 py-2">{o.supplier_id ? (supplierMap[o.supplier_id] || '—') : '—'}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-[160px]">{o.supplier_order_id || o.supplier_reference || '—'}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={statusBadge(o.status)}>{o.status}</Badge>
                        {o.status === 'Failed' && o.failure_reason && (
                          <p className="text-[10px] text-destructive/80 mt-0.5 truncate max-w-[180px]" title={o.failure_reason}>{o.failure_reason}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(o.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{count.toLocaleString()} bulk orders · page {page + 1} / {totalPages}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-7" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="w-3 h-3" /></Button>
            <Button size="sm" variant="outline" className="h-7" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="w-3 h-3" /></Button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

const StatCard = ({ label, value, tone }: { label: string; value: number | undefined; tone?: 'emerald' | 'amber' | 'destructive' }) => {
  const toneCls =
    tone === 'emerald' ? 'text-emerald-600' :
    tone === 'amber' ? 'text-amber-600' :
    tone === 'destructive' ? 'text-destructive' : 'text-foreground';
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold ${toneCls}`}>{value === undefined ? '—' : Number(value).toLocaleString()}</p>
      </CardContent>
    </Card>
  );
};

const BreakdownCard = ({ title, data }: { title: string; data: Record<string, number> }) => {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent className="pt-0">
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">No data.</p>
        ) : (
          <ul className="space-y-1">
            {entries.map(([k, v]) => (
              <li key={k} className="flex items-center justify-between text-sm">
                <span className="font-medium">{k}</span>
                <span className="text-muted-foreground tabular-nums">{Number(v).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminBulkOrders;
