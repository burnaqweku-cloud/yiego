import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/pages/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Gift, RefreshCw, Check, X, ChevronDown, ChevronUp, ExternalLink, AlertTriangle } from 'lucide-react';

const BADGE_STYLES = `
  .reward-badge-pending    { background: hsl(38 100% 50% / 0.15); color: hsl(38 100% 65%); border: 1px solid hsl(38 100% 50% / 0.35); }
  .reward-badge-processing { background: hsl(217 91% 60% / 0.15); color: hsl(217 91% 72%); border: 1px solid hsl(217 91% 60% / 0.35); }
  .reward-badge-delivered  { background: hsl(142 71% 45% / 0.15); color: hsl(142 71% 58%); border: 1px solid hsl(142 71% 45% / 0.35); }
  .reward-badge-failed     { background: hsl(0 84% 60% / 0.15);   color: hsl(0 84% 72%);   border: 1px solid hsl(0 84% 60% / 0.35);   }
`;


interface DispatchAttempt {
  id: string;
  attempt_no: number;
  supplier_key: string | null;
  success: boolean;
  http_status: number | null;
  error_message: string | null;
  created_at: string;
  created_by: string;
}

interface RewardClaim {
  id: string;
  user_id: string;
  milestone_id: string;
  network: string;
  phone: string;
  linked_order_id: string | null;
  status: string;
  rejection_reason: string | null;
  payout_gb: number | null;
  created_at: string;
  updated_at: string;
  reward_milestones: { gb_amount: number } | null;
  profiles: { full_name: string; username: string | null; phone: string } | null;
  dispatchAttempts?: DispatchAttempt[];
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending_admin:        { label: 'Pending Approval',  cls: 'reward-badge-pending' },
  approved_processing:  { label: 'Processing',        cls: 'reward-badge-processing' },
  delivered:            { label: 'Delivered',          cls: 'reward-badge-delivered' },
  rejected:             { label: 'Rejected',           cls: 'reward-badge-failed' },
  failed:               { label: 'Failed',             cls: 'reward-badge-failed' },
};

