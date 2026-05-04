import { useState, useEffect, useCallback } from 'react';
import AdminLayout from './AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { RefreshCw, Search, Shield, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface PaymentIntent {
  id: string;
  paystack_reference: string;
  created_at: string;
  updated_at: string;
  payment_status: string;
  order_type: string;
  user_id: string | null;
  recipient_number: string;
  network: string;
  bundle_size_gb: number;
  expected_amount: number;
  order_created: boolean;
  order_id: string | null;
  fulfilled_by: string | null;
  fulfilled_at: string | null;
  fulfillment_error: string | null;
}

const statusConfig: Record<string, { color: string; icon: typeof CheckCircle }> = {
  pending: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  success: { color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle },
  failed: { color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

const AdminPaymentIntents = () => {
  const [intents, setIntents] = useState<PaymentIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchRef, setSearchRef] = useState('');
  const [stats, setStats] = useState({ total: 0, pending: 0, fulfilled: 0, unfulfilled: 0 });

  const fetchIntents = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('payment_intents')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (filterStatus !== 'all') query = query.eq('payment_status', filterStatus);
    if (filterType !== 'all') query = query.eq('order_type', filterType);
    if (searchRef.trim()) query = query.ilike('paystack_reference', `%${searchRef.trim()}%`);

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to load payment intents');
      console.error(error);
    }
    const items = (data || []) as PaymentIntent[];
    setIntents(items);

    // Compute stats from full recent set
    const statsQuery = await supabase
      .from('payment_intents')
      .select('payment_status, order_created, fulfilled_by')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
    const all = statsQuery.data || [];
    setStats({
      total: all.length,
      pending: all.filter((i: any) => i.payment_status === 'pending').length,
      fulfilled: all.filter((i: any) => i.order_created === true).length,
      unfulfilled: all.filter((i: any) => i.payment_status === 'success' && !i.order_created).length,
    });

    setLoading(false);
  }, [filterStatus, filterType, searchRef]);

  useEffect(() => { fetchIntents(); }, [fetchIntents]);

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Payment Intents
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Server-side payment fulfillment tracking — last 24h stats
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchIntents} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total (24h)</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.fulfilled}</p>
            <p className="text-xs text-muted-foreground">Fulfilled</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.unfulfilled}</p>
            <p className="text-xs text-muted-foreground">Success but Unfulfilled</p>
          </CardContent></Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="w-48">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue placeholder="Payment Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-48">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger><SelectValue placeholder="Intent Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="user">User Order</SelectItem>
                <SelectItem value="guest">Guest Order</SelectItem>
                <SelectItem value="deposit">Deposit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by reference..."
                value={searchRef}
                onChange={(e) => setSearchRef(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : intents.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No payment intents found</CardContent></Card>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Reference</th>
                  <th className="text-left px-3 py-2 font-medium">Type</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Amount</th>
                  <th className="text-left px-3 py-2 font-medium">Network</th>
                  <th className="text-left px-3 py-2 font-medium">Fulfilled</th>
                  <th className="text-left px-3 py-2 font-medium">Method</th>
                  <th className="text-left px-3 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {intents.map((intent) => {
                  const sc = statusConfig[intent.payment_status] || statusConfig.pending;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={intent.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs max-w-[180px] truncate" title={intent.paystack_reference}>
                        {intent.paystack_reference}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-xs capitalize">{intent.order_type}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sc.color}`}>
                          <StatusIcon className="h-3 w-3" />
                          {intent.payment_status}
                        </span>
                      </td>
                      <td className="px-3 py-2">GHS {Number(intent.expected_amount).toFixed(2)}</td>
                      <td className="px-3 py-2">{intent.network === 'N/A' ? '—' : intent.network}</td>
                      <td className="px-3 py-2">
                        {intent.order_created ? (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <CheckCircle className="h-3.5 w-3.5" />
                            {intent.order_id ? <span className="text-xs font-mono">{intent.order_id}</span> : 'Yes'}
                          </span>
                        ) : intent.payment_status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-red-600">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span className="text-xs">Missing</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {intent.fulfilled_by ? (
                          <Badge variant="secondary" className="text-xs capitalize">{intent.fulfilled_by}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(intent.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminPaymentIntents;
