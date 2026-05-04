import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { supabase } from '@/integrations/supabase/client';
import { formatPrice } from '@/data/bundles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, RotateCcw, RefreshCw,
  Search, CheckCircle, XCircle, DollarSign, AlertTriangle, ChevronLeft, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';

interface WalletTransaction {
  id: string;
  user_id: string;
  type: string;
  amount_ghs: number;
  status: string;
  reference: string | null;
  description: string | null;
  created_at: string;
  user_name?: string;
  user_email?: string;
}

interface WalletStats {
  totalBalance: number;
  totalDeposits: number;
  totalDebits: number;
  totalRefunds: number;
  totalAdjustments: number;
  pendingDeposits: number;
}

const PAGE_SIZE = 25;

const AdminWalletOverview = () => {
  const { user, isAdminOrStaff, isAdmin, loading: authLoading } = useAuth();
  const { log } = useAuditLog();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [stats, setStats] = useState<WalletStats>({ totalBalance: 0, totalDeposits: 0, totalDebits: 0, totalRefunds: 0, totalAdjustments: 0, pendingDeposits: 0 });
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!authLoading && (!user || !isAdminOrStaff)) navigate('/auth');
  }, [user, isAdminOrStaff, authLoading, navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [walletsRes, txnsRes, allTxnsRes] = await Promise.all([
      supabase.from('wallets').select('balance_ghs'),
      supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('wallet_transactions').select('type, amount_ghs, status'),
    ]);

    const totalBalance = walletsRes.data?.reduce((sum, w: any) => sum + Number(w.balance_ghs), 0) || 0;

    let totalDeposits = 0, totalDebits = 0, totalRefunds = 0, totalAdjustments = 0, pendingDeposits = 0;
    allTxnsRes.data?.forEach((t: any) => {
      const amount = Number(t.amount_ghs);
      if (t.type === 'deposit' && t.status === 'confirmed') totalDeposits += amount;
      if (t.type === 'deposit' && t.status === 'pending') pendingDeposits += amount;
      if (t.type === 'debit') totalDebits += amount;
      if (t.type === 'refund') totalRefunds += amount;
      if (t.type === 'adjustment') totalAdjustments += amount;
    });

    setStats({ totalBalance, totalDeposits, totalDebits, totalRefunds, totalAdjustments, pendingDeposits });

    // Filter by type
    let filteredTxns = txnsRes.data || [];
    if (typeFilter !== 'all') filteredTxns = filteredTxns.filter((t: any) => t.type === typeFilter);

    // Enrich with user info
    const userIds = [...new Set(filteredTxns.map((t: any) => t.user_id))];
    const { data: profiles } = userIds.length > 0
      ? await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
      : { data: [] };

    const profileMap: Record<string, any> = {};
    profiles?.forEach((p: any) => { profileMap[p.id] = p; });

    setTransactions(filteredTxns.map((t: any) => ({
      ...t,
      user_name: profileMap[t.user_id]?.full_name || 'Unknown',
      user_email: profileMap[t.user_id]?.email || '',
    })));

    setLoading(false);
  }, [typeFilter]);

  useEffect(() => {
    if (isAdminOrStaff) fetchData();
  }, [isAdminOrStaff, fetchData]);

  const handleAction = async (txId: string, userId: string, amount: number, action: 'confirm' | 'reject') => {
    if (!isAdmin) { toast.error('Only admins can approve deposits'); return; }

    const { error } = await supabase.from('wallet_transactions').update({ status: action === 'confirm' ? 'confirmed' : 'rejected' }).eq('id', txId);
    if (error) { toast.error('Failed to update'); return; }

    if (action === 'confirm') {
      const { data: wallet } = await supabase.from('wallets').select('balance_ghs').eq('user_id', userId).single();
      if (wallet) {
        await supabase.from('wallets').update({ balance_ghs: Number(wallet.balance_ghs) + amount }).eq('user_id', userId);
      }
    }

    await log({
      action: action === 'confirm' ? 'deposit_confirmed' : 'deposit_rejected',
      entity_type: 'wallet_transaction',
      entity_id: txId,
      changes: { status: { before: 'pending', after: action === 'confirm' ? 'confirmed' : 'rejected' } },
      metadata: { user_id: userId, amount },
    });

    toast.success(action === 'confirm' ? 'Deposit confirmed' : 'Deposit rejected');
    fetchData();
  };

  if (authLoading || !user || !isAdminOrStaff) return null;

  const filtered = transactions.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return t.reference?.toLowerCase().includes(q) || t.user_name?.toLowerCase().includes(q) || t.user_email?.toLowerCase().includes(q);
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const typeIcon = (type: string) => {
    switch (type) {
      case 'deposit': return <ArrowDownCircle className="w-3.5 h-3.5 text-success" />;
      case 'debit': return <ArrowUpCircle className="w-3.5 h-3.5 text-destructive" />;
      case 'refund': return <RotateCcw className="w-3.5 h-3.5 text-info" />;
      case 'adjustment': return <DollarSign className="w-3.5 h-3.5 text-primary" />;
      default: return <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold">Wallet & Finance</h2>
            <p className="text-muted-foreground text-sm">Overview of all wallet balances and transactions</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Total Liability', value: formatPrice(stats.totalBalance), icon: Wallet, color: 'text-primary' },
            { label: 'Deposits', value: formatPrice(stats.totalDeposits), icon: ArrowDownCircle, color: 'text-success' },
            { label: 'Debits', value: formatPrice(stats.totalDebits), icon: ArrowUpCircle, color: 'text-destructive' },
            { label: 'Refunds', value: formatPrice(stats.totalRefunds), icon: RotateCcw, color: 'text-info' },
            { label: 'Adjustments', value: formatPrice(stats.totalAdjustments), icon: DollarSign, color: 'text-muted-foreground' },
            { label: 'Pending Deposits', value: formatPrice(stats.pendingDeposits), icon: AlertTriangle, color: stats.pendingDeposits > 0 ? 'text-primary' : 'text-muted-foreground' },
          ].map(stat => (
            <div key={stat.label} className="bg-card rounded-xl p-4 border border-border card-shadow">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</span>
              </div>
              <p className="text-lg font-display font-bold">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by user, reference..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {['all', 'deposit', 'debit', 'refund', 'adjustment'].map(t => (
              <button key={t} onClick={() => { setTypeFilter(t); setPage(0); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}>
                {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            {paged.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm">No transactions found</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Reference</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Date</th>
                    {isAdmin && <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {paged.map(t => (
                    <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3"><div className="flex items-center gap-2">{typeIcon(t.type)}<span className="capitalize text-xs font-medium">{t.type}</span></div></td>
                      <td className="px-4 py-3"><p className="font-medium text-xs">{t.user_name}</p></td>
                      <td className="px-4 py-3 text-right font-medium">{formatPrice(Number(t.amount_ghs))}</td>
                      <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground font-mono">{t.reference || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          t.status === 'confirmed' || t.status === 'completed' ? 'bg-success/10 text-success' :
                          t.status === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                        }`}>{t.status}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          {t.type === 'deposit' && t.status === 'pending' && (
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="default" onClick={() => handleAction(t.id, t.user_id, Number(t.amount_ghs), 'confirm')} className="gap-1 text-[10px] h-7 px-2">
                                <CheckCircle className="w-3 h-3" /> OK
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleAction(t.id, t.user_id, Number(t.amount_ghs), 'reject')} className="gap-1 text-[10px] h-7 px-2 text-destructive">
                                <XCircle className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminWalletOverview;