const AdminRewardClaims = () => {
  const [claims, setClaims] = useState<RewardClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('reward_claims')
      .select(`*, reward_milestones ( gb_amount )`)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);

    const { data: claimsData, error } = await query;
    if (!error && claimsData) {
      // Enrich with profiles separately to avoid type issues
      const enriched = await Promise.all(
        (claimsData as any[]).map(async (c) => {
          const [{ data: p }, dispatchResult] = await Promise.all([
            supabase
              .from('profiles')
              .select('full_name, username, phone')
              .eq('id', c.user_id)
              .maybeSingle(),
            c.linked_order_id
              ? supabase
                  .from('order_dispatch_attempts')
                  .select('id, attempt_no, supplier_key, success, http_status, error_message, created_at, created_by')
                  .eq('order_id', c.linked_order_id)
                  .order('attempt_no', { ascending: false })
                  .limit(5)
              : Promise.resolve({ data: [] }),
          ]);
          return { ...c, profiles: p, dispatchAttempts: dispatchResult.data || [] };
        })
      );
      setClaims(enriched as RewardClaim[]);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Realtime: auto-refresh when reward_claims status changes (e.g. via order trigger)
  useEffect(() => {
    const channel = supabase
      .channel('admin-reward-claims-sync')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'reward_claims',
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const callAction = async (claimId: string, action: 'approve' | 'reject', reason?: string) => {
    setActionLoading(claimId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/referral-approve-claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ claim_id: claimId, action, rejection_reason: reason }),
      });
      const json = await res.json();

      if (action === 'reject') {
        if (json.success) {
          toast.success('Claim rejected.');
          await load();
        } else {
          toast.error(json.error || 'Reject failed');
        }
        setActionLoading(null);
        return;
      }

      // approve / retry
      if (json.success) {
        if (json.delivery_triggered) {
          toast.success('Approved. Delivery started — order is now Processing.');
        } else {
          toast.success(json.message || 'Approved.');
        }
        await load();
      } else if (json.action === 'approved_but_delivery_failed') {
        // Claim was approved but supplier rejected it
        toast.error(`Approved but delivery failed: ${json.failure_reason || 'Unknown supplier error'}`);
        await load();
      } else {
        toast.error(json.error || json.reason || 'Action failed');
      }
    } catch {
      toast.error('Network error');
    }
    setActionLoading(null);
  };

  const filtered = claims.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.phone.includes(q) ||
      (c.profiles?.full_name || '').toLowerCase().includes(q) ||
      (c.profiles?.username || '').toLowerCase().includes(q) ||
      (c.linked_order_id || '').toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q)
    );
  });

  const statuses = ['all', 'pending_admin', 'approved_processing', 'delivered', 'rejected', 'failed'];

  return (
    <AdminLayout>
      <style>{BADGE_STYLES}</style>
      <div className="space-y-4 max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-display font-bold">Reward Claims</h1>
            <p className="text-sm text-muted-foreground">Review and approve referral reward claims</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Search by name, phone, order ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
          <div className="flex gap-1.5 flex-wrap">
            {statuses.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-muted'
                }`}
              >
                {s === 'all' ? 'All' : STATUS_LABELS[s]?.label ?? s}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl p-4 border border-border">
                <Skeleton className="h-4 w-1/2 mb-2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Gift className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No reward claims found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(claim => {
              const st = STATUS_LABELS[claim.status] ?? { label: claim.status, cls: 'bg-muted text-muted-foreground' };
              const isExpanded = expandedId === claim.id;

              return (
                <div key={claim.id} className="bg-card rounded-xl border border-border overflow-hidden">
                  {/* Row header */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : claim.id)}
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Gift className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">
                          {claim.profiles?.full_name || 'Unknown'} ·{' '}
                          <span className="font-bold text-primary">
                            {claim.payout_gb ?? claim.reward_milestones?.gb_amount ?? '?'}GB Payout
                          </span>
                          <span className="text-muted-foreground text-xs ml-1">
                            (Tier: {claim.reward_milestones?.gb_amount ?? '?'}GB)
                          </span>
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {claim.network} · {claim.phone} · {new Date(claim.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-border space-y-4 pt-3">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">User</p>
                          <p className="font-medium">{claim.profiles?.full_name || '—'}</p>
                          {claim.profiles?.username && <p className="text-xs text-muted-foreground">@{claim.profiles.username}</p>}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Milestone Total</p>
                          <p className="font-bold text-primary">{claim.reward_milestones?.gb_amount ?? '?'}GB</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Payout (Incremental)</p>
                          <p className="font-bold text-emerald-500 dark:text-emerald-400">{claim.payout_gb ?? '?'}GB</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Network</p>
                          <p className="font-medium">{claim.network}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Recipient Phone</p>
                          <p className="font-medium">{claim.phone}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Linked Order ID</p>
                          <p className="font-mono text-xs font-medium">{claim.linked_order_id || '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Submitted</p>
                          <p className="text-xs">{new Date(claim.created_at).toLocaleString('en-GB')}</p>
                        </div>
                        {claim.rejection_reason && (
                          <div className="col-span-2">
                            <p className="text-xs text-muted-foreground">Rejection Reason</p>
                            <p className="text-sm text-destructive">{claim.rejection_reason}</p>
                          </div>
                        )}
                      </div>

                      {/* Dispatch Debug */}
                      {claim.linked_order_id && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dispatch Trace</p>
                          {(!claim.dispatchAttempts || claim.dispatchAttempts.length === 0) ? (
                            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                              <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
                              <p className="text-xs text-muted-foreground">No dispatch attempts recorded yet</p>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {claim.dispatchAttempts.map((att) => (
                                <div key={att.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs border ${
                                  att.success 
                                    ? 'bg-success/10 border-success/20 text-success' 
                                    : 'bg-destructive/10 border-destructive/20 text-destructive'
                                }`}>
                                  <span className="font-bold">#{att.attempt_no}</span>
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${att.success ? 'bg-success' : 'bg-destructive'}`} />
                                  <span className="font-medium">{att.success ? 'Success' : 'Failed'}</span>
                                  {att.http_status && <span className="text-muted-foreground">HTTP {att.http_status}</span>}
                                  {att.error_message && <span className="truncate max-w-[200px] text-muted-foreground" title={att.error_message}>{att.error_message}</span>}
                                  <span className="ml-auto text-muted-foreground whitespace-nowrap">
                                    {new Date(att.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          <a
                            href={`/admin/orders?search=${encodeURIComponent(claim.linked_order_id)}`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View Order {claim.linked_order_id}
                          </a>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-col gap-2">
                        {claim.status === 'pending_admin' && (
                          <>
                            <Button
                              size="sm"
                              className="gap-1.5 w-full bg-success text-success-foreground hover:bg-success/90"
                              disabled={actionLoading === claim.id}
                              onClick={() => callAction(claim.id, 'approve')}
                            >
                              <Check className="w-3.5 h-3.5" />
                              {actionLoading === claim.id ? 'Approving...' : 'Approve → Set Processing'}
                            </Button>
                            <div className="flex gap-2">
                              <Input
                                placeholder="Rejection reason (required)..."
                                className="h-8 text-sm flex-1"
                                value={rejectReason[claim.id] || ''}
                                onChange={e => setRejectReason(prev => ({ ...prev, [claim.id]: e.target.value }))}
                              />
                              <Button
                                size="sm"
                                variant="destructive"
                                className="gap-1.5 shrink-0"
                                disabled={actionLoading === claim.id || !rejectReason[claim.id]?.trim()}
                                onClick={() => callAction(claim.id, 'reject', rejectReason[claim.id])}
                              >
                                <X className="w-3.5 h-3.5" />
                                Reject
                              </Button>
                            </div>
                          </>
                        )}
                        {['delivered', 'rejected'].includes(claim.status) && (
                          <p className="text-xs text-muted-foreground text-center py-1">No further actions available</p>
                        )}
                        {claim.status === 'approved_processing' && (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 rounded-lg bg-info/10 border border-info/20 px-3 py-2">
                              <div className="w-2 h-2 bg-info rounded-full animate-pulse shrink-0" />
                              <p className="text-xs text-info font-medium">Approved. Delivery started — order is Processing.</p>
                            </div>
                            <p className="text-xs text-muted-foreground">The supplier API was called on approval. Mark as Delivered manually via <strong>Admin → Orders</strong> once confirmed.</p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 w-full"
                              disabled={actionLoading === claim.id}
                              onClick={() => callAction(claim.id, 'retry' as any)}
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              {actionLoading === claim.id ? 'Retrying...' : 'Retry Delivery'}
                            </Button>
                          </div>
                        )}
                        {claim.status === 'failed' && (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                              <X className="w-3.5 h-3.5 text-destructive shrink-0" />
                              <p className="text-xs text-destructive font-medium">Supplier delivery failed.</p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 w-full border-destructive/30 hover:bg-destructive/5"
                              disabled={actionLoading === claim.id}
                              onClick={() => callAction(claim.id, 'retry' as any)}
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              {actionLoading === claim.id ? 'Retrying...' : 'Retry Delivery'}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminRewardClaims;
