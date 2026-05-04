import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import AdminLayout from './AdminLayout';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { formatPrice } from '@/data/bundles';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Eye, Ban, Trash2, Search, ExternalLink, RefreshCw,
  CheckCircle, AlertTriangle, Timer, XCircle, Clock, Hourglass
} from 'lucide-react';

const PAID_STATUSES = ['Paid', 'Processing', 'Delivered'];

type EffectiveState = 'active' | 'expiring_soon' | 'grace_period' | 'expired_promo' | 'expired_standard' | 'approved_awaiting_activation' | 'pending_review' | 'unknown';

interface AgentEffectiveData {
  effective_state: EffectiveState;
  expiry_date: string | null;
  grace_end: string | null;
  promo_end: string | null;
  can_store_accept_orders: boolean;
  can_use_bulk_orders: boolean;
  has_agent_pricing: boolean;
  days_remaining: number;
  hours_remaining: number;
}

const stateConfig: Record<string, { label: string; color: string; icon: any; note?: string }> = {
  active: { label: 'Active', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle },
  expiring_soon: { label: 'Expiring Soon', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', icon: Timer, note: 'Renewal recommended' },
  grace_period: { label: 'Grace Period', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', icon: Clock, note: 'Store still active temporarily' },
  expired_promo: { label: 'Expired (Promo)', color: 'bg-destructive/10 text-destructive', icon: AlertTriangle, note: 'Store inactive, promo window' },
  expired_standard: { label: 'Expired', color: 'bg-destructive/10 text-destructive', icon: XCircle, note: 'Store inactive' },
  approved_awaiting_activation: { label: 'Awaiting Activation', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: Hourglass, note: 'Approved, not yet activated' },
  pending_review: { label: 'Pending Review', color: 'bg-muted text-muted-foreground', icon: Clock },
  unknown: { label: 'Unknown', color: 'bg-muted text-muted-foreground', icon: XCircle, note: 'Needs review' },
};

type FilterKey = 'all' | 'operational' | 'expiring_soon' | 'grace_period' | 'expired' | 'awaiting_activation';

const VALID_FILTERS: FilterKey[] = ['all', 'operational', 'expiring_soon', 'grace_period', 'expired', 'awaiting_activation'];

const AdminActiveAgents = () => {
  const { user } = useAuth();
  const { log } = useAuditLog();
  const [searchParams, setSearchParams] = useSearchParams();
  const [agents, setAgents] = useState<any[]>([]);
  const [wallets, setWallets] = useState<Record<string, any>>({});
  const [orderStats, setOrderStats] = useState<Record<string, { count: number; revenue: number; profit: number; lastOrder: string | null }>>({});
  const [effectiveStates, setEffectiveStates] = useState<Record<string, AgentEffectiveData>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Read filter from URL, default to 'operational'
  const urlFilter = searchParams.get('filter') as FilterKey | null;
  const filter: FilterKey = urlFilter && VALID_FILTERS.includes(urlFilter) ? urlFilter : 'operational';

  const setFilter = (f: FilterKey) => {
    setSearchParams({ filter: f }, { replace: true });
  };

  const [deleteDialog, setDeleteDialog] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [suspendDialog, setSuspendDialog] = useState<any>(null);
  const [suspendReason, setSuspendReason] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    // Use narrowed selects and DB aggregate for order stats
    const [agentsRes, walletsRes, orderStatsRes] = await Promise.all([
      supabase.from('agents').select('id, user_id, store_name, store_slug, store_email, whatsapp_number, region, status, activation_paid, activation_paid_at, created_at, subscription_plan, activation_discount_expires_at, discount_extended_until').in('status', ['active', 'approved', 'pending_review']).order('created_at', { ascending: false }),
      supabase.from('agent_wallets').select('agent_id, available_balance, pending_balance, total_earned, total_withdrawn'),
      // Use DB aggregate function instead of fetching ALL agent_orders
      supabase.rpc('admin_agent_order_stats' as any),
    ]);

    const agentList = agentsRes.data || [];
    setAgents(agentList);

    if (walletsRes.data) {
      const map: Record<string, any> = {};
      (walletsRes.data as any[]).forEach(w => { map[w.agent_id] = w; });
      setWallets(map);
    }

    // Map order stats from DB aggregate
    if (orderStatsRes.data) {
      const stats: Record<string, { count: number; revenue: number; profit: number; lastOrder: string | null }> = {};
      (orderStatsRes.data as any[]).forEach((row: any) => {
        stats[row.agent_id] = {
          count: Number(row.order_count) || 0,
          revenue: Number(row.total_revenue) || 0,
          profit: Number(row.total_profit) || 0,
          lastOrder: row.last_order_at || null,
        };
      });
      setOrderStats(stats);
    }

    // Batch fetch effective states — use Promise.all but with concurrency
    // This is still N calls but they run in parallel (typically <20 agents)
    const stateMap: Record<string, AgentEffectiveData> = {};
    const defaultState: AgentEffectiveData = {
      effective_state: 'unknown',
      expiry_date: null, grace_end: null, promo_end: null,
      can_store_accept_orders: false, can_use_bulk_orders: false, has_agent_pricing: false,
      days_remaining: 0, hours_remaining: 0,
    };
    const statePromises = agentList.map(async (ag: any) => {
      try {
        const { data } = await supabase.rpc('get_agent_effective_state', { p_agent_id: ag.id });
        const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
        stateMap[ag.id] = row ? (row as AgentEffectiveData) : { ...defaultState };
      } catch {
        stateMap[ag.id] = { ...defaultState };
      }
    });
    await Promise.all(statePromises);
    setEffectiveStates(stateMap);

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const agentsWithState = useMemo(() => {
    return agents.map(ag => {
      const es = effectiveStates[ag.id];
      return {
        ...ag,
        effectiveState: es?.effective_state || 'unknown',
        esData: es,
      };
    });
  }, [agents, effectiveStates]);

  const filtered = useMemo(() => {
    let list = agentsWithState;

    if (filter === 'operational') {
      list = list.filter(a => ['active', 'expiring_soon', 'grace_period'].includes(a.effectiveState));
    } else if (filter === 'expiring_soon') {
      list = list.filter(a => a.effectiveState === 'expiring_soon');
    } else if (filter === 'grace_period') {
      list = list.filter(a => a.effectiveState === 'grace_period');
    } else if (filter === 'expired') {
      list = list.filter(a => ['expired_promo', 'expired_standard'].includes(a.effectiveState));
    } else if (filter === 'awaiting_activation') {
      list = list.filter(a => ['approved_awaiting_activation', 'pending_review'].includes(a.effectiveState));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.store_name?.toLowerCase().includes(q) ||
        a.store_slug?.toLowerCase().includes(q) ||
        a.store_email?.toLowerCase().includes(q) ||
        a.whatsapp_number?.includes(q)
      );
    }

    return list;
  }, [agentsWithState, search, filter]);

  const stateCounts = useMemo(() => {
    const c = { all: agentsWithState.length, operational: 0, expiring_soon: 0, grace_period: 0, expired: 0, awaiting_activation: 0 };
    agentsWithState.forEach(a => {
      if (['active', 'expiring_soon', 'grace_period'].includes(a.effectiveState)) c.operational++;
      if (a.effectiveState === 'expiring_soon') c.expiring_soon++;
      if (a.effectiveState === 'grace_period') c.grace_period++;
      if (['expired_promo', 'expired_standard'].includes(a.effectiveState)) c.expired++;
      if (['approved_awaiting_activation', 'pending_review'].includes(a.effectiveState)) c.awaiting_activation++;
    });
    return c;
  }, [agentsWithState]);

  const handleSuspend = async () => {
    if (!suspendDialog || !suspendReason.trim()) { toast.error('Reason required'); return; }
    setProcessing(suspendDialog.id);
    try {
      await supabase.from('agents').update({ status: 'suspended' }).eq('id', suspendDialog.id);
      await log({ action: 'agent_suspended', entity_type: 'agent', entity_id: suspendDialog.id, changes: { reason: { before: '', after: suspendReason } } });
      toast.success('Agent suspended');
      setSuspendDialog(null);
      setSuspendReason('');
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    finally { setProcessing(null); }
  };

  const handleDelete = async () => {
    if (!deleteDialog || deleteConfirm !== deleteDialog.store_name) {
      toast.error('Type the store name exactly to confirm');
      return;
    }
    if (!deleteReason.trim()) { toast.error('Reason required'); return; }
    setProcessing(deleteDialog.id);
    try {
      await supabase.from('agents').update({ status: 'deleted' }).eq('id', deleteDialog.id);
      await log({
        action: 'agent_store_deleted', entity_type: 'agent', entity_id: deleteDialog.id,
        changes: { store_name: { before: deleteDialog.store_name, after: 'deleted' } },
        metadata: { reason: deleteReason },
      });
      toast.success('Agent store deleted');
      setDeleteDialog(null);
      setDeleteConfirm('');
      setDeleteReason('');
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    finally { setProcessing(null); }
  };

  const renderTimeInfo = (ag: any) => {
    const es = ag.esData as AgentEffectiveData | undefined;
    if (!es) return <span className="text-muted-foreground">—</span>;

    const state = es.effective_state;

    if (state === 'approved_awaiting_activation' || state === 'pending_review') {
      return <span className="text-muted-foreground text-xs">Not yet subscribed</span>;
    }

    if (!es.expiry_date) return <span className="text-muted-foreground">No subscription</span>;

    const expiry = new Date(es.expiry_date);

    return (
      <div>
        <p className="text-muted-foreground">{format(expiry, 'dd MMM yyyy, HH:mm')}</p>
        {state === 'active' && (
          <p className="text-[10px] text-green-600 dark:text-green-400">{es.days_remaining}d {es.hours_remaining % 24}h remaining</p>
        )}
        {state === 'expiring_soon' && (
          <p className="text-[10px] text-amber-600 font-semibold">{es.days_remaining > 0 ? `${es.days_remaining}d` : `${es.hours_remaining}h`} left</p>
        )}
        {state === 'grace_period' && es.grace_end && (
          <p className="text-[10px] text-amber-600">Grace ends {formatDistanceToNow(new Date(es.grace_end), { addSuffix: true })}</p>
        )}
        {state === 'expired_promo' && es.promo_end && (
          <p className="text-[10px] text-destructive">Promo ends {formatDistanceToNow(new Date(es.promo_end), { addSuffix: true })}</p>
        )}
        {state === 'expired_standard' && (
          <p className="text-[10px] text-destructive">Expired {formatDistanceToNow(expiry, { addSuffix: true })}</p>
        )}
      </div>
    );
  };

  const renderCapabilities = (es: AgentEffectiveData | undefined) => {
    if (!es) return null;
    return (
      <div className="flex gap-1.5 flex-wrap mt-1">
        <span className={`text-[9px] px-1.5 py-0.5 rounded ${es.can_store_accept_orders ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
          Store: {es.can_store_accept_orders ? 'ON' : 'OFF'}
        </span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded ${es.can_use_bulk_orders ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
          Bulk: {es.can_use_bulk_orders ? 'ON' : 'OFF'}
        </span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded ${es.has_agent_pricing ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
          Pricing: {es.has_agent_pricing ? 'ON' : 'OFF'}
        </span>
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">Agent Management</h1>
            <p className="text-sm text-muted-foreground">
              {stateCounts.operational} operational · {stateCounts.expired} expired · {stateCounts.awaiting_activation} awaiting · {agentsWithState.length} total
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {([
            { key: 'all', label: 'All', count: stateCounts.all },
            { key: 'operational', label: 'Operational', count: stateCounts.operational },
            { key: 'expiring_soon', label: 'Expiring Soon', count: stateCounts.expiring_soon },
            { key: 'grace_period', label: 'Grace Period', count: stateCounts.grace_period },
            { key: 'expired', label: 'Expired', count: stateCounts.expired },
            { key: 'awaiting_activation', label: 'Awaiting Activation', count: stateCounts.awaiting_activation },
          ] as { key: FilterKey; label: string; count: number }[]).map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search agents..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center text-muted-foreground text-sm">No agents found</div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Store</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Expiry / Time Left</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Capabilities</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Orders</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Revenue</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Balance</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ag => {
                  const stats = orderStats[ag.id] || { count: 0, revenue: 0, profit: 0, lastOrder: null };
                  const wlt = wallets[ag.id];
                  const sc = stateConfig[ag.effectiveState] || stateConfig.unknown;
                  const StateIcon = sc.icon;
                  const isOperational = ['active', 'expiring_soon', 'grace_period'].includes(ag.effectiveState);

                  return (
                    <tr key={ag.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <Link to={`/admin/agents/${ag.id}`} className="font-semibold text-primary hover:underline">{ag.store_name}</Link>
                        <p className="text-[10px] text-muted-foreground font-mono">/store/{ag.store_slug}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] ${sc.color} border-0 gap-1`}>
                          <StateIcon className="w-3 h-3" />
                          {sc.label}
                        </Badge>
                        {!isOperational && ag.effectiveState !== 'approved_awaiting_activation' && ag.effectiveState !== 'pending_review' && (
                          <p className="text-[9px] text-destructive mt-0.5">Store checkout disabled</p>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs">
                        {renderTimeInfo(ag)}
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        {renderCapabilities(ag.esData)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{stats.count}</td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell font-medium">{formatPrice(stats.revenue)}</td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell font-medium">
                        {wlt ? formatPrice(Number(wlt.available_balance)) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" asChild>
                            <Link to={`/admin/agents/${ag.id}`}><Eye className="w-3 h-3" /></Link>
                          </Button>
                          {ag.status === 'active' && (
                            <>
                              <Button size="sm" variant="outline" asChild>
                                <a href={`/store/${ag.store_slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3" /></a>
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => { setSuspendDialog(ag); setSuspendReason(''); }}>
                                <Ban className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setDeleteDialog(ag); setDeleteConfirm(''); setDeleteReason(''); }}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Suspend Dialog */}
        <Dialog open={!!suspendDialog} onOpenChange={() => setSuspendDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Suspend Agent Store</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Suspending <strong>{suspendDialog?.store_name}</strong>. Their store will go offline.</p>
            <Textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="Reason for suspension (required)..." rows={3} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setSuspendDialog(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleSuspend} disabled={!suspendReason.trim() || processing === suspendDialog?.id}>Confirm Suspend</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle className="text-destructive">Delete Agent Store</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This will permanently disable <strong>{deleteDialog?.store_name}</strong>. Historical orders will be preserved for reporting.
              </p>
              <div>
                <p className="text-xs font-medium mb-1">Type "<strong>{deleteDialog?.store_name}</strong>" to confirm:</p>
                <Input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder={deleteDialog?.store_name} />
              </div>
              <Textarea value={deleteReason} onChange={e => setDeleteReason(e.target.value)} placeholder="Reason for deletion (required, stored in audit log)..." rows={3} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleteConfirm !== deleteDialog?.store_name || !deleteReason.trim() || processing === deleteDialog?.id}>
                Delete Store
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminActiveAgents;
